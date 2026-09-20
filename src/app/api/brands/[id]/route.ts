import { BRAND_TONES } from '@/lib/tones';
import { z } from 'zod';
import { ok, parseJson, route } from '@/server/api/http';
import { deleteBrand, getBrand, normalisePlatforms, updateBrand } from '@/server/services/brands';

type Params = { id: string };

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    clientLabel: z.string().trim().max(160).nullable(),
    websiteUrl: z.url().nullable(),
    description: z.string().trim().max(2000).nullable(),
    industry: z.string().trim().max(120).nullable(),
    targetAudience: z.string().trim().max(500).nullable(),
    country: z.string().trim().max(56),
    language: z.string().trim().max(10),
    currency: z.string().trim().length(3),
    timezone: z.string().trim().max(64),
    tone: z.enum(BRAND_TONES),
    voiceNotes: z.string().trim().max(2000).nullable(),
    preferredCta: z.string().trim().max(120).nullable(),
    guidelines: z.string().trim().max(5000).nullable(),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(8),
    socialHandles: z.record(z.string(), z.string().max(120)),
    activePlatforms: z.array(z.string()),
  })
  .partial();

export const GET = route<Params>(async ({ auth, params }) => ok(await getBrand(auth, params.id)));

export const PATCH = route<Params>(
  async ({ request, auth, params }) => {
    const body = await parseJson(request, updateSchema);
    const { activePlatforms, ...rest } = body;
    const brand = await updateBrand(auth, params.id, {
      ...rest,
      ...(activePlatforms ? { activePlatforms: normalisePlatforms(activePlatforms) } : {}),
    });
    return ok(brand);
  },
  { capability: 'brand:write' },
);

export const DELETE = route<Params>(
  async ({ auth, params }) => {
    await deleteBrand(auth, params.id);
    return ok({ deleted: true });
  },
  { capability: 'brand:delete' },
);
