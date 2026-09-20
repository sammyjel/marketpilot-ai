import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/card';
import { Alert } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { AcceptInviteForm } from './accept-form';

export const metadata: Metadata = { title: 'Accept invitation' };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Join the workspace</h1>

      {!token ? (
        <>
          <Alert tone="warning" title="This invitation link is incomplete">
            Ask whoever invited you to send the full link again. Invitations expire after seven days.
          </Alert>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </>
      ) : (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-600">
              Accepting adds your account to this workspace with the role you were invited as. The invitation has to
              match the email address you are signed in with.
            </p>
            <div className="mt-5">
              <AcceptInviteForm token={token} />
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
