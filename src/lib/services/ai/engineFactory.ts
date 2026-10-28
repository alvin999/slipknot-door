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
  private static STORAGE_KEY_TEXT_PROV = 'slipknot_role_copywriting_provider';
  private static STORAGE_KEY_TEXT_MODEL = 'slipknot_role_copywriting_model';

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

    return {
      vision: {
        provider: visionProv,
        modelId: visionModel
      },
      copywriting: {
        provider: copyProv,
        modelId: copyModel
      }
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
    }

    if (roles.copywriting) {
      if (roles.copywriting.provider) {
        localStorage.setItem(this.STORAGE_KEY_TEXT_PROV, roles.copywriting.provider);
      }
      if (roles.copywriting.modelId !== undefined) {
        localStorage.setItem(this.STORAGE_KEY_TEXT_MODEL, roles.copywriting.modelId.trim());
      }
    }
  }

  /**
   * 依據使用者指派，取得負責影像顯影之策略與金鑰
   */
  public static async getVisionEngine(): Promise<{
    strategy: IVisionStrategy;
    modelId: string;
    apiKey: string;
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
      apiKey
    };
  }

  /**
   * 依據使用者指派，取得負責文字文案之策略與金鑰
   */
  public static async getCopywritingEngine(): Promise<{
    strategy: ITextStrategy;
    modelId: string;
    apiKey: string;
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
      apiKey
    };
  }
}
