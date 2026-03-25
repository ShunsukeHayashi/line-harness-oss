// =============================================================================
// Beta Feedback — structured feedback collection from beta testers
// =============================================================================

export type FeedbackCategory = 'bug' | 'feature' | 'ux' | 'performance' | 'general';
export type FeedbackStatus = 'open' | 'in_review' | 'resolved' | 'wontfix';

export interface BetaFeedback {
  id: string;
  display_name: string | null;
  email: string | null;
  line_user_id: string | null;
  category: FeedbackCategory;
  rating: number | null;
  title: string;
  body: string;
  page_context: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  status: FeedbackStatus;
  created_at: string;
}

export interface CreateBetaFeedbackInput {
  displayName?: string | null;
  email?: string | null;
  lineUserId?: string | null;
  category?: FeedbackCategory;
  rating?: number | null;
  title: string;
  body: string;
  pageContext?: string | null;
}

export interface ListBetaFeedbackOptions {
  status?: FeedbackStatus;
  category?: FeedbackCategory;
  limit?: number;
  offset?: number;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createBetaFeedback(
  db: D1Database,
  input: CreateBetaFeedbackInput,
): Promise<BetaFeedback> {
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO beta_feedback
         (id, display_name, email, line_user_id, category, rating, title, body, page_context)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.displayName ?? null,
      input.email ?? null,
      input.lineUserId ?? null,
      input.category ?? 'general',
      input.rating ?? null,
      input.title,
      input.body,
      input.pageContext ?? null,
    )
    .run();

  return (await getBetaFeedbackById(db, id))!;
}

export async function getBetaFeedbackById(
  db: D1Database,
  id: string,
): Promise<BetaFeedback | null> {
  return db
    .prepare(`SELECT * FROM beta_feedback WHERE id = ?`)
    .bind(id)
    .first<BetaFeedback>();
}

export async function listBetaFeedback(
  db: D1Database,
  opts: ListBetaFeedbackOptions = {},
): Promise<BetaFeedback[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.status) {
    conditions.push('status = ?');
    params.push(opts.status);
  }
  if (opts.category) {
    conditions.push('category = ?');
    params.push(opts.category);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(opts.limit ?? 50, 200); // cap at 200 to prevent oversized responses
  const offset = opts.offset ?? 0;

  const result = await db
    .prepare(
      `SELECT * FROM beta_feedback ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, limit, offset)
    .all<BetaFeedback>();

  return result.results;
}

export async function updateBetaFeedbackGithubIssue(
  db: D1Database,
  id: string,
  issueNumber: number,
  issueUrl: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE beta_feedback
          SET github_issue_number = ?,
              github_issue_url    = ?
        WHERE id = ?`,
    )
    .bind(issueNumber, issueUrl, id)
    .run();
}

export async function updateBetaFeedbackStatus(
  db: D1Database,
  id: string,
  status: FeedbackStatus,
): Promise<void> {
  await db
    .prepare(`UPDATE beta_feedback SET status = ? WHERE id = ?`)
    .bind(status, id)
    .run();
}
