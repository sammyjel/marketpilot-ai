'use client';

import { useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SubmitButton } from '@/components/forms/form-status';
import { restoreVersionAction } from '@/server/actions/campaigns';

export function VersionHistory({
  campaignId,
  versions,
  canEdit,
}: {
  campaignId: string;
  versions: { version: number; label: string | null; createdAt: string }[];
  canEdit: boolean;
}) {
  const [restoring, setRestoring] = useState<number | null>(null);

  if (versions.length === 0) {
    return (
      <EmptyState
        icon={<History className="size-8" />}
        title="No saved versions yet"
        description="A version is saved automatically each time the campaign is generated, so you can always go back."
      />
    );
  }

  return (
    <Card>
      <CardHeader title="Version history" description="Restoring a version saves the current one first." />
      <CardBody className="p-0">
        <ul className="divide-y divide-ink-100">
          {versions.map((version) => (
            <li key={version.version} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">
                  Version {version.version}
                  {version.label ? <span className="ml-2 font-normal text-ink-500">{version.label}</span> : null}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">{new Date(version.createdAt).toLocaleString()}</p>
              </div>
              {canEdit ? (
                <Button variant="outline" size="sm" onClick={() => setRestoring(version.version)}>
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  Restore
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardBody>

      <ConfirmDialog
        open={restoring !== null}
        onClose={() => setRestoring(null)}
        title={`Restore version ${restoring ?? ''}?`}
        description="The current content is snapshotted first, so this is reversible."
      >
        <form action={restoreVersionAction}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="version" value={restoring ?? ''} />
          <SubmitButton pendingLabel="Restoring…">Restore</SubmitButton>
        </form>
      </ConfirmDialog>
    </Card>
  );
}
