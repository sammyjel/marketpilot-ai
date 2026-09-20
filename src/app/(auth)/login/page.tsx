import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Alert } from '@/components/ui/primitives';
import { getDictionary } from '@/i18n';
import { getAuthContext } from '@/server/auth/context';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; verified?: string }>;
}) {
  if (await getAuthContext()) redirect('/dashboard');

  const dict = await getDictionary();
  const params = await searchParams;

  return (
    <div>
      {params.reset ? (
        <div className="mb-5">
          <Alert tone="success">Your password has been changed. Sign in with your new password.</Alert>
        </div>
      ) : null}
      {params.verified ? (
        <div className="mb-5">
          <Alert tone="success">Your email is verified.</Alert>
        </div>
      ) : null}

      <LoginForm dict={dict.auth} next={params.next ?? ''} />

      <p className="mt-6 text-center text-sm text-ink-500">
        {dict.auth.noAccount}{' '}
        <Link href="/signup" className="font-medium text-brand-600 hover:text-brand-700">
          {dict.common.signUp}
        </Link>
      </p>
    </div>
  );
}
