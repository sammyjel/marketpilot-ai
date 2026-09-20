/**
 * Scheduled queue drain.
 *
 * Netlify has no always-on process, so the long-running `npm run worker` loop
 * cannot live here. This function runs once a minute and repeatedly calls the
 * application's internal drain endpoint, which processes jobs inside the Next
 * server where the database pool, providers and job handlers already exist.
 *
 * Keeping the work behind an HTTP call rather than importing the worker
 * directly means this file needs no bundler configuration, no `@/` path
 * aliases, and no second copy of the application's runtime.
 *
 * Scheduled functions are capped at 30 seconds. The budget below stops well
 * short of that so an in-flight job finishes rather than being killed and left
 * for the stalled-job sweep.
 */

const TOTAL_BUDGET_MS = 24_000;
const DRAIN_BUDGET_MS = 9_000;

export default async function handler() {
  const base = process.env.APP_URL || process.env.URL;
  const secret = process.env.WORKER_SECRET;

  if (!base || !secret) {
    // Misconfiguration, not a transient fault: fail loudly in the function log.
    return new Response('APP_URL (or URL) and WORKER_SECRET must be set.', { status: 500 });
  }

  const endpoint = `${base.replace(/\/$/, '')}/api/internal/worker?budgetMs=${DRAIN_BUDGET_MS}`;
  const startedAt = Date.now();
  let processed = 0;
  let rounds = 0;

  while (Date.now() - startedAt < TOTAL_BUDGET_MS) {
    rounds += 1;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    });

    if (!response.ok) {
      const body = await response.text();
      return new Response(`Drain failed (${response.status}): ${body.slice(0, 500)}`, { status: 502 });
    }

    const payload = await response.json();
    processed += payload?.data?.processed ?? 0;

    // Queue is empty — stop rather than burning the rest of the budget polling.
    if (!payload?.data?.more) break;
  }

  return new Response(JSON.stringify({ processed, rounds, ms: Date.now() - startedAt }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

export const config = {
  schedule: '* * * * *',
};
