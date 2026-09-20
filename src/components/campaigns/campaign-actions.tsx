'use client';

import { useState } from 'react';
import { Check, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SubmitButton } from '@/components/forms/form-status';
import {
  approveCampaignAction,
  deleteCampaignAction,
  duplicateCampaignAction,
  regenerateCampaignAction,
} from '@/server/actions/campaigns';

const APPROVABLE = ['generated', 'needs_review', 'draft'];

export function CampaignActions({
  campaignId,
  status,
  canApprove,
  canGenerate,
  canDelete,
}: {
  campaignId: string;
  status: string;
  canApprove: boolean;
  canGenerate: boolean;
  canDelete: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const generating = status === 'generating';

  return (
    <>
      {canGenerate && !generating ? (
        <Button variant="outline" onClick={() => setConfirmRegenerate(true)}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Regenerate
        </Button>
      ) : null}

      <form action={duplicateCampaignAction}>
        <input type="hidden" name="campaignId" value={campaignId} />
        <SubmitButton variant="outline" pendingLabel="Copying…">
          <Copy className="size-4" aria-hidden="true" />
          Duplicate
        </SubmitButton>
      </form>

      {canApprove && APPROVABLE.includes(status) ? (
        <form action={approveCampaignAction}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <SubmitButton pendingLabel="Approving…">
            <Check className="size-4" aria-hidden="true" />
            Approve
          </SubmitButton>
        </form>
      ) : null}

      {canDelete ? (
        <Button variant="ghost" onClick={() => setConfirmDelete(true)} aria-label="Delete campaign">
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      ) : null}

      <ConfirmDialog
        open={confirmRegenerate}
        onClose={() => setConfirmRegenerate(false)}
        title="Regenerate this campaign?"
        description="Every piece of content will be rewritten and your edits to them will be lost. The current version is saved to history first, so you can restore it."
      >
        <form action={regenerateCampaignAction}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <SubmitButton pendingLabel="Queuing…">Regenerate</SubmitButton>
        </form>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this campaign?"
        description="Scheduled posts that have not gone out will be cancelled. Already published posts stay on their platforms."
        destructive
      >
        <form action={deleteCampaignAction}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <SubmitButton variant="danger" pendingLabel="Deleting…">
            Delete campaign
          </SubmitButton>
        </form>
      </ConfirmDialog>
    </>
  );
}
