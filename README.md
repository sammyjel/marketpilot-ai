# MarketPilot AI

**Upload one product → AI writes the campaign → you review → publish across your connected social accounts → track what happened.**

A multi-tenant SaaS application that turns a single product photo and a one-line description into a complete, reviewable marketing campaign across Facebook, Instagram, TikTok, YouTube, LinkedIn, Pinterest and X.

The working product name lives in [`src/lib/branding.ts`](src/lib/branding.ts) — change it there and it changes everywhere.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Design principles](#design-principles)
3. [Architecture](#architecture)
4. [Quick start](#quick-start)
5. [Environment variables](#environment-variables)
6. [Database](#database)
7. [Development](#development)
8. [Testing](#testing)
9. [Mock mode](#mock-mode)
10. [AI provider configuration](#ai-provider-configuration)
11. [Storage configuration](#storage-configuration)
12. [Social API configuration](#social-api-configuration)
13. [Billing configuration](#billing-configuration)
14. [Background jobs](#background-jobs)
15. [Security](#security)
16. [Production deployment](#production-deployment)
17. [Troubleshooting](#troubleshooting)
18. [Project layout](#project-layout)

---

## What it does

```
        upload a product photo + one sentence
                        │
              ┌─────────▼─────────┐
              │  Product analyzer │  vision: what is actually visible
              └─────────┬─────────┘
              ┌─────────▼─────────┐
              │   Brand context   │  voice, audience, market, guidelines
              └─────────┬─────────┘
              ┌─────────▼─────────┐
              │ Campaign strategy │  one angle, committed to
              └─────────┬─────────┘
              ┌─────────▼─────────┐
              │ Platform content  │  written separately per network
              └─────────┬─────────┘
              ┌─────────▼─────────┐
              │   SEO generator   │  title, meta, keywords, FAQs
              └─────────┬─────────┘
              ┌─────────▼─────────┐
              │  Creative brief   │  art direction around your product
              └─────────┬─────────┘
              ┌─────────▼─────────┐
              │ Image / video gen │  product preserved exactly
              └─────────┬─────────┘
              ┌─────────▼─────────┐
              │  Quality checker  │  claims, grammar, format, voice
              └─────────┬─────────┘
                    review → approve → schedule / publish → analytics
```

Every stage returns JSON validated against a schema before it is stored. A stage that returns something malformed is repaired once, then retried — never saved half-formed.

---

## Design principles

These shaped most of the non-obvious decisions in the codebase.

**Never claim something happened when it did not.** If a platform API cannot accept a post — TikTok without audit approval, Instagram without publicly reachable media, a text post to a video-only network — the post is marked `manual_required` with a plain-language reason and the media is offered for download. There is no code path that writes `published` without a platform confirming it.

**Never fabricate data.** Analytics show only metrics a platform actually returned; anything else is reported as unavailable rather than rendered as zero. AI insights must cite the figure behind each statement and list what they could not assess. The generator is instructed never to invent testimonials, certifications, statistics, discounts or scarcity, and a separate quality-control pass treats unsupported medical, financial, legal and guaranteed-results claims as blockers that prevent approval.

**The product stays the product.** Generated images are composed from the real photograph — background, framing, lighting and text overlay are generated, the product itself is untouched. Where a text-to-image model is used instead, that asset is labelled as reinterpreted.

**A person approves before anything publishes.** Enforced in `scheduleOrPublish`, not just hidden in the UI. Auto-publish is opt-in and applies only to already-approved campaigns.

**Authorization is server-side.** Every request resolves an `AuthContext` and every query is scoped to that organization. No service accepts an `organizationId` from the client. The middleware only does a cookie-presence fast path; it is explicitly not the security boundary.

**Mock mode is a first-class mode, not a stub.** With `MOCK_EXTERNAL_SERVICES=true` the whole product works end to end — generation, review, previews, OAuth round trip, publishing, quality control — without spending a cent. The mocks enforce the same content rules the real adapters do, so the manual-publish and error paths get exercised in development.

---

## Architecture

**Stack**

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15, App Router, React 19 | Server Components keep secrets server-side by construction |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` | |
| Database | PostgreSQL via Drizzle ORM | One schema, one set of SQL migrations |
| Dev database | PGlite (real PostgreSQL compiled to WASM) | Zero setup, identical dialect to production |
| Styling | Tailwind CSS v4 with design tokens | Rebrandable from one file |
| Validation | Zod v4 | Same schemas validate forms, APIs and AI output |
| Jobs | PostgreSQL-backed queue, `FOR UPDATE SKIP LOCKED` | No extra infrastructure to run |
| Auth | Hand-rolled sessions, scrypt, `arctic` for OAuth | No beta dependency in the security path |

**Layering**

```
  app/            routes, server components, server actions
    └── calls
  server/services/   business logic; every function takes an AuthContext
    └── calls
  server/db/         Drizzle schema and queries
  providers/         every external integration behind an interface
```

Routes never talk to the database directly, and services never import a vendor SDK. Swapping Anthropic for OpenAI, S3 for local disk, or Stripe for another processor is a provider change with no service-layer edits.

**Provider interfaces**

| Interface | Implementations |
| --- | --- |
| `LanguageModelProvider` | Anthropic, OpenAI, Mock |
| `ImageGenerationProvider` | Compositor (product-preserving), OpenAI, Stability |
| `VideoGenerationProvider` | Replicate, Unavailable (honest refusal) |
| `VoiceGenerationProvider` | ElevenLabs, Unavailable |
| `StorageProvider` | Local disk, S3-compatible (SigV4, no SDK) |
| `SocialPublisher` | Facebook, Instagram, TikTok, YouTube, LinkedIn, Pinterest, X, Mock |
| `BillingProvider` | Stripe, Mock |

---

## Quick start

Requires **Node.js 20.11+**. Nothing else — no database server, no Docker.

```bash
npm install
cp .env.example .env.local

# Generate the two required secrets
node -e "const c=require('crypto');console.log('AUTH_SECRET='+c.randomBytes(48).toString('base64'));console.log('ENCRYPTION_KEY='+c.randomBytes(32).toString('base64'))"
# paste both into .env.local

npm run db:migrate     # creates ./.pglite and applies migrations
npm run db:seed        # optional: demo workspace with a brand and products
npm run dev
```

Open <http://localhost:3000>.

With the seed data, sign in as `demo@marketpilot.test` / `demopassword1`, or register a fresh account.

`MOCK_EXTERNAL_SERVICES=true` is the default, so everything works offline immediately.

---

## Environment variables

Every variable is declared and validated in [`src/lib/env.ts`](src/lib/env.ts). Anything not declared there is not read anywhere. A blank value is treated as unset.

**Required**

| Variable | Notes |
| --- | --- |
| `AUTH_SECRET` | 32+ characters. Session signing. |
| `ENCRYPTION_KEY` | 32+ characters. AES-256-GCM key for OAuth tokens at rest. |

**Core**

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_URL` | `http://localhost:3000` | Must match the origin you browse; OAuth callbacks are built from it. |
| `DATABASE_URL` | *(empty)* | Empty uses embedded PGlite. Set for production PostgreSQL. |
| `MOCK_EXTERNAL_SERVICES` | `true` | Overrides every provider. Set `false` to go live. |
| `RUN_INLINE_WORKER` | `true` | Runs the job worker inside the web process. Set `false` in production. |

**Providers** — `AI_PROVIDER`, `AI_PROVIDER_API_KEY`, `AI_MODEL`, `IMAGE_PROVIDER`, `IMAGE_PROVIDER_API_KEY`, `VIDEO_PROVIDER`, `VIDEO_PROVIDER_API_KEY`, `VOICE_PROVIDER`, `VOICE_PROVIDER_API_KEY`.

**Storage** — `STORAGE_DRIVER` (`local` | `s3`), `STORAGE_LOCAL_DIR`, `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET`, `STORAGE_PUBLIC_URL`.

**Social** — `FACEBOOK_*`, `INSTAGRAM_*`, `TIKTOK_*`, `GOOGLE_*` (YouTube), `LINKEDIN_*`, `PINTEREST_*`, `X_*`, each `_CLIENT_ID` and `_CLIENT_SECRET`.

**Billing** — `BILLING_PROVIDER`, `BILLING_SECRET`, `BILLING_WEBHOOK_SECRET`, plus `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PROFESSIONAL`, `STRIPE_PRICE_AGENCY` when using Stripe.

---

## Database

One Drizzle schema in [`src/server/db/schema/`](src/server/db/schema/) produces one set of PostgreSQL migrations in `drizzle/`, applied identically to PGlite in development and managed PostgreSQL in production.

```bash
npm run db:generate    # after editing the schema
npm run db:migrate     # apply pending migrations
npm run db:studio      # browse the data
```

23 tables covering users, organizations and membership, brands and assets, products, campaigns, content and versions, media, social accounts and posts, scheduling, analytics snapshots, templates, subscriptions, usage, notifications, jobs and audit logs. Every tenant-scoped table carries `organization_id` and is indexed on it. Records that history depends on are soft-deleted.

In development, migrations are applied automatically on first database use. In production they are not — run `npm run db:migrate` as a deploy step.

---

## Development

```bash
npm run dev           # app on :3000, with the job worker inside the process
npm run typecheck     # tsc --noEmit
npm run lint
npm run test          # unit + integration
npm run verify        # all three
npm run e2e           # end-to-end against a running dev server
```

---

## Testing

| Suite | Location | Covers |
| --- | --- | --- |
| Unit | `tests/unit/` | Password hashing, encryption, permission matrix, rate limits, JSON extraction, schemas, slugs, timezone conversion, plan limits |
| Integration | `tests/integration/` | Real database. Tenant isolation, role enforcement, plan limits, upload validation, the full campaign pipeline, approval gate, publish idempotency, auth flows |
| End-to-end | `scripts/e2e.ts` | Real HTTP: register → brand → upload → generate → connect → approve → publish → creative, including the background worker |

```bash
npm run test
npm run test:unit
npm run test:integration

# end-to-end needs the app running
npm run dev
npm run e2e     # in a second terminal
```

Tests run against a throwaway PGlite database created per run and always with every external service mocked. No test can reach a real API or a real social account.

---

## Mock mode

`MOCK_EXTERNAL_SERVICES=true` replaces every external dependency:

| Service | Mock behaviour |
| --- | --- |
| Language model | Deterministic fixtures built from the **real** brand and product in the prompt, so output is coherent and schema-valid |
| Image generation | The compositor — a genuine image pipeline that produces usable JPEGs from your product photo |
| Video / voice | Refuses honestly; storyboards, scripts and voice-over lines are still generated |
| Social publishing | Full OAuth round trip against our own callback; enforces real content rules (video-only platforms, Pinterest images, the 280-character limit) |
| Billing | Plan changes apply immediately, no money moves |

Mock-generated campaigns are labelled in the UI and flagged as requiring human review, so they can never be mistaken for a live model's output.

---

## AI provider configuration

```env
MOCK_EXTERNAL_SERVICES=false
AI_PROVIDER=anthropic          # or openai
AI_PROVIDER_API_KEY=sk-...
AI_MODEL=claude-sonnet-5
```

Prompts live in [`src/prompts/marketing/`](src/prompts/marketing/) — never inside components. Output schemas are in [`src/server/ai/schemas.ts`](src/server/ai/schemas.ts) and stages in [`src/server/ai/stages.ts`](src/server/ai/stages.ts). Adding a provider means implementing `complete()` on `BaseLanguageModelProvider`; JSON handling, schema instruction and the repair round-trip are inherited.

**Image generation** defaults to the compositor, which keeps your product pixel-identical. Configure `IMAGE_PROVIDER_API_KEY` to additionally offer a text-to-image model — those assets are labelled as reinterpreted.

**Video** requires `VIDEO_PROVIDER_API_KEY`. Without it, storyboards and scripts are still produced and the UI says plainly that rendering is unavailable.

---

## Storage configuration

Local disk by default (`./.storage`), served through an authenticated route that verifies the file belongs to your organization — media is never publicly readable by URL guessing.

For production, or for Instagram and Pinterest publishing:

```env
STORAGE_DRIVER=s3
STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com
STORAGE_REGION=auto
STORAGE_BUCKET=marketpilot
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
STORAGE_PUBLIC_URL=https://cdn.example.com   # required by Instagram/Pinterest
```

Instagram and Pinterest fetch media themselves from a public HTTPS URL. Without `STORAGE_PUBLIC_URL` those platforms return `manual_required` with an explanation rather than failing silently.

---

## Social API configuration

Each platform needs its own developer app. The connection screen shows every requirement and known limitation, and marks platforms this installation cannot connect.

| Platform | Needs | Callback URL |
| --- | --- | --- |
| Facebook | Page, `pages_manage_posts`, App Review | `{APP_URL}/api/social/facebook/callback` |
| Instagram | Business/Creator account linked to a Page, `instagram_content_publish`, App Review | `{APP_URL}/api/social/instagram/callback` |
| TikTok | Content Posting API, `video.publish`, TikTok audit | `{APP_URL}/api/social/tiktok/callback` |
| YouTube | Google Cloud project, YouTube Data API v3, OAuth verification | `{APP_URL}/api/social/youtube/callback` |
| LinkedIn | App tied to a Company Page, Community Management access | `{APP_URL}/api/social/linkedin/callback` |
| Pinterest | Business account, `pins:write`, standard access review | `{APP_URL}/api/social/pinterest/callback` |
| X | Paid tier with write access, OAuth 2.0 + PKCE | `{APP_URL}/api/social/x/callback` |

Real constraints the app respects rather than papers over: Instagram allows ~50 API posts per 24h and needs public media URLs; YouTube uploads cost 1600 quota units each (~6/day on the default quota); TikTok cannot Direct Post without audit approval; X post analytics need a paid tier; LinkedIn per-post analytics need programme access.

Tokens are encrypted with AES-256-GCM before storage, refreshed proactively before they expire, and never sent to the browser.

---

## Billing configuration

```env
BILLING_PROVIDER=stripe
BILLING_SECRET=sk_live_...
BILLING_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PROFESSIONAL=price_...
STRIPE_PRICE_AGENCY=price_...
```

Point the webhook at `{APP_URL}/api/billing/webhook`. Signatures are verified over the raw body and replays older than five minutes are rejected; nothing in a payload is trusted before that check passes.

Plan limits are enforced *before* an expensive operation runs — see `assertWithinLimit` — so a user is never billed for a generation they did not expect.

---

## Background jobs

A PostgreSQL-backed queue. Jobs are claimed with `SELECT … FOR UPDATE SKIP LOCKED`, so several workers can run without ever processing the same job twice. Retries use exponential backoff, and only transient failures retry — a validation or permission error fails immediately rather than looping.

Job kinds: `campaign.generate`, `media.generate_image`, `media.generate_video`, `publishing.publish_post`, `publishing.dispatch_scheduled`, `analytics.sync`, `maintenance.prune`.

**Development** — the worker runs inside the Next.js process (`RUN_INLINE_WORKER=true`), because PGlite is single-process and a separate worker could not open the same data directory.

**Production** — set `RUN_INLINE_WORKER=false` and run the worker separately, so a deploy never kills an in-flight job:

```bash
npm run worker
```

Scheduling and analytics sync need a periodic trigger. Either run a small scheduler that enqueues `publishing.dispatch_scheduled` every minute, or call it from your platform's cron.

**Where no process can stay running** — serverless hosts cannot hold the worker loop, so the queue is drained over HTTP instead:

```
POST /api/internal/worker
Authorization: Bearer $WORKER_SECRET
```

It claims and runs jobs until the queue is empty or its time budget runs out, then reports `{ processed, more }` so the caller knows whether to come back. Every run begins with a `requeueStalled` sweep, which is what recovers a job whose invocation was killed mid-flight. With `WORKER_SECRET` unset the endpoint refuses every request, so leave it unset wherever `npm run worker` is doing the work. `netlify/functions/worker-cron.mjs` is the scheduled caller.

Prefer `npm run worker` whenever you can run it: it holds a job from claim to completion, and nothing cuts it off partway.

---

## Security

- Passwords hashed with scrypt (N=65536, r=8), per-user salt, parameters encoded in the hash so cost can be raised later.
- Sessions are random 256-bit tokens; only a SHA-256 hash is stored, so a database leak cannot be replayed as a login. httpOnly, SameSite=Lax, Secure on HTTPS. Sliding expiry.
- OAuth access and refresh tokens encrypted at rest with AES-256-GCM and never serialised to the client.
- Every tenant query scoped by `organization_id`; capabilities checked server-side on every mutation.
- OAuth CSRF protection via single-use server-side `state` rows, plus PKCE where the platform supports it.
- Uploads validated by magic bytes, not the declared type or filename; size and pixel ceilings; internally generated storage keys; path traversal blocked at the storage driver.
- Media served through an authenticated route with `nosniff` and a sandboxing CSP.
- Rate limiting on login, registration, password reset, uploads, AI generation and publishing.
- Structured logging with hard redaction of anything resembling a credential.
- Append-only audit log of significant actions.
- Security headers set globally; same-origin check on state-changing API requests.

Run a security review before going to production — in particular, replace the in-memory rate limiter with a shared store if you run more than one instance.

---

## Production deployment

The application is an ordinary Node server: any host that can run `next start`
and a second long-lived process will do. Two deployment shapes are documented
here because they differ in one important way — whether the job queue has a
process of its own.

### Any Node host (the shape the app was designed for)

1. Provision managed PostgreSQL (Neon, Supabase, RDS) and set `DATABASE_URL`.
2. Provision S3-compatible storage and set the `STORAGE_*` variables including
   `STORAGE_PUBLIC_URL`.
3. Set `MOCK_EXTERNAL_SERVICES=false`, `RUN_INLINE_WORKER=false`, real
   `AUTH_SECRET` and `ENCRYPTION_KEY`, and `APP_URL` to your domain.
4. Run `npm run db:migrate` as a deploy step.
5. Run `npm run worker` on a long-running host (Railway, Fly, Render, ECS).
   Serverless functions are not suitable for the worker.
6. Configure the social developer apps with production callback URLs.

Keep `development`, `staging` and `production` on separate databases, storage
buckets and developer apps. Never point a local environment at production
credentials.

### Netlify

Netlify runs the app as serverless functions, which changes three things. Each
has a concrete answer in the repository rather than a workaround at the edges.

| Constraint | Answer |
| --- | --- |
| No always-on process for `npm run worker` | `netlify/functions/worker-cron.mjs` runs every minute and drains the queue through `POST /api/internal/worker` |
| Request bodies capped near 6 MB, against a 200 MB media ceiling | The browser uploads straight to the bucket with a presigned PUT, then `POST /api/media/finalize` accepts the bytes |
| No writable disk | `STORAGE_DRIVER=s3` is required; the local disk driver cannot work here |

**1. Create the Neon database.** Use the *pooled* connection string — functions
cold-start independently and will otherwise exhaust direct connections.

**2. Create the Cloudflare R2 bucket.** Then, on the bucket:

- Add a CORS rule allowing `PUT` from your site origin, with `content-type`
  among the allowed headers. Without it every direct upload fails in the
  browser's preflight, before it reaches R2.
- Add a lifecycle rule expiring objects under `staging/` after one day. Those
  are uploads the browser started and never finished; nothing reads them.
- Note the endpoint (`https://<account-id>.r2.cloudflarestorage.com`) for
  `STORAGE_ENDPOINT`, and the public bucket or custom domain URL for
  `STORAGE_PUBLIC_URL`. Instagram and Pinterest fetch media themselves, so
  `STORAGE_PUBLIC_URL` is not optional if you publish to them.

**3. Connect the repository to Netlify.** `netlify.toml` sets the build; the
Next.js runtime is installed automatically. The production context runs
`npm run db:migrate && npm run build`, so migrations are applied once per
deploy rather than by whichever function instance starts first.

**4. Set the environment variables** in Netlify:

```
APP_URL                 https://your-domain            # exactly the origin users hit
DATABASE_URL            postgres://…                   # Neon, pooled — scope to production
AUTH_SECRET             <48 random bytes, base64>
ENCRYPTION_KEY          <32 random bytes, base64>
WORKER_SECRET           <32 random bytes, hex>
MOCK_EXTERNAL_SERVICES  false
RUN_INLINE_WORKER       false
STORAGE_DRIVER          s3
STORAGE_ENDPOINT        https://<account-id>.r2.cloudflarestorage.com
STORAGE_REGION          auto
STORAGE_BUCKET          <bucket>
STORAGE_ACCESS_KEY      <R2 access key id>
STORAGE_SECRET_KEY      <R2 secret access key>
STORAGE_PUBLIC_URL      https://media.your-domain
```

Two of these bite if they are wrong:

- **`APP_URL` must match the origin the browser is actually on.** Every
  state-changing request is checked against it (`assertSameOrigin`), so if
  `APP_URL` is the custom domain and someone opens the `*.netlify.app` URL,
  each form post returns 403.
- **Scope `DATABASE_URL` to the production context**, or give branch deploys
  their own database. Netlify variables apply to every context by default, and
  a deploy preview would otherwise migrate and write to production data.

**5. Confirm the scheduled function.** After the first deploy, Netlify lists
`worker-cron` under *Functions → Scheduled*. Trigger it once and check the log:
it reports how many jobs it processed. If it returns 500, `WORKER_SECRET` or
`APP_URL` is missing; if 502, the drain endpoint rejected the secret.

#### What is weaker on Netlify than on a Node host

Stated plainly, because neither is visible until it matters:

- **Rate limiting is per-instance.** `src/server/services/rate-limit.ts` keeps
  its windows in process memory, which was correct for one server. Functions
  scale horizontally, so the login, registration and upload limits are only
  enforced within whichever instance happens to serve the request. Backing the
  limiter with Postgres or Redis is the fix; the call sites do not change.
- **Jobs can be interrupted.** A long publish can outlive the function
  invocation that claimed it. `requeueStalled` returns those jobs to the queue
  on the next run, so nothing is lost, but a job may start twice — handlers
  should stay idempotent. A dedicated `npm run worker` process does not have
  this problem.

## Troubleshooting

**`Invalid environment configuration`** — copy `.env.example` to `.env.local` and set `AUTH_SECRET` and `ENCRYPTION_KEY`. Blank values count as unset.

**`ENOENT … .pglite`** — run `npm run db:migrate` once to create and migrate the embedded database.

**Campaign stuck on "Generating"** — the worker is not running. In development check `RUN_INLINE_WORKER=true`; in production check the worker process. Failed jobs and their errors are visible in the `jobs` table and in `/admin`.

**"Your … connection has expired"** — the platform token could not be refreshed. Reconnect from **Social accounts**; the account is flagged automatically when this is detected.

**Instagram says a manual publish is required** — Instagram fetches media from a public HTTPS URL. Configure S3 storage with `STORAGE_PUBLIC_URL`.

**A script hangs while `npm run dev` is running** — in development the database is embedded PGlite, which only one process may open at a time. Stop the dev server before running `db:migrate`, `db:seed` or `db:studio`. This does not apply once `DATABASE_URL` points at a real PostgreSQL server.

**`npm`/`npx` fails with EPERM on Windows** — invoke the package binary directly, e.g. `node node_modules/next/dist/bin/next dev`.

**Port already in use** — `npm run dev -- -p 3001`, and set `APP_URL` to match or OAuth callbacks will not return.

---

## Project layout

```
src/
  app/
    (marketing)/        public site: home, features, how it works, pricing, use cases, FAQ, contact, legal
    (auth)/             sign in, sign up, password reset, email verification
    (app)/              dashboard, campaigns, products, brands, content, media,
                        social, calendar, analytics, templates, team, billing, settings, admin
    api/                REST API: auth, brands, products, campaigns, media, social, publishing, analytics, usage, billing
  components/           UI primitives, app shell, campaign workspace, platform previews
  server/
    auth/               sessions, password hashing, permission matrix, request context
    db/                 Drizzle schema and client
    services/           business logic, all AuthContext-scoped
    jobs/               queue, worker, handlers
    ai/                 generation stages and output schemas
    api/                route helpers: envelope, validation, error mapping
  providers/            ai/ image/ video/ voice/ social/ storage/ billing/
  prompts/marketing/    every prompt template
  lib/                  env, errors, crypto, logger, dates, plans, platforms
  i18n/                 locale resolution and dictionaries
drizzle/                generated SQL migrations
scripts/                migrate, seed, worker, e2e
tests/                  unit, integration, helpers, mocks
```

---

## Status

Phases 1–8 of the build plan are implemented and verified: foundation, AI generation, media, social integration, scheduling, analytics, monetization and agency/team features.

Known limitations, stated plainly:

- **Email delivery is not implemented.** Verification links, password resets and team invitations are surfaced in the UI or written to the server log. `notify()` is the single seam to add a transport behind.
- **Video rendering requires a third-party provider.** Without one, storyboards and scripts are produced and the UI says rendering is unavailable.
- **The rate limiter is in-process.** Correct for a single instance; swap the store in `rate-limit.ts` for Redis before scaling horizontally.
- **Interface translations ship for English only.** The i18n infrastructure, locale detection and dictionary contract are in place; other locales need dictionary files.
- **Google sign-in is not wired up.** Email/password authentication is complete; the OAuth plumbing used for social accounts is the pattern to follow.
- **Legal pages are templates.** They have not been reviewed by a lawyer and make no compliance claim for any jurisdiction.
