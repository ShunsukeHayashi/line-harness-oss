# LINE Harness

**Open-source LINE CRM — the free alternative to L-step and Utage.**

Operate your LINE Official Account entirely via API or natural language through Claude Code.

```
"Send a reminder 3 days before and 1 day before the seminar to all attendees"
"Broadcast tomorrow's sale announcement to everyone at 10 AM"
"Create a form, tag respondents as VIP, and start the follow-up scenario"
```

No dashboard required.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Deploy to Cloudflare](https://img.shields.io/badge/Deploy-Cloudflare%20Workers-F38020?logo=cloudflare)](https://dash.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)

---

## Why LINE Harness?

| | L-step | Utage | **LINE Harness** |
|---|---|---|---|
| Monthly cost | $140/mo | $70/mo | **$0** |
| Step delivery | Yes | Yes | Yes |
| Segmented broadcast | Yes | Yes | Yes |
| Rich menu switching | Yes | Yes | Yes |
| Forms | Yes | Yes | Yes |
| Lead scoring | Yes | No | Yes |
| IF-THEN automation | Partial | Partial | Yes |
| Open API | No | No | **Full** |
| AI (Claude Code) | No | No | **Yes** |
| BAN detection & migration | No | No | **Yes** |
| Multi-account | Extra cost | Extra cost | **Built-in** |
| Source code | Closed | Closed | **MIT** |

---

## Features

### Delivery
- **Step sequences** — minute-level delay control, conditional branching, stealth mode
- **Instant delivery** — broadcast immediately or to individuals via single API call
- **Broadcast** — send to all / by tag / by segment, instant or scheduled, batch sending
- **Reminders** — countdown delivery from a target date (3 days before, 1 day before, day of)
- **Templates** — manage and reuse message templates

### CRM
- **Friend management** — auto-registration via Webhook, profile retrieval, custom metadata
- **Tags** — segmentation, delivery conditions, scenario triggers
- **Scoring** — automatic lead score calculation based on behavior
- **Operator chat** — reply to LINE messages directly from the admin panel

### Marketing
- **Rich menus** — switch menus per user or per tag
- **Tracking links** — click measurement + automatic tagging + scenario launch
- **Forms (LIFF)** — forms that work inside LINE, responses auto-saved as metadata
- **Calendar booking** — Google Calendar-integrated reservation system (LIFF)

### Automation
- **IF-THEN rules** — 7 trigger types x 6 action types
- **Auto-reply** — keyword matching (exact / partial)
- **Webhook IN/OUT** — external service integration (Stripe, Slack, etc.)
- **Notification rules** — conditional alert delivery

### Safety
- **BAN detection** — automatic account health monitoring (normal / warning / danger)
- **Account migration** — one-click migration on BAN (friends, tags, scenarios transferred)
- **Stealth mode** — send jitter, randomized batch intervals
- **Multi-account** — UUID-based cross-account data integration

### Analytics
- **Conversion tracking** — define conversion points, record events, generate reports
- **Affiliate** — issue codes, track clicks, calculate rewards
- **Attribution** — auto-record friend addition source via `/auth/line?ref=xxx`

---

## Architecture

```
LINE Platform ──> Cloudflare Workers (Hono) ──> D1 (SQLite)
                         |                          |
                  Cron (step check)            42 tables
                         |
                  LINE Messaging API
                  (instant + scheduled delivery)

Next.js 15 (admin) ──> Workers API ──> D1
LIFF (Vite) ──> Workers API ──> D1
TypeScript SDK ──> Workers API ──> D1
Claude Code ──> Workers API ──> D1
```

| Layer | Technology |
|-------|-----------|
| API / Webhook | Cloudflare Workers + Hono |
| Database | Cloudflare D1 (SQLite) — 42 tables |
| Admin panel | Next.js 15 (App Router) + Tailwind CSS |
| LIFF | Vite + TypeScript |
| SDK | TypeScript (ESM + CJS, 41 tests) |
| Scheduled jobs | Workers Cron Triggers |
| CI/CD | GitHub Actions |

**Runs up to 5,000 friends on Cloudflare's free tier. Zero server cost.**

---

## Quick Start

### Prerequisites

- Node.js 20+, pnpm 9+
- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [LINE Developers account](https://developers.line.biz/)

### 1. Clone

```bash
git clone https://github.com/ShunsukeHayashi/line-harness-oss.git
cd line-harness-oss
pnpm install
```

### 2. Create LINE Channels

In [LINE Developers Console](https://developers.line.biz/console/), create **two channels**:

1. **Messaging API channel** — for sending and receiving messages
2. **LINE Login channel** — for automatic UUID acquisition (**required**)

> Without the LINE Login channel, UUIDs cannot be obtained for friends added via `/auth/line`, which disables multi-account integration and attribution tracking.

### 3. Create D1 Database

```bash
npx wrangler d1 create line-crm
# Copy the database_id output into apps/worker/wrangler.toml

npx wrangler d1 execute line-crm --file=packages/db/schema.sql
```

### 4. Set Secrets

```bash
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put API_KEY            # openssl rand -hex 32
npx wrangler secret put LINE_LOGIN_CHANNEL_ID
npx wrangler secret put LINE_LOGIN_CHANNEL_SECRET
npx wrangler secret put ALLOWED_ORIGINS   # e.g. https://admin.example.com
```

### 5. Deploy

```bash
pnpm deploy:worker
# -> https://your-worker.your-subdomain.workers.dev
```

### 6. Set LINE Webhook URL

LINE Developers Console -> Messaging API -> Webhook URL:
```
https://your-worker.your-subdomain.workers.dev/webhook
```

### 7. Verify

```bash
# Friend add URL (paste this into your LP or social media)
https://your-worker.your-subdomain.workers.dev/auth/line?ref=test

# API health check
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://your-worker.your-subdomain.workers.dev/api/friends/count
```

---

## Project Structure

```
line-harness-oss/
├── apps/
│   ├── worker/           # Cloudflare Workers API (Hono)
│   ├── web/              # Next.js 15 admin panel
│   └── liff/             # LINE mini app (Vite)
├── packages/
│   ├── db/               # D1 schema + queries (42 tables)
│   ├── sdk/              # TypeScript SDK (41 tests)
│   ├── line-sdk/         # LINE Messaging API wrapper
│   └── shared/           # Shared type definitions
├── docs/
│   └── wiki/             # 23-page documentation
└── .github/
    └── workflows/        # GitHub Actions CI/CD
```

---

## API Reference

25 route files, 100+ endpoints. Full reference: [Wiki: API Reference](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/20-API-Reference).

```bash
# List friends
GET  /api/friends?limit=20&offset=0&tagId=xxx

# Create scenario
POST /api/scenarios
{ "name": "Welcome", "triggerType": "friend_add" }

# Add step
POST /api/scenarios/:id/steps
{ "stepOrder": 0, "delayMinutes": 0, "messageType": "text", "messageContent": "Welcome!" }

# Schedule broadcast
POST /api/broadcasts
{ "title": "Sale", "messageType": "text", "messageContent": "50% OFF!", "targetType": "all", "scheduledAt": "2026-04-01T10:00:00+09:00" }

# Create automation rule
POST /api/automations
{ "name": "Friend add -> Welcome", "eventType": "friend_add", "actions": [{"type": "add_tag", "params": {"tagId": "xxx"}}] }
```

---

## Documentation

**[Wiki (23 pages)](https://github.com/ShunsukeHayashi/line-harness-oss/wiki)**

| Category | Pages |
|---------|--------|
| Getting started | [Home](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/Home) · [Getting Started](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/Getting-Started) · [Architecture](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/Architecture) · [Configuration](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/Configuration) |
| Delivery | [Scenarios](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/Scenarios) · [Broadcasts](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/Broadcasts) · [Reminders](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/12-Reminders) |
| CRM | [Friends](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/Friends) · [Tags](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/Tags) · [Scoring](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/13-Scoring) · [Chat](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/16-Chat-and-AutoReply) |
| Marketing | [Rich Menus](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/09-Rich-Menus) · [Tracked Links](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/10-Tracked-Links) · [Forms & LIFF](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/11-Forms-and-LIFF) · [CV & Affiliates](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/17-CV-Tracking-and-Affiliates) |
| Automation | [Automation](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/14-Automation) · [Webhooks](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/15-Webhooks-and-Notifications) |
| Safety | [Multi-Account & BAN](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/18-Multi-Account-and-BAN) |
| Development | [SDK Reference](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/19-SDK-Reference) · [API Reference](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/20-API-Reference) · [Deployment](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/21-Deployment) · [Operations](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/22-Operations) · [Claude Code](https://github.com/ShunsukeHayashi/line-harness-oss/wiki/23-Claude-Code-Integration) |

---

## Cost

| Friends | Monthly cost |
|---------|-------------|
| Up to 5,000 | **Free** (Cloudflare free tier) |
| Up to 10,000 | ~$10/mo (D1 + Workers paid plan) |
| 50,000+ | ~$25/mo + Queues recommended |

L-step: from $140/mo. LINE Harness: **from $0.**

---

## Local Development

```bash
pnpm dev:worker    # -> http://localhost:8787
pnpm dev:web       # -> http://localhost:3001
pnpm db:migrate:local
```

---

## Contributing

Issues and PRs are welcome. Please read the [Wiki](https://github.com/ShunsukeHayashi/line-harness-oss/wiki) before contributing.

---

## License

MIT
