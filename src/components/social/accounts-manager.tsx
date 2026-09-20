'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, Info, Plug, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SubmitButton } from '@/components/forms/form-status';
import { cn } from '@/lib/cn';
import { PLATFORM_META, type Platform } from '@/lib/platforms';
import { connectAccountAction, disconnectAccountAction, validateAccountAction } from '@/server/actions/social';

type Availability = {
  platform: Platform;
  label: string;
  configured: boolean;
  isMock: boolean;
  requirements: string[];
  limitations: string[];
  docsUrl: string;
};

type Account = {
  id: string;
  platform: string;
  displayName: string;
  username: string | null;
  brandId: string;
  needsReconnect: boolean;
  isMock: boolean;
  tokenExpiresAt: string | null;
  lastValidatedAt: string | null;
};

export function SocialAccountsManager({
  brands,
  accounts,
  availability,
  defaultBrandId,
  canConnect,
}: {
  brands: { id: string; name: string }[];
  accounts: Account[];
  availability: Availability[];
  defaultBrandId: string;
  canConnect: boolean;
}) {
  const [brandId, setBrandId] = useState(defaultBrandId);
  const [expanded, setExpanded] = useState<Platform | null>(null);
  const [disconnecting, setDisconnecting] = useState<Account | null>(null);

  const brandAccounts = accounts.filter((account) => account.brandId === brandId);

  return (
    <div className="space-y-5">
      {brands.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink-700">Brand:</span>
          {brands.map((brand) => (
            <button
              key={brand.id}
              type="button"
              onClick={() => setBrandId(brand.id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                brandId === brand.id
                  ? 'bg-ink-900 text-white ring-ink-900'
                  : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
              )}
            >
              {brand.name}
            </button>
          ))}
        </div>
      ) : null}

      {availability.some((entry) => entry.isMock) ? (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          <p className="font-semibold">Mock mode is on</p>
          <p className="mt-0.5">
            Connections made now are local simulations for development. Nothing is sent to a real platform and no post
            is ever created. Accounts connected this way are labelled &ldquo;Demo&rdquo;.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {availability.map((entry) => {
          const connected = brandAccounts.filter((account) => account.platform === entry.platform);
          const meta = PLATFORM_META[entry.platform];
          const isOpen = expanded === entry.platform;

          return (
            <Card key={entry.platform}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden="true" />
                    {entry.label}
                  </span>
                }
                description={
                  connected.length > 0
                    ? `${connected.length} account${connected.length === 1 ? '' : 's'} connected`
                    : entry.configured
                      ? 'Not connected'
                      : 'Not available on this installation'
                }
                action={
                  entry.configured && canConnect ? (
                    <form action={connectAccountAction}>
                      <input type="hidden" name="platform" value={entry.platform} />
                      <input type="hidden" name="brandId" value={brandId} />
                      <SubmitButton size="sm" variant={connected.length > 0 ? 'outline' : 'primary'} pendingLabel="Opening…">
                        <Plug className="size-3.5" aria-hidden="true" />
                        {connected.length > 0 ? 'Add another' : 'Connect'}
                      </SubmitButton>
                    </form>
                  ) : (
                    <Badge tone="neutral">Unavailable</Badge>
                  )
                }
              />

              <CardBody className="space-y-3">
                {connected.length > 0 ? (
                  <ul className="space-y-2">
                    {connected.map((account) => (
                      <li
                        key={account.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 px-3 py-2"
                      >
                        {account.needsReconnect ? (
                          <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink-900">
                            {account.displayName}
                          </span>
                          {account.username ? (
                            <span className="block truncate text-xs text-ink-500">@{account.username}</span>
                          ) : null}
                        </span>

                        {account.isMock ? <Badge tone="warning">Demo</Badge> : null}
                        {account.needsReconnect ? <Badge tone="danger">Reconnect</Badge> : null}

                        <span className="flex gap-1">
                          <form action={validateAccountAction}>
                            <input type="hidden" name="accountId" value={account.id} />
                            <SubmitButton size="sm" variant="ghost" pendingLabel="Checking…">
                              Check
                            </SubmitButton>
                          </form>
                          <Button size="sm" variant="ghost" onClick={() => setDisconnecting(account)}>
                            <Unplug className="size-3.5" aria-hidden="true" />
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {!entry.configured ? (
                  <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
                    An administrator needs to add this platform&rsquo;s developer app credentials to the environment
                    before it can be connected.
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : entry.platform)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left text-xs font-medium text-ink-600 hover:text-ink-900"
                >
                  <span className="flex items-center gap-1.5">
                    <Info className="size-3.5" aria-hidden="true" />
                    What this platform requires
                  </span>
                  <ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
                </button>

                {isOpen ? (
                  <div className="space-y-3 rounded-lg bg-ink-50 p-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Requirements</p>
                      <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-ink-700">
                        {entry.requirements.map((requirement) => (
                          <li key={requirement}>{requirement}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Known limits</p>
                      <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-ink-700">
                        {entry.limitations.map((limitation) => (
                          <li key={limitation}>{limitation}</li>
                        ))}
                      </ul>
                    </div>
                    <a
                      href={entry.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                    >
                      Platform documentation
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          );
        })}
      </div>

      <ConfirmDialog
        open={disconnecting !== null}
        onClose={() => setDisconnecting(null)}
        title={`Disconnect ${disconnecting?.displayName ?? ''}?`}
        description="Stored access tokens are deleted and scheduled posts to this account will not go out. Posts already published stay on the platform."
        destructive
      >
        <form action={disconnectAccountAction}>
          <input type="hidden" name="accountId" value={disconnecting?.id ?? ''} />
          <SubmitButton variant="danger" pendingLabel="Disconnecting…">
            Disconnect
          </SubmitButton>
        </form>
      </ConfirmDialog>
    </div>
  );
}
