'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteBrandAction } from '@/server/actions/brands';

export function DeleteBrandButton({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" aria-hidden="true" />
        Delete
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${brandName}?`}
        description="Existing campaigns and analytics are kept for your records, but the brand will no longer be selectable and its connected accounts stop publishing."
        confirmLabel="Delete brand"
        destructive
      >
        <form action={deleteBrandAction}>
          <input type="hidden" name="brandId" value={brandId} />
          <Button type="submit" variant="danger">
            Delete brand
          </Button>
        </form>
      </ConfirmDialog>
    </>
  );
}
