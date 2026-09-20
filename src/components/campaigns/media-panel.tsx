'use client';

import { useActionState } from 'react';
import { Film, ImageIcon, Info, Sparkles } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Badge, EmptyState } from '@/components/ui/primitives';
import { FormMessage, SubmitButton } from '@/components/forms/form-status';
import { ProductThumb } from '@/components/products/product-thumb';
import { IDLE, type ActionState } from '@/lib/action-state';
import { generateImageAction, generateVideoAction } from '@/server/actions/media';

type Concept = {
  name: string;
  kind: string;
  aspectRatio: string;
  background: string;
  overlayText: string | null;
  rationale: string;
};

type VideoConcept = {
  durationSeconds: number;
  structure: { beat: string; seconds: number; visual: string; voiceover: string; onScreen: string }[];
};

type Asset = {
  id: string;
  storageKey: string;
  thumbnailKey: string | null;
  kind: string;
  role: string;
  producedBy: string;
  preservedProduct: boolean;
};

export function MediaPanel({
  campaignId,
  concepts,
  videoConcepts,
  assets,
  capabilities,
  canEdit,
}: {
  campaignId: string;
  concepts: Concept[];
  videoConcepts: VideoConcept[];
  assets: Asset[];
  capabilities: {
    image: { provider: string; preservesProduct: boolean };
    video: { available: boolean; provider: string; reason?: string };
    voice: { available: boolean; provider: string; reason?: string };
  };
  canEdit: boolean;
}) {
  const [imageState, imageAction] = useActionState<ActionState<null>, FormData>(
    generateImageAction,
    IDLE as ActionState<null>,
  );
  const [videoState, videoAction] = useActionState<ActionState<null>, FormData>(
    generateVideoAction,
    IDLE as ActionState<null>,
  );

  return (
    <div className="space-y-5">
      <Alert tone="info">
        <span className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Images are built from your actual product photograph — the product is never redrawn, recoloured or
            relabelled. Only the background, framing and text overlay are generated.
            {capabilities.image.preservesProduct
              ? ''
              : ' A text-to-image model is configured, so you can also generate a fully imagined scene; those are marked separately.'}
          </span>
        </span>
      </Alert>

      {assets.length > 0 ? (
        <Card>
          <CardHeader title="Generated creative" description="Attach any of these to a platform before publishing." />
          <CardBody>
            <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {assets.map((asset) => (
                <li key={asset.id} className="overflow-hidden rounded-lg border border-ink-200">
                  <ProductThumb
                    storageKey={asset.thumbnailKey ?? asset.storageKey}
                    kind={asset.kind}
                    alt={asset.role}
                    className="aspect-square"
                  />
                  <div className="space-y-1 p-2.5">
                    <p className="truncate text-xs font-medium text-ink-900">{asset.role}</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={asset.preservedProduct ? 'success' : 'warning'}>
                        {asset.preservedProduct ? 'Product preserved' : 'AI reinterpreted'}
                      </Badge>
                      <Badge>{asset.producedBy}</Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Image concepts" description="From the creative brief the AI wrote for this campaign." />
        <CardBody>
          <FormMessage state={imageState} className="mb-3" />

          {concepts.length === 0 ? (
            <EmptyState
              icon={<ImageIcon className="size-8" />}
              title="No image concepts yet"
              description="Generate the campaign first and a creative brief comes with it."
            />
          ) : (
            <ul className="space-y-3">
              {concepts.map((concept, index) => (
                <li key={`${concept.name}-${index}`} className="rounded-lg border border-ink-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">{concept.name}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {concept.kind} · {concept.aspectRatio}
                        {concept.overlayText ? ` · overlay: “${concept.overlayText}”` : ''}
                      </p>
                      <p className="mt-2 text-sm text-ink-600">{concept.rationale}</p>
                      <p className="mt-1 text-xs text-ink-500">Background: {concept.background}</p>
                    </div>

                    <form action={imageAction} className="shrink-0">
                      <input type="hidden" name="campaignId" value={campaignId} />
                      <input type="hidden" name="conceptIndex" value={index} />
                      <input type="hidden" name="preserveProduct" value="on" />
                      <SubmitButton size="sm" pendingLabel="Queuing…" disabled={!canEdit}>
                        <Sparkles className="size-3.5" aria-hidden="true" />
                        Generate
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Video"
          description={
            capabilities.video.available
              ? `Rendered by ${capabilities.video.provider}.`
              : 'No renderer configured — the storyboard below is still yours to shoot.'
          }
        />
        <CardBody>
          <FormMessage state={videoState} className="mb-3" />

          {!capabilities.video.available ? (
            <Alert tone="warning" title="Video rendering is not available here">
              {capabilities.video.reason} Everything you need to produce it yourself is below: timecoded beats, what is
              on camera, the voice-over line and the on-screen text.
            </Alert>
          ) : null}

          {videoConcepts.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={<Film className="size-8" />}
                title="No video concepts"
                description="Regenerate the campaign with a video format selected to get a storyboard."
              />
            </div>
          ) : (
            <ul className="mt-4 space-y-4">
              {videoConcepts.map((concept, index) => (
                <li key={index} className="rounded-lg border border-ink-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink-900">{concept.durationSeconds} second cut</p>

                    {capabilities.video.available ? (
                      <form action={videoAction} className="flex items-center gap-3">
                        <input type="hidden" name="campaignId" value={campaignId} />
                        <input type="hidden" name="conceptIndex" value={index} />
                        <label className="flex items-center gap-1.5 text-xs text-ink-600">
                          <input
                            type="checkbox"
                            name="withVoiceover"
                            disabled={!capabilities.voice.available}
                            className="size-3.5 rounded border-ink-300 text-brand-600"
                          />
                          Voice-over
                          {!capabilities.voice.available ? <span className="text-ink-400">(unavailable)</span> : null}
                        </label>
                        <SubmitButton size="sm" pendingLabel="Queuing…" disabled={!canEdit}>
                          Render
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>

                  <ol className="mt-3 space-y-2">
                    {concept.structure.map((beat, beatIndex) => (
                      <li key={beatIndex} className="grid gap-0.5 border-l-2 border-brand-200 pl-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                          {beat.beat} · {beat.seconds}s
                        </p>
                        <p className="text-sm text-ink-900">{beat.voiceover}</p>
                        <p className="text-xs text-ink-500">Camera: {beat.visual}</p>
                        {beat.onScreen ? <p className="text-xs text-ink-500">On screen: {beat.onScreen}</p> : null}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
