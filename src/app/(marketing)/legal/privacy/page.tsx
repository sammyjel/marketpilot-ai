import type { Metadata } from 'next';
import { LegalDocument } from '@/components/marketing/legal-document';
import { BRANDING } from '@/lib/branding';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      updated="This template was last revised when the application was built."
      sections={[
        {
          heading: 'This is a template',
          body: [
            `This document describes how ${BRANDING.name} handles data as built. It is not legal advice and it is not tailored to GDPR, CCPA, KVKK or any other specific regime.`,
            'If you operate this software as a service, have it reviewed against the laws of every market you serve, and replace this page with your own policy naming your organisation as the data controller.',
          ],
        },
        {
          heading: 'What the application stores',
          body: [
            'Account data: your email address, name if you give one, a password hash (never the password), your timezone and locale, and session records containing an IP address and browser identifier.',
            'Workspace data: brands, products, the images and video you upload, generated campaigns and content, schedules, and the metrics retrieved from connected platforms.',
            'Operational data: an audit log of significant actions, a usage meter for plan limits, and application logs.',
          ],
        },
        {
          heading: 'What it deliberately does not store',
          body: [
            'Your social media passwords. Connections use each platform’s own OAuth flow, and the application never sees or asks for a platform password.',
            'Plaintext credentials of any kind. Passwords are stored as scrypt hashes; session and invitation tokens are stored only as SHA-256 hashes; platform access and refresh tokens are encrypted at rest with AES-256-GCM.',
            'Logs never contain passwords, tokens or API secrets — those field names are redacted before a log line is written.',
          ],
        },
        {
          heading: 'Third parties that receive data',
          body: [
            'AI providers: product information and the images you upload are sent to the configured language and image model providers in order to generate content. In mock mode nothing leaves the server.',
            'Social platforms: when you publish, the content and media for that post are sent to the platform you selected, using the permissions you granted.',
            'Infrastructure: your hosting, database and object storage providers process data on the operator’s behalf.',
            'A self-hosted installation can be configured so that the only external recipients are the platforms you choose to publish to.',
          ],
        },
        {
          heading: 'Retention and deletion',
          body: [
            'Most records are soft-deleted so an accidental deletion can be recovered and so published history stays coherent.',
            'Deleting your account erases your personal details, ends every session, destroys stored platform credentials, and closes any workspace you solely own.',
            'Content already published to a third-party platform is held by that platform under its own policy and must be removed there.',
          ],
        },
        {
          heading: 'Cookies',
          body: [
            'The application sets a session cookie, an active-workspace cookie and a language preference cookie. All are httpOnly or functional, first-party, and none are used for advertising or cross-site tracking.',
            'There is no analytics or advertising tracker in the application as shipped. If you add one, add a cookie consent mechanism appropriate to your market.',
          ],
        },
        {
          heading: 'Your rights',
          body: [
            'Depending on where you live you may have rights to access, correct, export or erase your personal data, and to object to certain processing.',
            'Account settings provide direct access to your data and a deletion path. For anything else, contact the operator of the installation you are using.',
          ],
        },
      ]}
    />
  );
}
