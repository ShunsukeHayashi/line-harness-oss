import { Hono } from 'hono';
import { verifySignature, LineClient } from '@line-crm/line-sdk';
import type { WebhookRequestBody, WebhookEvent, TextEventMessage, PostbackEvent } from '@line-crm/line-sdk';
import {
  upsertFriend,
  updateFriendFollowStatus,
  getFriendByLineUserId,
  getScenarios,
  enrollFriendInScenario,
  getScenarioSteps,
  advanceFriendScenario,
  completeFriendScenario,
  upsertChatOnMessage,
  addTagToFriend,
  getTags,
  jstNow,
  getAiSettings,
} from '@line-crm/db';
import { fireEvent } from '../services/event-bus.js';
import { buildMessage } from '../services/step-delivery.js';
import { callClaudeAutoReply, resolveSystemPrompt } from '../services/ai-auto-reply.js';
import type { Env } from '../index.js';

const webhook = new Hono<Env>();

webhook.post('/webhook', async (c) => {
  const channelSecret = c.env.LINE_CHANNEL_SECRET;
  const signature = c.req.header('X-Line-Signature') ?? '';
  const rawBody = await c.req.text();

  // Always return 200 to LINE, but verify signature first
  const valid = await verifySignature(channelSecret, rawBody, signature);
  if (!valid) {
    console.error('Invalid LINE signature');
    return c.json({ status: 'ok' }, 200);
  }

  let body: WebhookRequestBody;
  try {
    body = JSON.parse(rawBody) as WebhookRequestBody;
  } catch {
    console.error('Failed to parse webhook body');
    return c.json({ status: 'ok' }, 200);
  }

  const db = c.env.DB;
  const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);

  // 非同期処理 — LINE は ~1s 以内のレスポンスを要求
  const lineAccessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
  const aiConfig = {
    apiKey: (c.env as { ANTHROPIC_API_KEY?: string }).ANTHROPIC_API_KEY,
    systemPromptEnv: (c.env as { AI_SYSTEM_PROMPT?: string }).AI_SYSTEM_PROMPT,
  };
  const processingPromise = (async () => {
    for (const event of body.events) {
      try {
        await handleEvent(db, lineClient, event, lineAccessToken, aiConfig);
      } catch (err) {
        console.error('Error handling webhook event:', err);
      }
    }
  })();

  c.executionCtx.waitUntil(processingPromise);

  return c.json({ status: 'ok' }, 200);
});

async function handleEvent(
  db: D1Database,
  lineClient: LineClient,
  event: WebhookEvent,
  lineAccessToken: string,
  aiConfig?: { apiKey?: string; systemPromptEnv?: string },
): Promise<void> {
  if (event.type === 'follow') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    // プロフィール取得 & 友だち登録/更新
    let profile;
    try {
      profile = await lineClient.getProfile(userId);
    } catch (err) {
      console.error('Failed to get profile for', userId, err);
    }

    const friend = await upsertFriend(db, {
      lineUserId: userId,
      displayName: profile?.displayName ?? null,
      pictureUrl: profile?.pictureUrl ?? null,
      statusMessage: profile?.statusMessage ?? null,
    });

    // friend_add シナリオに登録
    const scenarios = await getScenarios(db);
    for (const scenario of scenarios) {
      if (scenario.trigger_type === 'friend_add' && scenario.is_active) {
        try {
          const existing = await db
            .prepare(`SELECT id FROM friend_scenarios WHERE friend_id = ? AND scenario_id = ?`)
            .bind(friend.id, scenario.id)
            .first<{ id: string }>();
          if (!existing) {
            const friendScenario = await enrollFriendInScenario(db, friend.id, scenario.id);

            // Immediate delivery: if the first step has delay=0, send it now
            // instead of waiting for the next cron run (up to 5 minutes)
            // NOTE: Uses pushMessage (not replyMessage) because replyToken can only be used once
            // and may be needed for competing immediate deliveries. Future optimization could
            // prioritize reply if available and only one step is due immediately.
            const steps = await getScenarioSteps(db, scenario.id);
            const firstStep = steps[0];
            if (firstStep && firstStep.delay_minutes === 0 && friendScenario.status === 'active') {
              try {
                const message = buildMessage(firstStep.message_type, firstStep.message_content);
                await lineClient.pushMessage(userId, [message]);
                console.log(`Immediate delivery: sent step ${firstStep.id} to ${userId}`);

                // Log outgoing message
                const logId = crypto.randomUUID();
                await db
                  .prepare(
                    `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
                     VALUES (?, ?, 'outgoing', ?, ?, NULL, ?, ?)`,
                  )
                  .bind(logId, friend.id, firstStep.message_type, firstStep.message_content, firstStep.id, jstNow())
                  .run();

                // Advance or complete the friend_scenario
                const secondStep = steps[1] ?? null;
                if (secondStep) {
                  const nextDeliveryDate = new Date(Date.now() + 9 * 60 * 60_000);
                  nextDeliveryDate.setMinutes(nextDeliveryDate.getMinutes() + secondStep.delay_minutes);
                  await advanceFriendScenario(db, friendScenario.id, firstStep.step_order, nextDeliveryDate.toISOString().slice(0, -1) + '+09:00');
                } else {
                  await completeFriendScenario(db, friendScenario.id);
                }
              } catch (err) {
                console.error('Failed immediate delivery for scenario', scenario.id, err);
              }
            }
          }
        } catch (err) {
          console.error('Failed to enroll friend in scenario', scenario.id, err);
        }
      }
    }

    // イベントバス発火: friend_add
    await fireEvent(db, 'friend_add', { friendId: friend.id, eventData: { displayName: friend.display_name } }, lineAccessToken);

    // Onboarding:Started タグ付与 → PPAL_GuestToStage0 automation が Stage0 リッチメニューに切替
    const allFollowTags = await getTags(db);
    const onboardingStartedTag = allFollowTags.find((t) => t.name === 'Onboarding:Started');
    if (onboardingStartedTag) {
      try {
        await addTagToFriend(db, friend.id, onboardingStartedTag.id);
        await fireEvent(db, 'tag_change', {
          friendId: friend.id,
          eventData: { tagId: onboardingStartedTag.id, action: 'add' },
        }, lineAccessToken);
      } catch (err) {
        console.error('Failed to add Onboarding:Started tag on follow', err);
      }
    }

    return;
  }

  if (event.type === 'unfollow') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    await updateFriendFollowStatus(db, userId, false);
    return;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const textMessage = event.message as TextEventMessage;
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    const friend = await getFriendByLineUserId(db, userId);
    if (!friend) return;

    const incomingText = textMessage.text;
    const now = jstNow();
    const logId = crypto.randomUUID();

    // 受信メッセージをログに記録
    await db
      .prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
         VALUES (?, ?, 'incoming', 'text', ?, NULL, NULL, ?)`,
      )
      .bind(logId, friend.id, incomingText, now)
      .run();

    // チャットを作成/更新（オペレーター機能連携）
    await upsertChatOnMessage(db, friend.id);

    // 自動返信チェック
    // NOTE: Auto-replies use replyMessage (free, no quota) instead of pushMessage
    // The replyToken is only valid for ~1 minute after the message event
    const autoReplies = await db
      .prepare(`SELECT * FROM auto_replies WHERE is_active = 1 ORDER BY created_at ASC`)
      .all<{
        id: string;
        keyword: string;
        match_type: 'exact' | 'contains';
        response_type: string;
        response_content: string;
        is_active: number;
        created_at: string;
      }>();

    let matched = false;
    for (const rule of autoReplies.results) {
      const isMatch =
        rule.match_type === 'exact'
          ? incomingText === rule.keyword
          : incomingText.includes(rule.keyword);

      if (isMatch) {
        try {
          if (rule.response_type === 'text') {
            await lineClient.replyMessage(event.replyToken, [
              { type: 'text', text: rule.response_content },
            ]);
          } else if (rule.response_type === 'image') {
            const parsed = JSON.parse(rule.response_content) as {
              originalContentUrl: string;
              previewImageUrl: string;
            };
            await lineClient.replyMessage(event.replyToken, [
              { type: 'image', originalContentUrl: parsed.originalContentUrl, previewImageUrl: parsed.previewImageUrl },
            ]);
          } else if (rule.response_type === 'flex') {
            const contents = JSON.parse(rule.response_content);
            await lineClient.replyMessage(event.replyToken, [
              { type: 'flex', altText: 'Message', contents },
            ]);
          }

          // 送信ログ
          const outLogId = crypto.randomUUID();
          await db
            .prepare(
              `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
               VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, ?)`,
            )
            .bind(outLogId, friend.id, rule.response_type, rule.response_content, jstNow())
            .run();
        } catch (err) {
          console.error('Failed to send auto-reply', err);
        }

        matched = true;
        break;
      }
    }

    // AI自動応答 — キーワードルール未マッチかつANTHROPIC_API_KEY設定済みの場合
    if (!matched && aiConfig?.apiKey) {
      try {
        const aiRow = await getAiSettings(db);
        if (aiRow && aiRow.is_enabled === 1) {
          const systemPrompt = resolveSystemPrompt(aiRow.system_prompt, aiConfig.systemPromptEnv);
          const result = await callClaudeAutoReply({
            apiKey: aiConfig.apiKey,
            model: aiRow.model,
            systemPrompt,
            userMessage: incomingText,
          });
          await lineClient.replyMessage(event.replyToken, [
            { type: 'text', text: result.text },
          ]);

          // 送信ログ
          const aiLogId = crypto.randomUUID();
          await db
            .prepare(
              `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
               VALUES (?, ?, 'outgoing', 'text', ?, NULL, NULL, ?)`,
            )
            .bind(aiLogId, friend.id, result.text, jstNow())
            .run();
        }
      } catch (err) {
        console.error('Failed to send AI auto-reply', err);
      }
    }

    // イベントバス発火: message_received
    await fireEvent(db, 'message_received', {
      friendId: friend.id,
      eventData: { text: incomingText, matched },
    }, lineAccessToken);

    return;
  }

  if (event.type === 'postback') {
    const postbackEvent = event as PostbackEvent;
    const userId =
      postbackEvent.source.type === 'user' ? postbackEvent.source.userId : undefined;
    if (!userId) return;

    const friend = await getFriendByLineUserId(db, userId);
    if (!friend) return;

    const params = new URLSearchParams(postbackEvent.postback.data);
    const action = params.get('action');

    // セグメントアンケート回答（Welcomeシーケンス Step1 ボタン）
    if (action === 'segment') {
      const value = params.get('value'); // 'tech' or 'biz'
      const allTags = await getTags(db);
      const tagName = value === 'tech' ? 'Seg:Tech_Interest' : value === 'biz' ? 'Seg:Biz_Result' : null;
      const tag = tagName ? allTags.find((t) => t.name === tagName) : null;
      if (tag) {
        try {
          await addTagToFriend(db, friend.id, tag.id);
          await fireEvent(db, 'tag_change', { friendId: friend.id, eventData: { tagId: tag.id, action: 'add' } }, lineAccessToken);
        } catch (err) {
          console.error('Failed to add segment tag', err);
        }
      }
      const replyText = value === 'tech'
        ? '開発・コーディング系として登録しました！🖥️\n\nClaude Code / MCPの実践情報をお届けします。\n\n▶ PPALラボを詳しく見る\nhttps://shuhayas-s-school.teachable.com/p/pro-prompt-agent-lab'
        : '業務・営業の自動化として登録しました！💼\n\n業務効率化・営業自動化のAI活用情報をお届けします。\n\n▶ PPALラボを詳しく見る\nhttps://shuhayas-s-school.teachable.com/p/pro-prompt-agent-lab';
      try {
        await lineClient.replyMessage(postbackEvent.replyToken, [{ type: 'text', text: replyText }]);
      } catch (err) {
        console.error('Failed to reply for segment postback', err);
      }
      return;
    }

    // Stage0 リッチメニュー「講座にアクセス」ボタンタップ
    // → Onboarding:Step0_Clicked タグ付与 → オートメーションがStage1へ切替
    if (action === 'rm_stage0_course') {
      const allTags = await getTags(db);
      const tag = allTags.find((t) => t.name === 'Onboarding:Step0_Clicked');
      if (tag) {
        try {
          await addTagToFriend(db, friend.id, tag.id);
          // tag_change イベント発火 → automation が Stage1 リッチメニューに切替
          await fireEvent(db, 'tag_change', {
            friendId: friend.id,
            eventData: { tagId: tag.id, action: 'add' },
          }, lineAccessToken);
        } catch (err) {
          console.error('Failed to add Onboarding:Step0_Clicked tag', err);
        }
      }

      // Teachable 講座 URL をリプライ（タップで遷移）
      try {
        await lineClient.replyMessage(postbackEvent.replyToken, [
          {
            type: 'text',
            text: '講座ページを開きます👇\nhttps://shuhayas-s-school.teachable.com/courses/enrolled/2925864',
          },
        ]);
      } catch (err) {
        console.error('Failed to reply for rm_stage0_course', err);
      }
    }

    return;
  }
}

export { webhook };
