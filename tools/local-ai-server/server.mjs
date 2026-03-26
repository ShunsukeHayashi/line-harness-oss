/**
 * みやびライン ローカルAIサーバー v1.0.0
 *
 * Claude Code SDK (subscription) を使い、Anthropic API の従量課金なしで
 * 管理画面の「AIに聞く」リクエストを処理するローカルHTTPブリッジ。
 *
 * 起動: node server.mjs
 * ポート: 4747 (PORT環境変数で変更可)
 */

import { createServer } from 'node:http';
import { query } from '@anthropic-ai/claude-agent-sdk';

const PORT = process.env.PORT ?? 4747;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000';

// ─── ヘルパー: CRMコンテキストをシステムプロンプトに変換 ────────────────
function buildSystemPrompt(crmContext) {
  if (!crmContext) {
    return 'あなたはLINE公式アカウントのCRMマーケティングアドバイザーです。ユーザーの質問に日本語で簡潔に回答してください。';
  }
  const { friendsCount, tags, scenarios, broadcastStats } = crmContext;
  return `あなたはLINE公式アカウントのCRMマーケティングアドバイザーです。
以下がこのアカウントの現在のCRMデータです:

- 友だち数: ${friendsCount ?? 0}人
- タグ: ${Array.isArray(tags) ? tags.join(', ') : (tags || 'なし')}
- シナリオ: ${Array.isArray(scenarios) ? scenarios.join(', ') : (scenarios || 'なし')}
- 配信実績: ${broadcastStats ?? 'データなし'}

このデータをもとに、日本語で具体的なアドバイスを簡潔に回答してください。`;
}

// ─── ヘルパー: SSEのdata行を送信 ────────────────────────────────────────
function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ─── HTTPサーバー ─────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  // CORSヘッダー
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ─── GET /health ──────────────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));
    return;
  }

  // ─── POST /api/ai/analyze ─────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/ai/analyze') {
    // リクエストボディを読み込む
    let body = '';
    for await (const chunk of req) body += chunk;

    let prompt, crmContext;
    try {
      ({ prompt, crmContext } = JSON.parse(body));
      if (!prompt?.trim()) throw new Error('prompt required');
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
      return;
    }

    // SSEレスポンス開始
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });

    const systemPrompt = buildSystemPrompt(crmContext);
    const fullPrompt = `${systemPrompt}\n\nユーザーの質問:\n${prompt}`;

    try {
      // Claude Code SDK経由でサブスクリプションを使用
      for await (const message of query({
        prompt: fullPrompt,
        options: {
          maxTurns: 1,
        },
      })) {
        // テキストチャンクをSSEで流す
        if (message.type === 'assistant') {
          for (const block of message.message?.content ?? []) {
            if (block.type === 'text' && block.text) {
              sendSSE(res, { type: 'text', text: block.text });
            }
          }
        }
        // 結果メッセージ
        if (message.type === 'result') {
          const text = message.result ?? '';
          if (text) sendSSE(res, { type: 'text', text });
        }
      }
    } catch (err) {
      console.error('[AI Error]', err.message);
      sendSSE(res, { type: 'error', error: err.message });
    }

    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n✅ みやびライン ローカルAIサーバー起動`);
  console.log(`   http://localhost:${PORT}/health`);
  console.log(`   POST http://localhost:${PORT}/api/ai/analyze`);
  console.log(`   Claude Code SDK (subscription) 使用 — 追加コスト0円\n`);
});
