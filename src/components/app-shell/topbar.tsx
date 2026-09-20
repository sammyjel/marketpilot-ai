'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Building2, Check, ChevronDown, LogOut, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';
import { signOutAction, switchOrganizationAction } from '@/server/actions/auth';

export type TopbarOrg = { id: string; name: string; role: string };

/** Click-outside + Escape handling shared by both menus. */
function useDismiss<T extends HTMLElement>(onDismiss: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onDismiss]);
  return ref;
}

export function OrgSwitcher({ organizations, activeId }: { organizations: TopbarOrg[]; activeId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(() => setOpen(false));
  const active = organizations.find((o) => o.id === activeId) ?? organizations[0];
  if (!active) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[15rem] items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Building2 className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
        <span className="truncate">{active.name}</span>
        <ChevronDown className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
      </button>

      {open ? (
        <div
          className="absolute left-0 z-50 mt-1 w-64 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-lg"
          role="menu"
        >
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Workspaces</p>
          {organizations.map((org) => (
            <form key={org.id} action={switchOrganizationAction}>
              <input type="hidden" name="organizationId" value={org.id} />
              <button
                type="submit"
                role="menuitem"
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-ink-50',
                  org.id === activeId && 'font-semibold text-brand-700',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{org.name}</span>
                  <span className="block text-xs font-normal text-ink-400">{org.role}</span>
                </span>
                {org.id === activeId ? <Check className="size-4 shrink-0 text-brand-600" aria-hidden="true" /> : null}
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function UserMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(() => setOpen(false));
  const initials = (name || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid size-9 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {initials || <UserRound className="size-4" aria-hidden="true" />}
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-lg"
          role="menu"
        >
          <div className="border-b border-ink-100 px-3 py-2">
            <p className="truncate text-sm font-medium text-ink-900">{name || 'Your account'}</p>
            <p className="truncate text-xs text-ink-500">{email}</p>
          </div>
          <Link href="/settings" role="menuitem" className="block px-3 py-2 text-sm text-ink-700 hover:bg-ink-50">
            Settings
          </Link>
          <Link href="/settings/account" role="menuitem" className="block px-3 py-2 text-sm text-ink-700 hover:bg-ink-50">
            Account & data
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-50"
            >
              <LogOut className="size-4 text-ink-400" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/settings/notifications"
      className="relative grid size-9 place-items-center rounded-lg text-ink-600 hover:bg-ink-100"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Bell className="size-5" aria-hidden="true" />
      {unread > 0 ? (
        <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
