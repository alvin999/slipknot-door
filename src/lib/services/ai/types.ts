/**
 * AI Multi-Provider Strategy & Role Assignment Interfaces
 * Strategy Pattern for pluggable Vision & Text AI Engines.
 * Zero hardcoded model names.
 */

import type { ExifOpticalData } from '../../types/photo';
import type { AiSceneDecision, CopywritingPayload, CopywritingResult } from '../aiSceneService';

export type StylePresetKey =
  | 'standard'
  | 'matte_shadow'
  | 'reala_tone'
  | 'tungsten_soft'
  | 'monochrome_hc'
  | 'classic_chrome_cc'
  | 'classic_neg'
  | 'velvet_slide'
  | 'warm_astia'
  | 'nostalgic_neg'
  | 'platinum_acros'
  | 'auto';

export type StyleKeywordId =
  | 'film_like'
  | 'lomo'
  | 'airy_jp'
  | 'cinematic'
  | 'faded_vintage'
  | 'neon_wkw'
  | 'gritty_mono';

export interface VisionInferenceOptions {
  apiKey: string;
  modelId: string;
  imagePayload512pxBase64: string;
  exif: ExifOpticalData;
  timeoutMs?: number;
  signal?: AbortSignal;
  stylePreset?: StylePresetKey;
  styleKeywords?: StyleKeywordId[];
  customStylePrompt?: string;
}

export interface TextInferenceOptions {
  apiKey: string;
  modelId: string;
  payload: CopywritingPayload;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RefinementInferenceOptions {
  apiKey: string;
  modelId: string;
  originalImageBase64: string;
  renderedImageBase64: string;
  firstPassDecision: AiSceneDecision;
  exif: ExifOpticalData;
  timeoutMs?: number;
  signal?: AbortSignal;
  stylePreset?: StylePresetKey;
  styleKeywords?: StyleKeywordId[];
  customStylePrompt?: string;
}

export interface RefinementDecision {
  exposure_delta: number;      // -0.30 to +0.30 EV
  lift_shadows_delta: number;  // -0.20 to +0.20
  color_temp_delta: number;    // -300 to +300 Kelvin
  contrast_delta: number;      // -0.15 to +0.15
  refine_rationale: string;    // Traditional Chinese explanation
}

/**
 * 視覺多模態策略介面 (Strategy Pattern for Visual Scene Inference)
 */
export interface IVisionStrategy {
  readonly providerId: string;
  readonly providerName: string;
  analyzePhoto(options: VisionInferenceOptions): Promise<AiSceneDecision>;
  refinePhoto?(options: RefinementInferenceOptions): Promise<RefinementDecision>;
  testConnection(apiKey: string, modelId: string): Promise<{ success: boolean; latencySec: number; error?: string }>;
}

/**
 * 文字與文案生成策略介面 (Strategy Pattern for Copywriting & Metadata Generation)
 */
export interface ITextStrategy {
  readonly providerId: string;
  readonly providerName: string;
  generateCopywriting(options: TextInferenceOptions): Promise<CopywritingResult>;
  testConnection(apiKey: string, modelId: string): Promise<{ success: boolean; latencySec: number; error?: string }>;
}

/**
 * 雙圖覆審品控角色配置
 */
export interface CriticRoleConfig {
  enabled: boolean;
  useCustomModel: boolean;
  provider: 'gemini' | 'groq' | string;
  modelId: string;
}

/**
 * 任務職責配置（由使用者在保險庫自由指派文字、影像起草與雙圖覆審各自負責的模型）
 */
export interface AiTaskRolesConfig {
  vision: {
    provider: 'gemini' | 'groq' | string;
    modelId: string;
  };
  copywriting: {
    provider: 'groq' | 'gemini' | string;
    modelId: string;
  };
  critic: CriticRoleConfig;
}
