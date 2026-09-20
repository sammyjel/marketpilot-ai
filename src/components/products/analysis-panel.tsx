import { Eye } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/primitives';

type Analysis = {
  productType?: string | null;
  category?: string | null;
  visibleBrandName?: string | null;
  packaging?: string | null;
  colors?: string[];
  visualCharacteristics?: string[];
  likelyUseCase?: string | null;
  audienceClues?: string[];
  unknowns?: string[];
  confidence?: string;
};

function isUnknown(value: unknown): boolean {
  return value === null || value === undefined || value === '' || value === 'unknown';
}

/**
 * Shows what the vision pass could and could not determine. Fields the model
 * could not establish are listed explicitly rather than quietly filled in.
 */
export function ProductAnalysisPanel({
  analysis,
  analyzedAt,
}: {
  analysis: Record<string, unknown> | null;
  analyzedAt: Date | null;
}) {
  if (!analysis || !analyzedAt) return null;
  const data = analysis as Analysis;

  const rows: [string, string | null | undefined][] = [
    ['Product type', data.productType],
    ['Category', data.category],
    ['Visible brand name', data.visibleBrandName],
    ['Packaging', data.packaging],
    ['Likely use case', data.likelyUseCase],
  ];

  return (
    <Card>
      <CardHeader
        title="What the AI saw"
        description={`Analyzed ${analyzedAt.toISOString().slice(0, 10)}. Details it could not determine are marked unknown rather than guessed.`}
        action={<Eye className="size-5 text-ink-400" aria-hidden="true" />}
      />
      <CardBody className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
              <dd className="mt-0.5 text-sm text-ink-900">
                {isUnknown(value) ? <span className="text-ink-400">Not determined</span> : value}
              </dd>
            </div>
          ))}
        </dl>

        {data.visualCharacteristics && data.visualCharacteristics.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Visual characteristics</p>
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {data.visualCharacteristics.map((item) => (
                <li key={item}>
                  <Badge>{item}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {data.unknowns && data.unknowns.length > 0 ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2.5 ring-1 ring-inset ring-amber-200">
            <p className="text-xs font-semibold text-amber-800">Could not be determined from the image</p>
            <ul className="mt-1 list-inside list-disc text-xs text-amber-800">
              {data.unknowns.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
