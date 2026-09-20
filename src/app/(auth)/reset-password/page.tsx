import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui/primitives';
import { ResetPasswordForm } from './reset-form';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="space-y-5">
        <Alert tone="warning" title="This link is incomplete">
          Password reset links expire after one hour. Request a new one to continue.
        </Alert>
        <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          Request a new reset link
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
