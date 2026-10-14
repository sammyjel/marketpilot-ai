# Connecting the social platforms

Five of the six remaining platforms cost nothing. What they all want is an
**app review**: a working demo video, public policy pages, and days to weeks of
waiting. Money is not the constraint — review time is.

Requirements below come from `src/lib/platforms.ts`, which already documents
them per platform, so they match what the code actually asks for.

## Do these once, before any platform

### 1. The redirect URI

Every platform needs one, and they all follow the same shape
(`src/server/services/social-accounts.ts` builds it from `APP_URL`):

```
https://marketpilot-ai.duckdns.org/api/social/<platform>/callback
```

So `.../api/social/facebook/callback`, `.../api/social/pinterest/callback`, and
so on. It must match **character for character** or OAuth fails with a redirect
mismatch — the single most common setup error.

### 2. The pages reviewers ask for

Already live, nothing to write:

- https://marketpilot-ai.duckdns.org/legal/privacy
- https://marketpilot-ai.duckdns.org/legal/terms
- https://marketpilot-ai.duckdns.org/contact

### 3. Consider a real domain first

Reviewers at Meta and TikTok are deciding whether you are a real business.
They will see `marketpilot-ai.duckdns.org` — a free dynamic-DNS subdomain.
That is a plausible reason to be bounced, and a rejected review costs weeks,
not the ~$10 a domain costs. Changing it later means redoing every redirect URI
on every platform, so it is cheapest to decide **before** you start.

### 4. How to store each credential

Never paste a secret into a chat window. On the box:

```
ssh root@178.105.200.215
bash /opt/marketpilot/set-one.sh FACEBOOK_CLIENT_ID
bash /opt/marketpilot/set-one.sh FACEBOOK_CLIENT_SECRET
```

It prompts, writes to `/opt/marketpilot/.env`, and restarts the services.

| Platform | Variables |
|---|---|
| Facebook | `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` |
| Instagram | `INSTAGRAM_CLIENT_ID` / `INSTAGRAM_CLIENT_SECRET` |
| TikTok | `TIKTOK_CLIENT_ID` / `TIKTOK_CLIENT_SECRET` |
| YouTube | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| Pinterest | `PINTEREST_CLIENT_ID` / `PINTEREST_CLIENT_SECRET` |
| X | `X_CLIENT_ID` / `X_CLIENT_SECRET` |

---

## 1. Facebook + Instagram (one Meta app covers both)

Biggest reach, and the app already exists. Do this first, because its review is
the slowest.

**You need:** a Facebook **Page** (personal profiles cannot be posted to via the
API) and, for Instagram, a **Business or Creator** account linked to that Page.

1. developers.facebook.com, then **My Apps**, then your existing app
2. **Settings, Basic** — set Privacy Policy URL, Terms URL, and App Domain
   (`marketpilot-ai.duckdns.org`)
3. Add the **Facebook Login** product, then **Settings**, then Valid OAuth
   Redirect URIs:
   ```
   https://marketpilot-ai.duckdns.org/api/social/facebook/callback
   https://marketpilot-ai.duckdns.org/api/social/instagram/callback
   ```
4. Copy **App ID** and **App Secret**, store them with `set-one.sh`
5. **App Review, Permissions and Features** — request exactly:
   - `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`,
     `business_management` (Facebook)
   - `instagram_content_publish` (Instagram)
6. **Business verification** — Meta asks for documents proving the business
   exists. Allow time; this is the slow part.
7. Record a screen capture of the whole flow: log in, connect the account,
   compose a post, publish, see it appear. Vague videos get rejected.

**Instagram needs public media.** Publishing is a two-step container flow and
Meta's servers fetch the image over **public HTTPS**. `STORAGE_DRIVER` is
currently `local`, and that driver returns no public URL, so Instagram cannot
publish yet. Now the app runs on its own server, nginx can serve the storage
directory directly and S3 is no longer the only option. This is a code change,
not a configuration one.

Other limits: Page tokens expire and need refreshing; Instagram allows 50
API-published posts per account per 24 hours.

---

## 2. Pinterest

The gentlest review. Do it second to get a second platform live quickly.

**You need:** a Pinterest **business** account (free to convert).

1. developers.pinterest.com, create an app
2. Redirect URI: `https://marketpilot-ai.duckdns.org/api/social/pinterest/callback`
3. Scopes: `pins:write` and `boards:read`
4. Store the credentials with `set-one.sh`
5. Apply for **Standard access** to leave trial mode — trial apps get only a
   few calls per day

Every pin must target a board, and descriptions cap at 500 characters.

---

## 3. TikTok

Free, but read the warning before trusting any result.

> **Until the audit passes, every post publishes as PRIVATE — and the API
> returns success.** No error, no warning. The dashboard says "posted" and
> nobody can see it. Budget for the audit before believing any TikTok output.

1. developers.tiktok.com, create an app
2. Add the **Content Posting API** product, request the `video.publish` scope
3. Redirect URI: `https://marketpilot-ai.duckdns.org/api/social/tiktok/callback`
4. Verify your domain — they check you control it
5. Store the credentials with `set-one.sh`
6. Submit for audit **with a demo video of the complete end-to-end flow**. This
   is mandatory, not optional.
7. Expect several days to two weeks

TikTok is **video only**. There is no public text or image endpoint, so it will
sit idle until the video pipeline is wired up.

---

## 4. YouTube

Free, but the quota is the real limit.

1. console.cloud.google.com, new project, enable **YouTube Data API v3**
2. **OAuth consent screen** — add the privacy and terms URLs
3. **Credentials, OAuth client ID, Web application**
4. Redirect URI: `https://marketpilot-ai.duckdns.org/api/social/google/callback`
5. Scope: `youtube.upload`
6. Store as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
7. Submit for **OAuth verification** — `youtube.upload` is a sensitive scope

Each upload costs 1,600 quota units against a default daily 10,000 — about
**6 uploads a day in total**, across all users. Until the channel is verified,
uploads land as private.

---

## 5. X (Twitter) — last, or not at all

The only one that costs money, and the economics are hostile.

Reports indicate the free tier **closed to new projects in February 2026** and
the $200/month Basic plan moved to **pay-per-use in June 2026**, at roughly
**$0.015 a post and $0.20 for a post containing a link**. Sources disagree and
none were X's own pricing page, so **verify at developer.x.com before paying.**

A marketing tool posts links. At $0.20 each, X is the only platform here whose
cost grows with your success.

---

## Realistic expectations

| Platform | Money | Review | Blocked on |
|---|---|---|---|
| LinkedIn | Free | done | nothing, it works |
| Pinterest | Free | light | business account |
| Facebook | Free | heavy | business verification |
| Instagram | Free | heavy | **public media URLs (code change)** |
| TikTok | Free | audit + video | video pipeline |
| YouTube | Free | OAuth verification | 6 uploads/day cap |
| X | **Paid** | — | confirm the real pricing |

Reviews run in parallel. Submit Meta first because it is slowest, then do
Pinterest while you wait.
