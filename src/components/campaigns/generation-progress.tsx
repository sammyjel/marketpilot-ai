'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const STAGES = [
  'Analyzing product',
  'Creating campaign strategy',
  'Writing content',
  'Optimizing SEO',
  'Creating creative concepts',
  'Preparing platform content',
];

/**
 * Live progress while the generation job runs.
 *
 * The stages shown are the real pipeline stages, but their timing is an
 * estimate — the worker does not stream per-stage events. The page refreshes
 * from the server every few seconds and switches to the real result as soon as
 * the job finishes, so nothing here can show "done" for work that failed.
 */
export function GenerationProgress({
  campaignId,
  status,
  error,
}: {
  campaignId: string;
  status: string;
  error: string | null;
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => setElapsed((value) => value + 1), 1000);
    const refresh = setInterval(() => router.refresh(), 3000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router, campaignId]);

  if (status === 'failed') {
    return (
      <Card className="border-red-200">
        <CardBody className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">Generation did not finish</p>
            <p className="mt-1 text-sm text-ink-600">{error ?? 'Something went wrong while generating this campaign.'}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.refresh()}>
            Refresh
          </Button>
        </CardBody>
      </Card>
    );
  }

  // Roughly 4 seconds per stage; the final stage stays "running" until the
  // server reports otherwise, so this never claims completion on its own.
  const reached = Math.min(Math.floor(elapsed / 4), STAGES.length - 1);

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-brand-600" aria-hidden="true" />
          <p className="text-sm font-semibold text-ink-900">Generating your campaign</p>
          <span className="ml-auto text-xs tabular-nums text-ink-400">{elapsed}s</span>
        </div>

        <ol className="mt-4 space-y-2" aria-live="polite">
          {STAGES.map((stage, index) => {
            const done = index < reached;
            const running = index === reached;
            return (
              <li key={stage} className="flex items-center gap-2.5 text-sm">
                <span
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-full',
                    done ? 'bg-emerald-100 text-emerald-700' : running ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-400',
                  )}
                  aria-hidden="true"
                >
                  {done ? <Check className="size-3" /> : running ? <Loader2 className="size-3 animate-spin" /> : null}
                </span>
                <span className={cn(done ? 'text-ink-500' : running ? 'font-medium text-ink-900' : 'text-ink-400')}>
                  {stage}
                </span>
              </li>
            );
          })}
        </ol>

        <p className="mt-4 text-xs text-ink-500">
          This runs on our servers — you can leave this page and come back. We will notify you when it is ready.
        </p>
      </CardBody>
    </Card>
  );
}
