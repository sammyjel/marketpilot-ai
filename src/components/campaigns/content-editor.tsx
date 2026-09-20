'use client';

import { useActionState, useEffect, useState } from 'react';
import { Check, Eye, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/primitives';
import { IDLE, type ActionState } from '@/lib/action-state';
import { cn } from '@/lib/cn';
import { PLATFORM_META, type Platform } from '@/lib/platforms';
import { runContentToolAction, updateContentAction } from '@/server/actions/campaigns';
import { PlatformPreview } from './previews';
import { QualityFlags } from './quality-flags';
import { ContentTools } from './content-tools';

type ContentPiece = {
  id: string;
  platform: Platform;
  format: string;
  status: string;
  fields: Record<string, unknown>;
  hashtags: string[];
  qualityFlags: Record<string, unknown>[];
};

/** Fields rendered as a plain single-line input rather than a textarea. */
const SHORT_FIELDS = new Set(['headline', 'title', 'pinTitle', 'cta', 'hook', 'imageText', 'businessAngle']);

/** Fields we never show as free text because they have their own editors. */
const STRUCTURED_FIELDS = new Set(['hashtags', 'tags', 'keywords', 'script', 'reelScript', 'shortsScript', 'carouselCopy', 'onScreenText', 'thread']);

function humanise(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

export function ContentEditor({
  campaignId,
  content,
  brand,
  media,
  canEdit,
}: {
  campaignId: string;
  content: ContentPiece;
  brand: { name: string; handle: string; avatarKey: string | null };
  media: { key: string | null; kind: string | null };
  canEdit: boolean;
}) {
  const [fields, setFields] = useState<Record<string, unknown>>(content.fields);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');

  const [saveState, saveAction] = useActionState<ActionState<null>, FormData>(
    updateContentAction,
    IDLE as ActionState<null>,
  );

  const [toolState, toolAction] = useActionState<
    ActionState<{ fields: Record<string, unknown>; note: string | null } | null>,
    FormData
  >(runContentToolAction, IDLE as ActionState<{ fields: Record<string, unknown>; note: string | null } | null>);

  // An AI tool rewrites the fields server-side; adopt the result locally.
  useEffect(() => {
    if (toolState.ok === true && toolState.data) {
      setFields(toolState.data.fields);
      setDirty(false);
    }
  }, [toolState]);

  useEffect(() => {
    if (saveState.ok === true) setDirty(false);
  }, [saveState]);

  const meta = PLATFORM_META[content.platform];
  const hashtags = Array.isArray(fields['hashtags']) ? (fields['hashtags'] as string[]) : content.hashtags;

  function setField(key: string, value: unknown) {
    setFields((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  const bodyKey = ['primaryText', 'caption', 'post', 'description'].find((key) => typeof fields[key] === 'string');
  const bodyLength = bodyKey ? String(fields[bodyKey] ?? '').length : 0;
  const overLimit = bodyLength > meta.maxTextLength;

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card>
          <CardHeader
            title={`${meta.label} content`}
            description={`Format: ${content.format.replace(/_/g, ' ')}`}
            action={
              <div className="flex rounded-lg border border-ink-200 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode('preview')}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium',
                    mode === 'preview' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100',
                  )}
                >
                  <Eye className="size-3.5" aria-hidden="true" />
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setMode('edit')}
                  disabled={!canEdit}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-40',
                    mode === 'edit' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100',
                  )}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Edit
                </button>
              </div>
            }
          />
          <CardBody>
            {mode === 'preview' ? (
              <div className="flex justify-center">
                <PlatformPreview
                  platform={content.platform}
                  brand={brand}
                  fields={fields}
                  hashtags={hashtags}
                  mediaKey={media.key}
                  mediaKind={media.kind}
                />
              </div>
            ) : (
              <form action={saveAction} className="space-y-4">
                <input type="hidden" name="contentId" value={content.id} />
                <input type="hidden" name="fields" value={JSON.stringify(fields)} />

                {Object.entries(fields).map(([key, value]) => {
                  if (STRUCTURED_FIELDS.has(key)) return null;
                  if (typeof value !== 'string' && value !== null) return null;

                  const isShort = SHORT_FIELDS.has(key);
                  const current = (value as string | null) ?? '';

                  return (
                    <div key={key} className="space-y-1.5">
                      <label htmlFor={`field-${key}`} className="block text-sm font-medium text-ink-800">
                        {humanise(key)}
                      </label>
                      {isShort ? (
                        <input
                          id={`field-${key}`}
                          value={current}
                          onChange={(event) => setField(key, event.target.value)}
                          className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                        />
                      ) : (
                        <>
                          <textarea
                            id={`field-${key}`}
                            value={current}
                            rows={key === 'description' || key === 'primaryText' || key === 'caption' ? 8 : 4}
                            onChange={(event) => setField(key, event.target.value)}
                            className="w-full resize-y rounded-lg border border-ink-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                          />
                          {key === bodyKey ? (
                            <p className={cn('text-xs tabular-nums', overLimit ? 'text-red-600' : 'text-ink-500')}>
                              {bodyLength} / {meta.maxTextLength} characters
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                })}

                <HashtagEditor
                  value={hashtags}
                  recommended={meta.recommendedHashtags}
                  onChange={(next) => setField('hashtags', next)}
                />

                <div className="flex items-center justify-end gap-2 border-t border-ink-100 pt-4">
                  {saveState.ok === true ? (
                    <span className="flex items-center gap-1 text-sm text-emerald-700">
                      <Check className="size-4" aria-hidden="true" />
                      Saved
                    </span>
                  ) : null}
                  <Button type="submit" disabled={!dirty || overLimit}>
                    Save changes
                  </Button>
                </div>
              </form>
            )}
          </CardBody>
        </Card>

        <StructuredPanels fields={fields} />
      </div>

      <div className="space-y-4 lg:col-span-2">
        {content.qualityFlags.length > 0 ? (
          <Card>
            <CardHeader title="Needs your attention" />
            <CardBody>
              <QualityFlags flags={content.qualityFlags} />
            </CardBody>
          </Card>
        ) : null}

        {toolState.ok === false ? <Alert tone="danger">{toolState.message}</Alert> : null}
        {toolState.ok === true && toolState.data?.note ? <Alert tone="info">{toolState.data.note}</Alert> : null}

        <ContentTools campaignId={campaignId} contentId={content.id} action={toolAction} disabled={!canEdit} />
      </div>
    </div>
  );
}

function HashtagEditor({
  value,
  recommended,
  onChange,
}: {
  value: string[];
  recommended: [number, number];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [min, max] = recommended;
  const outOfRange = value.length < min || value.length > max;

  return (
    <div className="space-y-1.5">
      <label htmlFor="hashtag-input" className="block text-sm font-medium text-ink-800">
        Hashtags
      </label>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-ink-300 p-2">
        {value.map((tag) => (
          <span key={tag} className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="text-brand-400 hover:text-red-600"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id="hashtag-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ',') return;
            event.preventDefault();
            const cleaned = draft.trim().replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '');
            if (cleaned && !value.includes(`#${cleaned}`)) onChange([...value, `#${cleaned}`]);
            setDraft('');
          }}
          placeholder="Add a hashtag and press Enter"
          className="min-w-[12rem] flex-1 border-0 bg-transparent px-1 text-sm focus:outline-none"
        />
      </div>
      <p className={cn('text-xs', outOfRange ? 'text-amber-600' : 'text-ink-500')}>
        {value.length} tags · this platform works best with {min}–{max}
      </p>
    </div>
  );
}

/** Scripts, carousels and thread posts get their own read-friendly rendering. */
function StructuredPanels({ fields }: { fields: Record<string, unknown> }) {
  const script = (fields['script'] ?? fields['reelScript'] ?? fields['shortsScript']) as
    | { timecode?: string; line?: string; voiceover?: string; onScreen?: string; action?: string }[]
    | undefined;
  const carousel = fields['carouselCopy'] as { slide: number; headline: string; body: string }[] | undefined;
  const thread = fields['thread'] as string[] | undefined;
  const onScreen = fields['onScreenText'] as string[] | undefined;

  if (!script?.length && !carousel?.length && !thread?.length && !onScreen?.length) return null;

  return (
    <>
      {script && script.length > 0 ? (
        <Card>
          <CardHeader title="Script" description="Timecoded beats for the video cut." />
          <CardBody>
            <ol className="space-y-3">
              {script.map((beat, index) => (
                <li key={index} className="grid gap-1 border-l-2 border-brand-200 pl-3">
                  <span className="font-mono text-xs text-ink-400">{beat.timecode}</span>
                  <p className="text-sm text-ink-900">{beat.line ?? beat.voiceover}</p>
                  {beat.action ? <p className="text-xs text-ink-500">Camera: {beat.action}</p> : null}
                  {beat.onScreen ? <p className="text-xs text-ink-500">On screen: {beat.onScreen}</p> : null}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      ) : null}

      {carousel && carousel.length > 0 ? (
        <Card>
          <CardHeader title="Carousel slides" />
          <CardBody>
            <ol className="grid gap-3 sm:grid-cols-2">
              {carousel.map((slide) => (
                <li key={slide.slide} className="rounded-lg border border-ink-200 p-3">
                  <p className="text-xs font-medium text-ink-400">Slide {slide.slide}</p>
                  <p className="mt-1 text-sm font-semibold text-ink-900">{slide.headline}</p>
                  <p className="mt-1 text-xs text-ink-600">{slide.body}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      ) : null}

      {onScreen && onScreen.length > 0 ? (
        <Card>
          <CardHeader title="On-screen text" />
          <CardBody>
            <ul className="flex flex-wrap gap-1.5">
              {onScreen.map((line) => (
                <li key={line} className="rounded bg-ink-100 px-2 py-1 text-xs text-ink-700">
                  {line}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {thread && thread.length > 0 ? (
        <Card>
          <CardHeader title="Thread" />
          <CardBody>
            <ol className="space-y-2">
              {thread.map((post, index) => (
                <li key={index} className="rounded-lg border border-ink-200 p-3 text-sm text-ink-800">
                  <span className="mr-2 text-xs text-ink-400">{index + 2}/</span>
                  {post}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
