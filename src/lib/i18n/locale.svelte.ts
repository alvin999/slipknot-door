import { SUPPORTED_LOCALES, type Locale } from './types';
import { zhTW, type TranslationSchema } from './locales/zh-TW';
import { en } from './locales/en';
import { ja } from './locales/ja';

export const LOCALE_STORAGE_KEY = 'slipknot_locale_v1';

type DeepString<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepString<T[K]>;
};

const DICTIONARIES: Record<Locale, DeepString<TranslationSchema>> = {
  'zh-TW': zhTW,
  en,
  ja,
};

function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh-TW';
  const lang = (navigator.language || '').toLowerCase();
  if (lang.startsWith('ja')) return 'ja';
  if (lang.startsWith('zh')) return 'zh-TW';
  if (lang.startsWith('en')) return 'en';
  return 'en';
}

function loadInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-TW';
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(saved)) return saved;
  } catch {
    // Ignore storage access errors in restricted environments
  }
  return detectBrowserLocale();
}

let currentLocale = $state<Locale>(loadInitialLocale());

export const i18nStore = {
  get locale(): Locale {
    return currentLocale;
  },
  setLocale(next: Locale) {
    if (!isSupportedLocale(next) || next === currentLocale) return;
    currentLocale = next;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        // Ignore storage write errors
      }
    }
  },
  cycleLocale() {
    const idx = SUPPORTED_LOCALES.indexOf(currentLocale);
    const next = SUPPORTED_LOCALES[(idx + 1) % SUPPORTED_LOCALES.length];
    this.setLocale(next);
  },
};

type NestedKeyOf<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${NestedKeyOf<T[K]>}`;
    }[keyof T & string];

export type TranslationKey = NestedKeyOf<TranslationSchema>;

function resolvePath(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.');
  let curr: unknown = obj;
  for (const part of parts) {
    if (!curr || typeof curr !== 'object') return undefined;
    curr = (curr as Record<string, unknown>)[part];
  }
  return typeof curr === 'string' ? curr : undefined;
}

/**
 * 依據目前語系取得對應翻譯字串，支援 `{param}` 插值。
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const dict = DICTIONARIES[currentLocale] as unknown as Record<string, unknown>;
  const fallback = DICTIONARIES['zh-TW'] as unknown as Record<string, unknown>;
  let text = resolvePath(dict, key) ?? resolvePath(fallback, key) ?? key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

/**
 * 取得給 AI 模型使用的回應語言指示，確保分析說明與 UI 語系一致。
 */
export function getAiResponseLanguageInstruction(locale: Locale = currentLocale): string {
  switch (locale) {
    case 'en':
      return 'Respond in natural, concise English for all human-readable explanations, scene summaries, and reasoning fields.';
    case 'ja':
      return '人間が読む説明・シーン要約・推論理由のフィールドはすべて自然な日本語で回答してください。';
    case 'zh-TW':
    default:
      return '所有給使用者閱讀的說明、場景摘要與推論理由欄位，請統一使用自然流暢的繁體中文（台灣用語）回答。';
  }
}
