import { type z } from 'zod';
import { AppError } from '@/lib/errors';

/**
 * Models occasionally wrap JSON in prose or a fenced block even when told not
 * to. This extracts the first balanced JSON object/array rather than failing.
 */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall through to brace matching.
  }

  const start = candidate.search(/[{[]/);
  if (start === -1) {
    throw new AppError('provider_unavailable', 'The AI response did not contain any JSON.', { retryable: true });
  }

  const opening = candidate[start];
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < candidate.length; i += 1) {
    const char = candidate[i]!;

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === opening) depth += 1;
    else if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch (error) {
          throw new AppError('provider_unavailable', 'The AI returned malformed JSON.', {
            retryable: true,
            cause: error,
          });
        }
      }
    }
  }

  throw new AppError('provider_unavailable', 'The AI response was cut off before the JSON was complete.', {
    retryable: true,
  });
}

/** Compact, readable issue list used to ask the model for a repair. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 20)
    .map((issue) => `- ${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
    .join('\n');
}

/**
 * A JSON Schema sketch generated from a Zod schema, good enough to steer a
 * model. Only the subset the prompts actually use is handled.
 */
/**
 * Pulls the bounds back out of a Zod check list.
 *
 * Zod keeps them on `def.checks`, each wrapped in a `_zod.def`. Without this
 * the schema sent to the model says only "string", so a field capped at 40
 * characters reads as unbounded and the model has no way to comply -- which
 * showed up in production as a whole six-stage generation failing because one
 * `format` label came back a few characters too long.
 */
function limits(def: Record<string, unknown>): string[] {
  const checks = (def['checks'] as { _zod?: { def?: Record<string, unknown> } }[] | undefined) ?? [];
  const out: string[] = [];
  for (const check of checks) {
    const d = check._zod?.def;
    if (!d) continue;
    switch (d['check']) {
      case 'max_length':
        out.push(`max ${String(d['maximum'])}`);
        break;
      case 'min_length':
        // A minimum of 1 only means "not empty", which the shape already implies.
        if (Number(d['minimum']) > 1) out.push(`min ${String(d['minimum'])}`);
        break;
      case 'less_than':
        out.push(`max ${String(d['value'])}`);
        break;
      case 'greater_than':
        out.push(`min ${String(d['value'])}`);
        break;
      default:
        break;
    }
  }
  return out;
}

/** Renders a scalar with its bounds, e.g. `string (max 40 chars)`. */
function annotate(kind: 'string' | 'number', def: Record<string, unknown>): string {
  const found = limits(def);
  if (found.length === 0) return kind;
  const unit = kind === 'string' ? ' chars' : '';
  return `${kind} (${found.join(', ')}${unit})`;
}

export function describeSchema(schema: z.ZodType): unknown {
  const def = schema.def as unknown as { type: string } & Record<string, unknown>;

  switch (def.type) {
    case 'string':
      return annotate('string', def);
    case 'number':
      return annotate('number', def);
    case 'boolean':
      return 'boolean';
    case 'literal': {
      const values = (def['values'] as unknown[]) ?? [];
      return values.length === 1 ? values[0] : values;
    }
    case 'enum':
      return Object.values((def['entries'] as Record<string, unknown>) ?? {});
    case 'array': {
      const items = describeSchema(def['element'] as z.ZodType);
      const limit = limits(def).find((text) => text.startsWith('max'));
      // A cap on item count only needs saying when there is one.
      return limit ? [items, `...${limit} items`] : [items];
    }
    case 'object': {
      const shape = (def['shape'] as Record<string, z.ZodType>) ?? {};
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(shape)) out[key] = describeSchema(value);
      return out;
    }
    case 'optional':
    case 'nullable':
    case 'default':
      return describeSchema(def['innerType'] as z.ZodType);
    case 'union':
      return ((def['options'] as z.ZodType[]) ?? []).map(describeSchema);
    case 'record':
      return { '<key>': describeSchema(def['valueType'] as z.ZodType) };
    default:
      return 'value';
  }
}

export function schemaInstruction(schemaName: string, schema: z.ZodType): string {
  return [
    `Respond with a single JSON object named ${schemaName} and nothing else.`,
    'Do not wrap it in markdown fences. Do not add commentary before or after.',
    'Match this shape exactly:',
    JSON.stringify(describeSchema(schema), null, 2),
  ].join('\n');
}
