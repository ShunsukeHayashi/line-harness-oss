import type { Context, Next } from 'hono';
import type { Env } from '../index.js';

export async function authMiddleware(c: Context<Env>, next: Next): Promise<Response | void> {
  // Skip auth for the LINE webhook endpoint — it uses signature verification instead
  // Skip auth for OpenAPI docs — public documentation
  const path = new URL(c.req.url).pathname;
  if (
    path === '/webhook' ||
    path.startsWith('/webhook/') ||
    path === '/docs' ||
    path === '/openapi.json' ||
    path === '/api/affiliates/click' ||
    path.startsWith('/t/') ||
    // /auth/ covers LINE Login OAuth flow (/auth/line, /auth/callback)
    path.startsWith('/auth/') ||
    // Stripe webhook uses its own signature verification
    path === '/api/integrations/stripe/webhook' ||
    // External webhook receivers use their own secret validation
    path.match(/^\/api\/webhooks\/incoming\/[^/]+\/receive$/) ||
    // LIFF form submission endpoints are public (LIFF context only)
    path.match(/^\/api\/forms\/[^/]+\/submit$/) ||
    path.match(/^\/api\/forms\/[^/]+$/) || // GET form definition (public for LIFF)
    // Beta feedback form page and submission endpoint are fully public
    path === '/feedback' ||
    path === '/api/beta-feedback'
    // NOTE: /api/liff/profile is intentionally NOT in this list.
    // It previously bypassed auth, which allowed any caller with a lineUserId
    // to fetch user profile data. Now it requires Authorization: Bearer {API_KEY}.
  ) {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice('Bearer '.length);
  if (token !== c.env.API_KEY) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  return next();
}
