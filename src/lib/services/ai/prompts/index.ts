/**
 * ═══════════════════════════════════════════════════════════════════
 * 【AI Prompt 中性化與客觀數據規範準則 (Prompt Neutrality Guidelines)】
 * 1. 保持客觀中立：不使用情緒化形容詞（如 punch, dreamy, extreme, harsh, poetic）。
 * 2. 避免固定數值區間：不提供預設數字範例或固定範圍，由模型依據畫面光學動態自主推算。
 * 3. 純物理控制通道：僅提供數據型別、物理邊界、方向定義與 EXIF 參數。
 * 4. 責任分離：Schema 作為標準型別規格，由前置風格意向引導調色，回歸模型預訓練常識。
 * ═══════════════════════════════════════════════════════════════════
 */

export { CONNECTION_PING_PROMPT } from './commonPrompts';
export { buildCopywritingPrompt } from './copywritingPrompt';
export { buildDirectoryPlanPrompts } from './directoryPlanPrompt';
export {
  buildGeometryInstructionPrompt,
  buildColorGradeInstructionPrompt,
  buildAnalyzePhotoPrompt,
  buildCriticInstructionBlock,
} from './visionPrompts';
