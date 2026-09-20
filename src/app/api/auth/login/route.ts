import { headers } from 'next/headers';
import { z } from 'zod';
import { ok, parseJson, publicRoute } from '@/server/api/http';
import { loginUser } from '@/server/services/accounts';

const schema = z.object({ email: z.email(), password: z.string().min(1) });

export const POST = publicRoute(async ({ request }) => {
  const body = await parseJson(request, schema);
  const headerList = await headers();
  const result = await loginUser({
    ...body,
    ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local',
  });
  return ok({ userId: result.userId });
});
