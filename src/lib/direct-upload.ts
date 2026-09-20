'use client';

/**
 * Browser-side upload that goes straight to object storage.
 *
 * Serverless hosts cap request bodies far below this app's media limits —
 * Netlify at roughly 6 MB against a 200 MB video ceiling — so sending bytes
 * through a Server Action stops working once deployed. Instead the browser
 * asks for a short-lived URL, PUTs the file to the bucket itself, and then
 * asks the server to accept it. Only metadata crosses the function boundary.
 *
 * The server still decides what a file is: `/api/media/finalize` reads the
 * bytes back and re-runs every check. Nothing here is a security boundary.
 */

type Ticket =
  | { supported: false }
  | { supported: true; uploadUrl: string; stagingKey: string };

export type DirectUploadResult =
  /** Storage cannot presign (the local disk driver) — post bytes as before. */
  | { kind: 'unsupported' }
  | { kind: 'uploaded'; mediaAssetIds: string[] };

const GENERIC_FAILURE = 'That upload could not be completed. Please try again.';

async function messageFor(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? GENERIC_FAILURE;
  } catch {
    return GENERIC_FAILURE;
  }
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function uploadDirect(
  files: File[],
  options: { brandId?: string | null; onProgress?: (completed: number, total: number) => void } = {},
): Promise<DirectUploadResult> {
  const mediaAssetIds: string[] = [];

  for (const file of files) {
    const ticketResponse = await postJson('/api/media/upload-url', { byteSize: file.size });
    if (!ticketResponse.ok) throw new Error(await messageFor(ticketResponse));

    const ticket = ((await ticketResponse.json()) as { data: Ticket }).data;

    // Decided once, on the first file: the driver does not change mid-batch.
    if (!ticket.supported) return { kind: 'unsupported' };

    const stored = await fetch(ticket.uploadUrl, { method: 'PUT', body: file });
    if (!stored.ok) {
      // A blocked preflight looks exactly like this, and it is the likeliest
      // cause on a fresh bucket, so the message names it.
      throw new Error(
        `${file.name} could not be sent to storage. If this is a new bucket, check that its CORS rules allow PUT from this site.`,
      );
    }

    const accepted = await postJson('/api/media/finalize', {
      stagingKey: ticket.stagingKey,
      filename: file.name,
      brandId: options.brandId ?? null,
    });
    if (!accepted.ok) throw new Error(await messageFor(accepted));

    const record = ((await accepted.json()) as { data: { id: string } }).data;
    mediaAssetIds.push(record.id);
    options.onProgress?.(mediaAssetIds.length, files.length);
  }

  return { kind: 'uploaded', mediaAssetIds };
}

/** Files still pending in a form, largest-first is irrelevant — order is kept. */
export function pendingFiles(formData: FormData, field = 'files'): File[] {
  return formData.getAll(field).filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

/**
 * Moves a form's file bytes into storage before the Server Action runs, and
 * rewrites the form to carry the resulting media IDs instead.
 *
 * When storage cannot presign the form is left exactly as it was, so the
 * action's existing multipart path still handles it.
 */
export async function hoistFilesToStorage(
  formData: FormData,
  options: { brandId?: string | null; field?: string } = {},
): Promise<void> {
  const field = options.field ?? 'files';
  const files = pendingFiles(formData, field);
  if (files.length === 0) return;

  const result = await uploadDirect(files, { brandId: options.brandId ?? null });
  if (result.kind === 'unsupported') return;

  formData.delete(field);
  for (const id of result.mediaAssetIds) formData.append('mediaAssetIds', id);
}
