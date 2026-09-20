import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

type Flag = {
  severity?: string;
  category?: string;
  platform?: string | null;
  field?: string | null;
  message?: string;
  suggestion?: string | null;
};

const SEVERITY = {
  blocker: { label: 'Blocker', tone: 'border-red-300 bg-red-50', icon: ShieldAlert, iconTone: 'text-red-600' },
  warning: { label: 'Warning', tone: 'border-amber-300 bg-amber-50', icon: AlertTriangle, iconTone: 'text-amber-600' },
  info: { label: 'Note', tone: 'border-sky-200 bg-sky-50', icon: Info, iconTone: 'text-sky-600' },
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  unsupported_claim: 'Unsupported claim',
  misleading: 'Potentially misleading',
  spelling: 'Spelling',
  grammar: 'Grammar',
  duplicate_content: 'Duplicate content',
  hashtag_hygiene: 'Hashtags',
  platform_format: 'Platform formatting',
  brand_voice: 'Brand voice',
  cta_quality: 'Call to action',
  seo_quality: 'SEO',
  prohibited_content: 'Prohibited content',
  safety: 'Safety',
};

/**
 * Quality-control findings.
 *
 * Blockers are shown first because a campaign cannot be approved while any
 * remain — that gate is enforced server-side in `approveCampaign`.
 */
export function QualityFlags({ flags }: { flags: Record<string, unknown>[] }) {
  const typed = flags as Flag[];
  const order = { blocker: 0, warning: 1, info: 2 } as const;
  const sorted = [...typed].sort(
    (a, b) =>
      (order[(a.severity ?? 'info') as keyof typeof order] ?? 3) -
      (order[(b.severity ?? 'info') as keyof typeof order] ?? 3),
  );

  return (
    <ul className="space-y-2.5">
      {sorted.map((flag, index) => {
        const severity = SEVERITY[(flag.severity ?? 'info') as keyof typeof SEVERITY] ?? SEVERITY.info;
        const Icon = severity.icon;
        return (
          <li key={index} className={cn('rounded-lg border px-3 py-2.5', severity.tone)}>
            <div className="flex items-start gap-2.5">
              <Icon className={cn('mt-0.5 size-4 shrink-0', severity.iconTone)} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                  {severity.label}
                  {flag.category ? ` · ${CATEGORY_LABELS[flag.category] ?? flag.category}` : ''}
                  {flag.field ? ` · ${flag.field}` : ''}
                </p>
                <p className="mt-1 text-sm text-ink-900">{flag.message}</p>
                {flag.suggestion ? <p className="mt-1 text-xs text-ink-600">Suggestion: {flag.suggestion}</p> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
