'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, FileText, History, Images, Search, Share2, Sparkles } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Badge, EmptyState } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { PLATFORM_META, type Platform } from '@/lib/platforms';
import { ContentEditor } from './content-editor';
import { MediaPanel } from './media-panel';
import { QualityFlags } from './quality-flags';
import { SchedulePanel } from './schedule-panel';
import { VersionHistory } from './version-history';

type ContentPiece = {
  id: string;
  platform: Platform;
  format: string;
  status: string;
  fields: Record<string, unknown>;
  hashtags: string[];
  qualityFlags: Record<string, unknown>[];
};

type CampaignSummary = {
  id: string;
  title: string;
  status: string;
  objective: string;
  tone: string;
  language: string;
  platforms: Platform[];
  formats: string[];
  strategy: Record<string, unknown> | null;
  seo: Record<string, unknown> | null;
  qualityReport: Record<string, unknown> | null;
  generationError: string | null;
};

export function CampaignWorkspace({
  campaign,
  content,
  brand,
  media,
  versions,
  accounts,
  posts,
  creative,
  mediaCapabilities,
  initialTab,
  timezone,
  canEdit,
  canPublish,
  canSchedule,
  mockAi,
}: {
  campaign: CampaignSummary;
  content: ContentPiece[];
  brand: { name: string; handle: string; avatarKey: string | null };
  media: { key: string | null; kind: string | null };
  versions: { version: number; label: string | null; createdAt: string }[];
  accounts: { id: string; platform: string; displayName: string; needsReconnect: boolean }[];
  posts: {
    id: string;
    platform: string;
    status: string;
    scheduledFor: string | null;
    externalPermalink: string | null;
    lastErrorMessage: string | null;
    manualReason: string | null;
  }[];
  creative: {
    concepts: { name: string; kind: string; aspectRatio: string; background: string; overlayText: string | null; rationale: string }[];
    videoConcepts: { durationSeconds: number; structure: { beat: string; seconds: number; visual: string; voiceover: string; onScreen: string }[] }[];
    assets: { id: string; storageKey: string; thumbnailKey: string | null; kind: string; role: string; producedBy: string; preservedProduct: boolean }[];
  };
  mediaCapabilities: {
    image: { provider: string; preservesProduct: boolean };
    video: { available: boolean; provider: string; reason?: string };
    voice: { available: boolean; provider: string; reason?: string };
  };
  initialTab: string;
  timezone: string;
  canEdit: boolean;
  canPublish: boolean;
  canSchedule: boolean;
  mockAi: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(initialTab);

  const tabs = [
    { key: 'overview', label: 'Overview', icon: Sparkles },
    ...content.map((piece) => ({
      key: piece.platform,
      label: PLATFORM_META[piece.platform].label,
      icon: null,
      flags: piece.qualityFlags.length,
    })),
    { key: 'seo', label: 'SEO', icon: Search },
    { key: 'media', label: 'Media', icon: Images },
    { key: 'schedule', label: 'Schedule', icon: Share2 },
    { key: 'history', label: 'History', icon: History },
  ];

  function select(key: string) {
    setTab(key);
    // Keep the tab in the URL so a refresh or shared link lands in the same place.
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', key);
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  const active = content.find((piece) => piece.platform === tab);
  const report = campaign.qualityReport as { issues?: Record<string, unknown>[]; summary?: string } | null;

  return (
    <div className="space-y-5">
      {mockAi ? (
        <Alert tone="warning" title="Mock mode">
          This content was produced by the built-in development stand-in, not a live AI model. Set{' '}
          <code className="rounded bg-amber-100 px-1 text-xs">MOCK_EXTERNAL_SERVICES=false</code> and configure an AI
          provider for real generation.
        </Alert>
      ) : null}

      <div className="overflow-x-auto scroll-panel">
        <div role="tablist" aria-label="Campaign sections" className="flex min-w-max gap-1 border-b border-ink-200">
          {tabs.map((item) => {
            const Icon = item.icon;
            const selected = tab === item.key;
            return (
              <button
                key={item.key}
                role="tab"
                aria-selected={selected}
                onClick={() => select(item.key)}
                className={cn(
                  'flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  selected
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800',
                )}
              >
                {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
                {item.label}
                {'flags' in item && item.flags ? (
                  <span className="grid size-4 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                    {item.flags}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'overview' ? (
        <OverviewTab campaign={campaign} report={report} contentCount={content.length} />
      ) : null}

      {active ? (
        <ContentEditor
          key={active.id}
          campaignId={campaign.id}
          content={active}
          brand={brand}
          media={media}
          canEdit={canEdit}
        />
      ) : null}

      {tab === 'seo' ? <SeoTab seo={campaign.seo} /> : null}

      {tab === 'media' ? (
        <MediaPanel
          campaignId={campaign.id}
          concepts={creative.concepts}
          videoConcepts={creative.videoConcepts}
          assets={creative.assets}
          capabilities={mediaCapabilities}
          canEdit={canEdit}
        />
      ) : null}

      {tab === 'schedule' ? (
        <SchedulePanel
          campaignId={campaign.id}
          campaignStatus={campaign.status}
          content={content.map((piece) => ({ id: piece.id, platform: piece.platform }))}
          accounts={accounts}
          posts={posts}
          timezone={timezone}
          canPublish={canPublish}
          canSchedule={canSchedule}
        />
      ) : null}

      {tab === 'history' ? <VersionHistory campaignId={campaign.id} versions={versions} canEdit={canEdit} /> : null}
    </div>
  );
}

function OverviewTab({
  campaign,
  report,
  contentCount,
}: {
  campaign: CampaignSummary;
  report: { issues?: Record<string, unknown>[]; summary?: string } | null;
  contentCount: number;
}) {
  const strategy = campaign.strategy as {
    bigIdea?: string;
    keyMessage?: string;
    angle?: string;
    targetAudience?: string;
    benefits?: string[];
    proofPoints?: string[];
    differentiators?: string[];
    primaryCta?: string;
    cautions?: string[];
  } | null;

  if (!strategy) {
    return (
      <EmptyState
        icon={<FileText className="size-8" />}
        title="No strategy yet"
        description={
          campaign.generationError ??
          'Generation has not finished. Once it does, the campaign strategy appears here.'
        }
      />
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader title="The idea" description={strategy.angle} />
          <CardBody className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Key message</p>
              <p className="mt-1 text-base font-medium text-ink-900">{strategy.keyMessage}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Big idea</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-700">{strategy.bigIdea}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Audience</p>
              <p className="mt-1 text-sm text-ink-700">{strategy.targetAudience}</p>
            </div>
          </CardBody>
        </Card>

        {strategy.benefits && strategy.benefits.length > 0 ? (
          <Card>
            <CardHeader title="Benefits the copy leans on" />
            <CardBody>
              <ul className="space-y-2">
                {strategy.benefits.map((benefit) => (
                  <li key={benefit} className="flex gap-2 text-sm text-ink-700">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}

        {report?.issues && report.issues.length > 0 ? (
          <Card>
            <CardHeader
              title="Quality control"
              description={report.summary}
              action={<AlertTriangle className="size-5 text-amber-500" aria-hidden="true" />}
            />
            <CardBody>
              <QualityFlags flags={report.issues} />
            </CardBody>
          </Card>
        ) : null}
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Setup" />
          <CardBody className="space-y-3 text-sm">
            <Row label="Objective" value={campaign.objective.replace(/_/g, ' ')} />
            <Row label="Tone" value={campaign.tone} />
            <Row label="Language" value={campaign.language.toUpperCase()} />
            <Row label="Pieces generated" value={String(contentCount)} />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Platforms</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {campaign.platforms.map((platform) => (
                  <Badge key={platform}>{PLATFORM_META[platform].label}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Formats</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {campaign.formats.map((format) => (
                  <Badge key={format}>{format.replace(/_/g, ' ')}</Badge>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        {strategy.cautions && strategy.cautions.length > 0 ? (
          <Card>
            <CardHeader title="Cautions" description="Things the AI could not support from your inputs." />
            <CardBody>
              <ul className="space-y-2 text-sm text-ink-700">
                {strategy.cautions.map((caution) => (
                  <li key={caution} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
                    {caution}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</span>
      <span className="text-right text-sm capitalize text-ink-900">{value}</span>
    </div>
  );
}

function SeoTab({ seo }: { seo: Record<string, unknown> | null }) {
  if (!seo) {
    return <EmptyState icon={<Search className="size-8" />} title="No SEO package yet" />;
  }

  const data = seo as {
    title?: string;
    metaDescription?: string;
    keywords?: string[];
    searchIntent?: string;
    productDescription?: string;
    faqs?: { question: string; answer: string }[];
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Search result preview" description="Roughly how this appears in a results page." />
        <CardBody>
          <div className="rounded-lg border border-ink-200 p-4">
            <p className="text-lg leading-snug text-[#1a0dab]">{data.title}</p>
            <p className="mt-0.5 text-xs text-[#006621]">example.com › product</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-600">{data.metaDescription}</p>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Title length</dt>
              <dd className={cn('tabular-nums', (data.title?.length ?? 0) > 60 ? 'text-red-600' : 'text-ink-900')}>
                {data.title?.length ?? 0} / 60
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Description length</dt>
              <dd
                className={cn(
                  'tabular-nums',
                  (data.metaDescription?.length ?? 0) > 160 ? 'text-amber-600' : 'text-ink-900',
                )}
              >
                {data.metaDescription?.length ?? 0} / 160
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Search intent</dt>
              <dd className="capitalize text-ink-900">{data.searchIntent}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Keywords" />
        <CardBody>
          <ul className="flex flex-wrap gap-1.5">
            {(data.keywords ?? []).map((keyword) => (
              <li key={keyword}>
                <Badge tone="brand">{keyword}</Badge>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {data.productDescription ? (
        <Card className="lg:col-span-2">
          <CardHeader title="Product description" description="For your product page." />
          <CardBody>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{data.productDescription}</p>
          </CardBody>
        </Card>
      ) : null}

      {data.faqs && data.faqs.length > 0 ? (
        <Card className="lg:col-span-2">
          <CardHeader title="FAQ suggestions" />
          <CardBody>
            <dl className="space-y-4">
              {data.faqs.map((faq) => (
                <div key={faq.question}>
                  <dt className="text-sm font-semibold text-ink-900">{faq.question}</dt>
                  <dd className="mt-1 text-sm text-ink-600">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
