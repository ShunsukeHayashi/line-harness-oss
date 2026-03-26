# みやびライン ローカルAIサーバー — マスタースペック

**バージョン**: 1.0.0
**作成日**: 2026-03-25
**オーナー**: 林駿甫
**ステータス**: 実装中

---

## 1. 概要・目的

管理画面（`localhost:3000`）の「AIに聞く」ボタンから、**Claude Code サブスクリプション**を使って
ローカルのClaude Codeセッションに問い合わせるためのHTTPブリッジサーバー。

Anthropic APIの従量課金を**一切使わない**。Claude Maxプランのサブスクリプション内で完結。

---

## 2. アーキテクチャ

```
管理画面（localhost:3000）
  │
  │ POST /api/ai/analyze
  │ { prompt, crmContext? }
  ↓
ローカルAIサーバー（localhost:4747）
  │
  │ @anthropic-ai/claude-agent-sdk query()
  │ Claude Code OAuth（サブスク認証）
  ↓
Claude Code CLIプロセス（ローカル）
  │
  │ SSEストリーム（text チャンク）
  ↓
管理画面にリアルタイム表示
```

---

## 3. エンドポイント仕様

### POST /api/ai/analyze

**リクエスト**

```json
{
  "prompt": "このタグリストをもとに配信戦略を教えて",
  "crmContext": {
    "friendsCount": 120,
    "tags": ["購入済み", "無料会員", "セミナー参加"],
    "scenarios": ["ウェルカムシーケンス", "商品案内"],
    "broadcastStats": "過去30日: 3回配信, 合計320通"
  }
}
```

**レスポンス**: `text/event-stream` (SSE)

```
data: {"type":"text","text":"配信戦略として"}
data: {"type":"text","text":"以下を提案します"}
data: [DONE]
```

### GET /health

```json
{ "status": "ok", "version": "1.0.0" }
```

---

## 4. 動作要件

| 項目 | 要件 |
|------|------|
| 起動コマンド | `node server.mjs` |
| ポート | `4747`（環境変数 `PORT` で変更可） |
| 認証 | なし（localhost限定のため） |
| Claude Code | v2.1.80以上、OAuth認証済み |
| Node.js | v18以上 |

---

## 5. セキュリティ方針

- **localhost限定**: `127.0.0.1` のみバインド（外部公開しない）
- **認証なし**: ローカル専用のためAPIキー不要
- **CORS**: `http://localhost:3000` のみ許可

---

## 6. 管理画面側の設定

`apps/web/.env.local` に追記：

```env
NEXT_PUBLIC_AI_URL=http://localhost:4747
```

`prompt-modal.tsx` はこの環境変数を参照してAIに聞くボタンの送信先を切り替える。

---

## 7. 起動手順

```bash
# 1. ローカルAIサーバー起動
cd tools/local-ai-server
node server.mjs

# 2. 管理画面起動（別ターミナル）
cd apps/web
pnpm dev

# 3. ブラウザで http://localhost:3000 を開き
#    「AIに聞く」ボタンをクリック
```

---

## 8. 今後の拡張

| フェーズ | 内容 |
|---------|------|
| v1.0 | localhost専用・Claude Code SDK |
| v1.1 | CRMデータ自動取得（Workerから直接フェッチ） |
| v2.0 | Cloudflare Tunnel経由で本番管理画面からも利用可 |
| v3.0 | Claude Code Channels（`--channels`フラグ）統合 |
