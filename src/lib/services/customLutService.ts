/**
 * ═══════════════════════════════════════════════════════════════════
 * 【自訂 3D LUT (Custom Cube LUT) 儲存、色彩特徵與分析服務】
 * 
 * 核心設計意圖：
 * 1. 零外部依賴：採用瀏覽器原生 IndexedDB 實現高容量本地持久化，徹底避免 localStorage 5MB 限制。
 * 2. 語意光學特徵橋接：儲存 .cube 數值同時綁定供 AI 閱讀之光學特徵 Directive。
 * 3. 純數學色相萃取：自動從 3D 空間點雲中萃取具代表性的色彩傾向（Accent Color），免去手動配色負擔。
 * 4. 雙向相容：完美相容標準 Adobe / DaVinci Resolve .cube 規格（17x17x17, 33x33x33, 65x65x65）。
 * ═══════════════════════════════════════════════════════════════════
 */

export interface CustomLutRecord {
  id: string; // 唯一識別碼，格式如 "custom_profile_1730889200000"
  name: string; // 使用者定義名稱，例如 "Kodak Gold 200"
  cubeContent: string; // .cube 原始字串內容
  lutSize: number; // 從 .cube 解析出的尺寸，如 33
  directiveDescription: string; // 供 AI Prompt 閱讀之英文光學特徵指令
  recommendedScene: string; // 適用場景說明（繁體中文）
  createdAt: number; // 建立時間戳記
  accent?: string; // 風格代表色 Hex，例如 "#2e7d32"
  lutIntensityDefault?: number; // 預設套用強度 0.0 ~ 1.0 (預設 0.85)
}

export interface ParsedCubeInfo {
  title?: string;
  lutSize: number;
  dataPointsCount: number;
  isValid: boolean;
  suggestedPrompt: string;
  accent: string;
  suggestedLutIntensity: number;
}

const DB_NAME = 'slipknot_custom_luts_db';
const STORE_NAME = 'custom_luts';
const DB_VERSION = 1;

/**
 * 簡易封裝原生 IndexedDB 實體
 */
function openCustomLutDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not available in current environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 將 HSL 轉為 Hex 色碼 (#rrggbb)
 */
function hslToHex(hDeg: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((hDeg % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;

  if (hp >= 0 && hp < 1) { r = c; g = x; }
  else if (hp >= 1 && hp < 2) { r = x; g = c; }
  else if (hp >= 2 && hp < 3) { g = c; b = x; }
  else if (hp >= 3 && hp < 4) { g = x; b = c; }
  else if (hp >= 4 && hp < 5) { r = x; b = c; }
  else if (hp >= 5 && hp < 6) { r = c; b = x; }

  const m = l - c / 2;
  const to255 = (val: number) => Math.round((val + m) * 255).toString(16).padStart(2, '0');
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}

/**
 * 純數學色彩科學：從 3D LUT 中性灰軸（Neutral Axis Drift）精準計算光學色彩偏轉代表色
 * 嚴禁硬編碼關鍵字，純依據底片 Toe 與中間調之 RGB 空間向量差值計算
 */
export function extractDominantAccentColor(rgbValues: number[], lutSize: number = 33): string {
  if (!rgbValues || rgbValues.length < lutSize * lutSize * lutSize * 3) {
    return '#8e929b';
  }

  // 取中性灰階軸（r == g == b）從暗部 Toe 到中間調（15% ~ 65% 階調）之偏移向量
  let sumDr = 0;
  let sumDg = 0;
  let sumDb = 0;
  let count = 0;

  const startIdx = Math.max(1, Math.floor(lutSize * 0.15));
  const endIdx = Math.min(lutSize - 2, Math.floor(lutSize * 0.65));

  for (let i = startIdx; i <= endIdx; i++) {
    const inV = i / (lutSize - 1);
    // 標準 3D .cube 順序：idx = (r + g * size + b * size * size) * 3
    const arrayIdx = (i + i * lutSize + i * lutSize * lutSize) * 3;
    const outR = rgbValues[arrayIdx];
    const outG = rgbValues[arrayIdx + 1];
    const outB = rgbValues[arrayIdx + 2];

    if (typeof outR === 'number' && !isNaN(outR)) {
      sumDr += (outR - inV);
      sumDg += (outG - inV);
      sumDb += (outB - inV);
      count++;
    }
  }

  if (count === 0) return '#8e929b';

  const avgDr = sumDr / count;
  const avgDg = sumDg / count;
  const avgDb = sumDb / count;

  const minD = Math.min(avgDr, avgDg, avgDb);
  const maxD = Math.max(avgDr, avgDg, avgDb);
  const spread = maxD - minD;

  // 若中性灰軸三通道漂移均勻（無色相偏轉，如純線性黑白或中性真實直出），輸出中性石板灰
  if (spread < 0.0035) {
    return '#8e929b';
  }

  // 依 RGB 向量差值換算為標準色相角（Hue 0° ~ 360°）
  let hue = 0;
  if (maxD === avgDr) {
    hue = 60 * (((avgDg - avgDb) / spread) % 6);
  } else if (maxD === avgDg) {
    hue = 60 * ((avgDb - avgDr) / spread + 2);
  } else {
    hue = 60 * ((avgDr - avgDg) / spread + 4);
  }
  if (hue < 0) hue += 360;

  // 換算為適配暗房卡片的電影級飽和度與明度（s: 0.68, l: 0.40）
  return hslToHex(hue, 0.68, 0.40);
}

/**
 * 解析 .cube 檔案標頭與內容特徵（包含自動代表色與建議強度）
 */
export function parseCubeMetadata(cubeText: string, fallbackName: string = 'Custom LUT'): ParsedCubeInfo {
  const lines = cubeText.split(/\r?\n/);
  let title = fallbackName;
  let lutSize = 33;
  let dataPointsCount = 0;
  const rgbValues: number[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('TITLE')) {
      const rawTitle = trimmed.substring(5).trim().replace(/^["']|["']$/g, '');
      if (rawTitle) title = rawTitle;
    } else if (trimmed.startsWith('LUT_3D_SIZE')) {
      const sizeParsed = parseInt(trimmed.substring(11).trim(), 10);
      if (!isNaN(sizeParsed) && sizeParsed >= 2) {
        lutSize = sizeParsed;
      }
    } else {
      const parts = trimmed.split(/\s+/);
      if (parts.length === 3) {
        const n0 = parseFloat(parts[0]);
        const n1 = parseFloat(parts[1]);
        const n2 = parseFloat(parts[2]);
        if (!isNaN(n0) && !isNaN(n1) && !isNaN(n2)) {
          rgbValues.push(n0, n1, n2);
          dataPointsCount++;
        }
      }
    }
  }

  const expectedCount = lutSize * lutSize * lutSize;
  const isValid = dataPointsCount > 0 && Math.abs(dataPointsCount - expectedCount) <= 2;

  // 預設建議的光學特徵敘述（遵循光學客觀風格）
  const suggestedPrompt = `User-imported custom 3D LUT (${title}): custom volumetric color transformation with distinct tonal density and calibrated optical response`;

  // 自動萃取風格代表色（純依據灰階軸暗部與中間調之色偏向量差值計算）
  const accent = extractDominantAccentColor(rgbValues, lutSize);

  return {
    title,
    lutSize,
    dataPointsCount,
    isValid,
    suggestedPrompt,
    accent,
    suggestedLutIntensity: 0.85, // 遵循底片 LUT 標準 85% 預設比例
  };
}

export class CustomLutService {
  /**
   * 取得所有已儲存的自訂 LUT
   */
  public static async getAllCustomLuts(): Promise<CustomLutRecord[]> {
    try {
      const db = await openCustomLutDatabase();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          const results = (req.result || []) as CustomLutRecord[];
          // 依建立時間排序
          results.sort((a, b) => b.createdAt - a.createdAt);
          resolve(results);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('Failed to load custom LUTs from IndexedDB, returning empty array:', err);
      return [];
    }
  }

  /**
   * 新增或更新自訂 LUT
   */
  public static async saveCustomLut(lut: CustomLutRecord): Promise<void> {
    const db = await openCustomLutDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(lut);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * 依 ID 刪除自訂 LUT
   */
  public static async deleteCustomLut(id: string): Promise<void> {
    const db = await openCustomLutDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
