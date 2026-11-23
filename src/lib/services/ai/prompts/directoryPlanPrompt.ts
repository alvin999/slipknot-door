import type { DirectoryPlanOptions } from '../types';
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
 * 建立數位資產管理 (DAM) 匯出目錄結構規劃 Prompt 與序列化使用者資料 (planDirectory)
 */
export function buildDirectoryPlanPrompts(
  payload: DirectoryPlanOptions['payload']
): { systemPrompt: string; userContent: string; sessionDate: string } {
  const sessionDate = payload.sessionDate || new Date().toISOString().slice(0, 10);
  const strategy = payload.strategy || 'smart_scene';
  const userPrompt = payload.userInstruction?.trim() || '';
  const langName = getLocaleLanguageLabel();
  const languageInstruction = getAiResponseLanguageInstruction();

  const systemPrompt = `你是一位資深的數位資產管理 (DAM) 專家與暗房策展人。
你的任務是根據一組攝影底片相片的 EXIF 元數據、場景辨識與調色風格，規劃最直覺、乾淨、有條理的「匯出目錄結構藍圖」。

【規劃原則】：
1. 資料夾名稱採用簡潔清楚的主題與數字編號組合（例如 "01_街景日常_Street"、"02_溫潤人像_Heartland"）。
2. 避免過多深層階層，以 1 層子資料夾分類為最佳。
3. 必須將輸入中的每張照片 id 分配至最合適的子資料夾中的 photoIds 陣列，不遺漏任何一張。
4. projectRootName 建議格式為 "${sessionDate}_主題名稱"。
5. 若使用者有特別指定指示，請優先嚴格遵循其自訂要求。

【使用者偏好策略】：${strategy}
${userPrompt ? `【使用者自訂分類指示】：${userPrompt}` : ''}

語言要求 (Language Requirement)：${languageInstruction}
請務必嚴格回傳標準 JSON 格式：
{
  "projectRootName": "${sessionDate}_街頭光影策展集",
  "rationale": "簡述目錄規劃的邏輯與分組考量（1-2 句，使用 ${langName}）",
  "folders": [
    {
      "subPath": "01_街頭夜景_Night",
      "description": "該資料夾包含的主題特色（使用 ${langName}）",
      "photoIds": ["photo_1"],
      "renamePattern": "{original}_graded"
    }
  ],
  "rawBackupSubPath": "00_RAW_Originals"
}`;

  const userContent = JSON.stringify({
    sessionDate,
    strategy,
    userInstruction: userPrompt,
    totalPhotos: payload.photos.length,
    samplePhotos: payload.photos.map((p) => ({
      id: p.id,
      filename: p.filename,
      scene: p.scene || '未標註',
      profile: p.profile || '標準風格',
      focal: p.focalLength || '--',
      iso: p.iso || 100,
      shutter: p.shutter || '--',
      time: p.dateTime || '--',
      flagged: !!p.flagged,
    })),
  });

  return { systemPrompt, userContent, sessionDate };
}
