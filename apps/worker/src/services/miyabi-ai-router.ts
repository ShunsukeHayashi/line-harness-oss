/**
 * みやびライン AI Router
 * LINE Webhook テキストメッセージ → Miyabi エージェント → LINE 返答
 *
 * このファイルは webhook.ts の message イベントハンドラから呼ばれる。
 * 業種を判定し、対応する OpenClaw エージェントに問い合わせ、返答を生成する。
 */

export type IndustryType = 'gyosei' | 'salon' | 'clinic' | 'ec' | 'general'

export interface MiyabiRouterConfig {
  ANTHROPIC_API_KEY?: string
  MIYABI_INDUSTRY?: string  // テナント設定（未設定なら auto-detect）
  MIYABI_ENABLED?: string   // "true" で有効化
}

// ─── 業種 → エージェント プロンプト ────────────────────────────
const INDUSTRY_SYSTEM_PROMPTS: Record<IndustryType, string> = {
  gyosei: `あなたは行政書士・税理士事務所のAIアシスタントです。
問い合わせに対して、専門的かつ親切に案内してください。
- 在留資格・ビザ申請、会社設立、相続・遺言に関する問い合わせに対応
- 「無料相談の予約」を促すCTAを自然に含める
- 複雑な法律判断は「専門家にご相談ください」と明示
- 返答は300文字以内で、読みやすく箇条書きを活用`,

  salon: `あなたは美容サロン・エステの予約・案内AIアシスタントです。
- 予約・空き確認・メニュー案内に対応
- 「ご予約はこちら」のCTAを含める
- 丁寧で温かみのある言葉遣い
- 返答は200文字以内`,

  clinic: `あなたは医療クリニックの案内AIアシスタントです。
- 診療時間・アクセス・予約方法の案内
- 症状への医療的アドバイスは行わない（「受診をお勧めします」に留める）
- 緊急の場合は「119番または救急病院へ」を案内
- 返答は250文字以内`,

  ec: `あなたはECショップのカスタマーサポートAIです。
- 注文状況・配送・返品・商品問い合わせに対応
- 注文番号を確認して適切に案内
- 返答は200文字以内`,

  general: `あなたはみやびラインのAIアシスタントです。
お客様のご質問に丁寧にお答えします。
返答は300文字以内でお願いします。`,
}

// ─── キーワード → 業種 自動判定 ────────────────────────────────
const INDUSTRY_KEYWORDS: Record<IndustryType, string[]> = {
  gyosei:  ['在留', 'ビザ', '帰化', '会社設立', '相続', '遺言', '許可', '申請', '行政書士', '税理士', '法人'],
  salon:   ['予約', '美容', 'カット', 'カラー', 'エステ', 'マッサージ', 'ネイル', 'まつげ', 'サロン'],
  clinic:  ['診察', '受診', '診療', '病院', 'クリニック', '症状', '薬', '処方', '健診'],
  ec:      ['注文', '配送', '返品', '商品', '発送', '届いて', '在庫', 'キャンセル'],
  general: [],
}

function detectIndustry(text: string, configured?: string): IndustryType {
  // テナント設定がある場合はそれを優先
  if (configured && configured in INDUSTRY_KEYWORDS) {
    return configured as IndustryType
  }
  // キーワードマッチング
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS) as [IndustryType, string[]][]) {
    if (industry === 'general') continue
    if (keywords.some(kw => text.includes(kw))) {
      return industry
    }
  }
  return 'general'
}

// ─── メイン: AI返答生成 ─────────────────────────────────────────
export async function generateMiyabiReply(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  env: MiyabiRouterConfig | undefined,
): Promise<string | null> {
  if (!env) return null;
  // みやびライン機能が有効かチェック
  if (env.MIYABI_ENABLED !== 'true') return null

  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[miyabi-ai-router] ANTHROPIC_API_KEY が未設定')
    return null
  }

  const industry = detectIndustry(userMessage, env.MIYABI_INDUSTRY)
  const systemPrompt = INDUSTRY_SYSTEM_PROMPTS[industry]

  // 会話履歴を含めたメッセージ配列（直近5件）
  const messages = [
    ...conversationHistory.slice(-5).map(h => ({
      role: h.role,
      content: h.content,
    })),
    { role: 'user' as const, content: userMessage },
  ]

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', // 高速・低コスト
        max_tokens: 300,
        system: systemPrompt,
        messages,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[miyabi-ai-router] API error:', res.status, err)
      return null
    }

    const data = await res.json() as {
      content: Array<{ type: string; text: string }>
    }
    const text = data.content?.find(c => c.type === 'text')?.text
    return text ?? null

  } catch (err) {
    console.error('[miyabi-ai-router] fetch error:', err)
    return null
  }
}

// ─── 会話履歴 D1 ヘルパー ──────────────────────────────────────
export async function getConversationHistory(
  db: D1Database,
  friendId: string,
  limit = 6,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  try {
    const rows = await db
      .prepare(
        `SELECT direction, content FROM messages_log
         WHERE friend_id = ? AND message_type = 'text'
         ORDER BY created_at DESC LIMIT ?`,
      )
      .bind(friendId, limit * 2)
      .all<{ direction: string; content: string }>()

    return rows.results
      .reverse()
      .map(r => ({
        role: (r.direction === 'incoming' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: r.content,
      }))
  } catch {
    return []
  }
}
