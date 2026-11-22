import en from './en.js';

export const defaultLocale = 'en';
export const locales = {
  en: { name: 'English', dir: 'ltr', messages: en },
};

export function matchLocale(tag) {
  try {
    let candidate = new Intl.Locale(tag).baseName;
    while (candidate) {
      if (Object.hasOwn(locales, candidate)) return candidate;
      candidate = candidate.split('-').slice(0, -1).join('-');
    }
  } catch { /* Ignore malformed or missing language tags. */ }
  return null;
}
