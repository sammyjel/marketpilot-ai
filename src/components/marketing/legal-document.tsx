import { Section } from './sections';

export type LegalSection = { heading: string; body: string[] };

/**
 * Shared layout for the legal pages.
 *
 * The "template, not legal advice" notice is part of the component rather than
 * each page, so it cannot be dropped by accident when the copy is edited.
 */
export function LegalDocument({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <Section>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">{title}</h1>
        <p className="mt-2 text-sm text-ink-500">{updated}</p>

        <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          <p className="font-semibold">Template document</p>
          <p className="mt-0.5">
            This is a starting point shipped with the software. It has not been reviewed by a lawyer and makes no claim
            of compliance with any particular jurisdiction. Replace it before operating a commercial service.
          </p>
        </div>

        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold text-ink-900">{section.heading}</h2>
              <div className="mt-2 space-y-3">
                {section.body.map((paragraph, index) => (
                  <p key={index} className="text-sm leading-relaxed text-ink-600">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Section>
  );
}
