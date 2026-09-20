'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { formatInTimezone } from '@/lib/dates';
import { PLATFORM_META, type Platform } from '@/lib/platforms';

type ScheduledPost = {
  id: string;
  campaignId: string;
  campaignTitle: string;
  platform: string;
  status: string;
  accountName: string;
  scheduledFor: string | null;
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function shiftMonth(monthIso: string, delta: number): string {
  const [year, month] = monthIso.split('-').map(Number);
  const date = new Date(Date.UTC(year!, (month ?? 1) - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Month grid.
 *
 * Posts are bucketed by their date *in the user's timezone*, not in UTC, so a
 * 23:00 post in Istanbul does not appear on the following day.
 */
export function CalendarGrid({
  monthIso,
  timezone,
  posts,
}: {
  monthIso: string;
  timezone: string;
  posts: ScheduledPost[];
}) {
  const [year, month] = monthIso.split('-').map(Number);
  const first = new Date(Date.UTC(year!, (month ?? 1) - 1, 1));
  const daysInMonth = new Date(Date.UTC(year!, month ?? 1, 0)).getUTCDate();

  // Monday-first grid.
  const leadingBlanks = (first.getUTCDay() + 6) % 7;

  const byDay = new Map<string, ScheduledPost[]>();
  for (const post of posts) {
    if (!post.scheduledFor) continue;
    const key = formatInTimezone(new Date(post.scheduledFor), timezone, 'yyyy-MM-dd');
    byDay.set(key, [...(byDay.get(key) ?? []), post]);
  }

  const monthLabel = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const todayKey = formatInTimezone(new Date(), timezone, 'yyyy-MM-dd');

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-5 py-3">
        <Link
          href={`/calendar?month=${shiftMonth(monthIso, -1)}`}
          className="grid size-8 place-items-center rounded-lg text-ink-600 hover:bg-ink-100"
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
        <h2 className="text-sm font-semibold text-ink-900">{monthLabel}</h2>
        <Link
          href={`/calendar?month=${shiftMonth(monthIso, 1)}`}
          className="grid size-8 place-items-center rounded-lg text-ink-600 hover:bg-ink-100"
          aria-label="Next month"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <CardBody className="p-3">
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((day) => (
            <div key={day} className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {day}
            </div>
          ))}

          {Array.from({ length: leadingBlanks }).map((_, index) => (
            <div key={`blank-${index}`} />
          ))}

          {Array.from({ length: daysInMonth }).map((_, index) => {
            const day = index + 1;
            const key = `${monthIso}-${String(day).padStart(2, '0')}`;
            const dayPosts = byDay.get(key) ?? [];
            const isToday = key === todayKey;

            return (
              <div
                key={key}
                className={cn(
                  'min-h-24 rounded-lg border p-1.5 text-left',
                  isToday ? 'border-brand-400 bg-brand-50/40' : 'border-ink-200',
                )}
              >
                <p className={cn('text-xs font-medium', isToday ? 'text-brand-700' : 'text-ink-500')}>{day}</p>

                <ul className="mt-1 space-y-1">
                  {dayPosts.slice(0, 3).map((post) => (
                    <li key={post.id}>
                      <Link
                        href={`/campaigns/${post.campaignId}?tab=schedule`}
                        title={`${post.campaignTitle} — ${post.accountName}`}
                        className="flex items-center gap-1 rounded bg-white px-1 py-0.5 text-[10px] font-medium text-ink-700 ring-1 ring-inset ring-ink-200 hover:ring-brand-300"
                      >
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: PLATFORM_META[post.platform as Platform]?.color ?? '#94a3b8' }}
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          {post.scheduledFor ? formatInTimezone(new Date(post.scheduledFor), timezone, 'HH:mm') : ''}{' '}
                          {post.campaignTitle}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {dayPosts.length > 3 ? (
                    <li className="px-1 text-[10px] text-ink-400">+{dayPosts.length - 3} more</li>
                  ) : null}
                </ul>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
