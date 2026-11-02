/**
 * AI Scene Analysis & Vision Orchestration Service
 * Authentic Gemini / Groq live API inference with automated retry and lightweight image compression.
 * Zero hardcoded dummy returns.
 */

import type { ExifOpticalData } from '../types/photo';
import { AiEngineFactory } from './ai/engineFactory';

export interface AiSceneDecision {
  scene_type: string;
  scene_title?: string;
  style_insight?: string;
  recommended_mood?: string;
  recommended_profile: string;
  exposure_compensation: number;
  contrast?: number;
  color_temp?: number;
  tint?: number;
  lift_shadows: number;
  lut_intensity: number;
  clarity?: number;
  sharpness?: number;
  tags?: string[];
  isFallback: boolean;
  fallbackReason?: string; // 記錄跌入本地兜底的真實原因 (透明化 Log 呈現)
  providerUsed?: 'gemini' | 'groq' | 'offline';
  modelUsed?: string;
  inferenceDurationMs?: number;
  // 智慧構圖、裁切與透視校正
  crop_box?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0.0 ~ 1.0
  rotation_deg?: number;                       // 水平傾斜校正角度 (-45 ~ +45)
  keystone_v?: number;                         // 垂直透視梯形校正 (-45 ~ +45)
  aspect_ratio?: 'original' | '1:1' | '4:5' | '16:9' | '9:16' | 'free';
  crop_rationale?: string;                     // 裁切與構圖診斷說明
}

export interface AnalyzeSceneOptions {
  signal?: AbortSignal;
  onLog?: (msg: string) => Promise<void> | void;
  maxRetries?: number; // 預設 2 次自動重試（共嘗試最多 3 次）
  stylePreset?: import('./ai/types').StylePresetKey;
  styleKeywords?: import('./ai/types').StyleKeywordId[];
  customStylePrompt?: string;
  renderPreview?: (previewSrc: string, decision: AiSceneDecision) => Promise<string | null>;
}

export interface CopywritingPayload {
  tags: string[];
  sceneTitle: string;
  userPrompt?: string;
  cameraModel?: string;
  lensModel?: string;
  exifOptical?: string;
}

export interface CopywritingResult {
  caption: string;
  hashtags: string[];
  iptcKeywords: string[];
  providerUsed: 'groq' | 'gemini' | 'offline';
}

export class AiSceneService {
  private static TIMEOUT_MS = 60000; // 放寬至 60 秒，提供雲端多模態模型尖峰排隊充裕運算時間

  /**
   * 將任何影像載入並透過 HTML5 Canvas 等比例壓縮為最大 1024px 之輕量 JPEG Base64
   * 確保 Payload 降至 30KB~50KB，使雲端多模態推論在 1~3 秒內極速完成，杜絕逾時
   */
  public static async toCleanBase64(imageSrc: string): Promise<{ base64: string; mimeType: string }> {
    if (!imageSrc || imageSrc.trim() === '') {
      throw new Error('影像資料為空');
    }

    // 瀏覽器環境：使用 Image + Canvas 執行極速縮圖壓縮 (Max 1024px)
    if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
      try {
        const img = new Image();

        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            img.onload = null;
            img.onerror = null;
            reject(new Error('圖片載入逾時 (>2s)'));
          }, 2000);
          img.onload = () => {
            clearTimeout(timer);
            resolve();
          };
          img.onerror = () => {
            clearTimeout(timer);
            reject(new Error('縮圖載入失敗'));
          };
          img.src = imageSrc;
        });

        const maxDim = 1024;
        let w = img.naturalWidth || img.width || maxDim;
        let h = img.naturalHeight || img.height || maxDim;

        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          const commaIdx = dataUrl.indexOf(',');
          return {
            base64: commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl,
            mimeType: 'image/jpeg'
          };
        }
      } catch (e) {
        console.warn('Canvas 1024px 壓縮回退至直接 Base64 轉換:', e);
      }
    }

    // 備援方案：若無 DOM 或 Canvas 失敗，直接擷取 Base64
    if (imageSrc.startsWith('data:')) {
      const match = imageSrc.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (match) {
        return { mimeType: match[1], base64: match[2] };
      }
      const commaIdx = imageSrc.indexOf(',');
      if (commaIdx !== -1) {
        return { mimeType: 'image/jpeg', base64: imageSrc.slice(commaIdx + 1) };
      }
    }

    try {
      const resp = await fetch(imageSrc);
      const blob = await resp.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          const comma = res.indexOf(',');
          resolve(comma !== -1 ? res.slice(comma + 1) : res);
        };
        reader.onerror = () => reject(new Error('FileReader 讀取 Blob 失敗'));
        reader.readAsDataURL(blob);
      });

      return { base64, mimeType: 'image/jpeg' };
    } catch (err: any) {
      throw new Error(`無法將縮圖 Blob/URL 轉換為 Base64：${err?.message || err}`);
    }
  }

  /**
   * 取得視覺顯影當前啟用之模型資訊（依使用者任務職責指派動態回傳）
   */
  public static getActiveModelInfo(): { provider: string; modelId: string } {
    const roles = AiEngineFactory.getTaskRoles();
    const provider = roles.vision.provider || 'gemini';
    // 若為 Gemini 且未手動指定，優先採用最極速穩定且幾乎無 503 佇列的 flash-lite 模型
    const defaultModel = provider === 'gemini' ? 'gemini-flash-lite-latest' : 'llama-3.2-11b-vision-preview';
    const modelId = roles.vision.modelId || defaultModel;
    return { provider, modelId };
  }

  /**
   * 執行場景分析決策：
   * 1. 100% 執行雲端多模態神經推論，具備「智慧自動重試（Auto-retry）」抗尖峰壅塞 (503/429)。
   * 2. 支援隨時手動中斷（AbortSignal），中止時立即掐斷連線與等待。
   * 3. 若未配置 API 金鑰，直接拋出錯誤提示使用者配置，不進行任何本地偽裝或兜底。
   */
  public static async analyzeScene(
    imagePayload1024pxBase64: string,
    exif: ExifOpticalData,
    options?: AnalyzeSceneOptions
  ): Promise<AiSceneDecision> {
    const startTime = Date.now();

    // 檢查當前視覺引擎是否具備金鑰
    const { strategy, modelId, apiKey } = await AiEngineFactory.getVisionEngine();
    const hasValidKey = !!(apiKey && apiKey.trim() !== '');

    if (!hasValidKey) {
      throw new Error(`未配置 ${strategy.providerName} 之可用 API 金鑰，請先至右下角保險庫輸入金鑰`);
    }

    if (!imagePayload1024pxBase64 || imagePayload1024pxBase64.trim() === '') {
      throw new Error('縮圖影像資料為空，無法傳輸至雲端進行神經視覺分析');
    }

    // 準備輕量 1024px Payload
    const tPrep = Date.now();
    const { base64: cleanBase64 } = await this.toCleanBase64(imagePayload1024pxBase64);
    const prepMs = Date.now() - tPrep;
    const sizeKb = (cleanBase64.length * 0.75 / 1024).toFixed(1);
    console.info(`[AI_VISION] 縮圖準備完成 (耗時: ${prepMs}ms, 體積: ${sizeKb} KB, 模型: ${modelId})`);

    const maxRetries = options?.maxRetries ?? 2;
    let attempt = 0;

    while (attempt <= maxRetries) {
      if (options?.signal?.aborted) {
        throw new Error('使用者已手動中止推論程序');
      }

      try {
        const decision = await strategy.analyzePhoto({
          apiKey,
          modelId,
          imagePayload1024pxBase64: cleanBase64,
          exif,
          signal: options?.signal,
          stylePreset: options?.stylePreset,
          styleKeywords: options?.styleKeywords,
          customStylePrompt: options?.customStylePrompt,
          timeoutMs: 180000 // 提供寬裕的 Socket 守護
        });

        // Pass 1 視覺分析完成，即時輸出初判成果與風格洞見
        if (options?.onLog) {
          const pass1Duration = ((Date.now() - startTime) / 1000).toFixed(1);
          const modelTag = decision.modelUsed ? ` [${decision.modelUsed}]` : '';
          await options.onLog(
            `> [CLOUD_DETECTED] 雲端視覺識別完成${modelTag}：【${decision.scene_title || decision.scene_type}】 (耗時 ${pass1Duration}s)`
          );
          if (decision.tags && decision.tags.length > 0) {
            await options.onLog(`> [VISION_TAGS] 視覺特徵：#${decision.tags.join(' #')}`);
          }
          if (decision.style_insight) {
            await options.onLog(`> [INSIGHT] ${decision.style_insight}`);
          }
          if (decision.recommended_mood) {
            await options.onLog(`> [MOOD_SUGGEST] 建議風格調性：${decision.recommended_mood}`);
          }
        }

        // 若開啟雙圖閉環覆審 (Pass 2 Critic Refinement)，且有提供渲染器
        try {
          const criticEngine = await AiEngineFactory.getCriticEngine();
          if (criticEngine.enabled && criticEngine.strategy?.refinePhoto && criticEngine.apiKey && options?.renderPreview) {
            if (options.onLog) {
              await options.onLog(`> [AI_CRITIC] 啟動雙圖閉環覆審 (${criticEngine.modelId || criticEngine.strategy.providerName})...`);
            }
            // 傳入已輕量化至 1024px 之純淨 Base64 進行渲染，確保成果圖體積約 120KB-250KB，杜絕龐大 Base64 阻塞網路
            const previewInput = `data:image/jpeg;base64,${cleanBase64}`;
            const renderedBase64 = await options.renderPreview(previewInput, decision);
            if (!renderedBase64 || renderedBase64.trim() === '') {
              if (options.onLog) {
                await options.onLog(`> [AI_CRITIC_NOTICE] 成果圖生成略過，直接採用 Pass 1 決策出圖`);
              }
            } else {
              if (options.onLog) {
                await options.onLog(`> [AI_CRITIC_INSPECT] 雙圖比對審查中 (${criticEngine.modelId || 'Critic'})...`);
              }
              const refinement = await criticEngine.strategy.refinePhoto({
                apiKey: criticEngine.apiKey,
                modelId: criticEngine.modelId,
                originalImageBase64: cleanBase64,
                renderedImageBase64: renderedBase64,
                firstPassDecision: decision,
                exif,
                signal: options.signal,
                stylePreset: options.stylePreset,
                styleKeywords: options.styleKeywords,
                customStylePrompt: options.customStylePrompt
              });

              // 記錄 Pass 1 原始基準值以供差值對照紀錄
              const prevExposure = decision.exposure_compensation;
              const prevShadow = decision.lift_shadows;
              const prevTemp = decision.color_temp ?? 5500;
              const prevContrast = decision.contrast ?? 0.0;
              const prevLut = decision.lut_intensity ?? 0.85;
              const prevClarity = decision.clarity ?? 0.0;
              const prevSharpness = decision.sharpness ?? 0.0;

              // 數值安全融合：Delta 本身不設微小限幅，僅約束總體結果於 UI 滑桿與著色器物理有效範圍內
              const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
              decision.exposure_compensation = parseFloat(clamp(prevExposure + refinement.exposure_delta, -2.0, 2.0).toFixed(2));
              decision.lift_shadows = parseFloat(clamp(prevShadow + refinement.lift_shadows_delta, -0.5, 0.5).toFixed(2));
              decision.color_temp = Math.round(clamp(prevTemp + refinement.color_temp_delta, 2500, 10000));
              decision.contrast = parseFloat(clamp(prevContrast + refinement.contrast_delta, -0.5, 0.5).toFixed(2));
              if (typeof refinement.lut_intensity_delta === 'number') {
                decision.lut_intensity = parseFloat(clamp(prevLut + refinement.lut_intensity_delta, 0.0, 1.0).toFixed(2));
              }
              if (typeof refinement.clarity_delta === 'number') {
                decision.clarity = parseFloat(clamp(prevClarity + refinement.clarity_delta, -1.0, 1.0).toFixed(2));
              }
              if (typeof refinement.sharpness_delta === 'number') {
                decision.sharpness = parseFloat(clamp(prevSharpness + refinement.sharpness_delta, -1.0, 1.0).toFixed(2));
              }

              if (options.onLog) {
                await options.onLog(
                  `> [AI_CRITIC_DONE] 覆審校正完成：${refinement.refine_rationale}`
                );

                const diffLogs: string[] = [];
                const formatDelta = (delta: number, unit = '', decimals = 2) => {
                  const sign = delta > 0 ? '+' : '';
                  return `${sign}${delta.toFixed(decimals)}${unit}`;
                };

                if (Math.abs(refinement.exposure_delta) >= 0.01) {
                  diffLogs.push(`  • 曝光補償: ${formatDelta(refinement.exposure_delta, ' EV')} (${prevExposure >= 0 ? '+' : ''}${prevExposure.toFixed(2)} → ${decision.exposure_compensation >= 0 ? '+' : ''}${decision.exposure_compensation.toFixed(2)})`);
                }
                if (Math.abs(refinement.lift_shadows_delta) >= 0.01) {
                  diffLogs.push(`  • 暗部抬升: ${formatDelta(refinement.lift_shadows_delta)} (${prevShadow >= 0 ? '+' : ''}${prevShadow.toFixed(2)} → ${decision.lift_shadows >= 0 ? '+' : ''}${decision.lift_shadows.toFixed(2)})`);
                }
                if (Math.abs(refinement.contrast_delta) >= 0.01) {
                  diffLogs.push(`  • 對比度: ${formatDelta(refinement.contrast_delta)} (${prevContrast >= 0 ? '+' : ''}${prevContrast.toFixed(2)} → ${decision.contrast >= 0 ? '+' : ''}${decision.contrast.toFixed(2)})`);
                }
                if (Math.abs(refinement.color_temp_delta) >= 10) {
                  diffLogs.push(`  • 色溫: ${refinement.color_temp_delta > 0 ? '+' : ''}${refinement.color_temp_delta} K (${prevTemp}K → ${decision.color_temp}K)`);
                }
                if (typeof refinement.lut_intensity_delta === 'number' && Math.abs(refinement.lut_intensity_delta) >= 0.01) {
                  diffLogs.push(`  • LUT 濃度: ${formatDelta(refinement.lut_intensity_delta)} (${prevLut.toFixed(2)} → ${decision.lut_intensity.toFixed(2)})`);
                }
                if (typeof refinement.clarity_delta === 'number' && Math.abs(refinement.clarity_delta) >= 0.01) {
                  const newClarity = decision.clarity ?? 0.0;
                  diffLogs.push(`  • 清晰度: ${formatDelta(refinement.clarity_delta)} (${prevClarity >= 0 ? '+' : ''}${prevClarity.toFixed(2)} → ${newClarity >= 0 ? '+' : ''}${newClarity.toFixed(2)})`);
                }
                if (typeof refinement.sharpness_delta === 'number' && Math.abs(refinement.sharpness_delta) >= 0.01) {
                  const newSharpness = decision.sharpness ?? 0.0;
                  diffLogs.push(`  • 銳利度: ${formatDelta(refinement.sharpness_delta)} (${prevSharpness >= 0 ? '+' : ''}${prevSharpness.toFixed(2)} → ${newSharpness >= 0 ? '+' : ''}${newSharpness.toFixed(2)})`);
                }

                if (diffLogs.length > 0) {
                  await options.onLog(`> [AI_CRITIC_DIFF] 參數微調明細：\n${diffLogs.join('\n')}`);
                } else {
                  await options.onLog(`> [AI_CRITIC_DIFF] 各項參數已達動態平衡，無需大幅更動。`);
                }
              }
            }
          }
        } catch (criticErr: any) {
          console.warn('[AI_CRITIC] 覆審階段異常（保留 Pass 1 決策繼續）：', criticErr);
          if (options?.onLog) {
            await options.onLog(`> [AI_CRITIC_SKIP] 覆審略過（保持起草參數）：${criticErr.message}`);
          }
        }

        decision.inferenceDurationMs = Date.now() - startTime;
        decision.isFallback = false; // 確信為雲端真實推論
        return decision;
      } catch (err: any) {
        // 若為使用者主動中止，立即拋出，不進行任何重試
        if (options?.signal?.aborted || err?.name === 'AbortError' || err?.message?.includes('手動中止')) {
          throw new Error('使用者已手動中止批次顯影程序');
        }

        const rawMsg: string = err?.message || '雲端服務連線中斷';
        // 判斷是否為暫時性伺服器尖峰壅塞 (503/UNAVAILABLE/high demand) 或配額冷卻 (429) 或短暫網路抖動
        const isTransient = /503|429|UNAVAILABLE|high demand|rate limit|fetch failed|連線異常|超時/i.test(rawMsg);

        if (isTransient && attempt < maxRetries) {
          attempt++;
          const delaySec = attempt === 1 ? 2.5 : 4.5;
          const retryMsg = `> [RETRY] 雲端伺服器尖峰壅塞 (${rawMsg.includes('503') ? 'HTTP 503' : '暫時壅塞'})，等待 ${delaySec}s 自動重試 (${attempt}/${maxRetries})...`;
          console.warn(`[AI_VISION] ${retryMsg} [${modelId}]`);

          if (options?.onLog) {
            await options.onLog(retryMsg);
          }

          // 指數退避等待，支援 signal 隨時喚醒中斷
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => resolve(), delaySec * 1000);
            if (options?.signal) {
              const onAbort = () => {
                clearTimeout(timer);
                reject(new Error('使用者已手動中止批次顯影程序'));
              };
              options.signal.addEventListener('abort', onAbort, { once: true });
            }
          });

          continue; // 進入下一輪重試
        }

        console.error(`[AI_VISION] 雲端推論失敗 (${strategy.providerName} / ${modelId}):`, err);
        // 重試耗盡或非暫時性錯誤（例如 400 Bad Request、401 Invalid Key），如實拋出真實錯誤
        throw new Error(`雲端推論失敗 [${modelId}]：${rawMsg}`);
      }
    }

    throw new Error(`雲端推論失敗 [${modelId}]：重試 ${maxRetries} 次後端點仍處於壅塞狀態`);
  }

  /**
   * 依據使用者指派之文字策略執行極速社群文案與 IPTC 標籤生成 (Strategy Pattern)
   */
  public static async generateGroqCopywriting(payload: CopywritingPayload): Promise<CopywritingResult> {
    const { strategy, modelId, apiKey } = await AiEngineFactory.getCopywritingEngine();
    return await strategy.generateCopywriting({
      apiKey,
      modelId,
      payload,
      timeoutMs: 15000
    });
  }
}



