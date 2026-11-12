/**
 * Model Discovery & Dynamic Capability-based Filtering Service
 * Dynamically queries provider endpoints (Gemini, OpenAI, Anthropic, Groq, OpenRouter, Ollama)
 * and filters visual/text models WITHOUT hardcoded model lists.
 */

import type { AiProviderId } from './ai/types';
import { KeyVaultService } from './keyVaultService';

export interface DiscoveredModel {
  id: string;
  displayName: string;
  provider: AiProviderId;
  description?: string;
  isVisionCapable: boolean;
  score: number; // Higher score = better suited for real-time 1024px darkroom latency
  recommendationTag?: string;
}

export interface DiscoveryResult {
  models: DiscoveredModel[];
  recommendedModelId: string | null;
  error?: string;
}

export const PROVIDER_DEFAULT_MODELS: Record<
  AiProviderId,
  { vision: string; text: string; displayName: string }
> = {
  gemini: {
    vision: 'gemini-2.5-flash',
    text: 'gemini-2.5-flash-lite',
    displayName: 'Google Gemini',
  },
  openai: {
    vision: 'gpt-4o-mini',
    text: 'gpt-4o-mini',
    displayName: 'OpenAI',
  },
  anthropic: {
    vision: 'claude-3-5-sonnet-latest',
    text: 'claude-3-5-haiku-latest',
    displayName: 'Anthropic Claude',
  },
  groq: {
    vision: 'meta-llama/llama-4-scout-17b-16e-instruct',
    text: 'llama-3.3-70b-versatile',
    displayName: 'Groq Cloud',
  },
  openrouter: {
    vision: 'google/gemini-2.5-flash',
    text: 'meta-llama/llama-3.3-70b-instruct',
    displayName: 'OpenRouter',
  },
  ollama: {
    vision: 'qwen2.5vl:latest',
    text: 'qwen2.5:latest',
    displayName: 'Ollama (本地端)',
  },
};

export class ModelDiscoveryService {
  /**
   * 取得本地持久化快取之動態端點模型（零 hardcode，重啟仍可即時載入）
   */
  public static getCachedModels(provider: AiProviderId | string): DiscoveredModel[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(`slipknot_cached_models_${provider}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * 快取端點探測之動態模型清單
   */
  public static setCachedModels(provider: AiProviderId | string, models: DiscoveredModel[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(`slipknot_cached_models_${provider}`, JSON.stringify(models));
    } catch {}
  }

  /**
   * Fetch and dynamically evaluate models using API Key or Ollama Endpoint URL
   */
  public static async discoverModels(
    provider: AiProviderId,
    apiKeyOrUrl: string
  ): Promise<DiscoveryResult> {
    if (provider !== 'ollama' && (!apiKeyOrUrl || apiKeyOrUrl.trim().length < 6)) {
      return { models: this.getCachedModels(provider), recommendedModelId: null };
    }

    try {
      let rawList: any[] = [];
      const trimmed = (apiKeyOrUrl || '').trim();

      switch (provider) {
        case 'gemini':
          rawList = await this.fetchGeminiModels(trimmed);
          break;
        case 'groq':
          rawList = await this.fetchOpenAICompatibleModels('https://api.groq.com/openai/v1/models', trimmed, 'Groq');
          break;
        case 'openai':
          rawList = await this.fetchOpenAICompatibleModels('https://api.openai.com/v1/models', trimmed, 'OpenAI');
          break;
        case 'openrouter':
          rawList = await this.fetchOpenAICompatibleModels('https://openrouter.ai/api/v1/models', trimmed, 'OpenRouter');
          break;
        case 'anthropic':
          rawList = await this.fetchAnthropicModels(trimmed);
          break;
        case 'ollama':
          rawList = await this.fetchOllamaModels(trimmed || KeyVaultService.getOllamaEndpoint());
          break;
      }

      const evaluatedModels = this.evaluateAndFilterModels(provider, rawList);
      evaluatedModels.sort((a, b) => b.score - a.score);

      const recommendedModelId = evaluatedModels.length > 0 ? evaluatedModels[0].id : null;

      if (evaluatedModels.length === 0 && rawList.length > 0) {
        return {
          models: [],
          recommendedModelId: null,
          error: `連線成功但未發現相容的生成模型（端點回傳 ${rawList.length} 個項目）`,
        };
      }

      this.setCachedModels(provider, evaluatedModels);
      return { models: evaluatedModels, recommendedModelId };
    } catch (err: any) {
      console.warn(`Dynamic model discovery failed for ${provider}:`, err);
      const cached = this.getCachedModels(provider);
      return {
        models: cached,
        recommendedModelId: cached.length > 0 ? cached[0].id : null,
        error: err?.message || '連線逾時或端點無回應',
      };
    }
  }

  /**
   * Automatically detect provider from API Key or URL pattern
   */
  public static detectProviderFromKey(key: string): AiProviderId | null {
    const trimmed = key.trim();
    if (/^https?:\/\//i.test(trimmed)) return 'ollama';
    if (trimmed.startsWith('AIzaSy')) return 'gemini';
    if (trimmed.startsWith('gsk_')) return 'groq';
    if (trimmed.startsWith('sk-ant-')) return 'anthropic';
    if (trimmed.startsWith('sk-or-')) return 'openrouter';
    if (trimmed.startsWith('sk-')) return 'openai';
    return null;
  }

  /* --- Provider Endpoints --- */

  private static async fetchGeminiModels(apiKey: string): Promise<any[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) {
      const errDetail = await this.extractErrorDetail(res);
      throw new Error(`Google API 查詢失敗 (${res.status}): ${errDetail}`);
    }
    const data = await res.json();
    return data.models || [];
  }

  private static async fetchOpenAICompatibleModels(
    url: string,
    apiKey: string,
    label: string
  ): Promise<any[]> {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const errDetail = await this.extractErrorDetail(res);
      throw new Error(`${label} API 查詢失敗 (${res.status}): ${errDetail}`);
    }
    const data = await res.json();
    return data.data || [];
  }

  private static async fetchAnthropicModels(apiKey: string): Promise<any[]> {
    const url = 'https://api.anthropic.com/v1/models';
    const res = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const errDetail = await this.extractErrorDetail(res);
      throw new Error(`Anthropic API 查詢失敗 (${res.status}): ${errDetail}`);
    }
    const data = await res.json();
    return data.data || [];
  }

  private static async fetchOllamaModels(baseUrl: string): Promise<any[]> {
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    let res: Response;
    try {
      res = await fetch(`${cleanUrl}/api/tags`);
    } catch {
      throw new Error(
        `無法連線至 Ollama (${cleanUrl})。請確認本機 Ollama 已啟動，並已設定環境變數 OLLAMA_ORIGINS="*"`
      );
    }
    if (!res.ok) {
      const errDetail = await this.extractErrorDetail(res);
      throw new Error(`Ollama 查詢失敗 (${res.status}): ${errDetail}`);
    }
    const data = await res.json();
    return data.models || [];
  }

  private static async extractErrorDetail(res: Response): Promise<string> {
    try {
      const errJson = await res.json();
      return (errJson.error?.message || errJson.error || JSON.stringify(errJson)).slice(0, 120);
    } catch {
      const txt = await res.text().catch(() => '');
      return txt.slice(0, 120);
    }
  }

  /* --- Non-hardcoded Capability Filtering & Heuristic Scoring --- */

  private static evaluateAndFilterModels(
    provider: AiProviderId,
    rawModels: any[]
  ): DiscoveredModel[] {
    const results: DiscoveredModel[] = [];

    // Exclude non-chat/non-vision models: embeddings, audio,tts, image generation (dall-e/imagen), moderation
    const EXCLUSION_REGEX =
      /(embedding|embed|whisper|tts|audio|realtime|transcribe|rerank|guard|moderation|bge|gte|dall-e|imagen|veo|aqa|babbage|davinci|canary)/i;

    // Vision signal detector across ID, families, and modality metadata
    const VISION_SIGNAL_REGEX =
      /(vision|multimodal|-vl|llava|pixtral|qwen2\.5-vl|qwen2\.5vl|qwen-vl|minicpm-v|moondream|gemma3|gemma-3|llama-4|scout|maverick|gpt-4o|gpt-4\.1|gpt-4\.5|chatgpt-4o|o1|o3|o4-mini|claude-3|claude-4|claude-sonnet|claude-opus|claude-haiku|gemini|flash)/i;

    for (const m of rawModels) {
      const rawId: string = m.id || m.name || m.model || '';
      if (!rawId) continue;
      const cleanId = rawId.replace(/^models\//, '');
      const description: string = m.description || m.details?.family || '';
      const displayName: string = m.display_name || m.displayName || m.name || cleanId;
      const families: string[] = Array.isArray(m.details?.families) ? m.details.families : [];
      const modality: string = m.architecture?.modality || '';
      const combinedMeta = `${cleanId} ${description} ${displayName} ${families.join(' ')} ${modality}`.toLowerCase();

      if (EXCLUSION_REGEX.test(combinedMeta)) {
        continue;
      }

      if (provider === 'gemini') {
        const methods: string[] = m.supportedGenerationMethods || [];
        if (methods.length > 0 && !methods.includes('generateContent')) {
          continue;
        }
      }

      if (provider === 'openai') {
        // Only keep mainstream GPT-4o, GPT-4.1, o1/o3/o4 chat models
        if (!/^(gpt-4o|gpt-4\.1|gpt-4\.5|chatgpt-4o|o1|o3|o4)/i.test(cleanId)) {
          continue;
        }
      }

      // Dynamic Vision Capability Detection
      const hasClipFamily = families.some((f) => /clip|vision|mllama|qwen2vl/i.test(f));
      const hasOpenRouterVision = modality.includes('image');
      const hasVisionSignal = VISION_SIGNAL_REGEX.test(combinedMeta) || hasClipFamily || hasOpenRouterVision;

      const isVisionCapable =
        provider === 'gemini' || provider === 'anthropic'
          ? true
          : hasVisionSignal;

      if (provider === 'gemini' && !isVisionCapable) {
        continue;
      }

      let score = 50;
      let recommendationTag = '';
      const isLatest = /latest/i.test(cleanId) || /latest/i.test(displayName);

      if (provider === 'gemini') {
        if (/lite/i.test(combinedMeta)) {
          score += 45;
          recommendationTag = isLatest ? '⭐ 首選推薦 (極速穩定多模態)' : '⚡ 極速輕量多模態';
        } else if (/flash/i.test(combinedMeta)) {
          score += 40;
          recommendationTag = isLatest ? '🚀 官方最新 (極速多模態)' : '⚡ 極速多模態';
        } else if (/pro/i.test(combinedMeta)) {
          score += 20;
          recommendationTag = '🎯 旗艦高精細解析';
        }
      } else if (provider === 'openai') {
        if (/gpt-4\.1-mini|gpt-4o-mini/i.test(cleanId)) {
          score += 45;
          recommendationTag = '⚡ 極速高性價比多模態';
        } else if (/gpt-4\.1|gpt-4o/i.test(cleanId)) {
          score += 40;
          recommendationTag = '🎯 旗艦視覺與色彩推理';
        } else if (/^o[134]/i.test(cleanId)) {
          score += 25;
          recommendationTag = '🧠 深度邏輯推理';
        }
      } else if (provider === 'anthropic') {
        if (/sonnet/i.test(cleanId)) {
          score += 45;
          recommendationTag = '⭐ 視覺美學與色調首選';
        } else if (/haiku/i.test(cleanId)) {
          score += 35;
          recommendationTag = '⚡ 極速輕量推論';
        } else if (/opus/i.test(cleanId)) {
          score += 25;
          recommendationTag = '🎯 旗艦深度策展';
        }
      } else if (provider === 'groq') {
        if (isVisionCapable) {
          score += 45;
          recommendationTag = '👁️ 極速 LPU 視覺多模態';
        } else if (/70b|versatile/i.test(combinedMeta)) {
          score += 40;
          recommendationTag = '📝 高品質文案策展 (70B)';
        } else if (/8b|instant/i.test(combinedMeta)) {
          score += 35;
          recommendationTag = '⚡ 極速文字生成';
        }
      } else if (provider === 'openrouter') {
        if (isVisionCapable && /(gemini-2\.5-flash|claude-3\.5-sonnet|claude-3\.7-sonnet|gpt-4o|qwen2\.5-vl)/i.test(cleanId)) {
          score += 45;
          recommendationTag = '⭐ 主流多模態推薦';
        } else if (isVisionCapable) {
          score += 30;
          recommendationTag = '👁️ 支援視覺輸入';
        }
      } else if (provider === 'ollama') {
        const paramSize = m.details?.parameter_size ? ` · ${m.details.parameter_size}` : '';
        if (isVisionCapable) {
          score += 50;
          recommendationTag = `👁️ 本地多模態視覺${paramSize}`;
        } else {
          score += 20;
          recommendationTag = `📝 本地純文字模型${paramSize}`;
        }
      }

      if (isLatest) {
        score += 30;
      }

      results.push({
        id: cleanId,
        displayName,
        provider,
        description,
        isVisionCapable,
        score,
        recommendationTag,
      });
    }

    return results;
  }
}
