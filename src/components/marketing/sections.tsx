import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Section({
  id,
  className,
  children,
  tone = 'default',
}: {
  id?: string;
  className?: string;
  children: ReactNode;
  tone?: 'default' | 'muted' | 'dark';
}) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20',
        tone === 'muted' && 'bg-ink-50',
        tone === 'dark' && 'bg-ink-950 text-white',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
  tone = 'default',
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: 'center' | 'left';
  tone?: 'default' | 'dark';
}) {
  return (
    <div className={cn('max-w-3xl', align === 'center' && 'mx-auto text-center')}>
      {eyebrow ? (
        <p className={cn('text-xs font-semibold uppercase tracking-[0.12em]', tone === 'dark' ? 'text-brand-300' : 'text-brand-600')}>
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={cn(
          'mt-2 text-3xl font-semibold tracking-tight sm:text-4xl',
          tone === 'dark' ? 'text-white' : 'text-ink-900',
        )}
      >
        {title}
      </h2>
      {description ? (
        <p className={cn('mt-4 text-base leading-relaxed', tone === 'dark' ? 'text-ink-300' : 'text-ink-600')}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function FeatureCard({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-6 shadow-xs transition-shadow hover:shadow-md">
      {icon ? (
        <div className="mb-4 grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-600">{icon}</div>
      ) : null}
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{children}</p>
    </div>
  );
}

export function StepCard({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <li className="relative rounded-[var(--radius-card)] border border-ink-200 bg-white p-6 shadow-xs">
      <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white">
        {step}
      </span>
      <h3 className="mt-4 text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{children}</p>
    </li>
  );
}
