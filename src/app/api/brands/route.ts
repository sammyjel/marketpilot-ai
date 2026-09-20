import { BRAND_TONES } from '@/lib/tones';
import { z } from 'zod';
import { ok, parseJson, route } from '@/server/api/http';
import { createBrand, listBrands, normalisePlatforms } from '@/server/services/brands';

const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  clientLabel: z.string().trim().max(160).nullish(),
  websiteUrl: z.url().nullish(),
  description: z.string().trim().max(2000).nullish(),
  industry: z.string().trim().max(120).nullish(),
  targetAudience: z.string().trim().max(500).nullish(),
  country: z.string().trim().max(56).optional(),
  language: z.string().trim().max(10).optional(),
  currency: z.string().trim().length(3).optional(),
  timezone: z.string().trim().max(64).optional(),
  tone: z.enum(BRAND_TONES).optional(),
  voiceNotes: z.string().trim().max(2000).nullish(),
  preferredCta: z.string().trim().max(120).nullish(),
  guidelines: z.string().trim().max(5000).nullish(),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(8).optional(),
  socialHandles: z.record(z.string(), z.string().max(120)).optional(),
  activePlatforms: z.array(z.string()).optional(),
});

export const GET = route(async ({ auth }) => ok(await listBrands(auth)));

export const POST = route(
  async ({ request, auth }) => {
    const body = await parseJson(request, createSchema);
    const { activePlatforms, ...rest } = body;
    const brand = await createBrand(auth, {
      ...rest,
      ...(activePlatforms ? { activePlatforms: normalisePlatforms(activePlatforms) } : {}),
    });
    return ok(brand, { status: 201 });
  },
  { capability: 'brand:write' },
);
