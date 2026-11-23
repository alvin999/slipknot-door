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

  const systemPrompt = `You are a Digital Asset Management (DAM) directory structure planner.
Organize the input photo metadata into a structured export directory hierarchy based on EXIF metadata, scene classification, color profile, and user preferences.

Structural Rules:
1. Folder naming format: <NN>_<Topic> (two-digit sequential numeric prefix followed by a concise topic label in ${langName} or universal ASCII).
2. Depth constraint: Single-level subdirectory hierarchy only; avoid nested subfolders.
3. Completeness constraint: Every input photo id must be assigned to the photoIds array of its target folder without omission or duplication.
4. Root naming format: "${sessionDate}_<ProjectTopic>" in ${langName} or filesystem-safe characters.
5. Priority constraint: Strictly follow userInstruction when provided.

Preferred Strategy: ${strategy}
${userPrompt ? `User Custom Instruction: ${userPrompt}` : ''}

Language Requirement: ${languageInstruction}
Respond ONLY with valid JSON matching this schema:
{
  "projectRootName": "string (Format: ${sessionDate}_<ProjectTopic>)",
  "rationale": "string (Concise grouping rationale in ${langName})",
  "folders": [
    {
      "subPath": "string (Single-level folder name following <NN>_<Topic>)",
      "description": "string (Objective summary of photos grouped in this folder in ${langName})",
      "photoIds": ["string (Assigned photo id values from input)"],
      "renamePattern": "string (Filename template supporting {original} placeholder)"
    }
  ],
  "rawBackupSubPath": "string (Relative subdirectory path for original RAW files)"
}`;

  const userContent = JSON.stringify({
    sessionDate,
    strategy,
    userInstruction: userPrompt,
    totalPhotos: payload.photos.length,
    samplePhotos: payload.photos.map((p) => ({
      id: p.id,
      filename: p.filename,
      scene: p.scene || 'N/A',
      profile: p.profile || 'N/A',
      focal: p.focalLength || '--',
      iso: p.iso || 100,
      shutter: p.shutter || '--',
      time: p.dateTime || '--',
      flagged: !!p.flagged,
    })),
  });

  return { systemPrompt, userContent, sessionDate };
}
