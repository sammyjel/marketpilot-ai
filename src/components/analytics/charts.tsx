'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardBody, CardHeader } from '@/components/ui/card';

type TimeseriesPoint = { date: string } & Record<string, number | string | undefined>;

const AXIS = { stroke: '#94a3b8', fontSize: 11 };
const GRID = '#e2e8f0';

/** Shared tooltip styling so every chart reads the same way. */
const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 10,
    border: '1px solid #e2e8f0',
    fontSize: 12,
    boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
  },
  labelStyle: { color: '#0f172a', fontWeight: 600 },
} as const;

export function AnalyticsCharts({
  timeseries,
  byPlatform,
  formats,
}: {
  timeseries: TimeseriesPoint[];
  byPlatform: {
    platform: string;
    label: string;
    color: string;
    impressions: number | null;
    engagement: number;
    posts: number;
  }[];
  formats: { format: string; posts: number; engagement: number; impressions: number | null }[];
}) {
  // Only plot series that actually have data, so a missing metric is absent
  // from the chart rather than drawn as a flat zero line.
  const hasImpressions = timeseries.some((point) => typeof point['impressions'] === 'number');
  const hasLikes = timeseries.some((point) => typeof point['likes'] === 'number');
  const hasViews = timeseries.some((point) => typeof point['views'] === 'number');

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader title="Performance over time" description="Daily snapshots from each platform." />
        <CardBody>
          {timeseries.length < 2 ? (
            <p className="py-10 text-center text-sm text-ink-500">
              At least two days of snapshots are needed to draw a trend.
            </p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeseries} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {hasImpressions ? (
                    <Line type="monotone" dataKey="impressions" stroke="#4f46e5" strokeWidth={2} dot={false} name="Impressions" />
                  ) : null}
                  {hasViews ? (
                    <Line type="monotone" dataKey="views" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Views" />
                  ) : null}
                  {hasLikes ? (
                    <Line type="monotone" dataKey="likes" stroke="#f59e0b" strokeWidth={2} dot={false} name="Likes" />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Platform comparison" description="Engagement by network." />
        <CardBody>
          {byPlatform.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-500">No platform data for this period.</p>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byPlatform} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="engagement" name="Engagements" radius={[6, 6, 0, 0]}>
                    {byPlatform.map((entry) => (
                      <Cell key={entry.platform} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Content type" description="Which formats earn engagement." />
        <CardBody>
          {formats.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-500">No format data for this period.</p>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={formats.map((entry) => ({ ...entry, label: entry.format.replace(/_/g, ' ') }))}
                  margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
                >
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="engagement" name="Engagements" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
