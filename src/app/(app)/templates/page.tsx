import type { Metadata } from 'next';
import Link from 'next/link';
import { LayoutTemplate } from 'lucide-react';
import { Badge, PageHeader } from '@/components/ui/primitives';
import { isPlatform, PLATFORM_META } from '@/lib/platforms';
import { requireAuth } from '@/server/auth/context';
import { listTemplates } from '@/server/services/templates';

export const metadata: Metadata = { title: 'Templates' };

export default async function TemplatesPage() {
  const ctx = await requireAuth();
  const templates = await listTemplates(ctx);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaign templates"
        description="Starting points that set the objective, platforms and formats — and give the AI extra guidance for that kind of campaign."
      />

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <li key={template.id}>
            <Link
              href={`/campaigns/new?template=${template.key}`}
              className="flex h-full flex-col rounded-[var(--radius-card)] border border-ink-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <LayoutTemplate className="size-5 text-brand-600" aria-hidden="true" />
                {template.isSystem === 1 ? <Badge>Built in</Badge> : <Badge tone="brand">Yours</Badge>}
              </div>

              <h2 className="mt-3 text-sm font-semibold text-ink-900">{template.name}</h2>
              <p className="mt-1 flex-1 text-xs text-ink-600">{template.description}</p>

              {template.promptHints ? (
                <p className="mt-3 rounded-lg bg-ink-50 px-2.5 py-2 text-[11px] leading-relaxed text-ink-600">
                  {template.promptHints}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {template.defaultPlatforms.filter(isPlatform).map((platform) => (
                  <span
                    key={platform}
                    title={PLATFORM_META[platform].label}
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: PLATFORM_META[platform].color }}
                  />
                ))}
                <span className="ml-1 text-[11px] text-ink-400">
                  {template.defaultFormats.map((format) => format.replace(/_/g, ' ')).join(', ')}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
