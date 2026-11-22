import { defaultLocale, locales, matchLocale } from './locales/index.js';

const url = new URL(location.href);
const preferenceKey = 'north-america-at-war.language';
let preferred;
try { preferred = localStorage.getItem(preferenceKey); } catch { /* Storage is optional. */ }
export const locale = matchLocale(url.searchParams.get('lang')) || matchLocale(preferred) ||
  (navigator.languages || [navigator.language]).map(matchLocale).find(Boolean) || defaultLocale;
const { dir, messages } = locales[locale];
const fallback = locales[defaultLocale].messages;
const plural = new Intl.PluralRules(locale);
const integer = new Intl.NumberFormat(locale, { useGrouping: false });
const countFormat = new Intl.NumberFormat(locale);
const dates = {
  full: new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC', calendar: 'gregory' }),
  month: new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'UTC', calendar: 'gregory' }),
};

export const number = (value) => integer.format(value);
export const count = (value) => countFormat.format(value);

export function formatDate(value) {
  const iso = /^(\d{3,4})(?:-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?)?$/.exec(value);
  if (!iso) return value;
  const [, year, month, day] = iso;
  if (!month) return number(+year);
  const date = new Date(Date.UTC(+year, +month - 1, +(day || 1)));
  if (day && date.getUTCDate() !== +day) return value;
  return dates[day ? 'full' : 'month'].format(date);
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function template(key, params) {
  const value = messages[key] ?? fallback[key];
  if (typeof value === 'string') return value;
  const form = plural.select(params.count);
  return value[form] ?? value.other;
}

export function t(key, params = {}) {
  return template(key, params).replace(/\{(\w+)\}/g, (_, name) =>
    name === 'count' ? count(params[name]) : (params[name] ?? ''));
}

// Rich values are assembled by the caller from escaped text and fixed markup.
export function rich(key, values) {
  return esc(template(key, {})).replace(/\{(\w+)\}/g, (_, name) => values[name]);
}

export function applyLocale() {
  document.documentElement.lang = locale;
  document.documentElement.dir = dir;
  document.title = t('siteTitle');
  document.querySelector('meta[name="description"]').content = t('description');
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const [attribute, marker] of [['aria-label', 'data-i18n-label'], ['placeholder', 'data-i18n-placeholder']]) {
    for (const node of document.querySelectorAll(`[${marker}]`)) node.setAttribute(attribute, t(node.getAttribute(marker)));
  }
  for (const node of document.querySelectorAll('[data-year]')) node.textContent = number(+node.dataset.year);

  const language = document.getElementById('language');
  for (const [code, { name }] of Object.entries(locales)) {
    const option = new Option(name, code);
    option.lang = code;
    language.add(option);
  }
  language.value = locale;
  language.addEventListener('change', () => {
    const next = new URL(location.href);
    next.searchParams.set('lang', language.value);
    try { localStorage.setItem(preferenceKey, language.value); } catch { /* The URL still carries the choice. */ }
    location.assign(next);
  });

  const link = (href, label) => `<a href="${href}">${esc(label)}</a>`;
  document.getElementById('footerBorders').innerHTML = rich('footerBorders', {
    basemaps: link('https://github.com/aourednik/historical-basemaps', 'historical-basemaps'),
    naturalEarth: link('https://www.naturalearthdata.com/', 'Natural Earth'),
  });
  document.getElementById('footerProject').innerHTML = rich('footerProject', {
    sweden: link('https://matsakelarsson.github.io/sweden-at-war/', t('footerSweden')),
    source: link('https://github.com/matsakelarsson/europe-at-war', t('footerSource')),
  });
  document.getElementById('contentFallback').hidden = !t('contentFallback');
}
