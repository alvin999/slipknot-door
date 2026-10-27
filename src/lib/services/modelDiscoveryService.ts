/**
 * Model Discovery & Dynamic Capability-based Filtering Service
 * Dynamically queries provider endpoints and filters visual models WITHOUT hardcoded model names.
 */

export interface DiscoveredModel {
  id: string;
  displayName: string;
  provider: 'gemini' | 'groq';
  description?: string;
  isVisionCapable: boolean;
  score: number; // Higher score = better suited for real-time 512px darkroom latency
  recommendationTag?: string;
}

export interface DiscoveryResult {
  models: DiscoveredModel[];
  recommendedModelId: string | null;
  error?: string;
}

export class ModelDiscoveryService {
  /**
   * Fetch and dynamically evaluate models using API Key
   */
  public static async discoverModels(
    provider: 'gemini' | 'groq',
    apiKey: string
  ): Promise<DiscoveryResult> {
    if (!apiKey || apiKey.trim().length < 8) {
      return { models: [], recommendedModelId: null };
    }

    try {
      const rawList = provider === 'gemini'
        ? await this.fetchGeminiModels(apiKey.trim())
        : await this.fetchGroqModels(apiKey.trim());

      // Filter and evaluate models without hardcoding names
      const evaluatedModels = this.evaluateAndFilterModels(provider, rawList);

      // Sort descending by calculated darkroom suitability score
      evaluatedModels.sort((a, b) => b.score - a.score);

      const recommendedModelId = evaluatedModels.length > 0 ? evaluatedModels[0].id : null;

      if (evaluatedModels.length === 0 && rawList.length > 0) {
        return {
          models: [],
          recommendedModelId: null,
          error: `連線成功但未發現相容的視覺多模態模型（端點回傳 ${rawList.length} 個模型皆為純文字或非視覺模型）`
        };
      }

      return { models: evaluatedModels, recommendedModelId };
    } catch (err: any) {
      console.warn(`Dynamic model discovery failed for ${provider}:`, err);
      return { models: [], recommendedModelId: null, error: err?.message || '連線逾時或端點無回應' };
    }
  }

  /**
   * Automatically detect provider from API Key pattern
   */
  public static detectProviderFromKey(key: string): 'gemini' | 'groq' | null {
    const trimmed = key.trim();
    if (trimmed.startsWith('AIzaSy')) return 'gemini';
    if (trimmed.startsWith('gsk_')) return 'groq';
    return null;
  }

  /* --- Provider Endpoints --- */

  private static async fetchGeminiModels(apiKey: string): Promise<any[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) {
      let errDetail = '';
      try {
        const errJson = await res.json();
        errDetail = errJson.error?.message || JSON.stringify(errJson);
      } catch {
        errDetail = await res.text();
      }
      throw new Error(`Google API 查詢失敗 (${res.status}): ${errDetail.slice(0, 120)}`);
    }
    const data = await res.json();
    return data.models || [];
  }

  private static async fetchGroqModels(apiKey: string): Promise<any[]> {
    const url = 'https://api.groq.com/openai/v1/models';
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) {
      let errDetail = '';
      try {
        const errJson = await res.json();
        errDetail = errJson.error?.message || JSON.stringify(errJson);
      } catch {
        errDetail = await res.text();
      }
      throw new Error(`Groq API 查詢失敗 (${res.status}): ${errDetail.slice(0, 120)}`);
    }
    const data = await res.json();
    return data.data || [];
  }

  /* --- Non-hardcoded Capability Filtering & Heuristic Scoring --- */

  private static evaluateAndFilterModels(
    provider: 'gemini' | 'groq',
    rawModels: any[]
  ): DiscoveredModel[] {
    const results: DiscoveredModel[] = [];

    // Negative filters: Exclude embeddings, audio, moderation, and rerankers
    const EXCLUSION_REGEX = /(embedding|embed|whisper|tts|audio|rerank|guard|moderation|bge|gte)/i;

    // Vision signal detector: Detect vision/multimodal capabilities across ID, methods, and descriptions
    const VISION_SIGNAL_REGEX = /(vision|multimodal|-vl-|image|flash)/i;

    for (const m of rawModels) {
      const rawId: string = m.id || m.name || '';
      const cleanId = rawId.replace(/^models\//, '');
      const description: string = m.description || '';
      const displayName: string = m.displayName || cleanId;
      const combinedMeta = `${cleanId} ${description} ${displayName}`.toLowerCase();

      // Rule 1: Exclude non-generative / specialized non-vision models
      if (EXCLUSION_REGEX.test(combinedMeta)) {
        continue;
      }

      // Rule 2: Check for API generation method support (Gemini specific)
      if (provider === 'gemini') {
        const methods: string[] = m.supportedGenerationMethods || [];
        if (methods.length > 0 && !methods.includes('generateContent')) {
          continue;
        }
      }

      // Rule 3: Dynamic Vision / Text Capability Detection
      const hasVisionSignal = VISION_SIGNAL_REGEX.test(combinedMeta);
      
      // For Gemini, standard generation models support multimodal inputs unless explicitly legacy
      const isVisionCapable = provider === 'gemini'
        ? (hasVisionSignal || combinedMeta.includes('gemini'))
        : hasVisionSignal;

      // Gemini requires multimodal vision capabilities for photo inspection.
      // Groq is utilized for lightning-fast text processing (copywriting & IPTC keywords), so pure text models are supported.
      if (provider === 'gemini' && !isVisionCapable) {
        continue;
      }

      // Rule 4: Suitability Scoring & Precise Tags ('latest' recommended)
      let score = 50;
      let recommendationTag = '';

      // Check if model explicitly contains 'latest'
      const isLatest = /latest/i.test(cleanId) || /latest/i.test(displayName);

      if (provider === 'gemini') {
        if (/lite/i.test(combinedMeta)) {
          score += 35;
          recommendationTag = isLatest ? '⭐ 首選推薦 (latest · 輕量多模態)' : '⚡ 極低延遲 · 輕量多模態';
        } else if (/flash/i.test(combinedMeta)) {
          score += 40;
          recommendationTag = isLatest ? '⭐ 首選推薦 (latest · 極速多模態)' : '⚡ 極速多模態';
        } else if (/pro/i.test(combinedMeta)) {
          score += 15;
          recommendationTag = isLatest ? '🎯 官方最新 (latest · 高精細解析)' : '🎯 高精細解析';
        } else if (/thinking/i.test(combinedMeta)) {
          score += 10;
          recommendationTag = '🧠 深度思考推理';
        } else if (/exp|experimental|preview/i.test(combinedMeta)) {
          score += 20;
          recommendationTag = '🧪 實驗預覽版';
        }
      } else {
        // Groq text models for copywriting & IPTC metadata
        if (/70b|versatile/i.test(combinedMeta)) {
          score += 40;
          recommendationTag = isLatest ? '⭐ 首選推薦 (latest · 文案策展)' : '📝 高品質文案策展 (70B)';
        } else if (/8b|instant/i.test(combinedMeta)) {
          score += 35;
          recommendationTag = isLatest ? '⭐ 首選推薦 (latest · 極速文字)' : '⚡ 極速文字生成 (8B)';
        } else if (/mixtral|qwen|gemma/i.test(combinedMeta)) {
          score += 25;
          recommendationTag = '通用文字處理';
        }
      }

      // Boost score if explicitly tagged as latest
      if (isLatest) {
        score += 50;
      }

      results.push({
        id: cleanId,
        displayName,
        provider,
        description,
        isVisionCapable,
        score,
        recommendationTag
      });
    }

    return results;
  }
}
