/**
 * AI Engine Factory & Strategy Registry
 * Factory + Strategy Pattern implementation.
 * Zero hardcoded model lists. Complete user autonomy over Model & Provider assignment.
 */

import type { IVisionStrategy, ITextStrategy, AiTaskRolesConfig } from './types';
import { GeminiAdapter } from './geminiAdapter';
import { GroqAdapter } from './groqAdapter';
import { KeyVaultService } from '../keyVaultService';

export class AiEngineFactory {
  // Registry of supported provider adapters
  private static visionRegistry: Map<string, IVisionStrategy> = new Map();
  private static textRegistry: Map<string, ITextStrategy> = new Map();

  private static STORAGE_KEY_VISION_PROV = 'slipknot_role_vision_provider';
  private static STORAGE_KEY_VISION_MODEL = 'slipknot_role_vision_model';
  private static STORAGE_KEY_VISION_TEMP = 'slipknot_role_vision_temp';
  private static STORAGE_KEY_TEXT_PROV = 'slipknot_role_copywriting_provider';
  private static STORAGE_KEY_TEXT_MODEL = 'slipknot_role_copywriting_model';
  private static STORAGE_KEY_TEXT_TEMP = 'slipknot_role_copywriting_temp';
  private static STORAGE_KEY_CRITIC_ENABLED = 'slipknot_critic_enabled';
  private static STORAGE_KEY_CRITIC_USE_CUSTOM = 'slipknot_critic_use_custom';
  private static STORAGE_KEY_CRITIC_PROV = 'slipknot_role_critic_provider';
  private static STORAGE_KEY_CRITIC_MODEL = 'slipknot_role_critic_model';
  private static STORAGE_KEY_CRITIC_TEMP = 'slipknot_role_critic_temp';
  private static STORAGE_KEY_TUNING_STRENGTH = 'slipknot_ai_tuning_strength';

  private static parseClampedNumber(
    raw: string | number | null | undefined,
    fallback: number,
    min: number,
    max: number
  ): number {
    const parsed = typeof raw === 'number' ? raw : raw !== null && raw !== undefined ? parseFloat(raw) : NaN;
    if (!Number.isFinite(parsed)) return fallback;
    return Math.round(Math.max(min, Math.min(max, parsed)) * 100) / 100;
  }

  // Static initialization of default registered adapters
  static {
    const gemini = new GeminiAdapter();
    const groq = new GroqAdapter();

    this.registerVisionStrategy(gemini);
    this.registerVisionStrategy(groq);

    this.registerTextStrategy(groq);
    this.registerTextStrategy(gemini);
  }

  /**
   * 註冊視覺多模態策略
   */
  public static registerVisionStrategy(strategy: IVisionStrategy) {
    this.visionRegistry.set(strategy.providerId, strategy);
  }

  /**
   * 註冊文字生成策略
   */
  public static registerTextStrategy(strategy: ITextStrategy) {
    this.textRegistry.set(strategy.providerId, strategy);
  }

  /**
   * 取得已註冊之視覺 Provider 清單
   */
  public static getAvailableVisionProviders(): { id: string; name: string }[] {
    return Array.from(this.visionRegistry.values()).map(s => ({
      id: s.providerId,
      name: s.providerName
    }));
  }

  /**
   * 取得已註冊之文字 Provider 清單
   */
  public static getAvailableTextProviders(): { id: string; name: string }[] {
    return Array.from(this.textRegistry.values()).map(s => ({
      id: s.providerId,
      name: s.providerName
    }));
  }

  /**
   * 讀取使用者設定的任務職責指派 (Task Roles)
   */
  public static getTaskRoles(): AiTaskRolesConfig {
    let visionProv = 'gemini';
    let visionModel = '';
    let copyProv = 'groq';
    let copyModel = '';

    if (typeof localStorage !== 'undefined') {
      const vp = localStorage.getItem(this.STORAGE_KEY_VISION_PROV);
      if (vp) visionProv = vp;

      const vm = localStorage.getItem(this.STORAGE_KEY_VISION_MODEL) || localStorage.getItem(`slipknot_model_${visionProv}`);
      if (vm) visionModel = vm;

      const cp = localStorage.getItem(this.STORAGE_KEY_TEXT_PROV);
      if (cp) copyProv = cp;

      const cm = localStorage.getItem(this.STORAGE_KEY_TEXT_MODEL) || localStorage.getItem(`slipknot_model_${copyProv}`);
      if (cm) copyModel = cm;
    }

    let criticEnabled = false;
    let criticUseCustom = false;
    let criticProv = 'gemini';
    let criticModel = '';
    let visionTemp = 0.4;
    let copyTemp = 0.7;
    let criticTemp = 0.2;
    let tuningStrength = 1.0;

    if (typeof localStorage !== 'undefined') {
      criticEnabled = localStorage.getItem(this.STORAGE_KEY_CRITIC_ENABLED) === 'true';
      criticUseCustom = localStorage.getItem(this.STORAGE_KEY_CRITIC_USE_CUSTOM) === 'true';
      const ctp = localStorage.getItem(this.STORAGE_KEY_CRITIC_PROV);
      if (ctp) criticProv = ctp;
      const ctm = localStorage.getItem(this.STORAGE_KEY_CRITIC_MODEL) || localStorage.getItem(`slipknot_model_${criticProv}`);
      if (ctm) criticModel = ctm;

      visionTemp = this.parseClampedNumber(localStorage.getItem(this.STORAGE_KEY_VISION_TEMP), 0.4, 0.0, 1.5);
      copyTemp = this.parseClampedNumber(localStorage.getItem(this.STORAGE_KEY_TEXT_TEMP), 0.7, 0.0, 1.5);
      criticTemp = this.parseClampedNumber(localStorage.getItem(this.STORAGE_KEY_CRITIC_TEMP), 0.2, 0.0, 1.0);
      tuningStrength = this.parseClampedNumber(localStorage.getItem(this.STORAGE_KEY_TUNING_STRENGTH), 1.0, 0.5, 1.5);
    }

    return {
      vision: {
        provider: visionProv,
        modelId: visionModel,
        temperature: visionTemp,
      },
      copywriting: {
        provider: copyProv,
        modelId: copyModel,
        temperature: copyTemp,
      },
      critic: {
        enabled: criticEnabled,
        useCustomModel: criticUseCustom,
        provider: criticProv,
        modelId: criticModel,
        temperature: criticTemp,
      },
      tuningStrength,
    };
  }

  /**
   * 儲存使用者的任務職責指派 (Task Roles)
   */
  public static setTaskRoles(roles: Partial<AiTaskRolesConfig>): void {
    if (typeof localStorage === 'undefined') return;

    if (roles.vision) {
      if (roles.vision.provider) {
        localStorage.setItem(this.STORAGE_KEY_VISION_PROV, roles.vision.provider);
      }
      if (roles.vision.modelId !== undefined) {
        localStorage.setItem(this.STORAGE_KEY_VISION_MODEL, roles.vision.modelId.trim());
      }
      if (typeof roles.vision.temperature === 'number') {
        localStorage.setItem(
          this.STORAGE_KEY_VISION_TEMP,
          String(this.parseClampedNumber(roles.vision.temperature, 0.4, 0.0, 1.5))
        );
      }
    }

    if (roles.copywriting) {
      if (roles.copywriting.provider) {
        localStorage.setItem(this.STORAGE_KEY_TEXT_PROV, roles.copywriting.provider);
      }
      if (roles.copywriting.modelId !== undefined) {
        localStorage.setItem(this.STORAGE_KEY_TEXT_MODEL, roles.copywriting.modelId.trim());
      }
      if (typeof roles.copywriting.temperature === 'number') {
        localStorage.setItem(
          this.STORAGE_KEY_TEXT_TEMP,
          String(this.parseClampedNumber(roles.copywriting.temperature, 0.7, 0.0, 1.5))
        );
      }
    }

    if (roles.critic) {
      if (roles.critic.enabled !== undefined) {
        localStorage.setItem(this.STORAGE_KEY_CRITIC_ENABLED, String(roles.critic.enabled));
      }
      if (roles.critic.useCustomModel !== undefined) {
        localStorage.setItem(this.STORAGE_KEY_CRITIC_USE_CUSTOM, String(roles.critic.useCustomModel));
      }
      if (roles.critic.provider) {
        localStorage.setItem(this.STORAGE_KEY_CRITIC_PROV, roles.critic.provider);
      }
      if (roles.critic.modelId !== undefined) {
        localStorage.setItem(this.STORAGE_KEY_CRITIC_MODEL, roles.critic.modelId.trim());
      }
      if (typeof roles.critic.temperature === 'number') {
        localStorage.setItem(
          this.STORAGE_KEY_CRITIC_TEMP,
          String(this.parseClampedNumber(roles.critic.temperature, 0.2, 0.0, 1.0))
        );
      }
    }

    if (typeof roles.tuningStrength === 'number') {
      localStorage.setItem(
        this.STORAGE_KEY_TUNING_STRENGTH,
        String(this.parseClampedNumber(roles.tuningStrength, 1.0, 0.5, 1.5))
      );
    }
  }

  /**
   * 依據使用者指派，取得負責雙圖閉環覆審之品控策略與金鑰
   */
  public static async getCriticEngine(): Promise<{
    strategy: IVisionStrategy | null;
    modelId: string;
    apiKey: string;
    enabled: boolean;
    temperature: number;
  }> {
    const roles = this.getTaskRoles();
    const criticTemp = roles.critic.temperature ?? 0.2;
    if (!roles.critic.enabled) {
      return { strategy: null, modelId: '', apiKey: '', enabled: false, temperature: criticTemp };
    }

    if (!roles.critic.useCustomModel) {
      const visionEngine = await this.getVisionEngine();
      return {
        strategy: visionEngine.strategy,
        modelId: visionEngine.modelId,
        apiKey: visionEngine.apiKey,
        enabled: true,
        temperature: criticTemp,
      };
    }

    const assignedProvider = roles.critic.provider;
    let strategy = this.visionRegistry.get(assignedProvider);
    if (!strategy) {
      strategy = this.visionRegistry.get('gemini') || Array.from(this.visionRegistry.values())[0];
    }
    const loaded = await KeyVaultService.loadKey(strategy.providerId as 'gemini' | 'groq');
    return {
      strategy,
      modelId: roles.critic.modelId,
      apiKey: loaded.apiKey || '',
      enabled: true,
      temperature: criticTemp,
    };
  }

  /**
   * 依據使用者指派，取得負責影像顯影之策略與金鑰
   */
  public static async getVisionEngine(): Promise<{
    strategy: IVisionStrategy;
    modelId: string;
    apiKey: string;
    temperature: number;
  }> {
    const roles = this.getTaskRoles();
    const assignedProvider = roles.vision.provider;
    const assignedModel = roles.vision.modelId;

    // 取得對應 Provider 的 Strategy
    let strategy = this.visionRegistry.get(assignedProvider);
    if (!strategy) {
      // 若指派的 Provider 未註冊，降級使用第一個可用的視覺策略
      strategy = this.visionRegistry.get('gemini') || Array.from(this.visionRegistry.values())[0];
    }

    // 載入該 Provider 的 API 金鑰
    const loaded = await KeyVaultService.loadKey(strategy.providerId as 'gemini' | 'groq');
    const apiKey = loaded.apiKey || '';

    return {
      strategy,
      modelId: assignedModel,
      apiKey,
      temperature: roles.vision.temperature ?? 0.4,
    };
  }

  /**
   * 依據使用者指派，取得負責文字文案之策略與金鑰
   */
  public static async getCopywritingEngine(): Promise<{
    strategy: ITextStrategy;
    modelId: string;
    apiKey: string;
    temperature: number;
  }> {
    const roles = this.getTaskRoles();
    const assignedProvider = roles.copywriting.provider;
    const assignedModel = roles.copywriting.modelId;

    let strategy = this.textRegistry.get(assignedProvider);
    if (!strategy) {
      strategy = this.textRegistry.get('groq') || Array.from(this.textRegistry.values())[0];
    }

    const loaded = await KeyVaultService.loadKey(strategy.providerId as 'gemini' | 'groq');
    const apiKey = loaded.apiKey || '';

    return {
      strategy,
      modelId: assignedModel,
      apiKey,
      temperature: roles.copywriting.temperature ?? 0.7,
    };
  }
}
