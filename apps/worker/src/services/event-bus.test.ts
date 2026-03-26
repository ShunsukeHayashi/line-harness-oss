/**
 * event-bus.test.ts
 * T22: score_threshold条件のユニットテスト
 *
 * matchConditions関数と fireEvent の2フェーズ実行をテストする。
 * - score >= threshold の場合はautomationがトリガーされる
 * - score < threshold の場合はautomationがスキップされる
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AutomationRow } from '@line-crm/db';
import { matchConditions, fireEvent } from './event-bus.js';

// ─── @line-crm/db モジュールをトップレベルでモック（hoisting対象）────
vi.mock('@line-crm/db', () => ({
  getActiveOutgoingWebhooksByEvent: vi.fn().mockResolvedValue([]),
  applyScoring: vi.fn().mockResolvedValue(undefined),
  getActiveAutomationsByEvent: vi.fn().mockResolvedValue([]),
  createAutomationLog: vi.fn().mockResolvedValue(undefined),
  getActiveNotificationRulesByEvent: vi.fn().mockResolvedValue([]),
  createNotification: vi.fn().mockResolvedValue(undefined),
  addTagToFriend: vi.fn().mockResolvedValue(undefined),
  removeTagFromFriend: vi.fn().mockResolvedValue(undefined),
  enrollFriendInScenario: vi.fn().mockResolvedValue(undefined),
  jstNow: vi.fn().mockReturnValue('2026-01-01T00:00:00+09:00'),
}));

import * as db from '@line-crm/db';

// ─── matchConditions ユニットテスト ───────────────────────

describe('matchConditions — score_threshold', () => {
  it('条件が空の場合は常にマッチする', () => {
    expect(matchConditions({}, { friendId: 'f1', eventData: {} })).toBe(true);
  });

  it('score >= threshold の場合はマッチする', () => {
    const conditions = { score_threshold: 50 };
    const payload = { friendId: 'f1', eventData: { currentScore: 60 } };
    expect(matchConditions(conditions, payload)).toBe(true);
  });

  it('score === threshold の場合はマッチする（境界値）', () => {
    const conditions = { score_threshold: 50 };
    const payload = { friendId: 'f1', eventData: { currentScore: 50 } };
    expect(matchConditions(conditions, payload)).toBe(true);
  });

  it('score < threshold の場合はマッチしない', () => {
    const conditions = { score_threshold: 50 };
    const payload = { friendId: 'f1', eventData: { currentScore: 40 } };
    expect(matchConditions(conditions, payload)).toBe(false);
  });

  it('currentScore が undefined の場合はマッチする（スコア未設定は制限しない）', () => {
    const conditions = { score_threshold: 50 };
    const payload = { friendId: 'f1', eventData: {} };
    expect(matchConditions(conditions, payload)).toBe(true);
  });

  it('eventData 自体が undefined の場合はマッチする', () => {
    const conditions = { score_threshold: 50 };
    const payload = { friendId: 'f1' };
    expect(matchConditions(conditions, payload)).toBe(true);
  });
});

// ─── fireEvent 統合テスト (モック) ────────────────────────

/**
 * D1Database スタブを生成するヘルパー。
 * D1Database の prepare → bind → first/run チェーンをモックする。
 * @param score - friends テーブルから返すスコア値
 */
function makeDb(score: number): D1Database {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ score }),
        run: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as D1Database;
}

/** テスト用 AutomationRow を生成するヘルパー */
function makeAutomation(overrides: Partial<AutomationRow> & { conditions: string; actions: string }): AutomationRow {
  return {
    id: 'auto-test',
    name: 'Test Automation',
    description: null,
    event_type: 'purchase',
    line_account_id: null,
    is_active: 1,
    priority: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('fireEvent — 2フェーズ実行でscoreが正しく注入される', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // デフォルトのモック設定（automationなし）に戻す
    vi.mocked(db.getActiveOutgoingWebhooksByEvent).mockResolvedValue([]);
    vi.mocked(db.getActiveAutomationsByEvent).mockResolvedValue([]);
    vi.mocked(db.getActiveNotificationRulesByEvent).mockResolvedValue([]);
  });

  it('processScoring完了後にcurrentScoreがpayloadに注入され、score_threshold条件が評価される', async () => {
    // threshold=50 の automation を返すよう設定
    vi.mocked(db.getActiveAutomationsByEvent).mockResolvedValue([
      makeAutomation({
        id: 'auto-1',
        conditions: JSON.stringify({ score_threshold: 50 }),
        actions: JSON.stringify([{ type: 'add_tag', params: { tagId: 'tag-vip' } }]),
      }),
    ]);

    // score=60（threshold=50 を上回る）
    const mockDb = makeDb(60);

    await fireEvent(mockDb, 'purchase', { friendId: 'friend-1' });

    // score=60 >= threshold=50 → automation がトリガーされるべき
    expect(db.addTagToFriend).toHaveBeenCalledWith(mockDb, 'friend-1', 'tag-vip');
    expect(db.createAutomationLog).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ automationId: 'auto-1', status: 'success' }),
    );
  });

  it('score < threshold の場合はautomationがスキップされる', async () => {
    // threshold=50 の automation を返すよう設定
    vi.mocked(db.getActiveAutomationsByEvent).mockResolvedValue([
      makeAutomation({
        id: 'auto-2',
        conditions: JSON.stringify({ score_threshold: 50 }),
        actions: JSON.stringify([{ type: 'add_tag', params: { tagId: 'tag-vip' } }]),
      }),
    ]);

    // score=30（threshold=50 を下回る）
    const mockDb = makeDb(30);

    await fireEvent(mockDb, 'purchase', { friendId: 'friend-2' });

    // score=30 < threshold=50 → automation がスキップされるべき
    expect(db.addTagToFriend).not.toHaveBeenCalled();
    expect(db.createAutomationLog).not.toHaveBeenCalled();
  });
});
