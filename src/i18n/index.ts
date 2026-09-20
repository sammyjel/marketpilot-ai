import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, type Locale } from './config';
import { en, type Dictionary } from './dictionaries/en';

export type { Dictionary };
export { DEFAULT_LOCALE };

const LOCALE_COOKIE = 'mp_locale';

/**
 * Dictionaries are loaded lazily per locale. English is bundled because it is
 * the fallback; additional locales are added here as they are translated.
 */
const loaders: Partial<Record<Locale, () => Promise<Dictionary>>> = {
  en: async () => en,
};

export async function resolveLocale(): Promise<Locale> {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  if (fromCookie && isLocale(fromCookie)) return fromCookie;

  const header = (await headers()).get('accept-language') ?? '';
  const preferred = header.split(',')[0]?.split('-')[0]?.trim().toLowerCase() ?? '';
  return isLocale(preferred) && loaders[preferred] ? preferred : DEFAULT_LOCALE;
}

/** Server-side dictionary access. Falls back to English for untranslated locales. */
export async function getDictionary(locale?: Locale): Promise<Dictionary> {
  const target = locale ?? (await resolveLocale());
  const loader = loaders[target];
  return loader ? loader() : en;
}

export const LOCALE_COOKIE_NAME = LOCALE_COOKIE;
