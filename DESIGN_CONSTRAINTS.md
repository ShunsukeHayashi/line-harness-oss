# DESIGN_CONSTRAINTS.md — line-harness-oss

## Security & Authentication

### HMAC Signature Verification (CRITICAL)
- **MUST** verify `X-Line-Signature` HMAC-SHA256 signature on all webhook requests
- **MUST** use constant-time comparison (`crypto.timingSafeEqual()`)
- **NEVER** expose raw HMAC secret in logs or error messages
- **MUST** reject requests with missing or invalid signature (401)

Example:
```typescript
import crypto from 'crypto';

function verifySignature(body: string, signature: string, secret: string): boolean {
  const hash = crypto.createHmac('sha256', secret).update(body).digest('base64');
  const expected = Buffer.from(signature);
  const actual = Buffer.from(hash);
  return crypto.timingSafeEqual(expected, actual);
}
```

### Environment Variables
- `LINE_CHANNEL_SECRET`: HMAC secret for signature verification
- `LINE_CHANNEL_ACCESS_TOKEN`: Bearer token for LINE Messaging API
- `ANTHROPIC_API_KEY`: Claude API key (do NOT log or expose)
- **NEVER** commit secrets to repository
- **MUST** use GitHub Secrets or secure environment variable injection

## LINE Messaging API Constraints

### Reply Token Usage (CRITICAL)
- Reply token is **single-use only**
- **MUST NOT** call `client.replyMessage()` more than once per reply token
- **MUST** aggregate all reply messages into a single call
- For additional messages beyond the initial reply, use `client.pushMessage()`

### Message Limits
- Reply: max 5 messages per reply token
- Push: max 5 messages per call
- **MUST** respect these limits to avoid API errors

### Trigger Word Prohibition (CRITICAL)
- **MUST NOT** implement trigger word filtering (`if (text.startsWith('/')`)
- Reason: LINE harness is for universal AI integration, not command parsing
- User can control triggers via LINE app settings or separate orchestration layer

## TypeScript Type Safety

### Strict Type Checking
- **MUST** enable `strict: true` in `tsconfig.json`
- **MUST** avoid `any` type (use `unknown` or explicit types)
- **MUST** handle all `Promise` rejections with `.catch()` or `try/catch`

### Webhook Event Typing
- **MUST** use `@line/bot-sdk` types for all webhook events
- Example:
```typescript
import { WebhookEvent, MessageEvent, TextEventMessage } from '@line/bot-sdk';

function handleEvent(event: WebhookEvent): Promise<void> {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve();
  }
  const message = event.message as TextEventMessage;
  // process message.text
}
```

## Time Handling (CRITICAL)

### JST Time Zone Enforcement
- **MUST** use `jstNow()` helper for all timestamps
- **NEVER** use `new Date()` directly without timezone conversion
- **MUST** format as ISO 8601 with JST offset: `YYYY-MM-DDTHH:mm:ss+09:00`

Example:
```typescript
function jstNow(): string {
  return new Date().toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/\//g, '-').replace(/ /, 'T') + '+09:00';
}
```

## Error Handling

### Webhook Response Requirements
- **MUST** return 200 OK for valid webhook signature (even if processing fails)
- **MUST** return 401 for invalid signature
- **MUST** return 500 only for unrecoverable server errors
- **MUST** log errors to stderr but not expose internal details in response

### Rate Limiting
- LINE API has undocumented rate limits
- **MUST** implement exponential backoff for 429 responses
- **MUST** cache LINE API responses when possible

## Testing

### Required Test Coverage
- HMAC signature verification (valid/invalid/missing)
- Reply token single-use enforcement
- JST time formatting
- Trigger word prohibition (ensure no filtering logic exists)

### Integration Testing
- **MUST** test against LINE Messaging API sandbox
- **MUST NOT** use production channel for automated tests

## Postmortem-Derived Constraints

### From 2026-03-26 Postmortem (みやびライン連鎖障害)
1. **NEVER** use `claude-code --non-interactive` (command does not exist)
2. **MUST** use `claude --print` with stdin for AI review workflows
3. **MUST** use `CLAUDE_CODE_OAUTH_TOKEN` (not `ANTHROPIC_API_KEY`)
4. **MUST** include `actorLogins: []` in Copilot assignment GraphQL
5. **MUST** include `baseRef` in `agentAssignment` mutation
6. **MUST** escape Issue body via file (`gh issue view N --json body -q .body > /tmp/issue_body.txt`) to prevent injection attacks

## Repository Structure

- `src/index.ts`: Express server + webhook handler
- `src/claude.ts`: Claude API integration
- `src/line.ts`: LINE Messaging API client
- `tests/`: Unit and integration tests
- `.github/workflows/`: CI/CD workflows (decompose, copilot-assign, ai-review, auto-merge)

## Deployment

### Vercel Deployment
- **MUST** set all environment variables in Vercel dashboard
- **MUST** use `vercel.json` for routing configuration
- **MUST** set `X-Line-Signature` header allowlist in CORS

### Health Check
- **MUST** provide `/health` endpoint returning `{ status: 'ok', timestamp: jstNow() }`
- **MUST** add `Cache-Control: no-cache, no-store, must-revalidate` header

## References

- LINE Messaging API: https://developers.line.biz/en/reference/messaging-api/
- Postmortem: `docs/postmortem-2026-03-26.md` (in agentic-pipeline repo)
- Harness Engineering: `docs/design/harness-engineering.md` (in workspace)
