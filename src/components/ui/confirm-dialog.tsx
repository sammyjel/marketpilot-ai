'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Modal built on the native <dialog> element so focus trapping, Escape and the
 * top layer come from the platform rather than a hand-rolled implementation.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  destructive = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  /** The confirm control, usually a form that posts a server action. */
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="w-[min(30rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-ink-200 p-0 shadow-xl backdrop:bg-ink-950/40"
      aria-labelledby="confirm-title"
    >
      <div className="p-5">
        <h2 id="confirm-title" className="text-base font-semibold text-ink-900">
          {title}
        </h2>
        {description ? <p className="mt-2 text-sm leading-relaxed text-ink-600">{description}</p> : null}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-ink-200 bg-ink-50 px-5 py-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {children}
      </div>
      <span className="sr-only">{confirmLabel ?? (destructive ? 'Confirm deletion' : 'Confirm')}</span>
    </dialog>
  );
}
