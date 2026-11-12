/**
 * 3D LUT 風格典藏庫狀態管理模組 (LUT Catalog Store)
 * 負責統一管理內建 3D LUT 典藏、使用者自訂 .cube 紀錄、以及衍生給暗房與 AI 面板使用的風格選單。
 * 遵循 Svelte 5 Runes ($state, $derived) 響應式規範。
 */

import {
  CustomLutService,
  type CustomLutRecord,
} from "$lib/services/customLutService";
import {
  BUILTIN_PROFILE_CATALOG,
  BUILTIN_STYLE_GRADING_PRESETS,
  type ProfileCatalogItem,
  type StyleGradingPresetItem,
} from "$lib/types/profile";

export class LutCatalogStore {
  // 內建 3D LUT 清單與風格預設
  readonly builtinProfiles: ProfileCatalogItem[] = BUILTIN_PROFILE_CATALOG;
  readonly builtinStyleGradingPresets: StyleGradingPresetItem[] =
    BUILTIN_STYLE_GRADING_PRESETS;

  // 使用者自訂 3D LUT 清單
  userCustomLuts = $state<CustomLutRecord[]>([]);

  // 合併內建與自訂 LUT 供典藏庫與暗房選擇器使用
  allProfiles = $derived<ProfileCatalogItem[]>([
    ...this.builtinProfiles,
    ...this.userCustomLuts.map((lut) => ({
      id: lut.id,
      title: lut.name,
      tone: lut.directiveDescription,
      badge: "CUSTOM",
      accent: lut.accent || "#bfa15f",
      evDefault: 0.0,
      contrastDefault: 0.0,
      highlightsDefault: 0.0,
      shadowsDefault: 0.0,
      fadeDefault: 0.0,
      cyanSkyDefault: 0.0,
      foliageDefault: 0.0,
      lutIntensityDefault: lut.lutIntensityDefault ?? 0.85,
      clarityDefault: 0.0,
      sharpnessDefault: 0.0,
      recommendedScene: lut.recommendedScene || "使用者自訂風格",
      isCustom: true,
      rawCustomLut: lut,
    })),
  ]);

  // 合併內建與自訂風格卡片供 AI 風格選擇器使用
  allStyleGradingPresets = $derived<StyleGradingPresetItem[]>([
    ...this.builtinStyleGradingPresets,
    ...this.userCustomLuts.map((lut) => ({
      key: lut.id as any,
      badge: "CUSTOM",
      shortLabel: lut.name,
      title: `${lut.name} · 自訂風格`,
      subtitle: `${lut.directiveDescription} (.cube)`,
      accent: lut.accent || "#bfa15f",
      profileId: lut.id,
    })),
  ]);

  /**
   * 從 IndexedDB 載入所有使用者自訂 3D LUT
   */
  async loadCustomLuts(): Promise<CustomLutRecord[]> {
    const luts = await CustomLutService.getAllCustomLuts();
    this.userCustomLuts = luts;
    return luts;
  }

  /**
   * 匯入新的自訂 LUT 並刷新清單
   */
  async importCustomLut(lut: CustomLutRecord): Promise<CustomLutRecord[]> {
    await CustomLutService.saveCustomLut(lut);
    this.userCustomLuts = await CustomLutService.getAllCustomLuts();
    return this.userCustomLuts;
  }

  /**
   * 更新現有自訂 LUT 並刷新清單
   */
  async updateCustomLut(lut: CustomLutRecord): Promise<CustomLutRecord[]> {
    await CustomLutService.saveCustomLut(lut);
    this.userCustomLuts = await CustomLutService.getAllCustomLuts();
    return this.userCustomLuts;
  }

  /**
   * 刪除指定自訂 LUT 並刷新清單
   */
  async deleteCustomLut(id: string): Promise<CustomLutRecord[]> {
    await CustomLutService.deleteCustomLut(id);
    this.userCustomLuts = await CustomLutService.getAllCustomLuts();
    return this.userCustomLuts;
  }
}

export const lutCatalog = new LutCatalogStore();

