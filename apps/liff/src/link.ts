/**
 * PPAL Identity Hub — LIFF 連携画面
 *
 * ?page=link でこのモジュールが起動する。
 * LINE user ID を取得し、Discord OAuth フローと Teachable メール連携フォームを表示する。
 */

declare const liff: {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(opts?: { redirectUri?: string }): void;
  getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
  getIDToken(): string | null;
  isInClient(): boolean;
  closeWindow(): void;
};

const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:8787';

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showLinkPage(lineUserId: string, displayName: string): void {
  const container = document.getElementById('app')!;

  const discordOauthUrl = `${API_URL}/api/liff/link-discord?lineUserId=${encodeURIComponent(lineUserId)}`;

  container.innerHTML = `
    <div class="link-card">
      <h2>アカウント連携</h2>
      <p class="greeting">${escapeHtml(displayName)} さん、ようこそ！</p>
      <p class="description">以下のアカウントを連携して受講・Discordコミュニティへのアクセスを開始してください。</p>

      <div class="section">
        <h3>① Discord 連携</h3>
        <a href="${escapeHtml(discordOauthUrl)}" class="btn btn-discord" id="discordBtn">
          Discord で連携する
        </a>
      </div>

      <div class="section">
        <h3>② Teachable メール連携</h3>
        <form id="teachableForm">
          <input
            type="email"
            id="teachableEmail"
            placeholder="Teachable 登録メールアドレス"
            class="input-email"
            required
          />
          <button type="submit" class="btn btn-teachable">メールを連携する</button>
        </form>
        <p class="result" id="teachableResult"></p>
      </div>
    </div>
  `;

  const form = document.getElementById('teachableForm') as HTMLFormElement;
  const resultEl = document.getElementById('teachableResult')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('teachableEmail') as HTMLInputElement;
    const email = emailInput.value.trim();
    if (!email) return;

    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.textContent = '送信中...';
    resultEl.textContent = '';

    try {
      const res = await fetch(`${API_URL}/api/liff/link-teachable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId, teachableEmail: email }),
      });

      if (res.ok) {
        resultEl.textContent = '✅ Teachable メールを連携しました！';
        resultEl.className = 'result success';
        emailInput.value = '';
      } else {
        resultEl.textContent = '❌ 連携に失敗しました。もう一度お試しください。';
        resultEl.className = 'result error';
      }
    } catch {
      resultEl.textContent = '❌ ネットワークエラーが発生しました。';
      resultEl.className = 'result error';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'メールを連携する';
    }
  });
}

function showError(message: string): void {
  const container = document.getElementById('app')!;
  container.innerHTML = `
    <div class="link-card">
      <h2>エラー</h2>
      <p class="error-msg">${escapeHtml(message)}</p>
    </div>
  `;
}

export async function initLink(): Promise<void> {
  try {
    const profile = await liff.getProfile();
    showLinkPage(profile.userId, profile.displayName);
  } catch (err) {
    showError(err instanceof Error ? err.message : 'プロフィール取得に失敗しました');
  }
}
