'use client';

import { useState } from 'react';
import { Expand, Languages, Minimize2, RefreshCw, Search, Sparkles, Wand2 } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { SubmitButton } from '@/components/forms/form-status';
import { EDIT_LABELS, type EditOperation } from '@/prompts/marketing/editing';
import { BRAND_TONES, TONE_LABELS } from '@/lib/tones';

const TOOLS: { operation: EditOperation; icon: typeof Wand2; hint: string; argument?: 'tone' | 'language' | 'cta' | 'keywords' }[] = [
  { operation: 'regenerate', icon: RefreshCw, hint: 'A genuinely different take on the same strategy.' },
  { operation: 'shorten', icon: Minimize2, hint: 'Cut about a third without losing the hook or CTA.' },
  { operation: 'expand', icon: Expand, hint: 'Add a concrete detail, not padding.' },
  { operation: 'change_tone', icon: Wand2, hint: 'Same facts, different voice.', argument: 'tone' },
  { operation: 'translate', icon: Languages, hint: 'Localised, not word-for-word.', argument: 'language' },
  { operation: 'improve_seo', icon: Search, hint: 'Work search terms in where they read naturally.', argument: 'keywords' },
  { operation: 'change_cta', icon: Sparkles, hint: 'Swap the closing ask.', argument: 'cta' },
];


const LANGUAGES: [string, string][] = [
  ['en', 'English'],
  ['tr', 'Türkçe'],
  ['fr', 'Français'],
  ['es', 'Español'],
  ['ar', 'العربية'],
  ['pt', 'Português'],
  ['de', 'Deutsch'],
];

/**
 * AI editing tools for a single piece of content.
 *
 * Each tool is a separate form posting to the same server action, so the
 * pending state is per-tool and the user always knows what is running.
 */
export function ContentTools({
  campaignId,
  contentId,
  action,
  disabled,
}: {
  campaignId: string;
  contentId: string;
  action: (formData: FormData) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState<EditOperation | null>(null);

  return (
    <Card>
      <CardHeader title="AI tools" description="Every change is applied to this piece only." />
      <CardBody className="space-y-2">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const needsArgument = Boolean(tool.argument);
          const expanded = open === tool.operation;

          return (
            <div key={tool.operation} className="rounded-lg border border-ink-200">
              <form action={action}>
                <input type="hidden" name="campaignId" value={campaignId} />
                <input type="hidden" name="contentId" value={contentId} />
                <input type="hidden" name="operation" value={tool.operation} />

                {needsArgument && expanded ? (
                  <div className="border-b border-ink-100 p-3">
                    {tool.argument === 'tone' ? (
                      <select
                        name="argument"
                        aria-label="Target tone"
                        className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm"
                      >
                        {BRAND_TONES.map((tone) => (
                          <option key={tone} value={tone}>
                            {TONE_LABELS[tone]}
                          </option>
                        ))}
                      </select>
                    ) : tool.argument === 'language' ? (
                      <select
                        name="argument"
                        aria-label="Target language"
                        className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm"
                      >
                        {LANGUAGES.map(([code, label]) => (
                          <option key={code} value={label}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        name="argument"
                        aria-label={tool.argument === 'cta' ? 'New call to action' : 'Target keywords'}
                        placeholder={tool.argument === 'cta' ? 'Shop the collection' : 'hair oil, dry hair'}
                        className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm"
                      />
                    )}
                  </div>
                ) : null}

                <div className="flex items-center gap-3 p-3">
                  <Icon className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-900">{EDIT_LABELS[tool.operation]}</p>
                    <p className="text-xs text-ink-500">{tool.hint}</p>
                  </div>

                  {needsArgument && !expanded ? (
                    <button
                      type="button"
                      onClick={() => setOpen(tool.operation)}
                      disabled={disabled}
                      className="shrink-0 rounded-lg border border-ink-300 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-40"
                    >
                      Choose
                    </button>
                  ) : (
                    <SubmitButton size="sm" variant="outline" pendingLabel="Working…" disabled={disabled}>
                      Run
                    </SubmitButton>
                  )}
                </div>
              </form>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
