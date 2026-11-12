<script lang="ts">
  import { onMount } from "svelte";
  import { AiSceneService } from "$lib/services/aiSceneService";
  import {
    ExportService,
    getExportExtension,
    type ExportFormat,
  } from "$lib/services/exportService";
  import { KeyVaultService } from "$lib/services/keyVaultService";
  import type { DirectoryPlanResult } from "$lib/services/ai/types";

  export interface PhotoPlateItem {
    id: string;
    frameNo: string;
    filename: string;
    camera: string;
    lens?: string;
    focalLength?: string;
    iso?: number;
    shutter?: string;
    aperture?: string;
    sceneTag?: string;
    appliedProfile: string;
    selected: boolean;
    flagged?: boolean;
    thumbnail?: string;
    gradedThumbnail?: string;
    tuning?: any;
    crop?: any;
    fileHandle?: File;
  }

  export type ExportScope = "picked" | "edited" | "selected" | "all";
  export type ExportPresetId = "social" | "high" | "archive" | "custom";
  export type ExportSizePreset =
    | "original"
    | "2048"
    | "1920"
    | "1080"
    | "custom";

  export interface ExportPipelineOptions {
    targetDir: string;
    autoDateSubdir: boolean;
    backupRawFiles: boolean;
    directoryPlan?: DirectoryPlanResult;
    format: ExportFormat;
    quality: number;
    maxLongEdge: number | null;
    colorSpace: "sRGB" | "DisplayP3" | "ProPhotoRGB";
    preserveExif: boolean;
  }

  interface Props {
    photos: PhotoPlateItem[];
    activePhoto?: PhotoPlateItem | null;
    exportMode: "modeA" | "modeB";
    isExporting: boolean;
    exportProgress: number;
    exportNotice: string;
    aiVisionTags?: string[];
    aiSceneTitle?: string;
    onSetExportMode: (m: "modeA" | "modeB") => void;
    onTriggerExport: (
      subset?: PhotoPlateItem[],
      options?: ExportPipelineOptions,
    ) => void;
    onGoToRetouch?: () => void;
    onGoToCatalog?: () => void;
  }

  let {
    photos = [],
    activePhoto = null,
    exportMode,
    isExporting,
    exportProgress,
    exportNotice,
    aiVisionTags = [],
    aiSceneTitle = "",
    onSetExportMode,
    onTriggerExport,
    onGoToRetouch,
    onGoToCatalog,
  }: Props = $props();

  let userChoseScope = $state(false);
  let exportScope = $state<ExportScope>("picked");
  let previewLayout = $state<"strip" | "grid">("strip");

  function isPhotoEdited(p: PhotoPlateItem): boolean {
    const hasCustomProfile =
      p.appliedProfile && p.appliedProfile !== "Profile_00_StandardNatural";
    const hasTuning =
      p.tuning &&
      (p.tuning.exposure !== 0 ||
        p.tuning.contrast !== 0 ||
        p.tuning.lutIntensity !== 1 ||
        (p.tuning.clarity && p.tuning.clarity !== 0) ||
        (p.tuning.sharpness && p.tuning.sharpness !== 0) ||
        (p.tuning.colorDensity && p.tuning.colorDensity !== 0) ||
        (p.tuning.shadowTintAmount && p.tuning.shadowTintAmount !== 0) ||
        (p.tuning.highlightTintAmount && p.tuning.highlightTintAmount !== 0) ||
        (p.tuning.halation && p.tuning.halation !== 0) ||
        (typeof p.tuning.grainAmount === "number" &&
          Math.abs(p.tuning.grainAmount - 0.15) > 0.001) ||
        (p.tuning.highlights && p.tuning.highlights !== 0) ||
        (p.tuning.blacks && p.tuning.blacks !== 0) ||
        (p.tuning.vibrance && p.tuning.vibrance !== 0) ||
        (p.tuning.vignette && p.tuning.vignette !== 0) ||
        (p.tuning.hsl &&
          Object.values(p.tuning.hsl).some(
            (b: any) => b && (b.hue !== 0 || b.sat !== 0 || b.lum !== 0),
          )));
    const hasCrop =
      p.crop &&
      (p.crop.width < 1 || p.crop.height < 1 || p.crop.rotation !== 0);
    return Boolean(hasCustomProfile || hasTuning || hasCrop);
  }

  let pickedPhotos = $derived(photos.filter((p) => p.flagged));
  let editedPhotos = $derived(photos.filter((p) => isPhotoEdited(p)));
  let selectedPhotos = $derived(
    activePhoto ? [activePhoto] : photos.length > 0 ? [photos[0]] : [],
  );
  let allPhotos = $derived(photos);

  // 智慧預設範疇：優先順序 Picked ➔ Edited ➔ All
  $effect(() => {
    if (!userChoseScope) {
      if (pickedPhotos.length > 0) {
        exportScope = "picked";
      } else if (editedPhotos.length > 0) {
        exportScope = "edited";
      } else {
        exportScope = "all";
      }
    }
  });

  let effectivePhotos = $derived<PhotoPlateItem[]>(
    exportScope === "picked"
      ? pickedPhotos
      : exportScope === "edited"
        ? editedPhotos
        : exportScope === "selected"
          ? selectedPhotos
          : allPhotos,
  );

  let excludedPhotoIds = $state<Set<string>>(new Set());

  $effect(() => {
    const _scope = exportScope;
    excludedPhotoIds = new Set();
  });

  let finalExportPhotos = $derived<PhotoPlateItem[]>(
    effectivePhotos.filter((p) => !excludedPhotoIds.has(p.id)),
  );

  function togglePhotoInclusion(id: string) {
    const next = new Set(excludedPhotoIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    excludedPhotoIds = next;
  }

  function selectAllInQueue() {
    excludedPhotoIds = new Set();
  }

  function deselectAllInQueue() {
    excludedPhotoIds = new Set(effectivePhotos.map((p) => p.id));
  }

  const STORAGE_KEY_DIR = "slipknot_export_target_dir";
  const STORAGE_KEY_DATE_SUBDIR = "slipknot_export_date_subdir";
  const STORAGE_KEY_BACKUP_RAW = "slipknot_export_backup_raw";
  const STORAGE_KEY_PRESET = "slipknot_export_preset";
  const STORAGE_KEY_FORMAT = "slipknot_export_format";
  const STORAGE_KEY_QUALITY = "slipknot_export_quality";
  const STORAGE_KEY_SIZE_PRESET = "slipknot_export_size_preset";
  const STORAGE_KEY_CUSTOM_EDGE = "slipknot_export_custom_edge";
  const STORAGE_KEY_COLOR_SPACE = "slipknot_export_color_space";
  const STORAGE_KEY_PRESERVE_EXIF = "slipknot_export_preserve_exif";

  const getStored = (key: string): string | null =>
    typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;

  const initialDir = getStored(STORAGE_KEY_DIR) || "./Exports";
  const initialDateSubdir = getStored(STORAGE_KEY_DATE_SUBDIR) !== "false";
  const initialBackupRaw = getStored(STORAGE_KEY_BACKUP_RAW) === "true";
  const initialPreset =
    (getStored(STORAGE_KEY_PRESET) as ExportPresetId) || "high";
  const initialFormat =
    (getStored(STORAGE_KEY_FORMAT) as ExportFormat) || "jpeg";
  const initialQuality = Number(getStored(STORAGE_KEY_QUALITY)) || 0.95;
  const initialSizePreset =
    (getStored(STORAGE_KEY_SIZE_PRESET) as ExportSizePreset) || "original";
  const initialCustomEdge = Number(getStored(STORAGE_KEY_CUSTOM_EDGE)) || 2048;
  const initialColorSpace =
    (getStored(STORAGE_KEY_COLOR_SPACE) as
      | "sRGB"
      | "DisplayP3"
      | "ProPhotoRGB") || "DisplayP3";
  const initialPreserveExif = getStored(STORAGE_KEY_PRESERVE_EXIF) !== "false";

  let targetDirectory = $state<string>(initialDir);
  let autoDateSubdir = $state<boolean>(initialDateSubdir);
  let backupRawFiles = $state<boolean>(initialBackupRaw);
  let activePreset = $state<ExportPresetId>(initialPreset);
  let exportFormat = $state<ExportFormat>(initialFormat);
  let exportQuality = $state<number>(initialQuality);
  let sizePreset = $state<ExportSizePreset>(initialSizePreset);
  let customLongEdge = $state<number>(initialCustomEdge);
  let preserveExif = $state<boolean>(initialPreserveExif);
  let colorSpace = $state<"sRGB" | "DisplayP3" | "ProPhotoRGB">(
    initialColorSpace,
  );

  let effectiveMaxLongEdge = $derived<number | null>(
    sizePreset === "original"
      ? null
      : sizePreset === "2048"
        ? 2048
        : sizePreset === "1920"
          ? 1920
          : sizePreset === "1080"
            ? 1080
            : Math.max(320, Math.round(customLongEdge || 2048)),
  );

  let formatSummaryLabel = $derived(
    exportFormat === "png"
      ? "PNG 無損"
      : `${exportFormat === "webp" ? "WebP" : "JPG"} · ${Math.round(exportQuality * 100)}%`,
  );

  let sizeSummaryLabel = $derived(
    effectiveMaxLongEdge === null
      ? "原始尺寸"
      : `長邊 ${effectiveMaxLongEdge} px`,
  );

  let fileExtension = $derived(getExportExtension(exportFormat));

  function applyExportPreset(preset: Exclude<ExportPresetId, "custom">) {
    activePreset = preset;
    if (preset === "social") {
      exportFormat = "jpeg";
      exportQuality = 0.92;
      sizePreset = "2048";
      colorSpace = "sRGB";
      onSetExportMode("modeA");
    } else if (preset === "high") {
      exportFormat = "jpeg";
      exportQuality = 0.95;
      sizePreset = "original";
      colorSpace = "DisplayP3";
      onSetExportMode("modeA");
    } else if (preset === "archive") {
      exportFormat = "png";
      exportQuality = 1.0;
      sizePreset = "original";
      colorSpace = "ProPhotoRGB";
      onSetExportMode("modeB");
    }
    saveSettings();
  }

  function markCustomPreset() {
    activePreset = "custom";
    onSetExportMode(
      exportFormat === "png" || exportQuality >= 1.0 ? "modeB" : "modeA",
    );
    saveSettings();
  }

  // Groq API Key 狀態
  let hasGroqKey = $state<boolean>(false);

  function checkAiKeyStatus() {
    const groqStatus = KeyVaultService.getKeyStatus("groq");
    const geminiStatus = KeyVaultService.getKeyStatus("gemini");
    hasGroqKey = groqStatus.exists || geminiStatus.exists;
  }

  // 智慧目錄規劃狀態
  type DirectoryMode = "flat" | "smart_scene" | "profile_lut" | "custom";
  let directoryMode = $state<DirectoryMode>("flat");
  let customDirectoryPrompt = $state<string>("");
  let isPlanningDirectory = $state<boolean>(false);
  let directoryPlan = $state<DirectoryPlanResult | null>(null);
  let directoryPlanError = $state<string>("");

  // 社群文案抽屜與狀態
  let isSocialSectionOpen = $state<boolean>(false);
  let userSocialPrompt = $state<string>("");
  let aiSocialCaption = $state<string>("");
  let aiSocialHashtags = $state<string[]>([]);
  let aiIptcKeywords = $state<string[]>([]);
  let isGeneratingCopy = $state<boolean>(false);
  let socialNotice = $state<string>("");

  function saveSettings() {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY_DIR, targetDirectory);
      localStorage.setItem(STORAGE_KEY_DATE_SUBDIR, String(autoDateSubdir));
      localStorage.setItem(STORAGE_KEY_BACKUP_RAW, String(backupRawFiles));
      localStorage.setItem(STORAGE_KEY_PRESET, activePreset);
      localStorage.setItem(STORAGE_KEY_FORMAT, exportFormat);
      localStorage.setItem(STORAGE_KEY_QUALITY, String(exportQuality));
      localStorage.setItem(STORAGE_KEY_SIZE_PRESET, sizePreset);
      localStorage.setItem(STORAGE_KEY_CUSTOM_EDGE, String(customLongEdge));
      localStorage.setItem(STORAGE_KEY_COLOR_SPACE, colorSpace);
      localStorage.setItem(STORAGE_KEY_PRESERVE_EXIF, String(preserveExif));
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  let resolvedPreviewPath = $state<string>("");

  $effect(() => {
    const dir = targetDirectory;
    const sub = autoDateSubdir
      ? directoryPlan?.projectRootName || todayStr
      : undefined;
    ExportService.resolveExportPath(dir, sub).then((res) => {
      resolvedPreviewPath = res;
    });
  });

  onMount(() => {
    checkAiKeyStatus();
  });

  async function handlePickTargetFolder() {
    const isTauri =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (isTauri) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          directory: true,
          multiple: false,
          title: "選擇匯出目標目錄",
        });
        if (selected && typeof selected === "string") {
          targetDirectory = selected;
          saveSettings();
        }
        return;
      } catch (err) {
        console.warn("Tauri 原生對話框呼叫失敗:", err);
      }
    }

    const promptPath = window.prompt(
      "【Web 預覽模式提示】\n請輸入本機目標目錄絕對路徑（例如 D:/Photos 或 /home/user/Pictures）：",
      targetDirectory || "./Exports",
    );
    if (promptPath && promptPath.trim()) {
      targetDirectory = promptPath.trim();
      saveSettings();
    }
  }

  async function handlePlanDirectory(mode: DirectoryMode = directoryMode) {
    directoryMode = mode;
    if (mode === "flat") {
      directoryPlan = null;
      directoryPlanError = "";
      return;
    }

    if (finalExportPhotos.length === 0) {
      directoryPlanError = "目前無待匯出底片，請先確認匯出清單";
      return;
    }

    isPlanningDirectory = true;
    directoryPlanError = "";

    try {
      const payloadItems = finalExportPhotos.map((p) => ({
        id: p.id,
        filename: p.filename,
        scene: p.sceneTag,
        profile: p.appliedProfile,
        camera: p.camera,
        lens: p.lens,
        focalLength: p.focalLength,
        iso: p.iso,
        shutter: p.shutter,
        aperture: p.aperture,
        flagged: p.flagged,
      }));

      const plan = await AiSceneService.planExportDirectory({
        sessionDate: todayStr,
        userInstruction: customDirectoryPrompt,
        strategy: mode,
        photos: payloadItems,
      });

      directoryPlan = plan;
    } catch (err: any) {
      console.warn("Directory planning error:", err);
      directoryPlanError = err?.message || "目錄規劃推估異常";
    } finally {
      isPlanningDirectory = false;
    }
  }

  async function handleGenerateSocialCopy() {
    isGeneratingCopy = true;
    try {
      const firstPhoto = finalExportPhotos[0] || photos[0];
      const res = await AiSceneService.generateGroqCopywriting({
        tags: aiVisionTags.length > 0 ? aiVisionTags : ["底片攝影", "光影展演"],
        sceneTitle: aiSceneTitle || "底片光影顯影",
        userPrompt: userSocialPrompt,
        cameraModel: firstPhoto?.camera || "Sony Alpha 數位底片機身",
        lensModel: firstPhoto?.lens || "原生光學鏡頭",
        exifOptical: `${finalExportPhotos.length} 幀底片批次匯出`,
      });
      aiSocialCaption = res.caption;
      aiSocialHashtags = res.hashtags;
      aiIptcKeywords = res.iptcKeywords;
    } catch (err) {
      console.warn("Social copywriting error:", err);
    } finally {
      isGeneratingCopy = false;
    }
  }

  async function handleShareSocial() {
    const shareText = aiSocialCaption
      ? `${aiSocialCaption}\n\n${aiSocialHashtags.join(" ")}`
      : `底片顯影紀錄：共 ${finalExportPhotos.length} 張底片已就緒。`;

    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: "Slipknot 底片顯影分享",
          text: shareText,
        });
        socialNotice = "系統分享面板已啟動 ✓";
        setTimeout(() => {
          socialNotice = "";
        }, 3000);
        return;
      } catch (err: any) {
        if (err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      socialNotice = "文案已複製！可直接開啟 Threads / Instagram 發布 ✓";
      setTimeout(() => {
        socialNotice = "";
      }, 3500);
    } catch {
      socialNotice = "已複製文案至剪貼簿";
      setTimeout(() => {
        socialNotice = "";
      }, 2500);
    }
  }

  async function handleOpenDestination() {
    const fullPath = resolvedPreviewPath || targetDirectory;
    await ExportService.openExportDirectory(fullPath);
  }

  function handleTriggerExportWithCopy() {
    if (userSocialPrompt && !aiSocialCaption) {
      handleGenerateSocialCopy();
    }
    onTriggerExport(finalExportPhotos, {
      targetDir: targetDirectory,
      autoDateSubdir,
      backupRawFiles,
      directoryPlan: directoryPlan || undefined,
      format: exportFormat,
      quality: exportQuality,
      maxLongEdge: effectiveMaxLongEdge,
      colorSpace,
      preserveExif,
    });
  }
</script>

<div class="export-viewport">
  <header class="export-toolbar hairline-b font-mono">
    <div class="header-left">
      <span class="tool-title font-headline">相片匯出設定</span>
      <span class="counter-badge amber">
        準備匯出 {finalExportPhotos.length} 張
        {#if excludedPhotoIds.size > 0}
          <span class="counter-excluded"
            >（已排除 {excludedPhotoIds.size} 張）</span
          >
        {/if}
      </span>
    </div>

    <div class="scope-selector-group hairline-all font-mono">
      <span class="scope-label">匯出範圍：</span>
      <button
        type="button"
        class="scope-chip"
        class:active={exportScope === "picked"}
        onclick={() => {
          userChoseScope = true;
          exportScope = "picked";
        }}
        title="僅匯出已標記精選（★）的相片"
      >
        <span>★ 已標記精選</span>
        <span class="scope-badge" class:amber={pickedPhotos.length > 0}
          >{pickedPhotos.length}</span
        >
      </button>

      <button
        type="button"
        class="scope-chip"
        class:active={exportScope === "edited"}
        onclick={() => {
          userChoseScope = true;
          exportScope = "edited";
        }}
        title="匯出所有進行過調色、套用風格或裁切的相片"
      >
        <span>✎ 已修圖調色</span>
        <span class="scope-badge" class:amber={editedPhotos.length > 0}
          >{editedPhotos.length}</span
        >
      </button>

      <button
        type="button"
        class="scope-chip"
        class:active={exportScope === "selected"}
        onclick={() => {
          userChoseScope = true;
          exportScope = "selected";
        }}
        title="僅匯出目前正在檢視的這張相片"
      >
        <span>◉ 目前這張</span>
      </button>

      <button
        type="button"
        class="scope-chip"
        class:active={exportScope === "all"}
        onclick={() => {
          userChoseScope = true;
          exportScope = "all";
        }}
        title="匯出相卷中的所有相片"
      >
        <span>全部相片</span>
        <span class="scope-badge">{allPhotos.length}</span>
      </button>
    </div>
  </header>

  <div class="export-content custom-scroll">
    <div class="export-deck max-w-5xl">
      <!-- STEP 1: 確認要匯出的相片 -->
      <section class="export-step-card hairline-all">
        <div class="step-card-header font-mono">
          <div class="step-title-wrap">
            <span class="step-num-badge">01</span>
            <div>
              <h3 class="step-title font-headline">確認匯出相片清單</h3>
              <p class="step-sub">點擊相片可勾選納入或暫時排除本次匯出</p>
            </div>
          </div>

          <div class="step-header-actions">
            {#if effectivePhotos.length > 0}
              <div class="selection-action-group hairline-all font-mono">
                <button
                  type="button"
                  class="select-action-btn"
                  onclick={selectAllInQueue}
                  disabled={excludedPhotoIds.size === 0}
                  title="將目前範疇的所有底片全部納入匯出"
                >
                  <span
                    class="material-symbols-outlined"
                    style="font-size: 13px;">check_box</span
                  >
                  <span>全選</span>
                </button>
                <button
                  type="button"
                  class="select-action-btn"
                  onclick={deselectAllInQueue}
                  disabled={finalExportPhotos.length === 0}
                  title="暫時排除目前範疇的所有底片"
                >
                  <span
                    class="material-symbols-outlined"
                    style="font-size: 13px;">check_box_outline_blank</span
                  >
                  <span>全不選</span>
                </button>
              </div>
            {/if}

            <div class="gallery-layout-toggle hairline-all">
              <button
                type="button"
                class="layout-btn"
                class:active={previewLayout === "strip"}
                onclick={() => (previewLayout = "strip")}
                title="橫向膠卷帶檢視"
              >
                <span class="material-symbols-outlined" style="font-size: 14px;"
                  >view_timeline</span
                >
                <span>膠卷帶</span>
              </button>
              <button
                type="button"
                class="layout-btn"
                class:active={previewLayout === "grid"}
                onclick={() => (previewLayout = "grid")}
                title="展開網格檢視"
              >
                <span class="material-symbols-outlined" style="font-size: 14px;"
                  >grid_view</span
                >
                <span>網格</span>
              </button>
            </div>
          </div>
        </div>

        {#if effectivePhotos.length > 0}
          <div
            class="gallery-scroll-container"
            class:is-strip={previewLayout === "strip"}
            class:is-grid={previewLayout === "grid"}
          >
            {#each effectivePhotos as photo (photo.id)}
              <div
                class="queued-photo-card hairline-all"
                class:is-flagged={photo.flagged}
                class:is-edited={isPhotoEdited(photo)}
                class:is-excluded={excludedPhotoIds.has(photo.id)}
                onclick={() => togglePhotoInclusion(photo.id)}
                role="button"
                tabindex="0"
                onkeydown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    togglePhotoInclusion(photo.id);
                  }
                }}
                title={excludedPhotoIds.has(photo.id)
                  ? "點擊納入匯出清單"
                  : "點擊自本次匯出排除"}
              >
                <div class="card-thumb-wrapper">
                  {#if photo.gradedThumbnail || photo.thumbnail}
                    <img
                      src={photo.gradedThumbnail || photo.thumbnail}
                      alt={photo.filename}
                      class="card-img"
                      loading="lazy"
                    />
                  {:else}
                    <div class="thumb-placeholder font-mono">NO THUMB</div>
                  {/if}

                  <div
                    class="card-checkbox"
                    class:checked={!excludedPhotoIds.has(photo.id)}
                    title={excludedPhotoIds.has(photo.id)
                      ? "未勾選（已排除）"
                      : "已勾選（將匯出）"}
                  >
                    {#if !excludedPhotoIds.has(photo.id)}
                      <span class="material-symbols-outlined check-icon"
                        >check</span
                      >
                    {/if}
                  </div>

                  <span class="plate-frame-badge font-mono"
                    >#{photo.frameNo}</span
                  >

                  {#if excludedPhotoIds.has(photo.id)}
                    <div class="excluded-overlay font-mono">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 14px;">block</span
                      >
                      <span>已排除</span>
                    </div>
                  {/if}

                  <div class="plate-status-badges font-mono">
                    {#if photo.flagged}
                      <span class="badge-flagged" title="已標記挑選 (Picked)">
                        <span
                          class="material-symbols-outlined"
                          style="font-size: 10px;">flag</span
                        >
                        <span>PICK</span>
                      </span>
                    {/if}
                    {#if isPhotoEdited(photo)}
                      <span class="badge-edited" title="已調色顯影">
                        <span
                          class="material-symbols-outlined"
                          style="font-size: 10px;">auto_fix_high</span
                        >
                        <span>EDITED</span>
                      </span>
                    {/if}
                    {#if photo.crop && (photo.crop.width < 1 || photo.crop.height < 1)}
                      <span class="badge-crop" title="自訂裁切比例">
                        <span
                          class="material-symbols-outlined"
                          style="font-size: 10px;">crop</span
                        >
                        <span>{photo.crop.aspectRatio || "CROP"}</span>
                      </span>
                    {/if}
                  </div>
                </div>

                <div class="card-meta font-mono">
                  <span class="meta-filename truncate" title={photo.filename}
                    >{photo.filename}</span
                  >
                  <div class="meta-profile-row truncate">
                    <span
                      class="profile-dot"
                      style:background={isPhotoEdited(photo)
                        ? "var(--cyan-accent)"
                        : "var(--parchment-dim)"}
                    ></span>
                    <span class="meta-profile truncate"
                      >{photo.appliedProfile || "標準風格"}</span
                    >
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="gallery-empty-slate font-mono hairline-all">
            <span class="material-symbols-outlined empty-icon">filter_none</span
            >
            <div class="empty-text">
              {#if exportScope === "picked"}
                <strong>目前佇列無挑選底片</strong>
                <p>
                  您尚未標記任何底片為
                  Pick。系統可為您切換至「所有已調色」或「全量底片」以匯出相片。
                </p>
                <div class="empty-actions">
                  <button
                    type="button"
                    class="empty-cta-btn"
                    onclick={() => {
                      userChoseScope = true;
                      exportScope = "edited";
                    }}
                  >
                    切換至「所有已調色 ({editedPhotos.length})」
                  </button>
                  <button
                    type="button"
                    class="empty-cta-btn outline"
                    onclick={() => {
                      userChoseScope = true;
                      exportScope = "all";
                    }}
                  >
                    切換至「全量底片 ({allPhotos.length})」
                  </button>
                </div>
              {:else if exportScope === "edited"}
                <strong>目前佇列無調色底片</strong>
                <p>
                  相片尚未進行暗房調色。您可以切換至全量底片，或前往暗房進行風格微調。
                </p>
                <div class="empty-actions">
                  <button
                    type="button"
                    class="empty-cta-btn"
                    onclick={() => {
                      userChoseScope = true;
                      exportScope = "all";
                    }}
                  >
                    切換至「全量底片 ({allPhotos.length})」
                  </button>
                  {#if onGoToRetouch}
                    <button
                      type="button"
                      class="empty-cta-btn outline"
                      onclick={onGoToRetouch}
                    >
                      前往暗房精修 →
                    </button>
                  {/if}
                </div>
              {:else}
                <strong>目前目錄無底片</strong>
                <p>請先由「膠卷目錄」載入相簿以進行批次匯出。</p>
                {#if onGoToCatalog}
                  <div class="empty-actions">
                    <button
                      type="button"
                      class="empty-cta-btn"
                      onclick={onGoToCatalog}
                    >
                      前往膠卷目錄匯入相片 →
                    </button>
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        {/if}
      </section>

      <!-- 雙欄主體：STEP 2 輸出格式與畫質 + STEP 3 儲存位置 -->
      <div class="export-dual-columns">
        <!-- 左欄：STEP 2 輸出格式與畫質設定 -->
        <div class="column-left">
          <section class="export-step-card hairline-all">
            <div class="step-card-header font-mono">
              <div class="step-title-wrap">
                <span class="step-num-badge">02</span>
                <div>
                  <h3 class="step-title font-headline">輸出格式與畫質</h3>
                  <p class="step-sub">
                    挑選常用用途預設，或於下方細部微調格式與尺寸
                  </p>
                </div>
              </div>
              {#if activePreset === "custom"}
                <span class="custom-mode-pill font-mono">已自訂規格</span>
              {/if}
            </div>

            <!-- 快速用途預設卡片 (3 欄) -->
            <div class="pipeline-switch-grid three-cols">
              <!-- 1. 社群分享 -->
              <button
                type="button"
                class="pipeline-toggle-card hairline-all"
                class:active={activePreset === "social"}
                onclick={() => applyExportPreset("social")}
              >
                <div class="pipe-card-top font-mono">
                  <span class="material-symbols-outlined icon amber">share</span
                  >
                  <span class="pipe-badge amber">推薦發文</span>
                </div>
                <div class="pipe-name font-headline">社群網路分享</div>
                <div class="pipe-note font-mono">
                  JPG · 92% 畫質 · 長邊 2048 px · sRGB
                </div>
                <div class="pipe-tags font-mono">
                  <span class="chip amber">IG / Threads</span>
                  <span class="chip">檔案輕巧</span>
                </div>
              </button>

              <!-- 2. 高畫質相片 -->
              <button
                type="button"
                class="pipeline-toggle-card hairline-all"
                class:active={activePreset === "high"}
                onclick={() => applyExportPreset("high")}
              >
                <div class="pipe-card-top font-mono">
                  <span class="material-symbols-outlined icon cyan"
                    >photo_library</span
                  >
                  <span class="pipe-badge cyan">日常保存</span>
                </div>
                <div class="pipe-name font-headline">高畫質相片</div>
                <div class="pipe-note font-mono">
                  JPG · 95% 畫質 · 原始尺寸 · Display P3
                </div>
                <div class="pipe-tags font-mono">
                  <span class="chip cyan">手機電腦瀏覽</span>
                  <span class="chip">清晰銳利</span>
                </div>
              </button>

              <!-- 3. 無損印刷典藏 -->
              <button
                type="button"
                class="pipeline-toggle-card hairline-all"
                class:active={activePreset === "archive"}
                onclick={() => applyExportPreset("archive")}
              >
                <div class="pipe-card-top font-mono">
                  <span class="material-symbols-outlined icon indigo"
                    >diamond</span
                  >
                  <span class="pipe-badge indigo">最高品質</span>
                </div>
                <div class="pipe-name font-headline">無損典藏送印</div>
                <div class="pipe-note font-mono">
                  PNG 無損 · 原始尺寸 · ProPhoto RGB
                </div>
                <div class="pipe-tags font-mono">
                  <span class="chip indigo">商業送印</span>
                  <span class="chip">零壓縮失真</span>
                </div>
              </button>
            </div>

            <!-- 細部規格設定表單 (如 Lightroom Export 介面) -->
            <div class="spec-detail-box hairline-all font-mono">
              <!-- 檔案格式 -->
              <div class="spec-row">
                <span class="spec-label">檔案格式：</span>
                <div class="segmented-group">
                  <button
                    type="button"
                    class="seg-btn"
                    class:active={exportFormat === "jpeg"}
                    onclick={() => {
                      exportFormat = "jpeg";
                      markCustomPreset();
                    }}
                  >
                    JPG (通用)
                  </button>
                  <button
                    type="button"
                    class="seg-btn"
                    class:active={exportFormat === "png"}
                    onclick={() => {
                      exportFormat = "png";
                      markCustomPreset();
                    }}
                  >
                    PNG (無損)
                  </button>
                  <button
                    type="button"
                    class="seg-btn"
                    class:active={exportFormat === "webp"}
                    onclick={() => {
                      exportFormat = "webp";
                      markCustomPreset();
                    }}
                  >
                    WebP (網頁輕量)
                  </button>
                </div>
              </div>

              <!-- 影像畫質 -->
              <div class="spec-row">
                <span class="spec-label">影像畫質：</span>
                {#if exportFormat === "png"}
                  <span class="spec-static-hint"
                    >PNG 為無損壓縮格式，一律保留 100% 原始畫質</span
                  >
                {:else}
                  <div class="segmented-group">
                    <button
                      type="button"
                      class="seg-btn"
                      class:active={exportQuality <= 0.85}
                      onclick={() => {
                        exportQuality = 0.8;
                        markCustomPreset();
                      }}
                    >
                      標準 (80%)
                    </button>
                    <button
                      type="button"
                      class="seg-btn"
                      class:active={exportQuality > 0.85 &&
                        exportQuality < 0.98}
                      onclick={() => {
                        exportQuality = 0.92;
                        markCustomPreset();
                      }}
                    >
                      高畫質 (92%)
                    </button>
                    <button
                      type="button"
                      class="seg-btn"
                      class:active={exportQuality >= 0.98}
                      onclick={() => {
                        exportQuality = 1.0;
                        markCustomPreset();
                      }}
                    >
                      最佳 (100%)
                    </button>
                  </div>
                {/if}
              </div>

              <!-- 影像尺寸 -->
              <div class="spec-row">
                <span class="spec-label">影像尺寸：</span>
                <div class="size-control-wrap">
                  <select
                    bind:value={sizePreset}
                    onchange={markCustomPreset}
                    class="spec-select font-mono"
                  >
                    <option value="original">原始解析度（不縮放尺寸）</option>
                    <option value="2048"
                      >社群分享最佳化（長邊限制 2048 px）</option
                    >
                    <option value="1920"
                      >Full HD 螢幕瀏覽（長邊限制 1920 px）</option
                    >
                    <option value="1080"
                      >輕量快速傳輸（長邊限制 1080 px）</option
                    >
                    <option value="custom">自訂長邊像素上限...</option>
                  </select>
                  {#if sizePreset === "custom"}
                    <div class="custom-px-box">
                      <input
                        type="number"
                        min="320"
                        max="12000"
                        step="10"
                        bind:value={customLongEdge}
                        oninput={markCustomPreset}
                        class="custom-px-input font-mono"
                      />
                      <span class="px-unit">px</span>
                    </div>
                  {/if}
                </div>
              </div>

              <!-- 色彩空間 -->
              <div class="spec-row">
                <span class="spec-label">色彩空間：</span>
                <select
                  bind:value={colorSpace}
                  onchange={markCustomPreset}
                  class="spec-select font-mono"
                >
                  <option value="sRGB"
                    >sRGB — 網路與所有裝置通用（最不易色偏）</option
                  >
                  <option value="DisplayP3"
                    >Display P3 — Apple 螢幕與現代手機廣色域</option
                  >
                  <option value="ProPhotoRGB"
                    >ProPhoto RGB — 專業印刷與後製廣色域</option
                  >
                </select>
              </div>

              <!-- 附加保留選項 -->
              <div class="spec-toggles font-mono">
                <label class="toggle-row">
                  <input
                    type="checkbox"
                    bind:checked={preserveExif}
                    onchange={saveSettings}
                  />
                  <span
                    >保留拍攝資訊 (EXIF：相機型號、鏡頭、光圈、快門、ISO)</span
                  >
                </label>
                <label class="toggle-row">
                  <input
                    type="checkbox"
                    bind:checked={backupRawFiles}
                    onchange={saveSettings}
                  />
                  <span class="amber"
                    >同時備份原始相片檔（將 RAW 原檔另存至 Raw_Backup 資料夾）</span
                  >
                </label>
              </div>
            </div>
          </section>

          <!-- 選配：AI 社群發文文案 -->
          <section class="social-accordion-card hairline-all">
            <button
              type="button"
              class="accordion-trigger font-mono"
              onclick={() => (isSocialSectionOpen = !isSocialSectionOpen)}
            >
              <div class="trigger-left">
                <span class="material-symbols-outlined icon-glow">campaign</span
                >
                <span class="trigger-title"
                  >選配：AI 社群發文文案與 Hashtag 產生器</span
                >
              </div>
              <span
                class="material-symbols-outlined arrow-icon"
                class:rotate={isSocialSectionOpen}
              >
                expand_more
              </span>
            </button>

            {#if isSocialSectionOpen}
              <div class="accordion-body font-mono">
                {#if aiVisionTags.length > 0}
                  <div class="vision-tags-row">
                    <span class="tags-hint">畫面識別標籤：</span>
                    {#each aiVisionTags as tag}
                      <span class="tag-pill">#{tag}</span>
                    {/each}
                  </div>
                {/if}

                <div class="input-with-label">
                  <span class="input-label">拍攝心得或地點備註</span>
                  <div class="input-action-wrap">
                    <input
                      type="text"
                      bind:value={userSocialPrompt}
                      class="social-prompt-input"
                      placeholder="例如：首爾雨後街頭漫步、赤峰街斜陽咖啡館..."
                      onkeydown={(e) => {
                        if (e.key === "Enter") handleGenerateSocialCopy();
                      }}
                    />
                    <button
                      type="button"
                      class="generate-copy-btn hairline-all"
                      onclick={handleGenerateSocialCopy}
                      disabled={isGeneratingCopy}
                      title="由 AI 快速生成貼文文案與標籤"
                    >
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 14px;"
                      >
                        {isGeneratingCopy
                          ? "progress_activity"
                          : "auto_fix_high"}
                      </span>
                      <span
                        >{isGeneratingCopy
                          ? "生成中..."
                          : aiSocialCaption
                            ? "重新生成"
                            : "生成文案"}</span
                      >
                    </button>
                  </div>
                </div>

                {#if aiSocialCaption}
                  <div class="copy-result-card hairline-all">
                    <p class="result-text font-body">{aiSocialCaption}</p>
                    <div class="result-hashtags font-mono">
                      {#each aiSocialHashtags as tag}
                        <span class="hashtag-tag">{tag}</span>
                      {/each}
                    </div>
                    <div class="result-toolbar font-mono">
                      <button
                        type="button"
                        class="btn-micro hairline-all"
                        onclick={handleShareSocial}
                      >
                        <span
                          class="material-symbols-outlined"
                          style="font-size: 13px;">share</span
                        >
                        <span>分享或複製文案</span>
                      </button>
                      {#if socialNotice}
                        <span class="social-toast-text">{socialNotice}</span>
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </section>
        </div>

        <!-- 右欄：STEP 3 儲存位置與資料夾整理 -->
        <div class="column-right">
          <section class="export-step-card hairline-all">
            <div class="step-card-header font-mono">
              <div class="step-title-wrap">
                <span class="step-num-badge">03</span>
                <div>
                  <h3 class="step-title font-headline">儲存位置與資料夾整理</h3>
                  <p class="step-sub">設定電腦儲存資料夾與自動分類方式</p>
                </div>
              </div>
            </div>

            <div class="setting-item font-mono">
              <span class="setting-label">儲存資料夾</span>
              <div class="dest-input-row">
                <input
                  type="text"
                  bind:value={targetDirectory}
                  oninput={saveSettings}
                  class="setting-input flex-1"
                  placeholder="請輸入或選擇儲存資料夾"
                />
                <button
                  type="button"
                  class="browse-btn hairline-all"
                  onclick={handlePickTargetFolder}
                  title="選擇電腦資料夾"
                >
                  <span
                    class="material-symbols-outlined"
                    style="font-size: 15px;">folder_open</span
                  >
                  <span>選擇資料夾</span>
                </button>
              </div>
              <label class="toggle-row date-subdir-toggle">
                <input
                  type="checkbox"
                  bind:checked={autoDateSubdir}
                  onchange={saveSettings}
                />
                <span>自動建立今日日期資料夾（{todayStr}）方便管理</span>
              </label>
            </div>

            <!-- 資料夾自動分類方式 -->
            <div class="smart-plan-box hairline-all font-mono">
              <div class="smart-plan-head">
                <div class="plan-head-left">
                  <span
                    class="material-symbols-outlined"
                    style="color: var(--amber-highlight); font-size: 16px;"
                  >
                    {hasGroqKey ? "auto_awesome" : "folder_special"}
                  </span>
                  <span class="plan-head-title">
                    {hasGroqKey ? "✨ 資料夾自動分類方式" : "資料夾分類方式"}
                  </span>
                </div>
                {#if isPlanningDirectory}
                  <span class="planning-badge">
                    <span
                      class="material-symbols-outlined spin"
                      style="font-size: 12px;">sync</span
                    >
                    AI 分類規劃中...
                  </span>
                {/if}
              </div>

              <!-- 分類策略按鈕 -->
              <div class="plan-strategy-chips">
                <button
                  type="button"
                  class="strategy-chip"
                  class:active={directoryMode === "flat"}
                  onclick={() => handlePlanDirectory("flat")}
                >
                  不分類（全部放一起）
                </button>
                <button
                  type="button"
                  class="strategy-chip"
                  class:active={directoryMode === "smart_scene"}
                  onclick={() => handlePlanDirectory("smart_scene")}
                  title="依 AI 辨識之場景（如：人像、街景、夜景）自動分資料夾"
                >
                  <span>✨ 依拍攝場景自動分類</span>
                </button>
                <button
                  type="button"
                  class="strategy-chip"
                  class:active={directoryMode === "profile_lut"}
                  onclick={() => handlePlanDirectory("profile_lut")}
                  title="依套用的濾鏡風格分別放入不同資料夾"
                >
                  <span>🎨 依套用風格分類</span>
                </button>
                <button
                  type="button"
                  class="strategy-chip"
                  class:active={directoryMode === "custom"}
                  onclick={() => (directoryMode = "custom")}
                  title="輸入想分類的條件（例如：人像放一夾、風景放一夾）"
                >
                  <span>💬 自訂分類規則</span>
                </button>
              </div>

              {#if directoryMode === "custom"}
                <div class="custom-rule-row">
                  <input
                    type="text"
                    bind:value={customDirectoryPrompt}
                    placeholder="例如：把 35mm 街拍單獨一夾、黑白單獨一夾..."
                    class="custom-rule-input font-mono"
                    onkeydown={(e) => {
                      if (e.key === "Enter") handlePlanDirectory("custom");
                    }}
                  />
                  <button
                    type="button"
                    class="rule-go-btn hairline-all"
                    onclick={() => handlePlanDirectory("custom")}
                    disabled={isPlanningDirectory}
                  >
                    套用
                  </button>
                </div>
              {/if}

              {#if directoryPlan?.rationale}
                <div class="plan-rationale-note">
                  <span
                    class="material-symbols-outlined"
                    style="font-size: 13px; color: var(--amber-highlight);"
                    >info</span
                  >
                  <span>{directoryPlan.rationale}</span>
                </div>
              {/if}

              {#if directoryPlanError}
                <div class="plan-error-note">
                  <span>{directoryPlanError}</span>
                </div>
              {/if}
            </div>

            <!-- 即時檔案目錄樹預覽 -->
            <div class="path-preview-box hairline-all font-mono">
              <div class="preview-title">
                <span class="material-symbols-outlined" style="font-size: 14px;"
                  >account_tree</span
                >
                <span>預計產生的資料夾結構預覽</span>
              </div>

              <div class="preview-tree">
                <div class="tree-line">
                  <span class="tree-branch"
                    >📁 {resolvedPreviewPath || targetDirectory}/</span
                  >
                </div>

                {#if directoryPlan && directoryPlan.folders.length > 0}
                  {#each directoryPlan.folders as folder}
                    <div class="tree-line indent">
                      <span class="tree-leaf">├─ 📂 {folder.subPath}/</span>
                      <span class="tree-counter amber"
                        >({folder.photoIds.length} 張 .{fileExtension})</span
                      >
                    </div>
                  {/each}
                {:else}
                  <div class="tree-line indent">
                    <span class="tree-leaf">├─ 🖼️ *_graded.{fileExtension}</span
                    >
                    <span class="tree-counter amber"
                      >({finalExportPhotos.length} 張成片 · {formatSummaryLabel}
                      · {sizeSummaryLabel})</span
                    >
                  </div>
                {/if}

                {#if backupRawFiles}
                  <div class="tree-line indent">
                    <span class="tree-leaf amber"
                      >└─ 💾 {directoryPlan?.rawBackupSubPath ||
                        "Raw_Backup"}/</span
                    >
                    <span class="tree-counter amber"
                      >({finalExportPhotos.length} 份原始 RAW 備份)</span
                    >
                  </div>
                {/if}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>

  <!-- 底部常駐匯出按鈕列 -->
  <footer class="action-dock hairline-t font-mono">
    <div class="dock-summary">
      <div class="summary-left">
        <span class="summary-count amber"
          >已選擇 {finalExportPhotos.length} 張相片</span
        >
        <span class="summary-spec-pill"
          >{formatSummaryLabel} · {sizeSummaryLabel}</span
        >
        {#if excludedPhotoIds.size > 0}
          <span class="summary-sub">（已排除 {excludedPhotoIds.size} 張）</span>
        {/if}
      </div>
      <div
        class="summary-path truncate"
        title={resolvedPreviewPath || targetDirectory}
      >
        <span class="path-label">儲存至：</span>
        <span class="path-val">{resolvedPreviewPath || targetDirectory}</span>
      </div>
    </div>

    {#if isExporting}
      <div class="progress-wrap font-mono">
        <div class="progress-bar-outer">
          <div class="progress-bar-inner" style:width="{exportProgress}%"></div>
        </div>
        <div class="progress-text">
          <span>{exportNotice}</span>
          <span>{exportProgress}%</span>
        </div>
      </div>
    {:else}
      <div class="button-row">
        {#if exportNotice}
          <span class="notice-text font-mono">{exportNotice}</span>
          <button
            type="button"
            class="archival-btn-secondary icon-only"
            onclick={handleOpenDestination}
            title="在檔案總管 / Finder 中開啟儲存資料夾"
          >
            <span class="material-symbols-outlined" style="font-size: 16px;"
              >folder_open</span
            >
            <span>開啟資料夾</span>
          </button>
        {/if}

        <button
          type="button"
          class="archival-btn-primary launch-btn"
          onclick={handleTriggerExportWithCopy}
          disabled={finalExportPhotos.length === 0}
        >
          <span class="material-symbols-outlined" style="font-size: 18px;"
            >download</span
          >
          <span>
            {#if effectivePhotos.length === 0}
              目前範圍沒有相片 · 請切換範圍
            {:else if finalExportPhotos.length === 0}
              全部相片已排除 · 請至少勾選 1 張
            {:else}
              開始匯出 ({finalExportPhotos.length} 張) ↵
            {/if}
          </span>
        </button>
      </div>
    {/if}
  </footer>
</div>

<style>
  .export-viewport {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background-color: var(--canvas-base);
    overflow: hidden;
  }

  .export-toolbar {
    height: 48px;
    background-color: var(--surface-panel);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .tool-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--parchment-bright);
    letter-spacing: 0.05em;
  }

  .counter-badge {
    font-size: 11px;
    background-color: var(--surface-elevated);
    color: var(--parchment-dim);
    padding: 2px 8px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--hairline-slate);
  }
  .counter-badge.amber {
    color: var(--amber-highlight);
    border-color: rgba(212, 163, 115, 0.3);
  }

  .counter-excluded {
    color: var(--parchment-muted);
    margin-left: 4px;
  }

  .scope-selector-group {
    display: flex;
    align-items: center;
    gap: 4px;
    background-color: rgba(22, 23, 27, 0.85);
    padding: 3px 6px;
    border-radius: var(--radius-sm);
  }

  .scope-label {
    font-size: 11px;
    color: var(--parchment-dim);
    margin-right: 4px;
  }

  .scope-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-xs);
    color: var(--parchment-muted);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .scope-chip:hover {
    color: var(--parchment-bright);
    background-color: rgba(255, 255, 255, 0.05);
  }

  .scope-chip.active {
    background: rgba(212, 163, 115, 0.15);
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    font-weight: 600;
  }

  .scope-badge {
    padding: 1px 5px;
    font-size: 10px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--parchment-bright);
  }
  .scope-badge.amber {
    background: rgba(212, 163, 115, 0.25);
    color: var(--amber-highlight);
  }

  .export-content {
    flex: 1;
    overflow-y: auto;
    padding: 18px 24px 80px;
  }

  .export-deck {
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .export-step-card {
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .step-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .step-title-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .step-num-badge {
    font-size: 12px;
    font-weight: 700;
    color: var(--amber-highlight);
    background: rgba(212, 163, 115, 0.15);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid rgba(212, 163, 115, 0.3);
  }

  .step-title {
    font-size: 14px;
    color: var(--parchment-bright);
    margin: 0;
  }

  .step-sub {
    font-size: 10px;
    color: var(--parchment-dim);
    margin: 2px 0 0;
  }

  .step-header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .selection-action-group {
    display: flex;
    background: var(--surface-elevated);
    border-radius: var(--radius-xs);
    overflow: hidden;
  }

  .select-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    font-size: 11px;
    background: transparent;
    border: none;
    color: var(--parchment-bright);
    cursor: pointer;
  }
  .select-action-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
  }
  .select-action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .gallery-layout-toggle {
    display: flex;
    background: var(--surface-elevated);
    border-radius: var(--radius-xs);
    overflow: hidden;
  }

  .layout-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    font-size: 11px;
    background: transparent;
    border: none;
    color: var(--parchment-dim);
    cursor: pointer;
  }
  .layout-btn.active {
    background: rgba(212, 163, 115, 0.18);
    color: var(--amber-highlight);
  }

  .gallery-scroll-container.is-strip {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding: 4px 2px 8px;
  }

  .gallery-scroll-container.is-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
    max-height: 240px;
    overflow-y: auto;
    padding: 4px 2px;
  }

  .queued-photo-card {
    flex-shrink: 0;
    width: 130px;
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    overflow: hidden;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .queued-photo-card:hover {
    border-color: var(--parchment-dim);
  }
  .queued-photo-card.is-excluded {
    opacity: 0.5;
    filter: grayscale(60%);
  }

  .card-thumb-wrapper {
    position: relative;
    width: 100%;
    height: 85px;
    background: #0d0e11;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .card-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: cover;
  }

  .thumb-placeholder {
    font-size: 9px;
    color: var(--parchment-dim);
  }

  .card-checkbox {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 18px;
    height: 18px;
    background: rgba(18, 19, 22, 0.85);
    border: 1px solid var(--hairline-slate);
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }
  .card-checkbox.checked {
    background: var(--amber-highlight);
    border-color: var(--amber-highlight);
  }
  .card-checkbox.checked .check-icon {
    font-size: 14px;
    color: #121316;
    font-weight: 700;
  }

  .plate-frame-badge {
    position: absolute;
    bottom: 4px;
    right: 4px;
    font-size: 9px;
    background: rgba(18, 19, 22, 0.8);
    color: var(--parchment-bright);
    padding: 1px 4px;
    border-radius: 2px;
  }

  .excluded-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: #ff6b6b;
    font-size: 10px;
    font-weight: 600;
  }

  .plate-status-badges {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: flex-end;
  }

  .badge-flagged,
  .badge-edited,
  .badge-crop {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 8px;
    padding: 1px 3px;
    border-radius: 2px;
  }
  .badge-flagged {
    background: rgba(212, 163, 115, 0.9);
    color: #121316;
    font-weight: 600;
  }
  .badge-edited {
    background: rgba(96, 130, 182, 0.9);
    color: #fff;
  }
  .badge-crop {
    background: rgba(0, 0, 0, 0.7);
    color: var(--parchment-bright);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .card-meta {
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .meta-filename {
    font-size: 10px;
    color: var(--parchment-bright);
  }

  .meta-profile-row {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    color: var(--parchment-dim);
  }

  .profile-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .gallery-empty-slate {
    padding: 24px;
    background: rgba(18, 19, 22, 0.5);
    border-radius: var(--radius-sm);
    display: flex;
    gap: 16px;
    align-items: center;
  }
  .empty-icon {
    font-size: 32px;
    color: var(--amber-highlight);
    opacity: 0.6;
  }
  .empty-text strong {
    font-size: 13px;
    color: var(--parchment-bright);
  }
  .empty-text p {
    font-size: 11px;
    color: var(--parchment-muted);
    margin: 4px 0 10px;
  }
  .empty-actions {
    display: flex;
    gap: 8px;
  }
  .empty-cta-btn {
    padding: 5px 12px;
    background: var(--amber-highlight);
    color: #121316;
    border: none;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .empty-cta-btn.outline {
    background: transparent;
    border: 1px solid var(--amber-highlight);
    color: var(--amber-highlight);
  }

  .export-dual-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .column-left,
  .column-right {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .pipeline-switch-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .pipeline-switch-grid.three-cols {
    grid-template-columns: repeat(3, 1fr);
  }

  .custom-mode-pill {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: var(--radius-xs);
    background: rgba(212, 163, 115, 0.15);
    border: 1px solid rgba(212, 163, 115, 0.4);
    color: var(--amber-highlight);
  }

  .pipeline-toggle-card {
    background: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 10px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pipeline-toggle-card:hover {
    border-color: var(--parchment-dim);
  }
  .pipeline-toggle-card.active {
    background: rgba(212, 163, 115, 0.08);
    border-color: var(--amber-highlight);
    box-shadow: 0 0 12px rgba(212, 163, 115, 0.12);
  }

  .pipe-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .icon.amber {
    color: var(--amber-highlight);
  }
  .icon.cyan {
    color: var(--cyan-accent, #56b6c2);
  }
  .icon.indigo {
    color: #818cf8;
  }

  .pipe-badge {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 2px;
  }
  .pipe-badge.amber {
    background: rgba(212, 163, 115, 0.2);
    color: var(--amber-highlight);
  }
  .pipe-badge.cyan {
    background: rgba(86, 182, 194, 0.2);
    color: var(--cyan-accent, #56b6c2);
  }
  .pipe-badge.indigo {
    background: rgba(96, 130, 182, 0.2);
    color: #818cf8;
  }

  .pipe-name {
    font-size: 13px;
    color: var(--parchment-bright);
    font-weight: 600;
  }

  .pipe-note {
    font-size: 9px;
    color: var(--parchment-muted);
    line-height: 1.4;
  }

  .pipe-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }
  .chip {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 2px;
    background: var(--canvas-base);
    color: var(--parchment-dim);
  }
  .chip.amber {
    color: var(--amber-highlight);
  }
  .chip.cyan {
    color: var(--cyan-accent, #56b6c2);
  }
  .chip.indigo {
    color: #818cf8;
  }

  .spec-detail-box {
    background: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 11px;
  }

  .spec-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .spec-label {
    color: var(--parchment-dim);
    min-width: 72px;
    flex-shrink: 0;
  }
  .spec-select {
    flex: 1;
    background: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-bright);
    padding: 5px 8px;
    border-radius: 3px;
    font-size: 11px;
  }
  .segmented-group {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    background: var(--canvas-base);
    padding: 3px;
    border-radius: 4px;
    border: 1px solid var(--hairline-slate);
  }
  .seg-btn {
    padding: 4px 6px;
    font-size: 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--parchment-muted);
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .seg-btn:hover {
    color: var(--parchment-bright);
    background: rgba(255, 255, 255, 0.05);
  }
  .seg-btn.active {
    background: rgba(212, 163, 115, 0.18);
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    font-weight: 600;
  }
  .spec-static-hint {
    font-size: 10px;
    color: var(--parchment-muted);
    padding: 4px 0;
  }
  .size-control-wrap {
    flex: 1;
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .custom-px-box {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    border-radius: 3px;
    padding: 2px 6px;
  }
  .custom-px-input {
    width: 64px;
    background: transparent;
    border: none;
    color: var(--amber-highlight);
    font-size: 11px;
    outline: none;
  }
  .px-unit {
    font-size: 10px;
    color: var(--parchment-dim);
  }
  .date-subdir-toggle {
    margin-top: 4px;
    font-size: 11px;
  }
  .summary-spec-pill {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--surface-elevated);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-bright);
  }

  .spec-toggles {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--parchment-muted);
    cursor: pointer;
  }
  .toggle-row span.amber {
    color: var(--amber-highlight);
  }

  .social-accordion-card {
    background: var(--surface-panel);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .accordion-trigger {
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    color: var(--parchment-bright);
  }
  .trigger-left {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 600;
  }
  .icon-glow {
    color: var(--amber-highlight);
    font-size: 16px;
  }
  .arrow-icon {
    font-size: 18px;
    color: var(--parchment-dim);
    transition: transform 0.2s;
  }
  .arrow-icon.rotate {
    transform: rotate(180deg);
  }

  .accordion-body {
    padding: 0 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    padding-top: 10px;
  }

  .vision-tags-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    font-size: 10px;
  }
  .tags-hint {
    color: var(--parchment-dim);
  }
  .tag-pill {
    background: rgba(255, 255, 255, 0.06);
    padding: 1px 6px;
    border-radius: 10px;
    color: var(--parchment-bright);
  }

  .input-with-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .input-label {
    font-size: 10px;
    color: var(--parchment-dim);
  }
  .input-action-wrap {
    display: flex;
    gap: 6px;
  }
  .social-prompt-input {
    flex: 1;
    background: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-bright);
    padding: 6px 10px;
    border-radius: 3px;
    font-size: 11px;
  }

  .generate-copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: var(--surface-elevated);
    border-radius: 3px;
    color: var(--amber-highlight);
    font-size: 11px;
    cursor: pointer;
  }

  .copy-result-card {
    background: var(--canvas-base);
    padding: 10px;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .result-text {
    font-size: 12px;
    color: var(--parchment-bright);
    margin: 0;
    line-height: 1.5;
  }
  .result-hashtags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    font-size: 10px;
  }
  .hashtag-tag {
    color: var(--primary-indigo);
  }
  .result-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 4px;
  }
  .btn-micro {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 10px;
    background: var(--surface-elevated);
    color: var(--parchment-bright);
    border-radius: 3px;
    cursor: pointer;
  }
  .social-toast-text {
    font-size: 10px;
    color: var(--amber-highlight);
  }

  .setting-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .setting-label {
    font-size: 10px;
    color: var(--parchment-muted);
  }
  .dest-input-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .setting-input {
    background-color: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    color: var(--parchment-bright);
    padding: 8px 12px;
    font-size: 12px;
    outline: none;
  }
  .setting-input.flex-1 {
    flex: 1;
  }

  .browse-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background-color: var(--surface-elevated);
    color: var(--parchment-bright);
    padding: 8px 14px;
    border-radius: var(--radius-xs);
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }

  .smart-plan-box {
    background: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .smart-plan-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .plan-head-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .plan-head-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--parchment-bright);
  }
  .planning-badge {
    font-size: 10px;
    color: var(--amber-highlight);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .spin {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    100% {
      transform: rotate(360deg);
    }
  }

  .plan-strategy-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .strategy-chip {
    padding: 4px 10px;
    font-size: 10px;
    background: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    border-radius: 4px;
    color: var(--parchment-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .strategy-chip:hover {
    color: var(--parchment-bright);
    border-color: var(--parchment-dim);
  }
  .strategy-chip.active {
    background: rgba(212, 163, 115, 0.15);
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    font-weight: 600;
  }

  .custom-rule-row {
    display: flex;
    gap: 6px;
  }
  .custom-rule-input {
    flex: 1;
    background: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-bright);
    padding: 4px 8px;
    font-size: 11px;
    border-radius: 3px;
  }
  .rule-go-btn {
    padding: 4px 10px;
    font-size: 10px;
    background: var(--amber-highlight);
    color: #121316;
    font-weight: 600;
    border-radius: 3px;
    cursor: pointer;
  }

  .plan-rationale-note {
    font-size: 10px;
    color: var(--parchment-bright);
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(212, 163, 115, 0.08);
    padding: 4px 8px;
    border-radius: 3px;
    line-height: 1.4;
  }
  .plan-error-note {
    font-size: 10px;
    color: #ff6b6b;
  }

  .path-preview-box {
    background-color: var(--canvas-base);
    border-radius: var(--radius-xs);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .preview-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: var(--parchment-dim);
  }
  .preview-tree {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
  }
  .tree-line {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tree-line.indent {
    padding-left: 14px;
  }
  .tree-branch {
    color: var(--parchment-bright);
    font-weight: 500;
  }
  .tree-leaf {
    color: var(--parchment-muted);
  }
  .tree-leaf.amber {
    color: var(--amber-highlight);
  }
  .tree-counter.amber {
    color: var(--amber-highlight);
    font-size: 10px;
  }

  .action-dock {
    position: sticky;
    bottom: 0;
    background-color: var(--surface-panel);
    padding: 12px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    z-index: 100;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.6);
  }

  .dock-summary {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }
  .summary-left {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .summary-count.amber {
    font-size: 13px;
    font-weight: 700;
    color: var(--amber-highlight);
  }
  .summary-sub {
    font-size: 10px;
    color: var(--parchment-dim);
  }
  .summary-path {
    font-size: 10px;
    color: var(--parchment-dim);
    display: flex;
    gap: 4px;
  }
  .path-val {
    color: var(--parchment-bright);
  }

  .progress-wrap {
    flex: 1;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .progress-bar-outer {
    height: 4px;
    background: var(--canvas-base);
    border-radius: 2px;
    overflow: hidden;
  }
  .progress-bar-inner {
    height: 100%;
    background: var(--amber-highlight);
    transition: width 0.15s ease;
  }
  .progress-text {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--parchment-muted);
  }

  .button-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .notice-text {
    font-size: 11px;
    color: var(--amber-highlight);
  }

  .launch-btn {
    padding: 10px 24px;
    font-size: 12px;
    font-weight: 600;
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 860px) {
    .export-dual-columns {
      grid-template-columns: 1fr;
    }
    .pipeline-switch-grid.three-cols {
      grid-template-columns: 1fr;
    }
    .spec-row {
      flex-direction: column;
      align-items: stretch;
    }
    .spec-label {
      min-width: 0;
    }
  }
</style>
