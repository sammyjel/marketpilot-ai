# Moving MarketPilot off Netlify onto the radio box

## Why we are doing this

Netlify's October bill breaks down like this:

| Meter | Credits | Share |
|---|---|---|
| **Compute** (sites **and databases**) | **2,057.1** | **93%** |
| Production deploys (10 × 15) | 150 | 7% |
| Bandwidth | 7.5 | 0.3% |
| Web requests (13,171 of them) | 2.6 | 0.1% |

Real visitor traffic costs **2.6 credits**. It is not the users. Netlify bills
database compute at 10 credits per compute unit, and a smallest-size Neon
instance left awake around the clock is `0.25 × 720h × 10 ≈ 1,800 credits` —
which is almost exactly the compute line. **The database being permanently
awake is the bill.** Everything else is rounding.

That matters, because it means moving only the worker would not have fixed it —
a worker polling the queue keeps the database awake just as effectively from
Hetzner as from Netlify. The database has to stop being metered at all.

After the move, Netlify is serving nothing and the box costs what it already
costs. The expected bill is **£0**.

## What goes where

```
Hetzner box (178.105.200.215, already paid for)
├── 3 × ffmpeg          the radio — untouched, and protected (see below)
├── nginx               already installed; gains a second server block
├── postgresql          localhost only, never exposed to the internet
├── marketpilot-web     Next standalone server on 127.0.0.1:3000
└── marketpilot-worker  the long-lived job worker
```

### How the radio is protected

The box has 2 GB and currently **no swap**, so anything greedy makes the kernel
pick an OOM victim, and ffmpeg is a fat target. Three guards:

1. `setup-vps.sh` adds a 2 GB swapfile with `vm.swappiness=10`.
2. Both services run under `MemoryMax=600M`, so a leak kills the service, not a
   stream.
3. The build runs inside a capped `systemd-run` scope; it fails on its own
   rather than starving anything.

The worker also runs at `Nice=10` and `CPUWeight=10`, below the encoders.

## Steps

### 0. Open the firewall — only you can do this
Ports 80 and 443 are blocked by a **Hetzner Cloud Firewall** (we hit this with
the radio's media server: SSH works, port 80 times out, while `iptables` and
`ufw` are both open — so the block is above the OS). Open 80 and 443 in the
Hetzner console or nothing below is reachable.

### 1. Prepare the box
```
ssh root@178.105.200.215
# from the repo:  scp -r deploy root@178.105.200.215:/root/
bash /root/deploy/setup-vps.sh
```
Adds swap, Node 22, PostgreSQL, creates the database and a generated password,
clones the repo. Safe to re-run.

### 2. Write `/opt/marketpilot/.env`
Copy every variable from Netlify. Two matter more than the rest:

- **`ENCRYPTION_KEY` must be byte-for-byte identical.** It decrypts stored
  LinkedIn tokens (AES-256-GCM). A different value does not error — it silently
  fails, and the LinkedIn connection is gone.
- `DATABASE_URL` — use the value in `/opt/marketpilot/.db-url`, not the Neon one.

Also set `APP_URL` to the new domain, `RUN_INLINE_WORKER=false` (a real worker
process now runs), and drop `WORKER_SECRET` once the cron is gone.

```
chmod 600 /opt/marketpilot/.env
```

### 3. Copy the data across
```
NEON_URL='postgresql://...' bash /root/deploy/migrate-db.sh
```
Prints row counts so you can see the users, orgs and social accounts arrived.

### 4. Install the services
```
cp /root/deploy/marketpilot-*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable marketpilot-web marketpilot-worker
```

### 5. Deploy
```
bash /opt/marketpilot/repo/deploy/deploy.sh
```
Builds, migrates, releases, restarts, health-checks. Keeps the last three
releases — rolling back is re-pointing the `current` symlink and restarting.

### 6. Put it on the internet
```
cp /root/deploy/nginx-marketpilot.conf /etc/nginx/sites-available/marketpilot
sed -i 's/APP_DOMAIN/your.domain/g' /etc/nginx/sites-available/marketpilot
ln -sf /etc/nginx/sites-available/marketpilot /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d your.domain
```

### 7. Cut over
1. Point the domain's DNS A record at `178.105.200.215`.
2. Update the **LinkedIn app's redirect URI** to the new domain — OAuth breaks
   otherwise, and the existing connection stops refreshing.
3. Delete `netlify/functions/worker-cron.mjs` and commit. The cron is redundant
   once a real worker runs, and each run costs credits.
4. Once the new site is proven, delete the Netlify project so deploys (15
   credits each) stop too.

## If the build gets OOM-killed on the box

Build in GitHub Actions instead and ship the result:

```
BUILD_STANDALONE=1 npm run build
tar czf mp.tgz .next/standalone .next/static public drizzle
scp mp.tgz root@178.105.200.215:/opt/marketpilot/
```
then unpack into a new `releases/<stamp>` and move the `current` symlink.

## What this also fixes for free

Campaign generation makes 5–6 sequential model calls and **cannot** finish
inside a 30-second serverless invocation. A long-lived worker has no such
limit, so the per-stage refactor that was on the list is no longer needed.

## Still outstanding after the move

- Rotate the Neon password and the Cloudflare `cfat_` token (both have been
  exposed).
- Replace the Anthropic API key before **30 November 2026**.
- Test `/forgot-password` end to end — email delivery has never actually run.
