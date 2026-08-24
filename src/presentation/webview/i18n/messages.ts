import { defaultLocale, translate, type MessageKey, type TranslationValues } from '@/core/i18n/catalog';
import type { AppLocale } from '@/core/types';

let locale: AppLocale = defaultLocale;
export function setLocale(value: AppLocale): void { locale = value; document.documentElement.lang = value; }
export function t(key: MessageKey, values?: TranslationValues): string { return translate(locale, key, values); }
export function plural(count: number, one: MessageKey, many: MessageKey): string { return t(count === 1 ? one : many, { count }); }
export type { MessageKey };
