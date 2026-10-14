# Connecting the other six platforms

LinkedIn works. The other six show "Not available on this installation"
because no developer-app credentials exist for them in the environment — not
because anything is broken.

## Read this first: you probably do not need App Review

The requirement notes shown in the app mention App Review, audits and
verification, and they are accurate — **for publishing on behalf of other
people's accounts**. MarketPilot has one user right now: you.

Nearly every platform lets an app post to **accounts you own** while it is
still in development mode, with no review at all. Review is the gate for
serving *customers*. That is a launch problem, not a today problem.

So the real job is much smaller than the warnings suggest: register an app on
each platform, paste two values, restart. An afternoon, not months.

| Platform | Works for your own account now? | Real cost |
|---|---|---|
| **Facebook** | **Yes** — dev mode, you as app admin | Free |
| **Instagram** | Yes, *but* needs object storage first (see below) | Free |
| **Pinterest** | Yes — trial access, limited calls per day | Free |
| **YouTube** | Yes — add yourself as a test user | Free, but ~6 uploads/day |
| **TikTok** | Partly — unaudited posts arrive as a draft you confirm | Free |
| **X** | **No** — write access sits behind a paid plan | **Money**, not review |

## Do them in this order

1. **Facebook** — one Meta app also serves Instagram, so it is two platforms
   for one registration.
2. **Pinterest** — the simplest portal of the six.
3. **YouTube** — more steps, but no payment and no review for your own channel.
4. **TikTok** — works unaudited, with the draft caveat.
5. **Instagram** — only once object storage is sorted.
6. **X** — last, because it is the only one that costs money.

## The pattern, for every platform

Each gives you a **client ID** and a **client secret**. Both go on the server,
and the script restarts the services itself:

```
ssh root@178.105.200.215
bash /opt/marketpilot/set-one.sh FACEBOOK_CLIENT_ID
bash /opt/marketpilot/set-one.sh FACEBOOK_CLIENT_SECRET
```

The variable names are:

| Platform | Variables |
|---|---|
| Facebook | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` |
| Instagram | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` |
| TikTok | `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET` |
| YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Pinterest | `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET` |
| X | `X_CLIENT_ID`, `X_CLIENT_SECRET` |

Every platform also asks for a **redirect URI** (sometimes called a callback
or OAuth redirect URL). It is always the same shape:

```
https://marketpilot-ai.duckdns.org/api/social/PLATFORM/callback
```

where `PLATFORM` is one of `facebook`, `instagram`, `tiktok`, `youtube`,
`pinterest`, `x`. Paste it exactly. A trailing slash, or `http` instead of
`https`, is the usual cause of "redirect_uri does not match".

---

## 1. Facebook (the same app also serves Instagram)

**You need a Facebook Page.** The API cannot post to a personal profile, so
create one if you have not already.

1. Go to **developers.facebook.com** then **My Apps** and **Create App**.
2. Use case **Other**, type **Business**, name it MarketPilot.
3. Add the **Facebook Login** product to the app.
4. Facebook Login then **Settings**. Valid OAuth Redirect URIs:
   `https://marketpilot-ai.duckdns.org/api/social/facebook/callback`
5. **App settings then Basic** holds the **App ID** and **App Secret**. Those
   are your client ID and secret.
6. Leave the app in **Development** mode. As its admin you can already publish
   to Pages you own.

Scopes requested: `pages_show_list`, `pages_manage_posts`,
`pages_read_engagement`, `business_management`.

**Instagram uses the very same App ID and Secret.** Paste them into
`INSTAGRAM_CLIENT_ID` and `INSTAGRAM_CLIENT_SECRET` as well, and add the
Instagram redirect URI alongside the Facebook one. The code keeps them as
separate variables so the two can be split later if you ever want that.

## 2. Pinterest

1. **developers.pinterest.com**, signed in with a **business** account. A
   personal account converts to business free in Pinterest settings.
2. **Apps** then **Create app**.
3. Redirect URI:
   `https://marketpilot-ai.duckdns.org/api/social/pinterest/callback`
4. Copy the **App ID** and **App secret**.

Scopes: `boards:read`, `pins:read`, `pins:write`, `user_accounts:read`.

Trial access caps you at a small number of calls per day, which is fine for
testing. "Standard access" lifts it and is requested from the same dashboard.

**Pinterest fetches your image from a public URL**, so it shares the storage
blocker described below.

## 3. YouTube

1. **console.cloud.google.com**, create a project.
2. **APIs and Services** then **Library**, enable **YouTube Data API v3**.
3. **OAuth consent screen**, choose External, fill in the app name and your
   email.
4. Under **Test users**, add your own Google account. This is the step that
   lets you skip verification — test users can use sensitive scopes straight
   away.
5. **Credentials** then **Create Credentials** then **OAuth client ID**, type
   **Web application**.
6. Authorised redirect URI:
   `https://marketpilot-ai.duckdns.org/api/social/youtube/callback`
7. Copy the **Client ID** and **Client secret**.

Scopes: `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly`.

**Plan around the quota.** An upload costs 1,600 of the default 10,000 daily
units — roughly **six uploads a day for the whole app**, not per user. More
than that needs a quota increase request to Google.

## 4. TikTok

1. **developers.tiktok.com**, register, create an app.
2. Add the **Content Posting API** product.
3. Redirect URI:
   `https://marketpilot-ai.duckdns.org/api/social/tiktok/callback`
4. Copy the **Client key** and **Client secret**.

Scopes: `user.info.basic`, `video.publish`, `video.upload`.

**Know what unaudited means here.** Without TikTok's audit a post does not go
live: it arrives in your TikTok inbox as a draft you tap to confirm. That is
still useful, and it is TikTok's rule rather than a defect. Direct publishing
needs their audit.

TikTok is **video only** — there is no public text or image endpoint, so a
text-only campaign has nothing to send it.

## 5. X

1. **developer.x.com**, sign up.
2. **Subscribe to a paid tier.** The free tier is read-mostly and posting
   needs a paid plan. This is the only platform here that costs money.
3. Create a **Project**, then an **App** inside it.
4. User authentication settings, OAuth 2.0, type **Web App**. Callback URI:
   `https://marketpilot-ai.duckdns.org/api/social/x/callback`
5. Copy the **OAuth 2.0 Client ID** and **Client Secret** — not the API
   key and secret pair, which belongs to the older OAuth 1.1 scheme.

Scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access`.

Post analytics are not offered on lower tiers, so metrics for X may stay
empty even once posting works.

---

## Two blockers that are not about developer apps

### Instagram and Pinterest need publicly readable media

Both fetch the image or video from a URL **their own servers** must reach.
Right now `STORAGE_DRIVER=local`: files sit on the box and are served by
`/api/media/file/...`, which requires a logged-in session. Instagram's fetcher
has no session, so it would receive a redirect to the login page instead of a
JPEG.

The driver is honest about this — `publicUrlFor()` returns `null` for local
storage, so publishing fails cleanly rather than posting a broken image.

The fix is object storage with public read. **Cloudflare R2** fits well: the
account already exists, there are no egress charges, and the free tier covers
far more than this app will use. It means setting `STORAGE_DRIVER=s3` and the
`STORAGE_*` variables the S3 driver already supports — no code change.

Facebook, YouTube, TikTok, LinkedIn and X all upload the bytes directly, so
none of them are affected.

### The Meta API version wants bumping before any review

`src/providers/social/meta.ts` pins `GRAPH_VERSION = 'v21.0'`. The current
version is v26.0, and v21.0 runs until roughly **21 January 2027**. It works
today, so this is not urgent for testing — but do not submit a Meta App Review
against a version that close to end of life. Bump it first.

## After pasting any credentials

```
ssh root@178.105.200.215
bash /opt/marketpilot/set-one.sh <VARIABLE>
```

Then reload the Social Accounts page. The platform should change from
"Unavailable" to a **Connect** button. Click it and complete that platform's
own login.

If you see **"redirect_uri does not match"**, the URI registered in the
platform's dashboard differs from the one the app sends. The app builds it as
`APP_URL` + `/api/social/` + platform + `/callback`, so check for a trailing
slash, `http` against `https`, or a typo in the subdomain.
