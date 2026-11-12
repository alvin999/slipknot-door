/**
 * 調色意境關鍵字自訂與儲存管理模組 (Style Keyword Catalog Store)
 * 負責統一管理內建關鍵字（含使用者的覆寫與隱藏設定）及使用者自訂關鍵字，
 * 僅於明確執行儲存／刪除／還原等管理操作時寫入 localStorage。
 */

import {
  STYLE_KEYWORD_ENTRIES,
  type StyleKeywordEntry,
} from "$lib/services/ai/styleDirectives";
import type { StyleKeywordId } from "$lib/services/ai/types";
import { readLocalJson, writeLocalJson } from "$lib/utils/panelStorage";

export const STYLE_KEYWORDS_STORAGE_KEY = "slipknot_style_keywords_v1";

export interface BuiltinKeywordOverride {
  shortTag?: string;
  tooltip?: string;
  promptEnglish?: string;
  hidden?: boolean;
  updatedAt?: number;
}

interface PersistedKeywordCatalog {
  version: number;
  customKeywords: StyleKeywordEntry[];
  builtinOverrides: Record<string, BuiltinKeywordOverride>;
  order: StyleKeywordId[];
}

const DEFAULT_PERSISTED_CATALOG: PersistedKeywordCatalog = {
  version: 1,
  customKeywords: [],
  builtinOverrides: {},
  order: [],
};

function sanitizeCustomKeyword(raw: unknown): StyleKeywordEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  const shortTag = typeof obj.shortTag === "string" ? obj.shortTag.trim() : "";
  const promptEnglish =
    typeof obj.promptEnglish === "string" ? obj.promptEnglish.trim() : "";
  if (!id || !shortTag || !promptEnglish) return null;

  const tooltip = typeof obj.tooltip === "string" ? obj.tooltip.trim() : "";
  const label =
    typeof obj.label === "string" && obj.label.trim()
      ? obj.label.trim()
      : shortTag;

  return {
    id,
    label,
    shortTag,
    tooltip,
    promptEnglish,
    isCustom: true,
    createdAt: typeof obj.createdAt === "number" ? obj.createdAt : Date.now(),
    updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : undefined,
  };
}

function loadInitialCatalog(): PersistedKeywordCatalog {
  const loaded = readLocalJson<PersistedKeywordCatalog>(
    STYLE_KEYWORDS_STORAGE_KEY,
    DEFAULT_PERSISTED_CATALOG,
  );
  const customKeywords = Array.isArray(loaded.customKeywords)
    ? loaded.customKeywords
        .map(sanitizeCustomKeyword)
        .filter((item): item is StyleKeywordEntry => item !== null)
    : [];

  const builtinOverrides: Record<string, BuiltinKeywordOverride> = {};
  if (
    loaded.builtinOverrides &&
    typeof loaded.builtinOverrides === "object" &&
    !Array.isArray(loaded.builtinOverrides)
  ) {
    for (const [id, ov] of Object.entries(loaded.builtinOverrides)) {
      if (!ov || typeof ov !== "object") continue;
      if (!STYLE_KEYWORD_ENTRIES.some((b) => b.id === id)) continue;
      builtinOverrides[id] = {
        ...(typeof ov.shortTag === "string" ? { shortTag: ov.shortTag } : {}),
        ...(typeof ov.tooltip === "string" ? { tooltip: ov.tooltip } : {}),
        ...(typeof ov.promptEnglish === "string"
          ? { promptEnglish: ov.promptEnglish }
          : {}),
        ...(typeof ov.hidden === "boolean" ? { hidden: ov.hidden } : {}),
        ...(typeof ov.updatedAt === "number" ? { updatedAt: ov.updatedAt } : {}),
      };
    }
  }

  const order = Array.isArray(loaded.order)
    ? loaded.order.filter((id): id is StyleKeywordId => typeof id === "string")
    : [];

  return {
    version: 1,
    customKeywords,
    builtinOverrides,
    order,
  };
}

function reconcileOrder(
  savedOrder: StyleKeywordId[],
  customKeywords: StyleKeywordEntry[],
): StyleKeywordId[] {
  const validIds = new Set<StyleKeywordId>([
    ...STYLE_KEYWORD_ENTRIES.map((k) => k.id),
    ...customKeywords.map((k) => k.id),
  ]);

  const result: StyleKeywordId[] = [];
  const seen = new Set<StyleKeywordId>();

  for (const id of savedOrder) {
    if (validIds.has(id) && !seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }
  for (const id of validIds) {
    if (!seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }
  return result;
}

export class StyleKeywordCatalogStore {
  private customKeywords = $state<StyleKeywordEntry[]>([]);
  private builtinOverrides = $state<Record<string, BuiltinKeywordOverride>>({});
  private order = $state<StyleKeywordId[]>([]);

  constructor() {
    const initial = loadInitialCatalog();
    this.customKeywords = initial.customKeywords;
    this.builtinOverrides = initial.builtinOverrides;
    this.order = reconcileOrder(initial.order, initial.customKeywords);
  }

  /**
   * 合併內建與自訂關鍵字，並依使用者排序排列
   */
  allKeywords = $derived.by<StyleKeywordEntry[]>(() => {
    const entryMap = new Map<StyleKeywordId, StyleKeywordEntry>();

    for (const builtin of STYLE_KEYWORD_ENTRIES) {
      const ov = this.builtinOverrides[builtin.id];
      const shortTag = ov?.shortTag?.trim() || builtin.shortTag;
      const tooltip =
        ov?.tooltip !== undefined ? ov.tooltip.trim() : builtin.tooltip;
      const promptEnglish = ov?.promptEnglish?.trim() || builtin.promptEnglish;
      const isModified =
        shortTag !== builtin.shortTag ||
        tooltip !== builtin.tooltip ||
        promptEnglish !== builtin.promptEnglish;

      entryMap.set(builtin.id, {
        ...builtin,
        label: isModified ? shortTag : builtin.label,
        shortTag,
        tooltip,
        promptEnglish,
        isCustom: false,
        isModified,
        hidden: Boolean(ov?.hidden),
        updatedAt: ov?.updatedAt,
      });
    }

    for (const custom of this.customKeywords) {
      entryMap.set(custom.id, { ...custom, isCustom: true });
    }

    const orderedIds = reconcileOrder(this.order, this.customKeywords);
    return orderedIds
      .map((id) => entryMap.get(id))
      .filter((entry): entry is StyleKeywordEntry => entry !== undefined);
  });

  /**
   * 僅包含未隱藏的關鍵字（供面板晶片網格渲染）
   */
  visibleKeywords = $derived<StyleKeywordEntry[]>(
    this.allKeywords.filter((k) => !k.hidden),
  );

  customCount = $derived<number>(this.customKeywords.length);

  modifiedOrHiddenBuiltinCount = $derived<number>(
    this.allKeywords.filter((k) => !k.isCustom && (k.isModified || k.hidden))
      .length,
  );

  private persist(): void {
    const payload: PersistedKeywordCatalog = {
      version: 1,
      customKeywords: this.customKeywords,
      builtinOverrides: this.builtinOverrides,
      order: reconcileOrder(this.order, this.customKeywords),
    };
    writeLocalJson(STYLE_KEYWORDS_STORAGE_KEY, payload);
  }

  findById(id: StyleKeywordId): StyleKeywordEntry | undefined {
    return this.allKeywords.find((k) => k.id === id);
  }

  getBuiltinDefault(id: StyleKeywordId): StyleKeywordEntry | undefined {
    return STYLE_KEYWORD_ENTRIES.find((k) => k.id === id);
  }

  isBuiltinId(id: StyleKeywordId): boolean {
    return STYLE_KEYWORD_ENTRIES.some((k) => k.id === id);
  }

  /**
   * 新增自訂關鍵字並寫入 localStorage
   */
  addCustomKeyword(input: {
    shortTag: string;
    tooltip?: string;
    promptEnglish: string;
  }): StyleKeywordEntry | null {
    const shortTag = input.shortTag.trim();
    const promptEnglish = input.promptEnglish.trim();
    const tooltip = (input.tooltip || "").trim();
    if (!shortTag || !promptEnglish) return null;

    const now = Date.now();
    const entry: StyleKeywordEntry = {
      id: `custom_kw_${now}_${Math.random().toString(36).slice(2, 6)}`,
      label: shortTag,
      shortTag,
      tooltip,
      promptEnglish,
      isCustom: true,
      createdAt: now,
      updatedAt: now,
    };

    this.customKeywords = [...this.customKeywords, entry];
    this.order = reconcileOrder(
      [...this.order, entry.id],
      this.customKeywords,
    );
    this.persist();
    return entry;
  }

  /**
   * 編修自訂或內建關鍵字並明確寫入 localStorage
   */
  updateKeyword(
    id: StyleKeywordId,
    patch: {
      shortTag?: string;
      tooltip?: string;
      promptEnglish?: string;
      hidden?: boolean;
    },
  ): boolean {
    const builtin = this.getBuiltinDefault(id);
    if (builtin) {
      const current = this.builtinOverrides[id] || {};
      const nextShortTag =
        patch.shortTag !== undefined
          ? patch.shortTag.trim() || builtin.shortTag
          : current.shortTag ?? builtin.shortTag;
      const nextTooltip =
        patch.tooltip !== undefined
          ? patch.tooltip.trim()
          : current.tooltip ?? builtin.tooltip;
      const nextPrompt =
        patch.promptEnglish !== undefined
          ? patch.promptEnglish.trim() || builtin.promptEnglish
          : current.promptEnglish ?? builtin.promptEnglish;
      const nextHidden =
        patch.hidden !== undefined ? patch.hidden : Boolean(current.hidden);

      const nextOverrides = { ...this.builtinOverrides };
      const isBackToDefault =
        nextShortTag === builtin.shortTag &&
        nextTooltip === builtin.tooltip &&
        nextPrompt === builtin.promptEnglish &&
        !nextHidden;

      if (isBackToDefault) {
        delete nextOverrides[id];
      } else {
        nextOverrides[id] = {
          ...(nextShortTag !== builtin.shortTag
            ? { shortTag: nextShortTag }
            : {}),
          ...(nextTooltip !== builtin.tooltip ? { tooltip: nextTooltip } : {}),
          ...(nextPrompt !== builtin.promptEnglish
            ? { promptEnglish: nextPrompt }
            : {}),
          ...(nextHidden ? { hidden: true } : {}),
          updatedAt: Date.now(),
        };
      }

      this.builtinOverrides = nextOverrides;
      this.persist();
      return true;
    }

    const idx = this.customKeywords.findIndex((k) => k.id === id);
    if (idx === -1) return false;

    const prev = this.customKeywords[idx];
    const nextShortTag =
      patch.shortTag !== undefined
        ? patch.shortTag.trim() || prev.shortTag
        : prev.shortTag;
    const nextPrompt =
      patch.promptEnglish !== undefined
        ? patch.promptEnglish.trim() || prev.promptEnglish
        : prev.promptEnglish;
    const nextTooltip =
      patch.tooltip !== undefined ? patch.tooltip.trim() : prev.tooltip;

    const updated: StyleKeywordEntry = {
      ...prev,
      label: nextShortTag,
      shortTag: nextShortTag,
      tooltip: nextTooltip,
      promptEnglish: nextPrompt,
      updatedAt: Date.now(),
    };

    const nextList = [...this.customKeywords];
    nextList[idx] = updated;
    this.customKeywords = nextList;
    this.persist();
    return true;
  }

  /**
   * 刪除自訂關鍵字並寫入 localStorage
   */
  deleteCustomKeyword(id: StyleKeywordId): boolean {
    const exists = this.customKeywords.some((k) => k.id === id);
    if (!exists) return false;
    this.customKeywords = this.customKeywords.filter((k) => k.id !== id);
    this.order = this.order.filter((item) => item !== id);
    this.persist();
    return true;
  }

  /**
   * 切換內建關鍵字的隱藏狀態
   */
  toggleHideBuiltin(id: StyleKeywordId): boolean {
    const builtin = this.getBuiltinDefault(id);
    if (!builtin) return false;
    const currentHidden = Boolean(this.builtinOverrides[id]?.hidden);
    return this.updateKeyword(id, { hidden: !currentHidden });
  }

  /**
   * 還原單筆內建關鍵字為原廠預設值（包含取消隱藏）
   */
  resetBuiltinKeyword(id: StyleKeywordId): boolean {
    if (!this.builtinOverrides[id]) return false;
    const nextOverrides = { ...this.builtinOverrides };
    delete nextOverrides[id];
    this.builtinOverrides = nextOverrides;
    this.persist();
    return true;
  }

  /**
   * 還原所有內建關鍵字為原廠預設值並重置順序
   */
  resetAllBuiltins(): void {
    this.builtinOverrides = {};
    this.order = reconcileOrder([], this.customKeywords);
    this.persist();
  }

  /**
   * 調整關鍵字顯示順序（僅在同組範圍或整體順序中移動）
   */
  moveKeywordOrder(id: StyleKeywordId, direction: "up" | "down"): boolean {
    const currentList = reconcileOrder(this.order, this.customKeywords);
    const idx = currentList.indexOf(id);
    if (idx === -1) return false;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentList.length) return false;

    const nextOrder = [...currentList];
    const [moved] = nextOrder.splice(idx, 1);
    nextOrder.splice(targetIdx, 0, moved);
    this.order = nextOrder;
    this.persist();
    return true;
  }
}

export const styleKeywordCatalog = new StyleKeywordCatalogStore();

