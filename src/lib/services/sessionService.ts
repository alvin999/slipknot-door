/**
 * Session Persistence Service
 * Automatically saves and restores photo curation state (flagged, appliedProfile, tuning, crop, aiDecision)
 * across browser refreshes and application restarts.
 */

export interface PhotoSessionRecord {
  filename: string;
  flagged?: boolean;
  appliedProfile?: string;
  tuning?: {
    exposure: number;
    contrast: number;
    shadows?: number;
    lutIntensity: number;
    colorTemp: number;
    tint: number;
    clarity?: number;
    sharpness?: number;
  };
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    keystoneV?: number;
    keystoneH?: number;
    aspectRatio?: any;
    flipH?: boolean;
    flipV?: boolean;
    rationale?: string;
  };
  aiDecision?: any;
  sceneTag?: string;
}

export class SessionService {
  private static STORAGE_PREFIX = 'slipknot_session_';
  private static saveTimeout: ReturnType<typeof setTimeout> | null = null;

  private static getStorageKey(dirName: string): string {
    const clean = (dirName || 'default').trim().replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
    return `${this.STORAGE_PREFIX}${clean}`;
  }

  /**
   * Save session state for modified or flagged photos in a directory with debounce
   */
  public static debouncedSaveSession(dirName: string, photos: any[]): void {
    if (typeof localStorage === 'undefined' || !dirName || !Array.isArray(photos)) return;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveSessionImmediate(dirName, photos);
      this.saveTimeout = null;
    }, 400);
  }

  /**
   * Immediately save session state
   */
  public static saveSessionImmediate(dirName: string, photos: any[]): void {
    if (typeof localStorage === 'undefined' || !dirName || !Array.isArray(photos)) return;

    try {
      // Only persist photos that have meaningful user edits, flags, or AI decisions
      const records: Record<string, PhotoSessionRecord> = {};
      let hasAny = false;

      for (const p of photos) {
        const isModified = p.flagged ||
          (p.appliedProfile && p.appliedProfile !== 'Profile_00_StandardNatural') ||
          p.tuning !== undefined ||
          p.crop !== undefined ||
          p.aiDecision !== undefined;

        if (isModified && p.filename) {
          records[p.filename] = {
            filename: p.filename,
            flagged: p.flagged,
            appliedProfile: p.appliedProfile,
            tuning: p.tuning ? { ...p.tuning } : undefined,
            crop: p.crop ? { ...p.crop } : undefined,
            aiDecision: p.aiDecision ? { ...p.aiDecision } : undefined,
            sceneTag: p.sceneTag,
          };
          hasAny = true;
        }
      }

      const key = this.getStorageKey(dirName);
      if (hasAny) {
        localStorage.setItem(key, JSON.stringify({
          updatedAt: Date.now(),
          records,
        }));
      } else {
        localStorage.removeItem(key);
      }
    } catch (err) {
      console.warn('[SessionService] 儲存相卷進度快取失敗:', err);
    }
  }

  /**
   * Restore saved session state onto loaded photo items
   */
  public static restoreSession(dirName: string, photos: any[]): number {
    if (typeof localStorage === 'undefined' || !dirName || !Array.isArray(photos)) return 0;

    try {
      const key = this.getStorageKey(dirName);
      const data = localStorage.getItem(key);
      if (!data) return 0;

      const parsed = JSON.parse(data);
      if (!parsed || !parsed.records) return 0;

      const records: Record<string, PhotoSessionRecord> = parsed.records;
      let restoredCount = 0;

      for (const p of photos) {
        const rec = records[p.filename];
        if (rec) {
          if (rec.flagged !== undefined) p.flagged = rec.flagged;
          if (rec.appliedProfile) p.appliedProfile = rec.appliedProfile;
          if (rec.tuning) p.tuning = { ...rec.tuning };
          if (rec.crop) p.crop = { ...rec.crop };
          if (rec.aiDecision) p.aiDecision = { ...rec.aiDecision };
          if (rec.sceneTag) p.sceneTag = rec.sceneTag;
          restoredCount++;
        }
      }

      return restoredCount;
    } catch (err) {
      console.warn('[SessionService] 恢復相卷進度快取失敗:', err);
      return 0;
    }
  }

  /**
   * Clear session cache for a directory
   */
  public static clearSession(dirName: string): void {
    if (typeof localStorage === 'undefined' || !dirName) return;
    try {
      localStorage.removeItem(this.getStorageKey(dirName));
    } catch {
      // ignore
    }
  }
}
