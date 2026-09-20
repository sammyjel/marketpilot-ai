import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDictionary } from '@/i18n';
import { getAuthContext } from '@/server/auth/context';
import { SignUpForm } from './signup-form';

export const metadata: Metadata = { title: 'Create your account' };

export default async function SignUpPage() {
  if (await getAuthContext()) redirect('/dashboard');
  const dict = await getDictionary();

  return (
    <div>
      <SignUpForm dict={dict.auth} />
      <p className="mt-6 text-center text-sm text-ink-500">
        {dict.auth.hasAccount}{' '}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
          {dict.common.signIn}
        </Link>
      </p>
    </div>
  );
}
