'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ExternalLink, Link2Off, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Badge, EmptyState } from '@/components/ui/primitives';
import { FormMessage, SubmitButton } from '@/components/forms/form-status';
import { PublishStatusBadge } from './status-badge';
import { IDLE, type ActionState } from '@/lib/action-state';
import { cn } from '@/lib/cn';
import { PLATFORM_META, type Platform } from '@/lib/platforms';
import { cancelPostAction, schedulePublishAction } from '@/server/actions/publishing';

type Account = { id: string; platform: string; displayName: string; needsReconnect: boolean };

type Post = {
  id: string;
  platform: string;
  status: string;
  scheduledFor: string | null;
  externalPermalink: string | null;
  lastErrorMessage: string | null;
  manualReason: string | null;
};

const READY_STATES = ['approved', 'scheduled', 'publishing', 'partially_published', 'published'];

export function SchedulePanel({
  campaignId,
  campaignStatus,
  content,
  accounts,
  posts,
  timezone,
  canPublish,
  canSchedule,
}: {
  campaignId: string;
  campaignStatus: string;
  content: { id: string; platform: Platform }[];
  accounts: Account[];
  posts: Post[];
  timezone: string;
  canPublish: boolean;
  canSchedule: boolean;
}) {
  const [state, action] = useActionState<ActionState<null>, FormData>(
    schedulePublishAction,
    IDLE as ActionState<null>,
  );
  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const [selected, setSelected] = useState<string[]>([]);

  const approved = READY_STATES.includes(campaignStatus);

  // A content piece can only target an account on the same platform.
  const pairs = content.flatMap((piece) =>
    accounts
      .filter((account) => account.platform === piece.platform)
      .map((account) => ({ key: `${piece.id}:${account.id}`, piece, account })),
  );

  const platformsWithoutAccounts = content
    .map((piece) => piece.platform)
    .filter((platform) => !accounts.some((account) => account.platform === platform));

  return (
    <div className="space-y-5">
      {!approved ? (
        <Alert tone="warning" title="Approve first">
          Nothing can be scheduled or published until you approve this campaign. That review step is deliberate — AI
          output is never published without a person signing off.
        </Alert>
      ) : null}

      {posts.length > 0 ? (
        <Card>
          <CardHeader title="Publishing status" description="Live status per destination." />
          <CardBody className="p-0">
            <ul className="divide-y divide-ink-100">
              {posts.map((post) => (
                <li key={post.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: PLATFORM_META[post.platform as Platform]?.color }}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium text-ink-900">
                    {PLATFORM_META[post.platform as Platform]?.label ?? post.platform}
                  </span>

                  {post.scheduledFor ? (
                    <Badge tone="info">
                      <CalendarClock className="size-3" aria-hidden="true" />
                      {new Date(post.scheduledFor).toLocaleString(undefined, { timeZone: timezone })}
                    </Badge>
                  ) : null}

                  <span className="ml-auto flex items-center gap-2">
                    <PublishStatusBadge status={post.status as never} />
                    {post.externalPermalink ? (
                      <a
                        href={post.externalPermalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink-400 hover:text-brand-600"
                        aria-label="Open the published post"
                      >
                        <ExternalLink className="size-4" aria-hidden="true" />
                      </a>
                    ) : null}
                    {post.status !== 'published' && canSchedule ? (
                      <form action={cancelPostAction}>
                        <input type="hidden" name="socialPostId" value={post.id} />
                        <input type="hidden" name="campaignId" value={campaignId} />
                        <button
                          type="submit"
                          className="text-ink-400 hover:text-red-600"
                          aria-label="Cancel this post"
                        >
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      </form>
                    ) : null}
                  </span>

                  {post.manualReason ? (
                    <p className="w-full rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
                      {post.manualReason}
                    </p>
                  ) : null}
                  {post.lastErrorMessage && post.status === 'failed' ? (
                    <p className="w-full rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-inset ring-red-200">
                      {post.lastErrorMessage}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {platformsWithoutAccounts.length > 0 ? (
        <Alert tone="info" title="Some platforms have no connected account">
          <p>
            {platformsWithoutAccounts.map((platform) => PLATFORM_META[platform].label).join(', ')} — connect{' '}
            {platformsWithoutAccounts.length === 1 ? 'it' : 'them'} to publish automatically, or copy the content and
            post manually.{' '}
            <Link href="/social" className="font-medium underline">
              Connect accounts
            </Link>
          </p>
        </Alert>
      ) : null}

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Link2Off className="size-8" />}
          title="No connected accounts for this brand"
          description="Connect at least one social account to publish from MarketPilot. You can always copy the content and post it yourself instead."
          action={
            <Button asChild>
              <Link href="/social">Connect an account</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader title="Publish" description="Pick the destinations for this campaign." />
          <CardBody>
            <form action={action} className="space-y-4">
              <input type="hidden" name="campaignId" value={campaignId} />
              <input type="hidden" name="mode" value={mode} />
              <input type="hidden" name="timezone" value={timezone} />
              {selected.map((key) => (
                <input key={key} type="hidden" name="targets" value={key} />
              ))}

              <FormMessage state={state} />

              <fieldset>
                <legend className="text-sm font-medium text-ink-800">Destinations</legend>
                <ul className="mt-2 space-y-2">
                  {pairs.map(({ key, piece, account }) => {
                    const checked = selected.includes(key);
                    return (
                      <li key={key}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                            checked ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:border-ink-300',
                            account.needsReconnect && 'opacity-60',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                            checked={checked}
                            disabled={account.needsReconnect || !approved}
                            onChange={() =>
                              setSelected((current) =>
                                current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
                              )
                            }
                          />
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: PLATFORM_META[piece.platform].color }}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink-900">
                              {account.displayName}
                            </span>
                            <span className="block text-xs text-ink-500">{PLATFORM_META[piece.platform].label}</span>
                          </span>
                          {account.needsReconnect ? (
                            <Badge tone="danger">Reconnect needed</Badge>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('now')}
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2 text-sm font-medium',
                    mode === 'now' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600',
                  )}
                  aria-pressed={mode === 'now'}
                >
                  Publish now
                </button>
                <button
                  type="button"
                  onClick={() => setMode('schedule')}
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2 text-sm font-medium',
                    mode === 'schedule' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600',
                  )}
                  aria-pressed={mode === 'schedule'}
                >
                  Schedule
                </button>
              </div>

              {mode === 'schedule' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="schedule-date" className="block text-sm font-medium text-ink-800">
                      Date
                    </label>
                    <input
                      id="schedule-date"
                      name="date"
                      type="date"
                      required
                      min={new Date().toISOString().slice(0, 10)}
                      className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="schedule-time" className="block text-sm font-medium text-ink-800">
                      Time ({timezone})
                    </label>
                    <input
                      id="schedule-time"
                      name="time"
                      type="time"
                      required
                      defaultValue="09:00"
                      className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <p className="text-xs text-ink-500 sm:col-span-2">
                    Scheduling runs on our servers in {timezone}. You do not need to keep this page open.
                  </p>
                </div>
              ) : null}

              <div className="flex justify-end border-t border-ink-100 pt-4">
                <SubmitButton
                  size="lg"
                  pendingLabel={mode === 'now' ? 'Publishing…' : 'Scheduling…'}
                  disabled={selected.length === 0 || !approved || (mode === 'now' ? !canPublish : !canSchedule)}
                >
                  <Send className="size-4" aria-hidden="true" />
                  {mode === 'now' ? `Publish to ${selected.length || 0}` : `Schedule ${selected.length || 0}`}
                </SubmitButton>
              </div>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
