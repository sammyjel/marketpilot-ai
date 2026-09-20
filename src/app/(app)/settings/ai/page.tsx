import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Badge, PageHeader } from '@/components/ui/primitives';
import { AiSettingsForm } from '@/components/settings/ai-settings-form';
import { env } from '@/lib/env';
import { mediaCapabilities } from '@/providers/media';
import { isMockAi } from '@/providers/ai';
import { isMockSocial } from '@/providers/social';
import { requireCapability } from '@/server/auth/context';
import { getDb } from '@/server/db';
import { organizations } from '@/server/db/schema';

export const metadata: Metadata = { title: 'AI settings' };

export default async function AiSettingsPage() {
  const ctx = await requireCapability('org:manage');
  const db = await getDb();

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, ctx.organization.id))
    .limit(1);

  const ai = (org?.settings?.['ai'] ?? {}) as {
    defaultTone?: string;
    autoPublishApproved?: boolean;
    requireReviewAlways?: boolean;
  };

  const capabilities = mediaCapabilities();
  const config = env();

  const providers = [
    { label: 'Language model', value: isMockAi() ? 'Mock (development)' : `${config.AI_PROVIDER} · ${config.AI_MODEL}`, live: !isMockAi() },
    { label: 'Image generation', value: capabilities.image.provider, live: capabilities.image.provider !== 'compositor' },
    {
      label: 'Video generation',
      value: capabilities.video.available ? capabilities.video.provider : 'Not configured',
      live: capabilities.video.available,
    },
    {
      label: 'Voice-over',
      value: capabilities.voice.available ? capabilities.voice.provider : 'Not configured',
      live: capabilities.voice.available,
    },
    { label: 'Social publishing', value: isMockSocial() ? 'Mock (development)' : 'Live platform APIs', live: !isMockSocial() },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="AI settings"
        description="What is configured on this installation, and how generated content is handled."
      />

      {config.MOCK_EXTERNAL_SERVICES ? (
        <Alert tone="warning" title="Mock mode is on">
          Every external service is simulated locally. No API credits are spent and nothing is sent to a real platform.
          Set <code>MOCK_EXTERNAL_SERVICES=false</code> in your environment to go live.
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Configured providers" description="Set through environment variables, not in the interface." />
        <CardBody className="p-0">
          <ul className="divide-y divide-ink-100">
            {providers.map((provider) => (
              <li key={provider.label} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="text-sm font-medium text-ink-800">{provider.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-sm text-ink-600">{provider.value}</span>
                  <Badge tone={provider.live ? 'success' : 'neutral'}>{provider.live ? 'Live' : 'Simulated'}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Generation defaults" />
        <CardBody>
          <AiSettingsForm
            defaultTone={ai.defaultTone ?? 'friendly'}
            autoPublishApproved={ai.autoPublishApproved ?? false}
            requireReviewAlways={ai.requireReviewAlways ?? true}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="How generated content is handled" />
        <CardBody className="space-y-3 text-sm text-ink-600">
          <p>
            Every campaign goes through a quality-control pass before you see it. Unsupported medical, financial, legal
            or guaranteed-results claims are flagged as blockers, and a campaign cannot be approved while any blocker
            remains.
          </p>
          <p>
            Nothing publishes without a person approving it first. Auto-publish, when enabled, applies only to campaigns
            that have already been approved.
          </p>
          <p>
            Images generated from a product photo keep the product identical — only the background, framing and text
            overlay are produced. See the{' '}
            <Link href="/legal/terms" className="font-medium text-brand-600 hover:text-brand-700">
              terms
            </Link>{' '}
            for how AI-generated content should be disclosed where your market requires it.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
