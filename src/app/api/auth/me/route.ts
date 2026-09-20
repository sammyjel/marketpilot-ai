import { ok, route } from '@/server/api/http';
import { capabilitiesFor } from '@/server/auth/permissions';

export const GET = route(async ({ auth }) =>
  ok({
    user: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      timezone: auth.user.timezone,
      locale: auth.user.locale,
      emailVerified: Boolean(auth.user.emailVerifiedAt),
      onboardingCompleted: Boolean(auth.user.onboardingCompletedAt),
      isPlatformAdmin: auth.user.isPlatformAdmin,
    },
    organization: auth.organization,
    organizations: auth.organizations,
    capabilities: capabilitiesFor(auth.role),
  }),
);
