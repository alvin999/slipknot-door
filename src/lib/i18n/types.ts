export type Locale = 'zh-TW' | 'en' | 'ja';

export const SUPPORTED_LOCALES: readonly Locale[] = ['zh-TW', 'en', 'ja'] as const;

export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-TW': '繁體中文',
  en: 'English',
  ja: '日本語',
};

export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  'zh-TW': '繁中',
  en: 'EN',
  ja: '日本語',
};
