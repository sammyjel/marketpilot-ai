export const LOCALES = ['en', 'tr', 'fr', 'es', 'ar', 'pt', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  tr: 'Türkçe',
  fr: 'Français',
  es: 'Español',
  ar: 'العربية',
  pt: 'Português',
  de: 'Deutsch',
};

/** Right-to-left locales need `dir="rtl"` on <html>. */
export const RTL_LOCALES: readonly Locale[] = ['ar'];

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function directionFor(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}
