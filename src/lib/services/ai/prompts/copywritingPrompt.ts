import type { TextInferenceOptions } from '../types';
import { getAiResponseLanguageInstruction, i18nStore } from '../../../i18n';

/**
 * 根據當前 UI 語系取得人類可讀語言名稱
 */
function getLocaleLanguageLabel(): string {
  switch (i18nStore.locale) {
    case 'en':
      return 'English';
    case 'ja':
      return 'Japanese';
    case 'zh-TW':
    default:
      return 'Traditional Chinese';
  }
}

/**
 * 建立社群文案與 IPTC 關鍵字生成 Prompt (generateCopywriting)
 * 依據使用者當前語系動態套用語言指示，並保留使用者筆記、場景與光學器材脈絡
 */
export function buildCopywritingPrompt(payload: TextInferenceOptions['payload']): string {
  const tagsStr = payload.tags.length > 0 ? payload.tags.join(', ') : 'N/A';
  const userNote = payload.userPrompt?.trim();
  const userPromptSection = userNote ? `\nUser Note: ${userNote}` : '';
  const opticalParts = [
    payload.cameraModel?.trim(),
    payload.lensModel?.trim(),
    payload.exifOptical?.trim() ? `(${payload.exifOptical.trim()})` : '',
  ].filter(Boolean);
  const opticalStr = opticalParts.length > 0 ? opticalParts.join(' ') : 'N/A';
  const langName = getLocaleLanguageLabel();
  const languageInstruction = getAiResponseLanguageInstruction();

  return `You are an objective photography metadata and social copy generator.
Generate a social media post draft and indexing keywords based strictly on the provided scene context, visual tags, optical EXIF metadata, and user note.
${userPromptSection}
Scene Subject: ${payload.sceneTitle || 'N/A'}
Visual Tags: ${tagsStr}
Optical & Camera Metadata: ${opticalStr}

Language Requirement: ${languageInstruction}
Respond ONLY with valid JSON matching this schema (all user-readable text in caption must use ${langName}):
{
  "caption": "string (Concise post caption in ${langName}; integrate the user note naturally if provided)",
  "hashtags": ["string (Relevant #-prefixed social tags in ${langName} or universal photography terms)"],
  "iptc_keywords": ["string (Objective IPTC search keywords in English or bilingual terms for file indexing and Spotlight search)"]
}`;
}
