import 'server-only';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { templates } from '@/server/db/schema';
import type { AuthContext } from '@/server/auth/context';

export type TemplateRecord = typeof templates.$inferSelect;

/**
 * Built-in campaign blueprints. They are seeded into the database on first use
 * so an organization can clone and customise one without losing the original.
 */
export const SYSTEM_TEMPLATES: {
  key: string;
  name: string;
  description: string;
  objective: string;
  defaultPlatforms: string[];
  defaultFormats: string[];
  promptHints: string;
}[] = [
  {
    key: 'product_launch',
    name: 'Product launch',
    description: 'Introduce something new and explain who it is for.',
    objective: 'product_launch',
    defaultPlatforms: ['instagram', 'facebook', 'tiktok'],
    defaultFormats: ['image', 'reel'],
    promptHints: 'Lead with what is new and why it exists. Build anticipation without inventing scarcity.',
  },
  {
    key: 'flash_sale',
    name: 'Flash sale',
    description: 'Short, time-bound promotion for an offer you actually have.',
    objective: 'sales',
    defaultPlatforms: ['instagram', 'facebook', 'x'],
    defaultFormats: ['image', 'text'],
    promptHints:
      'Only reference a discount, price or deadline that was supplied in the product information. Never invent one.',
  },
  {
    key: 'new_arrival',
    name: 'New arrival',
    description: 'Add a product to an existing range.',
    objective: 'new_product_announcement',
    defaultPlatforms: ['instagram', 'pinterest', 'facebook'],
    defaultFormats: ['image', 'carousel'],
    promptHints: 'Position it against the rest of the range. Say who it is for in the first line.',
  },
  {
    key: 'seasonal_sale',
    name: 'Seasonal sale',
    description: 'Tie the product to a season or occasion.',
    objective: 'seasonal_promotion',
    defaultPlatforms: ['instagram', 'facebook', 'pinterest'],
    defaultFormats: ['image', 'story'],
    promptHints: 'Connect to the season naturally. Do not fabricate a seasonal offer.',
  },
  {
    key: 'black_friday',
    name: 'Black Friday',
    description: 'High-competition retail moment.',
    objective: 'sales',
    defaultPlatforms: ['instagram', 'facebook', 'tiktok', 'x'],
    defaultFormats: ['image', 'short_video'],
    promptHints: 'Be direct about the offer. Cut through noise with specificity, not with louder adjectives.',
  },
  {
    key: 'valentines',
    name: "Valentine's Day",
    description: 'Gifting angle for a romantic occasion.',
    objective: 'seasonal_promotion',
    defaultPlatforms: ['instagram', 'pinterest', 'facebook'],
    defaultFormats: ['image', 'carousel'],
    promptHints: 'Frame as a gift. Consider both the buyer and the recipient.',
  },
  {
    key: 'christmas',
    name: 'Christmas',
    description: 'Seasonal gifting campaign.',
    objective: 'seasonal_promotion',
    defaultPlatforms: ['instagram', 'facebook', 'pinterest'],
    defaultFormats: ['image', 'carousel'],
    promptHints: 'Warm and inclusive. Gift-guide framing works well.',
  },
  {
    key: 'back_to_school',
    name: 'Back to school',
    description: 'Practical, routine-building angle.',
    objective: 'seasonal_promotion',
    defaultPlatforms: ['instagram', 'facebook', 'tiktok'],
    defaultFormats: ['image', 'short_video'],
    promptHints: 'Focus on preparation and routine rather than urgency.',
  },
  {
    key: 'brand_awareness',
    name: 'Brand awareness',
    description: 'Introduce the brand behind the product.',
    objective: 'brand_awareness',
    defaultPlatforms: ['instagram', 'linkedin', 'facebook'],
    defaultFormats: ['image', 'text'],
    promptHints: 'What the brand stands for matters more than the specific product here.',
  },
  {
    key: 'educational',
    name: 'Educational',
    description: 'Teach first, sell second.',
    objective: 'educational',
    defaultPlatforms: ['instagram', 'youtube', 'linkedin'],
    defaultFormats: ['carousel', 'short_video'],
    promptHints: 'The lesson must stand on its own even if the product is removed.',
  },
  {
    key: 'testimonial',
    name: 'Testimonial',
    description: 'Built around customer feedback you already have.',
    objective: 'engagement',
    defaultPlatforms: ['instagram', 'facebook'],
    defaultFormats: ['image', 'short_video'],
    promptHints:
      'Only use testimonial content supplied by the seller. Never write a testimonial. If none was supplied, say so in cautions.',
  },
  {
    key: 'before_after',
    name: 'Before / after',
    description: 'Comparison framing where the category allows it.',
    objective: 'engagement',
    defaultPlatforms: ['instagram', 'tiktok'],
    defaultFormats: ['carousel', 'short_video'],
    promptHints:
      'Only use before/after framing if the supplied information supports it. Never imply a health or medical outcome.',
  },
  {
    key: 'product_demo',
    name: 'Product demonstration',
    description: 'Show it working.',
    objective: 'engagement',
    defaultPlatforms: ['tiktok', 'instagram', 'youtube'],
    defaultFormats: ['short_video', 'reel'],
    promptHints: 'Lead with the moment the product does its job. Keep the setup short.',
  },
];

let seeded = false;

/** Idempotently inserts the built-in templates. */
export async function ensureSystemTemplates(): Promise<void> {
  if (seeded) return;
  const db = await getDb();

  const existing = await db
    .select({ key: templates.key })
    .from(templates)
    .where(and(isNull(templates.organizationId), eq(templates.isSystem, 1)));
  const known = new Set(existing.map((row) => row.key));

  const missing = SYSTEM_TEMPLATES.filter((template) => !known.has(template.key));
  if (missing.length > 0) {
    await db.insert(templates).values(
      missing.map((template) => ({
        organizationId: null,
        key: template.key,
        name: template.name,
        description: template.description,
        objective: template.objective,
        defaultPlatforms: template.defaultPlatforms,
        defaultFormats: template.defaultFormats,
        promptHints: template.promptHints,
        isSystem: 1,
      })),
    );
  }

  seeded = true;
}

export function systemTemplateByKey(key: string) {
  return SYSTEM_TEMPLATES.find((template) => template.key === key) ?? null;
}

/** System templates plus any the organization has created. */
export async function listTemplates(ctx: AuthContext): Promise<TemplateRecord[]> {
  await ensureSystemTemplates();
  const db = await getDb();
  return db
    .select()
    .from(templates)
    .where(or(isNull(templates.organizationId), eq(templates.organizationId, ctx.organization.id)))
    .orderBy(asc(templates.isSystem), asc(templates.name));
}
