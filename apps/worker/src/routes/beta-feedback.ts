import { Hono } from 'hono';
import {
  createBetaFeedback,
  getBetaFeedbackById,
  listBetaFeedback,
  updateBetaFeedbackGithubIssue,
  updateBetaFeedbackStatus,
  type BetaFeedback,
  type FeedbackCategory,
  type FeedbackStatus,
} from '@line-crm/db';
import type { Env } from '../index.js';

const betaFeedback = new Hono<Env>();

// ── Public endpoints ──────────────────────────────────────────────────────────

// GET /feedback — standalone HTML form (public, no auth required)
betaFeedback.get('/feedback', (c) => {
  return c.html(FEEDBACK_FORM_HTML);
});

// POST /api/beta-feedback — submit feedback, persist to DB, fire GitHub Issue
betaFeedback.post('/api/beta-feedback', async (c) => {
  let body: {
    displayName?: string;
    email?: string;
    lineUserId?: string;
    category?: FeedbackCategory;
    rating?: number;
    title?: string;
    body?: string;
    pageContext?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const title = body.title?.trim();
  const feedbackBody = body.body?.trim();

  if (!title) return c.json({ success: false, error: 'title is required' }, 400);
  if (!feedbackBody) return c.json({ success: false, error: 'body is required' }, 400);
  if (body.rating !== undefined && (body.rating < 1 || body.rating > 5)) {
    return c.json({ success: false, error: 'rating must be between 1 and 5' }, 400);
  }

  const validCategories: FeedbackCategory[] = ['bug', 'feature', 'ux', 'performance', 'general'];
  const category: FeedbackCategory =
    body.category && validCategories.includes(body.category) ? body.category : 'general';

  try {
    const feedback = await createBetaFeedback(c.env.DB, {
      displayName: body.displayName || null,
      email: body.email || null,
      lineUserId: body.lineUserId || null,
      category,
      rating: body.rating ?? null,
      title,
      body: feedbackBody,
      pageContext: body.pageContext || null,
    });

    // Fire GitHub Issue creation in the background — does not block the response.
    // Uses ctx.waitUntil so the Worker stays alive until the async task completes.
    const githubToken = c.env.GITHUB_TOKEN;
    const githubRepo = c.env.GITHUB_REPO; // e.g. "ShunsukeHayashi/line-harness-oss"

    if (githubToken && githubRepo) {
      c.executionCtx.waitUntil(
        createGithubIssue({ token: githubToken, repo: githubRepo }, feedback)
          .then(async (issue) => {
            if (issue) {
              await updateBetaFeedbackGithubIssue(
                c.env.DB,
                feedback.id,
                issue.number,
                issue.html_url,
              );
            }
          })
          .catch((err) => {
            console.error('GitHub Issue creation failed (non-fatal):', err);
          }),
      );
    }

    return c.json(
      {
        success: true,
        data: { id: feedback.id },
        message: 'フィードバックを受け取りました。ありがとうございます！',
      },
      201,
    );
  } catch (err) {
    console.error('POST /api/beta-feedback error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ── Admin endpoints (auth required) ──────────────────────────────────────────

// GET /api/admin/beta-feedback?status=open&category=bug&limit=50&offset=0
betaFeedback.get('/api/admin/beta-feedback', async (c) => {
  try {
    const { status, category, limit, offset } = c.req.query();
    const items = await listBetaFeedback(c.env.DB, {
      status: status as FeedbackStatus | undefined,
      category: category as FeedbackCategory | undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    return c.json({ success: true, data: items });
  } catch (err) {
    console.error('GET /api/admin/beta-feedback error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/admin/beta-feedback/:id — single item
betaFeedback.get('/api/admin/beta-feedback/:id', async (c) => {
  try {
    const item = await getBetaFeedbackById(c.env.DB, c.req.param('id'));
    if (!item) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: item });
  } catch (err) {
    console.error('GET /api/admin/beta-feedback/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/admin/beta-feedback/:id — update status
betaFeedback.patch('/api/admin/beta-feedback/:id', async (c) => {
  let body: { status?: FeedbackStatus };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const validStatuses: FeedbackStatus[] = ['open', 'in_review', 'resolved', 'wontfix'];
  if (!body.status || !validStatuses.includes(body.status)) {
    return c.json(
      { success: false, error: `status must be one of: ${validStatuses.join(', ')}` },
      400,
    );
  }

  try {
    await updateBetaFeedbackStatus(c.env.DB, c.req.param('id'), body.status);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('PATCH /api/admin/beta-feedback/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ── GitHub Issue helper ───────────────────────────────────────────────────────

interface GithubIssueResult {
  number: number;
  html_url: string;
}

// Maps our category values to standard GitHub label names.
// Only `bug` and `enhancement` are guaranteed to exist in a fresh repo;
// the others are created automatically on first use if the token has push access.
const CATEGORY_TO_LABEL: Record<FeedbackCategory, string> = {
  bug: 'bug',
  feature: 'enhancement',
  ux: 'feedback/ux',
  performance: 'feedback/performance',
  general: 'feedback/general',
};

async function createGithubIssue(
  config: { token: string; repo: string },
  feedback: BetaFeedback,
): Promise<GithubIssueResult | null> {
  const stars = feedback.rating ? '⭐'.repeat(feedback.rating) : '（未評価）';
  const submitter = feedback.display_name || '匿名';
  const contactLine = feedback.email ? `\n- Email: ${feedback.email}` : '';
  const pageCtxLine = feedback.page_context ? `\n- 画面/機能: ${feedback.page_context}` : '';

  const title = `[Beta Feedback] [${feedback.category}] ${feedback.title}`;
  const body = [
    '## フィードバック詳細',
    '',
    feedback.body,
    '',
    '---',
    '',
    '### メタデータ',
    `- カテゴリ: \`${feedback.category}\``,
    `- 満足度: ${stars}`,
    `- 送信者: ${submitter}${contactLine}${pageCtxLine}`,
    `- Feedback ID: \`${feedback.id}\``,
    '',
    '*このIssueはLINE CRM ベータフィードバックシステムにより自動作成されました。*',
  ].join('\n');

  const response = await fetch(`https://api.github.com/repos/${config.repo}/issues`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'line-harness-oss-beta-feedback/1.0',
    },
    body: JSON.stringify({
      title,
      body,
      labels: ['beta-feedback', CATEGORY_TO_LABEL[feedback.category]],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API responded with ${response.status}: ${text}`);
  }

  return response.json<GithubIssueResult>();
}

// ── Feedback form HTML ────────────────────────────────────────────────────────

const FEEDBACK_FORM_HTML = /* html */ `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ベータフィードバック — LINE CRM</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
  <div class="w-full max-w-lg bg-white rounded-2xl shadow-lg p-8">
    <div class="text-center mb-8">
      <div class="text-4xl mb-2">📝</div>
      <h1 class="text-2xl font-bold text-gray-800">ベータフィードバック</h1>
      <p class="text-gray-500 mt-1 text-sm">LINE CRMを使ってみてのご意見・ご要望をお聞かせください</p>
    </div>

    <div id="form-container">
      <form id="feedback-form" class="space-y-5" novalidate>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            お名前 <span class="text-gray-400 font-normal text-xs">(任意)</span>
          </label>
          <input type="text" name="displayName" placeholder="山田 太郎"
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            メールアドレス <span class="text-gray-400 font-normal text-xs">(任意・返信が必要な場合)</span>
          </label>
          <input type="email" name="email" placeholder="example@email.com"
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            カテゴリ <span class="text-red-500 text-xs">必須</span>
          </label>
          <select name="category" required
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none bg-white transition">
            <option value="general">💬 一般</option>
            <option value="bug">🐛 バグ報告</option>
            <option value="feature">✨ 機能要望</option>
            <option value="ux">🎨 UI/UX改善</option>
            <option value="performance">⚡ パフォーマンス</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            満足度 <span class="text-gray-400 font-normal text-xs">(任意)</span>
          </label>
          <div class="flex gap-1" id="star-rating">
            <button type="button" class="star text-gray-300 text-3xl leading-none hover:scale-110 transition-transform" data-v="1">★</button>
            <button type="button" class="star text-gray-300 text-3xl leading-none hover:scale-110 transition-transform" data-v="2">★</button>
            <button type="button" class="star text-gray-300 text-3xl leading-none hover:scale-110 transition-transform" data-v="3">★</button>
            <button type="button" class="star text-gray-300 text-3xl leading-none hover:scale-110 transition-transform" data-v="4">★</button>
            <button type="button" class="star text-gray-300 text-3xl leading-none hover:scale-110 transition-transform" data-v="5">★</button>
          </div>
          <input type="hidden" name="rating" id="rating-hidden" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            タイトル <span class="text-red-500 text-xs">必須</span>
          </label>
          <input type="text" name="title" placeholder="例: メッセージ送信ボタンが押せない"
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition" />
          <p id="title-err" class="hidden text-red-500 text-xs mt-1">タイトルを入力してください</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            詳細 <span class="text-red-500 text-xs">必須</span>
          </label>
          <textarea name="body" rows="4"
            placeholder="具体的な内容をお書きください。バグの場合は再現手順も記載いただけると大変助かります。"
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-y transition"></textarea>
          <p id="body-err" class="hidden text-red-500 text-xs mt-1">詳細を入力してください</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            使用中の機能 <span class="text-gray-400 font-normal text-xs">(任意)</span>
          </label>
          <input type="text" name="pageContext" placeholder="例: 友だちリスト、メッセージ配信、シナリオ設定"
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition" />
        </div>

        <div id="submit-err" class="hidden text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3"></div>

        <button type="submit" id="submit-btn"
          class="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          フィードバックを送信
        </button>
      </form>
    </div>

    <div id="success-container" class="hidden text-center py-8">
      <div class="text-6xl mb-4">🎉</div>
      <h2 class="text-xl font-bold text-gray-800 mb-2">ありがとうございます！</h2>
      <p class="text-gray-500 text-sm">フィードバックを受け取りました。<br />改善に役立てます。</p>
      <button onclick="location.reload()"
        class="mt-6 px-6 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium">
        もう1件送る
      </button>
    </div>

    <noscript>
      <p class="text-center text-red-600 text-sm mt-4 p-4 bg-red-50 rounded-lg">
        このフォームにはJavaScriptが必要です。ブラウザの設定をご確認ください。
      </p>
    </noscript>
  </div>

  <script>
    // ── Star rating ──
    let selectedRating = 0;
    const stars = document.querySelectorAll('.star');
    const ratingHidden = document.getElementById('rating-hidden');

    function highlightStars(n) {
      stars.forEach(s => {
        const v = parseInt(s.dataset.v);
        s.style.color = v <= n ? '#f59e0b' : '#d1d5db';
      });
    }

    stars.forEach(s => {
      s.addEventListener('mouseenter', () => highlightStars(parseInt(s.dataset.v)));
      s.addEventListener('mouseleave', () => highlightStars(selectedRating));
      s.addEventListener('click', () => {
        selectedRating = parseInt(s.dataset.v);
        ratingHidden.value = selectedRating;
        highlightStars(selectedRating);
      });
    });

    // ── Form submission ──
    document.getElementById('feedback-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const btn = document.getElementById('submit-btn');
      const errDiv = document.getElementById('submit-err');

      // Client-side validation
      let valid = true;
      const title = form.title.value.trim();
      const body = form.body.value.trim();

      document.getElementById('title-err').classList.toggle('hidden', !!title);
      document.getElementById('body-err').classList.toggle('hidden', !!body);
      if (!title || !body) valid = false;

      if (!valid) return;

      btn.disabled = true;
      btn.textContent = '送信中...';
      errDiv.classList.add('hidden');

      const payload = {
        displayName: form.displayName.value.trim() || undefined,
        email: form.email.value.trim() || undefined,
        category: form.category.value,
        rating: ratingHidden.value ? parseInt(ratingHidden.value) : undefined,
        title,
        body,
        pageContext: form.pageContext.value.trim() || undefined,
      };

      try {
        const res = await fetch('/api/beta-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();

        if (res.ok && json.success) {
          document.getElementById('form-container').classList.add('hidden');
          document.getElementById('success-container').classList.remove('hidden');
        } else {
          errDiv.textContent = json.error || '送信に失敗しました。もう一度お試しください。';
          errDiv.classList.remove('hidden');
          btn.disabled = false;
          btn.textContent = 'フィードバックを送信';
        }
      } catch {
        errDiv.textContent = 'ネットワークエラーが発生しました。もう一度お試しください。';
        errDiv.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'フィードバックを送信';
      }
    });
  </script>
</body>
</html>`;

export { betaFeedback };
