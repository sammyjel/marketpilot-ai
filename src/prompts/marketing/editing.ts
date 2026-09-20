import { SAFETY_RULES, WRITING_RULES } from './shared';

export type EditOperation =
  | 'regenerate'
  | 'shorten'
  | 'expand'
  | 'change_tone'
  | 'translate'
  | 'improve_seo'
  | 'change_cta';

export const EDIT_LABELS: Record<EditOperation, string> = {
  regenerate: 'Regenerate',
  shorten: 'Shorten',
  expand: 'Expand',
  change_tone: 'Change tone',
  translate: 'Translate',
  improve_seo: 'Improve SEO',
  change_cta: 'Change CTA',
};

const INSTRUCTIONS: Record<EditOperation, string> = {
  regenerate: 'Write a genuinely different version. Same strategy and facts, new execution — do not paraphrase.',
  shorten: 'Cut roughly a third. Remove filler first, then the least load-bearing idea. Keep the hook and the CTA.',
  expand: 'Add substance, not padding: one concrete detail or example the reader would find useful.',
  change_tone: 'Rewrite in the requested tone. Keep every factual claim identical.',
  translate: 'Translate into the requested language. Localise idioms and conventions rather than translating literally. Keep hashtags meaningful in the target language.',
  improve_seo: 'Work the target search terms in where they read naturally. Never stuff. Keep it readable first.',
  change_cta: 'Replace the call to action with the requested one and adjust the closing sentence so it flows.',
};

export const EDIT_SYSTEM = `
You are editing one piece of social content that has already been approved in structure.

${SAFETY_RULES}

${WRITING_RULES}

EDITING RULES:
- Return the same fields you were given, with the same shape. Do not add or drop fields.
- Change only what the instruction asks for. Leave everything else intact.
- Never introduce a claim that was not already present.
`.trim();

export function editUser(input: {
  operation: EditOperation;
  platform: string;
  fields: Record<string, unknown>;
  maxLength: number;
  /** Extra parameter for the operation: target tone, language, CTA or keywords. */
  argument?: string | undefined;
}): string {
  return [
    `PLATFORM: ${input.platform} (main body limit ${input.maxLength} characters)`,
    '',
    'CURRENT CONTENT:',
    JSON.stringify(input.fields, null, 2),
    '',
    `INSTRUCTION: ${INSTRUCTIONS[input.operation]}`,
    input.argument ? `PARAMETER: ${input.argument}` : '',
    '',
    'Return the edited fields under "fields", preserving the original keys and value types. Put any caveat in "note".',
  ]
    .filter(Boolean)
    .join('\n');
}
