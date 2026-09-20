import { headers } from 'next/headers';
import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '@/server/auth/password';
import { ok, parseJson, publicRoute } from '@/server/api/http';
import { registerUser } from '@/server/services/accounts';
import { env } from '@/lib/env';

const schema = z.object({
  email: z.email(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
  name: z.string().trim().max(120).optional(),
  organizationName: z.string().trim().max(160).optional(),
  timezone: z.string().max(64).optional(),
});

export const POST = publicRoute(async ({ request }) => {
  const body = await parseJson(request, schema);
  const headerList = await headers();

  const result = await registerUser({
    ...body,
    ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local',
  });

  return ok(
    {
      userId: result.userId,
      organizationId: result.organizationId,
      // Surfaced only in mock mode so local clients can finish verification
      // without an email transport configured.
      ...(env().MOCK_EXTERNAL_SERVICES ? { verificationToken: result.verificationToken } : {}),
    },
    { status: 201 },
  );
});
