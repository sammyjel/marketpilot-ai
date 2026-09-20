import { Badge } from '@/components/ui/primitives';

type CampaignStatus =
  | 'draft'
  | 'generating'
  | 'generated'
  | 'needs_review'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'partially_published'
  | 'failed'
  | 'archived';

type PublishStatus = 'pending' | 'processing' | 'published' | 'failed' | 'cancelled' | 'manual_required';

type ContentStatus = 'draft' | 'generated' | 'flagged' | 'approved' | 'scheduled' | 'published' | 'failed';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const CAMPAIGN: Record<CampaignStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  generating: { label: 'Generating', tone: 'info' },
  generated: { label: 'Generated', tone: 'brand' },
  needs_review: { label: 'Needs review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  publishing: { label: 'Publishing', tone: 'info' },
  published: { label: 'Published', tone: 'success' },
  partially_published: { label: 'Partially published', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
  archived: { label: 'Archived', tone: 'neutral' },
};

const PUBLISH: Record<PublishStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'neutral' },
  processing: { label: 'Processing', tone: 'info' },
  published: { label: 'Published', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  manual_required: { label: 'Manual publish', tone: 'warning' },
};

const CONTENT: Record<ContentStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  generated: { label: 'Generated', tone: 'brand' },
  flagged: { label: 'Needs review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  published: { label: 'Published', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const meta = CAMPAIGN[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function PublishStatusBadge({ status }: { status: PublishStatus }) {
  const meta = PUBLISH[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  const meta = CONTENT[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
