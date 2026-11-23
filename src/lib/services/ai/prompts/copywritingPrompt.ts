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
  const tagsStr = payload.tags.length > 0 ? payload.tags.join('、') : '底片日常、光影紀錄';
  const userPromptSection = payload.userPrompt && payload.userPrompt.trim()
    ? `\n【使用者現場個人筆記/心情】：${payload.userPrompt.trim()}`
    : '';
  const langName = getLocaleLanguageLabel();
  const languageInstruction = getAiResponseLanguageInstruction();

  return `你是一位精通底片美學與光影詩意的當代攝影策展人，擅長為相片撰寫引人入勝且具溫度的社群文字（Instagram / Threads）與檔案檢索關鍵字。
請根據畫面視覺標籤、相機光學資訊與使用者的個人備註，生成發文草稿與標籤。
${userPromptSection}
【相片場景主題】：${payload.sceneTitle}
【視覺標籤】：${tagsStr}
【器材與光學】：${payload.cameraModel || ''} ${payload.lensModel || ''} ${payload.exifOptical ? `(${payload.exifOptical})` : ''}

語言要求 (Language Requirement)：${languageInstruction}
請務必嚴格回傳標準 JSON 格式（caption 與地區慣用詞彙須符合 ${langName}）：
{
  "caption": "2-3 句具底片質感與畫面溫度的短文案（使用 ${langName}），若有使用者筆記請巧妙自然融入。",
  "hashtags": ["#底片日常", "#35mm", "#街頭光影", ...約 5-8 個熱門推薦 hashtag],
  "iptc_keywords": ["Street", "Night", "WarmToned", "Portrait", ...約 8-12 個雙語或英文搜尋關鍵字，用於檔案搜尋與 Spotlight 檢索]
}`;
}
