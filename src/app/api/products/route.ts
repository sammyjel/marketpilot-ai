import { z } from 'zod';
import { ok, pagination, parseJson, route, searchParams } from '@/server/api/http';
import { createProduct, listProducts } from '@/server/services/products';

const createSchema = z.object({
  brandId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullish(),
  productUrl: z.url().nullish(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Use a number such as 24.99').nullish(),
  currency: z.string().trim().length(3).nullish(),
  category: z.string().trim().max(120).nullish(),
  benefits: z.array(z.string().trim().max(200)).max(12).optional(),
  features: z.array(z.string().trim().max(200)).max(12).optional(),
  keywords: z.array(z.string().trim().max(60)).max(30).optional(),
  targetAudience: z.string().trim().max(500).nullish(),
  callToAction: z.string().trim().max(120).nullish(),
  mediaAssetIds: z.array(z.uuid()).max(10).optional(),
});

export const GET = route(async ({ request, auth }) => {
  const { limit, offset } = pagination(request);
  const brandId = searchParams(request).get('brandId');
  return ok(await listProducts(auth, { ...(brandId ? { brandId } : {}), limit, offset }));
});

export const POST = route(
  async ({ request, auth }) => {
    const body = await parseJson(request, createSchema);
    return ok(await createProduct(auth, body), { status: 201 });
  },
  { capability: 'product:write' },
);
