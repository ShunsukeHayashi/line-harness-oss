import { Hono } from 'hono';
import { LineClient } from '@line-crm/line-sdk';
import type { Message } from '@line-crm/line-sdk';
import type { Env } from '../index.js';

const teachable = new Hono<Env>();

// Basic email format validation (without regex literal to satisfy strict linters)
function isValidEmail(value: string): boolean {
  const parts = value.split('@');
  return parts.length === 2 && parts[0].length > 0 && parts[1].includes('.');
}

// Teachable sale.created Webhook handler
// POST /api/webhooks/teachable
// Authentication: TEACHABLE_WEBHOOK_SECRET must be provided as "secret" query param
// (configure in Teachable dashboard: Webhook URL = https://<worker>/api/webhooks/teachable?secret=<TEACHABLE_WEBHOOK_SECRET>)
teachable.post('/api/webhooks/teachable', async (c) => {
  try {
    // ── Authentication ──────────────────────────────────────────────────────
    const expectedSecret = c.env.TEACHABLE_WEBHOOK_SECRET;
    const providedSecret = c.req.query('secret') ?? c.req.header('X-Teachable-Secret');
    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json<{
      event?: string;
      object?: {
        email?: string;
        id?: number | string;
        name?: string;
      };
    }>();

    // Only process sale.created events
    if (body.event !== 'sale.created') {
      return c.json({ success: true, data: { skipped: true, event: body.event } });
    }

    const email = body.object?.email;
    const teachableId = body.object?.id ? String(body.object.id) : null;

    if (!email) {
      return c.json({ success: false, error: 'email is required in sale.created payload' }, 400);
    }

    // ── Email validation ──────────────────────────────────────────────────
    if (!isValidEmail(email)) {
      return c.json({ success: false, error: 'Invalid email format' }, 400);
    }

    const db = c.env.DB;
    const id = crypto.randomUUID();

    // Upsert unified_profiles — register (or update) the Teachable purchaser
    await db
      .prepare(
        `INSERT INTO unified_profiles (id, teachable_email, teachable_id, created_at, updated_at)
         VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
         ON CONFLICT(teachable_email) DO UPDATE SET
           teachable_id = excluded.teachable_id,
           updated_at   = excluded.updated_at`,
      )
      .bind(id, email, teachableId)
      .run();

    // Look up a LINE friend whose teachable_email matches
    const friend = await db
      .prepare(
        `SELECT id, line_user_id, display_name, line_account_id FROM friends
         WHERE teachable_email = ? AND is_following = 1
         LIMIT 1`,
      )
      .bind(email)
      .first<{ id: string; line_user_id: string; display_name: string | null; line_account_id: string | null }>();

    if (!friend) {
      // No matching LINE friend — provisional registration only, no LINE message
      return c.json({
        success: true,
        data: { registered: true, lineSent: false, reason: 'LINE friend not found for this email' },
      });
    }

    // ── Idempotency: mark DB record BEFORE sending the LINE message ──────
    // Uses "line_message_sent_at IS NULL" as an optimistic lock to prevent
    // duplicate sends on concurrent or retry requests.
    const updated = await db
      .prepare(
        `UPDATE unified_profiles
         SET line_user_id = ?,
             line_message_sent_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
             updated_at           = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
         WHERE teachable_email = ? AND line_message_sent_at IS NULL`,
      )
      .bind(friend.line_user_id, email)
      .run();

    if (updated.meta.changes === 0) {
      // Another request already sent this message
      return c.json({ success: true, data: { registered: true, lineSent: false, reason: 'already sent' } });
    }

    // Resolve LINE access token — prefer account-specific token
    let accessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (friend.line_account_id) {
      const account = await db
        .prepare('SELECT channel_access_token FROM line_accounts WHERE id = ? AND is_active = 1')
        .bind(friend.line_account_id)
        .first<{ channel_access_token: string }>();
      if (account) accessToken = account.channel_access_token;
    }

    const lineClient = new LineClient(accessToken);
    const liffUrl = c.env.LIFF_LINK_URL || c.env.LIFF_URL;
    const name = friend.display_name || '';

    // Build LIFF linkage guidance messages
    // Text message
    const textMessage: Message = {
      type: 'text',
      text: `🎉 ${name ? `${name}さん、` : ''}ご購入ありがとうございます！\n\nアカウント連携で受講・Discordコミュニティへのアクセスが開始されます。\n下のボタンから30秒で完了できます。`,
    };

    // Flex message with "今すぐ連携する" button
    const flexMessage: Message = {
      type: 'flex',
      altText: 'アカウント連携のご案内',
      contents: {
        type: 'bubble',
        size: 'mega',
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          contents: [
            {
              type: 'text',
              text: 'アカウント連携',
              size: 'xl',
              weight: 'bold',
              color: '#1e293b',
            },
            {
              type: 'text',
              text: 'LINEとTeachableアカウントを連携すると、受講コンテンツとDiscordコミュニティへのアクセスが有効になります。',
              size: 'sm',
              color: '#64748b',
              wrap: true,
              margin: 'md',
            },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: '今すぐ連携する',
                uri: liffUrl,
              },
              style: 'primary',
              color: '#06C755',
            },
          ],
        },
      },
    };

    await lineClient.pushMessage(friend.line_user_id, [textMessage, flexMessage]);

    return c.json({ success: true, data: { registered: true, lineSent: true } });
  } catch (err) {
    console.error('POST /api/webhooks/teachable error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { teachable };

