import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/server/auth/context';
import { OnboardingWizard } from './wizard';

export const metadata: Metadata = { title: 'Welcome' };

export default async function OnboardingPage() {
  const ctx = await requireAuth();
  if (ctx.user.onboardingCompletedAt) redirect('/dashboard');

  return (
    <div className="mx-auto max-w-2xl">
      <OnboardingWizard defaultTimezone={ctx.user.timezone} organizationName={ctx.organization.name} />
    </div>
  );
}
