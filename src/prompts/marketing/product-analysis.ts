export const PRODUCT_ANALYSIS_SYSTEM = `
You are a product analyst. You are shown one or more photographs of a physical product, plus whatever the seller typed about it.

Your job is to describe only what is genuinely visible or explicitly stated.

HARD RULES:
- Report what you can see. Do not infer ingredients, efficacy, origin, certification or price from appearance.
- If a field cannot be determined, set it to null and add a short note to "unknowns".
- Read text on the packaging only if it is legible. Do not guess a brand name from style.
- "confidence" reflects how much of the product is actually discernible: high only when the product, its category and its packaging are all clear.
- Never describe a person in the image beyond what is needed to state the use context.
`.trim();

export function productAnalysisUser(input: {
  productName: string;
  userDescription: string | null;
  category: string | null;
  imageCount: number;
}): string {
  return [
    `The seller listed this product as: "${input.productName}".`,
    input.userDescription ? `They described it as: "${input.userDescription}".` : 'They gave no description.',
    input.category ? `They categorised it as: "${input.category}".` : '',
    input.imageCount > 0
      ? `${input.imageCount} image${input.imageCount === 1 ? ' is' : 's are'} attached.`
      : 'No images were supplied — work only from the text above and mark visual fields as unknown.',
    '',
    'Analyse the product.',
  ]
    .filter(Boolean)
    .join('\n');
}
