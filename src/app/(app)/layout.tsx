import { redirect } from 'next/navigation';
import { and, count, eq, isNull } from 'drizzle-orm';
import { SidebarRail, SidebarTrigger, type ResolvedNavGroup } from '@/components/app-shell/sidebar';
import { NotificationBell, OrgSwitcher, UserMenu } from '@/components/app-shell/topbar';
import { NAV_GROUPS } from '@/components/app-shell/nav-config';
import { getDictionary } from '@/i18n';
import { ROLE_LABELS } from '@/server/auth/permissions';
import { getAuthContext } from '@/server/auth/context';
import { getDb } from '@/server/db';
import { notifications } from '@/server/db/schema';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Server-side gate. The middleware only does a cookie-presence fast path.
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const dict = await getDictionary();
  const db = await getDb();

  const [unreadRow] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, ctx.organization.id),
        eq(notifications.userId, ctx.user.id),
        isNull(notifications.readAt),
      ),
    );

  // Nav items the member cannot use are removed server-side, not just hidden.
  const groups: ResolvedNavGroup[] = NAV_GROUPS.map((group) => ({
    label: dict.nav[group.labelKey],
    items: group.items
      .filter((item) => !item.capability || ctx.can(item.capability))
      .map((item) => ({
        href: item.href,
        label: dict.nav[item.labelKey],
        icon: item.icon,
        ...(item.exact ? { exact: true } : {}),
      })),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex min-h-dvh bg-ink-50">
      <SidebarRail groups={groups} createLabel={dict.nav.createCampaign} isPlatformAdmin={ctx.user.isPlatformAdmin} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-200 bg-white/90 px-3 backdrop-blur sm:px-5">
          <SidebarTrigger groups={groups} createLabel={dict.nav.createCampaign} isPlatformAdmin={ctx.user.isPlatformAdmin} />

          <OrgSwitcher
            organizations={ctx.organizations.map((org) => ({
              id: org.id,
              name: org.name,
              role: ROLE_LABELS[org.role],
            }))}
            activeId={ctx.organization.id}
          />

          <div className="ml-auto flex items-center gap-1.5">
            <NotificationBell unread={unreadRow?.value ?? 0} />
            <UserMenu name={ctx.user.name ?? ''} email={ctx.user.email} />
          </div>
        </header>

        <main id="main" className="flex-1 px-3 py-5 sm:px-5 sm:py-7 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
