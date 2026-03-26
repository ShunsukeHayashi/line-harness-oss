import { Hono } from 'hono';
import {
  getIncomingWebhooks,
  getIncomingWebhookById,
  createIncomingWebhook,
  updateIncomingWebhook,
  deleteIncomingWebhook,
  getOutgoingWebhooks,
  getOutgoingWebhookById,
  createOutgoingWebhook,
  updateOutgoingWebhook,
  deleteOutgoingWebhook,
  jstNow,
} from '@line-crm/db';
import type { Env } from '../index.js';

const webhooks = new Hono<Env>();

// ========== 受信Webhook ==========

webhooks.get('/api/webhooks/incoming', async (c) => {
  try {
    const items = await getIncomingWebhooks(c.env.DB);
    return c.json({
      success: true,
      data: items.map((w) => ({
        id: w.id,
        name: w.name,
        sourceType: w.source_type,
        // secret is intentionally omitted from GET responses — write-only field
        isActive: Boolean(w.is_active),
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/webhooks/incoming error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.post('/api/webhooks/incoming', async (c) => {
  try {
    const body = await c.req.json<{ name: string; sourceType?: string; secret?: string }>();
    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);
    const item = await createIncomingWebhook(c.env.DB, body);
    return c.json({ success: true, data: { id: item.id, name: item.name, sourceType: item.source_type, isActive: Boolean(item.is_active), createdAt: item.created_at } }, 201);
  } catch (err) {
    console.error('POST /api/webhooks/incoming error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.put('/api/webhooks/incoming/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    await updateIncomingWebhook(c.env.DB, id, body);
    const updated = await getIncomingWebhookById(c.env.DB, id);
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: { id: updated.id, name: updated.name, sourceType: updated.source_type, isActive: Boolean(updated.is_active) } });
  } catch (err) {
    console.error('PUT /api/webhooks/incoming/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.delete('/api/webhooks/incoming/:id', async (c) => {
  try {
    await deleteIncomingWebhook(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/webhooks/incoming/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 送信Webhook ==========

webhooks.get('/api/webhooks/outgoing', async (c) => {
  try {
    const items = await getOutgoingWebhooks(c.env.DB);
    return c.json({
      success: true,
      data: items.map((w) => ({
        id: w.id,
        name: w.name,
        url: w.url,
        eventTypes: JSON.parse(w.event_types),
        // secret is intentionally omitted from GET responses — write-only field
        isActive: Boolean(w.is_active),
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/webhooks/outgoing error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.post('/api/webhooks/outgoing', async (c) => {
  try {
    const body = await c.req.json<{ name: string; url: string; eventTypes: string[]; secret?: string }>();
    if (!body.name || !body.url) return c.json({ success: false, error: 'name and url are required' }, 400);
    const item = await createOutgoingWebhook(c.env.DB, { ...body, eventTypes: body.eventTypes ?? [] });
    return c.json({
      success: true,
      data: { id: item.id, name: item.name, url: item.url, eventTypes: JSON.parse(item.event_types), isActive: Boolean(item.is_active), createdAt: item.created_at },
    }, 201);
  } catch (err) {
    console.error('POST /api/webhooks/outgoing error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.put('/api/webhooks/outgoing/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    await updateOutgoingWebhook(c.env.DB, id, body);
    const updated = await getOutgoingWebhookById(c.env.DB, id);
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: { id: updated.id, name: updated.name, url: updated.url, eventTypes: JSON.parse(updated.event_types), isActive: Boolean(updated.is_active) } });
  } catch (err) {
    console.error('PUT /api/webhooks/outgoing/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.delete('/api/webhooks/outgoing/:id', async (c) => {
  try {
    await deleteOutgoingWebhook(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/webhooks/outgoing/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 受信Webhookエンドポイント (外部システムからの受信) ==========

webhooks.post('/api/webhooks/incoming/:id/receive', async (c) => {
  try {
    const id = c.req.param('id');
    const wh = await getIncomingWebhookById(c.env.DB, id);
    if (!wh || !wh.is_active) return c.json({ success: false, error: 'Webhook not found or inactive' }, 404);

    const body = await c.req.json();

    // イベントバスに発火: source_type をイベントタイプとして使用
    const { fireEvent } = await import('../services/event-bus.js');
    const eventType = `incoming_webhook.${wh.source_type}`;
    await fireEvent(c.env.DB, eventType, {
      eventData: { webhookId: wh.id, source: wh.source_type, payload: body },
    });

    return c.json({ success: true, data: { received: true, source: wh.source_type } });
  } catch (err) {
    console.error('POST /api/webhooks/incoming/:id/receive error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Teachable Webhook (PPAL Identity Hub) ==========

interface TeachableSalePayload {
  object: string;
  id: number;
  user?: {
    id: number;
    email: string;
    name?: string;
  };
}

/**
 * POST /api/teachable/webhook — Teachable Webhook 受信エンドポイント
 *
 * sale.created イベント受信時:
 *   1. unified_profiles に仮登録 (teachable_email, teachable_id)
 *   2. friends テーブルから teachable_email が一致する友だちを検索
 *   3. 見つかった場合: LIFF 連携案内 Flex Message を push 送信
 */
webhooks.post('/api/teachable/webhook', async (c) => {
  try {
    const body = await c.req.json<{ object?: string; event?: string; payload?: TeachableSalePayload }>();
    const event = body.event || body.object || '';

    if (event !== 'sale.created') {
      return c.json({ success: true, data: { received: true, skipped: true } });
    }

    const payload = body.payload;
    const teachableEmail = payload?.user?.email;
    const teachableId = payload?.user?.id ?? null;

    if (!teachableEmail) {
      return c.json({ success: false, error: 'teachable email not found in payload' }, 400);
    }

    const db = c.env.DB;
    const now = jstNow();

    // 1. unified_profiles に仮登録 (teachable_email をキーに upsert)
    //    line_uid がまだない場合は teachable_email をプレースホルダとして使う
    //    ON CONFLICT(line_uid) は line_uid が決まったときに上書きされる
    //    ここでは teachable_email で既存行を確認してから insert or update する
    const existing = await db
      .prepare('SELECT line_uid FROM unified_profiles WHERE teachable_email = ? LIMIT 1')
      .bind(teachableEmail)
      .first<{ line_uid: string }>();

    if (existing) {
      // 既存行を更新
      await db
        .prepare(
          'UPDATE unified_profiles SET teachable_id = ?, updated_at = ? WHERE teachable_email = ?',
        )
        .bind(teachableId, now, teachableEmail)
        .run();
    } else {
      // 新規仮登録: line_uid には仮の値として "pending:{teachable_email}" を使用
      // (実際の LINE 連携時に line_uid が確定し、このレコードが更新される)
      const pendingUid = `pending:${teachableEmail}`;
      await db
        .prepare(
          `INSERT INTO unified_profiles (line_uid, teachable_id, teachable_email, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(line_uid) DO UPDATE SET
             teachable_id = excluded.teachable_id,
             teachable_email = excluded.teachable_email,
             updated_at = excluded.updated_at`,
        )
        .bind(pendingUid, teachableId, teachableEmail, now, now)
        .run();
    }

    // 2. friends テーブルから teachable_email が一致する友だちを検索
    //    friends テーブルに email カラムがある場合はそちらも検索する
    const friend = await db
      .prepare(
        `SELECT f.line_user_id, f.display_name, la.channel_access_token
         FROM friends f
         LEFT JOIN line_accounts la ON la.id = f.line_account_id
         WHERE f.is_following = 1
           AND (
             f.id IN (
               SELECT friend_id FROM users u
               INNER JOIN friends ff ON ff.user_id = u.id
               WHERE u.email = ?
             )
           )
         LIMIT 1`,
      )
      .bind(teachableEmail)
      .first<{ line_user_id: string; display_name: string | null; channel_access_token: string | null }>();

    if (!friend) {
      // LINE友だちが未存在: unified_profiles への仮登録のみで終了
      return c.json({ success: true, data: { registered: true, messageSent: false } });
    }

    // 3. LIFF 連携案内 Flex Message を push 送信
    const liffLinkUrl = c.env.LIFF_LINK_URL || c.env.LIFF_URL;
    const accessToken = friend.channel_access_token || c.env.LINE_CHANNEL_ACCESS_TOKEN;
    const flexMessage = buildLiffLinkFlexMessage(liffLinkUrl);

    const pushRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: friend.line_user_id,
        messages: [
          {
            type: 'text',
            text: '🎉 ご購入ありがとうございます！\n\nアカウント連携で受講・Discordコミュニティへのアクセスが開始されます。\n下のボタンから30秒で完了できます。',
          },
          flexMessage,
        ],
      }),
    });

    if (!pushRes.ok) {
      const errText = await pushRes.text();
      console.error('LINE push failed for Teachable webhook:', errText);
    }

    return c.json({ success: true, data: { registered: true, messageSent: pushRes.ok } });
  } catch (err) {
    console.error('POST /api/teachable/webhook error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

function buildLiffLinkFlexMessage(liffUrl: string): object {
  return {
    type: 'flex',
    altText: 'アカウント連携のご案内',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#5865F2',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: 'アカウント連携のご案内',
            color: '#ffffff',
            size: 'lg',
            weight: 'bold',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: '以下のボタンから Discord・Teachable アカウントを LINE と紐付けると、受講コンテンツへのアクセスが開始されます。',
            size: 'sm',
            color: '#444444',
            wrap: true,
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
            color: '#5865F2',
          },
        ],
      },
    },
  };
}

export { webhooks };
