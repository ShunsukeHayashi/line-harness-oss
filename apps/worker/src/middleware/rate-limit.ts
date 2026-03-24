import type { Context, Next } from 'hono';
import type { Env } from '../index.js';

type RateLimitOptions = {
  /** Time window in milliseconds */
  windowMs: number;
  /** Max requests per window per IP */
  maxRequests: number;
  /** Key prefix to namespace per-endpoint counters */
  keyPrefix: string;
};

/**
 * D1-based sliding window rate limiter for Cloudflare Workers.
 *
 * Stores request timestamps in the rate_limit_log table (see migration 008).
 * Cleans up expired entries on each check to keep the table small.
 *
 * Usage:
 *   app.use('/api/broadcasts/*', rateLimitMiddleware({ windowMs: 60_000, maxRequests: 10, keyPrefix: 'broadcast' }))
 *   app.use('/api/friends/*',    rateLimitMiddleware({ windowMs: 60_000, maxRequests: 100, keyPrefix: 'friends' }))
 */
export function rateLimitMiddleware(options: RateLimitOptions) {
  const { windowMs, maxRequests, keyPrefix } = options;

  return async (c: Context<Env>, next: Next): Promise<Response | void> => {
    const ip =
      c.req.header('CF-Connecting-IP') ??
      c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
      'unknown';

    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      // Delete expired entries for this key (sliding window cleanup)
      await c.env.DB.prepare(
        'DELETE FROM rate_limit_log WHERE key = ? AND timestamp < ?',
      )
        .bind(key, windowStart)
        .run();

      // Count remaining requests in current window
      const row = await c.env.DB.prepare(
        'SELECT COUNT(*) AS cnt FROM rate_limit_log WHERE key = ? AND timestamp >= ?',
      )
        .bind(key, windowStart)
        .first<{ cnt: number }>();

      const count = row?.cnt ?? 0;

      // Set rate limit headers regardless of outcome
      c.res.headers.set('X-RateLimit-Limit', String(maxRequests));
      c.res.headers.set('X-RateLimit-Remaining', String(Math.max(0, maxRequests - count - 1)));
      c.res.headers.set('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)));

      if (count >= maxRequests) {
        return c.json(
          { success: false, error: 'Too Many Requests' },
          429,
          { 'Retry-After': String(Math.ceil(windowMs / 1000)) },
        );
      }

      // Record this request
      await c.env.DB.prepare(
        'INSERT INTO rate_limit_log (key, timestamp) VALUES (?, ?)',
      )
        .bind(key, now)
        .run();
    } catch {
      // Rate limit table might not exist yet (before migration) — fail open
      console.warn('[rate-limit] DB error, failing open');
    }

    return next();
  };
}
