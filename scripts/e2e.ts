import './bootstrap';

/**
 * End-to-end check against a running server.
 *
 * Unlike the Vitest suite, this drives the real HTTP API exactly as a browser
 * would — cookies, redirects, multipart uploads and the background worker — so
 * it verifies the wiring between routes, jobs and services, not just the
 * services themselves.
 *
 * Usage:
 *   npm run dev          (in one terminal)
 *   npm run e2e          (in another)
 *
 * It only ever runs against MOCK_EXTERNAL_SERVICES, so no real platform is
 * contacted and no API credits are spent.
 */
const BASE = process.env['E2E_BASE_URL'] ?? process.env['APP_URL'] ?? 'http://localhost:3000';

let cookie = '';
let failures = 0;

function report(label: string, detail: string, ok = true): void {
  if (!ok) failures += 1;
  process.stdout.write(`${ok ? '  ok  ' : ' FAIL '} ${label.padEnd(34)} ${detail}\n`);
}

async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: { data?: T; error?: { code: string; message: string } } }> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: 'manual',
    headers: {
      ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
  });

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const pair = setCookie.split(';')[0];
    if (pair) cookie = cookie ? `${cookie}; ${pair}` : pair;
  }

  const text = await response.text();
  let body: { data?: T; error?: { code: string; message: string } } = {};
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    body = {};
  }

  return { status: response.status, body };
}

async function waitFor<T>(
  poll: () => Promise<T | null>,
  timeoutMs = 90_000,
  intervalMs = 1500,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await poll();
    if (result !== null) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

async function makeTestImage(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width: 900, height: 900, channels: 3, background: { r: 220, g: 180, b: 120 } } })
    .png()
    .toBuffer();
}

type Id = { id: string };

async function main(): Promise<void> {
  process.stdout.write(`\nEnd-to-end check against ${BASE}\n\n`);

  // 1. Register
  const email = `e2e-${Date.now().toString(36)}@example.test`;
  const registered = await api<{ userId: string; organizationId: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'strongpassword1', name: 'E2E', organizationName: 'E2E Beauty' }),
  });
  report('register', registered.body.data?.userId ?? registered.body.error?.message ?? '', registered.status === 201);

  // 2. Brand
  const brand = await api<Id & { name: string }>('/api/brands', {
    method: 'POST',
    body: JSON.stringify({
      name: 'DavMicBet',
      industry: 'Beauty & Cosmetics',
      targetAudience: 'Women aged 25-55 with dry or damaged hair',
      tone: 'premium',
      preferredCta: 'Shop the collection',
    }),
  });
  report('create brand', brand.body.data?.name ?? '', brand.status === 201);

  // 3. Upload + product
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(await makeTestImage())], { type: 'image/png' }), 'product.png');
  const upload = await api<Id & { width: number; height: number }>('/api/media', { method: 'POST', body: form });
  report(
    'upload product image',
    `${upload.body.data?.width}x${upload.body.data?.height}`,
    upload.status === 201,
  );

  const product = await api<Id & { name: string }>('/api/products', {
    method: 'POST',
    body: JSON.stringify({
      brandId: brand.body.data!.id,
      name: 'Hair Growth Oil',
      description: 'Hair growth oil for women with dry and damaged hair.',
      price: '24.99',
      benefits: ['Deeply nourishes dry ends', 'Lightweight, never greasy'],
      mediaAssetIds: [upload.body.data!.id],
    }),
  });
  report('create product', product.body.data?.name ?? '', product.status === 201);

  // 4. Generate a campaign, then wait for the background worker
  const campaign = await api<Id>('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      brandId: brand.body.data!.id,
      productId: product.body.data!.id,
      objective: 'product_launch',
      platforms: ['facebook', 'instagram'],
      formats: ['image'],
    }),
  });
  report('queue generation', campaign.body.data?.id ?? '', campaign.status === 201);

  const campaignId = campaign.body.data!.id;

  const generated = await waitFor(async () => {
    const current = await api<{ status: string; content: unknown[] }>(`/api/campaigns/${campaignId}`);
    const status = current.body.data?.status;
    return status && status !== 'draft' && status !== 'generating' ? current.body.data! : null;
  });
  report(
    'generation completed',
    generated ? `${generated.status}, ${generated.content.length} pieces` : 'timed out',
    Boolean(generated) && generated!.content.length === 2,
  );

  // 5. Connect two mock social accounts through the real OAuth round trip
  for (const platform of ['facebook', 'instagram']) {
    const start = await api<{ url: string }>('/api/social/connect', {
      method: 'POST',
      body: JSON.stringify({ platform, brandId: brand.body.data!.id }),
    });

    if (start.body.data?.url) {
      await fetch(start.body.data.url, { headers: { cookie }, redirect: 'manual' });
    }
  }

  const accounts = await api<{ id: string; platform: string }[]>('/api/social/accounts');
  report('connect accounts', `${accounts.body.data?.length ?? 0} connected`, (accounts.body.data?.length ?? 0) === 2);

  const targets = (generated?.content as { id: string; platform: string }[]).map((piece) => ({
    contentId: piece.id,
    socialAccountId: accounts.body.data!.find((account) => account.platform === piece.platform)!.id,
  }));

  // 6. Publishing before approval must be refused
  const premature = await api('/api/publishing/publish', {
    method: 'POST',
    body: JSON.stringify({ campaignId, targets, publishNow: true }),
  });
  report('unapproved publish refused', `status ${premature.status}`, premature.status === 422);

  // 7. Approve, then publish
  const approved = await api(`/api/campaigns/${campaignId}/approve`, { method: 'POST' });
  report('approve campaign', `status ${approved.status}`, approved.status === 200);

  const published = await api<{ created: number; skipped: number }>('/api/publishing/publish', {
    method: 'POST',
    body: JSON.stringify({ campaignId, targets, publishNow: true }),
  });
  report('publish queued', `${published.body.data?.created} created`, published.body.data?.created === 2);

  // 8. A duplicate request must not create a second post
  const duplicate = await api<{ created: number; skipped: number }>('/api/publishing/publish', {
    method: 'POST',
    body: JSON.stringify({ campaignId, targets, publishNow: true }),
  });
  report('duplicate request deduped', `${duplicate.body.data?.created} created`, duplicate.body.data?.created === 0);

  // 9. Wait for the worker to finish publishing
  const settled = await waitFor(async () => {
    const posts = await api<{ status: string }[]>(`/api/publishing/posts?campaignId=${campaignId}`);
    const rows = posts.body.data ?? [];
    const done = rows.every((post) => ['published', 'failed', 'manual_required', 'cancelled'].includes(post.status));
    return rows.length > 0 && done ? rows : null;
  });

  report(
    'posts reached a final state',
    settled ? settled.map((post) => post.status).join(', ') : 'timed out',
    Boolean(settled),
  );

  // 10. Generate creative from the brief
  const image = await api<{ jobId: string }>(`/api/campaigns/${campaignId}/media`, {
    method: 'POST',
    body: JSON.stringify({ kind: 'image', conceptIndex: 0, preserveProduct: true }),
  });
  report('queue image generation', image.body.data?.jobId ?? '', image.status === 202);

  const asset = await waitFor(async () => {
    const assets = await api<{ producedBy: string; preservedProduct: boolean }[]>(
      `/api/campaigns/${campaignId}/media`,
    );
    return assets.body.data && assets.body.data.length > 0 ? assets.body.data[0]! : null;
  });
  report(
    'creative generated',
    asset ? `${asset.producedBy}, product preserved: ${asset.preservedProduct}` : 'timed out',
    Boolean(asset),
  );

  process.stdout.write(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n\n`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`\nEnd-to-end check could not run: ${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write('Is the dev server running on the expected port?\n\n');
  process.exitCode = 1;
});
