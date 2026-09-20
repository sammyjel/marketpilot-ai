'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  CreditCard,
  FileText,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  Megaphone,
  Menu,
  Package,
  Palette,
  Plus,
  Settings,
  Share2,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Megaphone,
  Package,
  Palette,
  LayoutTemplate,
  FileText,
  Images,
  CalendarDays,
  Share2,
  BarChart3,
  Users,
  CreditCard,
  Settings,
};

export type ResolvedNavGroup = {
  label: string;
  items: { href: string; label: string; icon: string; exact?: boolean }[];
};

export type SidebarProps = {
  groups: ResolvedNavGroup[];
  createLabel: string;
  isPlatformAdmin: boolean;
};

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarBody({ groups, createLabel, isPlatformAdmin, onNavigate }: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className="px-3 py-4">
        <Button asChild className="w-full" size="md">
          <Link href="/campaigns/new" onClick={onNavigate}>
            <Plus className="size-4" aria-hidden="true" />
            {createLabel}
          </Link>
        </Button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4 scroll-panel" aria-label="Primary">
        {groups.map((group) => (
          <div key={group.label}>
            <h2 className="px-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-400">{group.label}</h2>
            <ul className="mt-1.5 space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon] ?? FileText;
                const active = isActive(pathname, item.href, item.exact);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                        active ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                      )}
                    >
                      <Icon
                        className={cn('size-4 shrink-0', active ? 'text-brand-600' : 'text-ink-400')}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {isPlatformAdmin ? (
        <div className="border-t border-ink-200 px-3 py-3">
          <Link
            href="/admin"
            onClick={onNavigate}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
          >
            <ShieldCheck className="size-4 text-ink-400" aria-hidden="true" />
            Admin
          </Link>
        </div>
      ) : null}
    </>
  );
}

/** Persistent desktop rail. */
export function SidebarRail(props: SidebarProps) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-200 bg-white lg:flex">
      <div className="flex h-14 items-center border-b border-ink-200 px-4">
        <Link href="/dashboard" aria-label="Dashboard">
          <BrandMark />
        </Link>
      </div>
      <SidebarBody {...props} />
    </aside>
  );
}

/** Trigger + slide-over for narrow viewports. Rendered inside the topbar. */
export function SidebarTrigger(props: SidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-9 place-items-center rounded-lg text-ink-600 hover:bg-ink-100"
        aria-label="Open navigation"
        aria-expanded={open}
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            className="absolute inset-0 bg-ink-950/40"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-ink-200 px-4">
              <BrandMark />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 place-items-center rounded-lg text-ink-600 hover:bg-ink-100"
                aria-label="Close navigation"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <SidebarBody {...props} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
