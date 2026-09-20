'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SubmitButton } from '@/components/forms/form-status';
import { deleteMediaAction } from '@/server/actions/media';

export function DeleteMediaButton({ mediaId }: { mediaId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-ink-400 hover:text-red-600"
        aria-label="Delete this file"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this file?"
        description="Campaigns that already used it keep their published posts, but the file will no longer be available for new ones."
        destructive
      >
        <form action={deleteMediaAction}>
          <input type="hidden" name="mediaId" value={mediaId} />
          <SubmitButton variant="danger" pendingLabel="Deleting…">
            Delete
          </SubmitButton>
        </form>
      </ConfirmDialog>
    </>
  );
}
