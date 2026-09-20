'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type ActionState, failure, fromError, success } from '@/lib/action-state';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/server/auth/context';
import { getMedia, uploadMedia } from '@/server/services/media';
import { createProduct, deleteProduct, updateProduct } from '@/server/services/products';

const productSchema = z.object({
  brandId: z.uuid('Choose a brand.'),
  name: z.string().trim().min(1, 'Give the product a name.').max(200),
  description: z.string().trim().max(5000).optional(),
  productUrl: z.union([z.url('Enter a full URL including https://'), z.literal('')]).optional(),
  price: z.union([z.string().regex(/^\d+(\.\d{1,2})?$/, 'Use a number such as 24.99'), z.literal('')]).optional(),
  currency: z.string().trim().max(3).optional(),
  category: z.string().trim().max(120).optional(),
  targetAudience: z.string().trim().max(500).optional(),
  callToAction: z.string().trim().max(120).optional(),
  benefits: z.string().max(2000).optional(),
  features: z.string().max(2000).optional(),
  keywords: z.string().max(1000).optional(),
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** Newline- or comma-separated textareas become clean string arrays. */
function toList(raw: string | undefined, max: number): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Files are uploaded in the same action as the product so a half-created
 * product with no images is impossible from the UI.
 *
 * Two shapes arrive here. `files` carries raw bytes through the action, which
 * is the development path and works wherever request bodies are not capped.
 * `mediaAssetIds` names assets the browser already uploaded straight to
 * storage, which is how this works on a serverless host. Either way the
 * product ends up holding media IDs.
 */
async function uploadFiles(
  ctx: Awaited<ReturnType<typeof requireAuth>>,
  formData: FormData,
  brandId: string,
): Promise<string[]> {
  const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const ids: string[] = [];

  for (const file of files.slice(0, 10)) {
    const record = await uploadMedia(ctx, {
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      brandId,
    });
    ids.push(record.id);
  }

  const staged = formData
    .getAll('mediaAssetIds')
    .filter((entry): entry is string => typeof entry === 'string' && entry !== '');

  for (const id of staged.slice(0, 10)) {
    // getMedia scopes the lookup to the caller's organisation, so an ID
    // belonging to another tenant fails here rather than being attached.
    const record = await getMedia(ctx, id);
    ids.push(record.id);
  }

  return ids;
}

export async function createProductAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return failure('validation_failed', 'Please correct the highlighted fields.', fieldErrors(parsed.error));
  }

  let productId: string;
  try {
    const ctx = await requireAuth();
    const mediaAssetIds = await uploadFiles(ctx, formData, parsed.data.brandId);

    const product = await createProduct(ctx, {
      brandId: parsed.data.brandId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      productUrl: parsed.data.productUrl || null,
      price: parsed.data.price || null,
      currency: parsed.data.currency || null,
      category: parsed.data.category || null,
      targetAudience: parsed.data.targetAudience || null,
      callToAction: parsed.data.callToAction || null,
      benefits: toList(parsed.data.benefits, 12),
      features: toList(parsed.data.features, 12),
      keywords: toList(parsed.data.keywords, 30),
      mediaAssetIds,
    });
    productId = product.id;
  } catch (error) {
    return fromError(error);
  }

  revalidatePath('/products');
  redirect(`/products/${productId}`);
}

export async function updateProductAction(
  productId: string,
  _prev: ActionState<null>,
  formData: FormData,
): Promise<ActionState<null>> {
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return failure('validation_failed', 'Please correct the highlighted fields.', fieldErrors(parsed.error));
  }

  try {
    const ctx = await requireAuth();
    const newMedia = await uploadFiles(ctx, formData, parsed.data.brandId);
    const existing = formData.getAll('existingMedia').map(String);

    await updateProduct(ctx, productId, {
      name: parsed.data.name,
      description: parsed.data.description || null,
      productUrl: parsed.data.productUrl || null,
      price: parsed.data.price || null,
      currency: parsed.data.currency || null,
      category: parsed.data.category || null,
      targetAudience: parsed.data.targetAudience || null,
      callToAction: parsed.data.callToAction || null,
      benefits: toList(parsed.data.benefits, 12),
      features: toList(parsed.data.features, 12),
      keywords: toList(parsed.data.keywords, 30),
      mediaAssetIds: [...existing, ...newMedia],
    });
  } catch (error) {
    return fromError(error);
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath('/products');
  return success(null, 'Product updated.');
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const productId = String(formData.get('productId') ?? '');
  if (!productId) throw new AppError('validation_failed', 'Missing product.');

  const ctx = await requireAuth();
  await deleteProduct(ctx, productId);
  revalidatePath('/products');
  redirect('/products');
}
