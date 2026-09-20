'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteProductAction } from '@/server/actions/products';

export function DeleteProductButton({ productId, productName }: { productId: string; productName: string }) {
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
        title={`Delete ${productName}?`}
        description="Campaigns already generated from this product are kept, but you will not be able to create new ones from it."
        destructive
      >
        <form action={deleteProductAction}>
          <input type="hidden" name="productId" value={productId} />
          <Button type="submit" variant="danger">
            Delete product
          </Button>
        </form>
      </ConfirmDialog>
    </>
  );
}
