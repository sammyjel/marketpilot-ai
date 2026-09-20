import type { Metadata } from 'next';
import { LegalDocument } from '@/components/marketing/legal-document';
import { BRANDING } from '@/lib/branding';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      updated="This template was last revised when the application was built."
      sections={[
        {
          heading: 'These terms are a starting point, not legal advice',
          body: [
            `This document is a template shipped with ${BRANDING.name}. It has not been reviewed by a lawyer and it is not tailored to any jurisdiction.`,
            'Before operating this software as a commercial service, have a qualified lawyer in your market review and replace this page. Obligations differ substantially between jurisdictions, particularly around consumer protection, advertising standards and automated decision-making.',
          ],
        },
        {
          heading: 'The service',
          body: [
            'The service generates marketing content from material you supply, and — where you connect accounts and grant permission — publishes that content to third-party social platforms on your instruction.',
            'The service does not guarantee any marketing outcome, reach, engagement, conversion or search ranking.',
          ],
        },
        {
          heading: 'Your content and your responsibility for it',
          body: [
            'You keep ownership of the product information, images and other material you upload, and of the content generated from it.',
            'You are responsible for what you publish. Generated content is a draft: you review and approve it before anything is sent to a platform, and by approving it you take responsibility for its accuracy and for its compliance with advertising law, platform policies and any regulations that apply to your products.',
            'You must not upload material you do not have the rights to use, or use the service to produce content that is unlawful, deceptive, or targets people on the basis of protected characteristics.',
          ],
        },
        {
          heading: 'AI-generated content',
          body: [
            'Content is produced by automated systems and can contain errors. The service includes a quality-control pass that flags unsupported claims, but that pass is itself automated and is not a substitute for your review.',
            'Some jurisdictions and some platforms require that AI-generated or AI-assisted content be disclosed. Determining and meeting those obligations is your responsibility.',
            'The service is instructed not to fabricate testimonials, reviews, certifications, statistics, endorsements, discounts or scarcity. If you supply such claims yourself, they are flagged for your review rather than verified.',
          ],
        },
        {
          heading: 'Third-party platforms',
          body: [
            'Publishing depends on third-party APIs that we do not control. Their availability, rate limits, approval requirements and policies can change without notice, and a platform may refuse or remove a post for its own reasons.',
            'You are bound by each platform’s own terms in addition to these. Connecting an account authorises the service to act on that account within the permissions you grant, and you can disconnect at any time.',
          ],
        },
        {
          heading: 'Plans, usage and billing',
          body: [
            'Paid plans include monthly allowances. Usage is checked before an expensive operation runs, and operations that would exceed an allowance are refused rather than billed.',
            'Where a payment provider is configured, billing is handled by that provider under its own terms.',
          ],
        },
        {
          heading: 'Termination',
          body: [
            'You may delete your account at any time from the account settings. Deletion erases your personal details, ends your sessions and destroys stored platform credentials.',
            'Content already published to a third-party platform is not removed by deleting your account here; remove it on that platform.',
          ],
        },
        {
          heading: 'Liability',
          body: [
            'To the maximum extent permitted by applicable law, the software is provided as is, without warranties of any kind, and the operator is not liable for indirect or consequential losses arising from its use.',
            'Nothing in these terms limits liability that cannot be limited by law.',
          ],
        },
      ]}
    />
  );
}
