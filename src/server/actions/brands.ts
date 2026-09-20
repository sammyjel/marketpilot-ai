'use server';

import { BRAND_TONES } from '@/lib/tones';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type ActionState, failure, fromError, success } from '@/lib/action-state';
import { requireAuth } from '@/server/auth/context';
import { createBrand, deleteBrand, normalisePlatforms, updateBrand } from '@/server/services/brands';

const brandSchema = z.object({
  name: z.string().trim().min(1, 'Give the brand a name.').max(160),
  clientLabel: z.string().trim().max(160).optional(),
  websiteUrl: z.union([z.url('Enter a full URL including https://'), z.literal('')]).optional(),
  description: z.string().trim().max(2000).optional(),
  industry: z.string().trim().max(120).optional(),
  targetAudience: z.string().trim().max(500).optional(),
  country: z.string().trim().max(56).optional(),
  language: z.string().trim().max(10).optional(),
  currency: z.string().trim().max(3).optional(),
  timezone: z.string().trim().max(64).optional(),
  tone: z.enum(BRAND_TONES).optional(),
  voiceNotes: z.string().trim().max(2000).optional(),
  preferredCta: z.string().trim().max(120).optional(),
  guidelines: z.string().trim().max(5000).optional(),
  colors: z.string().optional(),
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** Colors arrive as a comma-separated string from the form. */
function parseColors(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^#[0-9a-fA-F]{6}$/.test(value))
    .slice(0, 8);
}

function toInput(data: z.infer<typeof brandSchema>, platforms: string[]) {
  return {
    name: data.name,
    clientLabel: data.clientLabel || null,
    websiteUrl: data.websiteUrl || null,
    description: data.description || null,
    industry: data.industry || null,
    targetAudience: data.targetAudience || null,
    ...(data.country ? { country: data.country } : {}),
    ...(data.language ? { language: data.language } : {}),
    ...(data.currency ? { currency: data.currency } : {}),
    ...(data.timezone ? { timezone: data.timezone } : {}),
    ...(data.tone ? { tone: data.tone } : {}),
    voiceNotes: data.voiceNotes || null,
    preferredCta: data.preferredCta || null,
    guidelines: data.guidelines || null,
    colors: parseColors(data.colors),
    activePlatforms: normalisePlatforms(platforms),
  };
}

export async function createBrandAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const parsed = brandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return failure('validation_failed', 'Please correct the highlighted fields.', fieldErrors(parsed.error));
  }

  let brandId: string;
  try {
    const ctx = await requireAuth();
    const platforms = formData.getAll('platforms').map(String);
    const brand = await createBrand(ctx, toInput(parsed.data, platforms));
    brandId = brand.id;
  } catch (error) {
    return fromError(error);
  }

  revalidatePath('/brands');
  redirect(`/brands/${brandId}`);
}

export async function updateBrandAction(
  brandId: string,
  _prev: ActionState<null>,
  formData: FormData,
): Promise<ActionState<null>> {
  const parsed = brandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return failure('validation_failed', 'Please correct the highlighted fields.', fieldErrors(parsed.error));
  }

  try {
    const ctx = await requireAuth();
    const platforms = formData.getAll('platforms').map(String);
    await updateBrand(ctx, brandId, toInput(parsed.data, platforms));
  } catch (error) {
    return fromError(error);
  }

  revalidatePath(`/brands/${brandId}`);
  revalidatePath('/brands');
  return success(null, 'Brand updated.');
}

export async function deleteBrandAction(formData: FormData): Promise<void> {
  const brandId = String(formData.get('brandId') ?? '');
  const ctx = await requireAuth();
  await deleteBrand(ctx, brandId);
  revalidatePath('/brands');
  redirect('/brands');
}
