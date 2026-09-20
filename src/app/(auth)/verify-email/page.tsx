import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { verifyEmail } from '@/server/services/accounts';

export const metadata: Metadata = { title: 'Verify your email' };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const verified = token ? await verifyEmail(token) : false;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Verify your email</h1>

      {verified ? (
        <Alert tone="success" title="You are verified">
          Thanks — your email address is confirmed.
        </Alert>
      ) : (
        <Alert tone="warning" title="That link did not work">
          Verification links expire after 24 hours and can only be used once. Sign in and request a new one from your
          account settings.
        </Alert>
      )}

      <Button asChild className="w-full" size="lg">
        <Link href={verified ? '/login?verified=1' : '/login'}>Continue to sign in</Link>
      </Button>
    </div>
  );
}
