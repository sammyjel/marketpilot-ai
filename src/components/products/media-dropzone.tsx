'use client';

import { useCallback, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { cn } from '@/lib/cn';

const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';
const MAX_FILES = 10;
const MAX_IMAGE_MB = 12;
const MAX_VIDEO_MB = 200;

type Preview = { file: File; url: string; id: string };

/**
 * Client-side picker with previews. Every check here is a courtesy to the user;
 * the authoritative validation (magic bytes, dimensions, quotas) runs on the
 * server in `uploadMedia`.
 */
export function MediaDropzone({ name = 'files', disabled }: { name?: string; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback((next: Preview[]) => {
    setPreviews(next);
    // The file input is the source of truth for the form submission.
    const transfer = new DataTransfer();
    for (const preview of next) transfer.items.add(preview.file);
    if (inputRef.current) inputRef.current.files = transfer.files;
  }, []);

  const addFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) return;
      setError(null);
      const accepted: Preview[] = [];

      for (const file of Array.from(incoming)) {
        if (previews.length + accepted.length >= MAX_FILES) {
          setError(`You can attach up to ${MAX_FILES} files.`);
          break;
        }
        const isVideo = file.type.startsWith('video/');
        const limitMb = isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB;
        if (!ACCEPT.split(',').includes(file.type)) {
          setError('Only JPG, PNG, WEBP, MP4 and MOV files are supported.');
          continue;
        }
        if (file.size > limitMb * 1024 * 1024) {
          setError(`${file.name} is larger than ${limitMb} MB.`);
          continue;
        }
        accepted.push({ file, url: URL.createObjectURL(file), id: `${file.name}-${file.size}-${file.lastModified}` });
      }

      if (accepted.length > 0) sync([...previews, ...accepted]);
    },
    [previews, sync],
  );

  const remove = (id: string) => {
    const target = previews.find((p) => p.id === id);
    if (target) URL.revokeObjectURL(target.url);
    sync(previews.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        className={cn(
          'rounded-[var(--radius-card)] border-2 border-dashed px-5 py-8 text-center transition-colors',
          dragging ? 'border-brand-500 bg-brand-50' : 'border-ink-300 bg-ink-50/50',
        )}
      >
        <ImagePlus className="mx-auto size-7 text-ink-400" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-ink-800">Drag product photos here</p>
        <p className="mt-1 text-xs text-ink-500">
          JPG, PNG or WEBP up to {MAX_IMAGE_MB} MB · MP4 or MOV up to {MAX_VIDEO_MB} MB · {MAX_FILES} files max
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="mt-4 rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50 disabled:opacity-50"
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept={ACCEPT}
          multiple
          disabled={disabled}
          onChange={(event) => addFiles(event.target.files)}
          className="sr-only"
          aria-label="Product images and video"
        />
      </div>

      {error ? (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}

      {previews.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {previews.map((preview) => (
            <li key={preview.id} className="relative">
              <div className="aspect-square overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
                {preview.file.type.startsWith('video/') ? (
                  <video src={preview.url} className="size-full object-cover" muted playsInline />
                ) : (
                  // Object URLs cannot go through the Next image optimizer.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.url} alt="" className="size-full object-cover" />
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(preview.id)}
                className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-ink-900 text-white shadow hover:bg-red-600"
                aria-label={`Remove ${preview.file.name}`}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
