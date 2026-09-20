import { z } from 'zod';
import { ok, parseJson, route } from '@/server/api/http';
import { deleteProduct, getProduct, getProductAssets, updateProduct } from '@/server/services/products';

type Params = { id: string };

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).nullable(),
    productUrl: z.url().nullable(),
    price: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable(),
    currency: z.string().trim().length(3).nullable(),
    category: z.string().trim().max(120).nullable(),
    benefits: z.array(z.string().trim().max(200)).max(12),
    features: z.array(z.string().trim().max(200)).max(12),
    keywords: z.array(z.string().trim().max(60)).max(30),
    targetAudience: z.string().trim().max(500).nullable(),
    callToAction: z.string().trim().max(120).nullable(),
    mediaAssetIds: z.array(z.uuid()).max(10),
  })
  .partial();

export const GET = route<Params>(async ({ auth, params }) => {
  const [product, assets] = await Promise.all([
    getProduct(auth, params.id),
    getProductAssets(auth, params.id),
  ]);
  return ok({ ...product, assets });
});

export const PATCH = route<Params>(
  async ({ request, auth, params }) => {
    const body = await parseJson(request, updateSchema);
    return ok(await updateProduct(auth, params.id, body));
  },
  { capability: 'product:write' },
);

export const DELETE = route<Params>(
  async ({ auth, params }) => {
    await deleteProduct(auth, params.id);
    return ok({ deleted: true });
  },
  { capability: 'product:delete' },
);
