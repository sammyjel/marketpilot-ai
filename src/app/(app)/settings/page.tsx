import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell, Building2, Cpu, ShieldCheck, UserRound } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/primitives';
import { ProfileSettingsForm } from '@/components/settings/profile-form';
import { OrganizationSettingsForm } from '@/components/settings/organization-form';
import { requireAuth } from '@/server/auth/context';

export const metadata: Metadata = { title: 'Settings' };

const SECTIONS = [
  { href: '/settings/ai', icon: Cpu, title: 'AI settings', body: 'Providers, generation defaults and approval behaviour.' },
  { href: '/settings/notifications', icon: Bell, title: 'Notifications', body: 'What you get told about, and where.' },
  { href: '/settings/account', icon: ShieldCheck, title: 'Account & data', body: 'Sessions, data export and account deletion.' },
];

export default async function SettingsPage() {
  const ctx = await requireAuth();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" />

      <Card>
        <CardHeader
          title="Your profile"
          description="Your timezone controls how scheduled times are shown and entered."
          action={<UserRound className="size-5 text-ink-400" aria-hidden="true" />}
        />
        <CardBody>
          <ProfileSettingsForm
            name={ctx.user.name ?? ''}
            email={ctx.user.email}
            timezone={ctx.user.timezone}
            locale={ctx.user.locale}
            emailVerified={Boolean(ctx.user.emailVerifiedAt)}
          />
        </CardBody>
      </Card>

      {ctx.can('org:manage') ? (
        <Card>
          <CardHeader
            title="Workspace"
            description="Agency mode keeps each client's brands, accounts and analytics separate."
            action={<Building2 className="size-5 text-ink-400" aria-hidden="true" />}
          />
          <CardBody>
            <OrganizationSettingsForm
              name={ctx.organization.name}
              isAgency={ctx.organization.isAgency}
              planTier={ctx.organization.planTier}
            />
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-4 shadow-xs transition-shadow hover:shadow-md"
            >
              <Icon className="size-5 text-brand-600" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-ink-900">{section.title}</p>
              <p className="mt-1 text-xs text-ink-500">{section.body}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
