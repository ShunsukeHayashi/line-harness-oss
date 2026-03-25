---
name: line-harness-ops
description: line-harness-oss プロジェクトのオペレーションワークフロー。バグ修正・upstream rebase・PR提出・agent-skill-bus 計測を統合したパイプライン。
triggers:
  - line-harness
  - event-bus fix
  - upstream pr
  - T22
  - T23
  - T25
---

# line-harness-oss オペレーションスキル

## プロジェクト概要

| 項目 | 値 |
|------|-----|
| ローカルパス | `~/dev/tools/line-harness-oss/` |
| ワーカー | Cloudflare Workers (Hono) |
| upstream | `https://github.com/Shudesu/line-harness-oss` |
| fork | `https://github.com/ShunsukeHayashi/line-harness-oss` |

## エージェント・モデル割り当て（確認済み）

| タスク | エージェント | ノード | モデル |
|-------|------------|------|------|
| コード修正 | `kotowari-dev` | MacBook Pro | claude-sonnet-4-6 |
| Claude Code ローカル | `cc-hayashi` | MacBook Pro | claude-sonnet-4-6 |
| DM・SNS | `x-ops` | Gateway | gemini-2.5-flash |
| 汎用 | `main` | Gateway | gemini-2.5-flash |

## agent-skill-bus 計測ループ

### タスク開始時
```bash
cd ~/dev/tools/line-harness-oss
npx agent-skill-bus enqueue --source human --priority critical \
  --agent <agent> --task "<T番号: 説明>"
npx agent-skill-bus start <queue-id>
```

### タスク完了時（必須）
```bash
npx agent-skill-bus record-run \
  --agent <agent> \
  --skill line-harness-ops \
  --task "<T番号: 説明>" \
  --result <success|fail|partial> \
  --score <0.0-1.0>
npx agent-skill-bus complete <queue-id>
```

スコア基準: 1.0=完璧 / 0.8=軽微修正あり / 0.5=partial / 0.0=fail

## 実行前必須検証コマンド

```bash
# shared/db/sdk を先にビルド
pnpm --filter @line-crm/shared --filter @line-crm/line-sdk --filter @line-crm/db build
# worker typecheck
pnpm --filter worker typecheck
# 変更スコープ確認
npx gitnexus detect_changes --scope staged
```

## T22 fix(event-bus): score_threshold バグ修正

**バグ**: `processScoring` と `processAutomations` が並列 → currentScore が常に undefined

**修正**: 2 フェーズに分割 + getFriendScore で注入

```typescript
// Phase1: webhooks + scoring
await Promise.allSettled([
  fireOutgoingWebhooks(db, eventType, payload),
  processScoring(db, eventType, payload),
]);
// currentScore 注入
if (payload.friendId) {
  const currentScore = await getFriendScore(db, payload.friendId);
  payload.eventData = { ...payload.eventData, currentScore };
}
// Phase2: automations + notifications
await Promise.allSettled([
  processAutomations(db, eventType, payload, lineAccessToken),
  processNotifications(db, eventType, payload),
]);
```

`getFriendScore` は `packages/db/src/scoring.ts:85` にエクスポート済み。

## T23 upstream rebase

```bash
git remote -v | grep upstream || git remote add upstream https://github.com/Shudesu/line-harness-oss.git
git fetch upstream
git rebase upstream/main
git log --oneline upstream/main..HEAD  # fork 独自コミットのみ確認
```

## T25 upstream PR 提出

```bash
gh pr create \
  --repo Shudesu/line-harness-oss \
  --title "fix(event-bus): inject currentScore before automations execute" \
  --body "Fixes race condition in fireEvent(). Credit: meomao19930511-lab."
```

## T26 @ai_shunoda DM

```bash
openclaw agent --agent main --json -m \
  "x-opsで@ai_shunodaにDM: project_memory/MASTER_PLAN.md のDMメッセージを送信"
```
