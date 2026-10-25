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

      // Rule 3: Dynamic Vision Capability Detection
      const hasVisionSignal = VISION_SIGNAL_REGEX.test(combinedMeta);
      
      // For Gemini, standard generation models support multimodal inputs unless explicitly legacy
      const isVisionCapable = provider === 'gemini'
        ? (hasVisionSignal || combinedMeta.includes('gemini'))
        : hasVisionSignal;

      if (!isVisionCapable) {
        continue;
      }

      // Rule 4: Real-time Darkroom Suitability Scoring (Lower Latency = Higher Score)
      let score = 50;
      let recommendationTag = '';

      // High-speed / Low-latency tier (Flash, Lite, Mini, 8B, 11B)
      if (/(flash|instant|lite|mini|turbo)/i.test(combinedMeta)) {
        score += 40;
        recommendationTag = '極速低延遲 · 首選推薦';
      } else if (/(8b|11b|small)/i.test(combinedMeta)) {
        score += 25;
        recommendationTag = '輕量多模態';
      }

      // High-parameter / Heavy models (Pro, 70B, Ultra) - functional but slower for real-time slider updates
      if (/(pro|ultra|70b|thinking)/i.test(combinedMeta)) {
        score -= 20;
        if (!recommendationTag) recommendationTag = '高精度 · 延遲較長';
      }

      results.push({
        id: cleanId,
        displayName,
        provider,
        description,
        isVisionCapable: true,
        score,
        recommendationTag
      });
    }

    return results;
  }
}
