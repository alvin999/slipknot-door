<script lang="ts">
  import {
    IngestionService,
    type CameraMountInfo,
    type RecentDirectoryEntry,
  } from "$lib/services/ingestionService";
  import { i18nStore, LOCALE_LABELS, LOCALE_SHORT_LABELS, SUPPORTED_LOCALES, t } from "$lib/i18n";

  type ModuleTab = "catalog" | "retouch" | "profiles" | "export" | "devices";

  interface Props {
    activeTab: ModuleTab;
    cameraMounts: CameraMountInfo[];
    isScanningMounts: boolean;
    latestExtractionMs: number;
    flaggedCount: number;
    totalPhotos: number;
    activeQueueLength: number;
    exportMode: "modeA" | "modeB";
    isExporting: boolean;
    currentDirectoryName?: string;
    onSelectMount: () => void;
    onPickDirectory?: () => void;
    onAppendDirectory?: () => void;
    onAppendFiles?: () => void;
    onSelectRecentDirectory?: (path: string) => void;
    onLoadCameraMount?: (mount: CameraMountInfo) => void;
    onGoToCatalog: () => void;
    onGoToRetouch: () => void;
    onGoToExport: () => void;
    onOpenQuickExport: () => void;
    onTriggerExport: () => void;
    onOpenHelp: () => void;
    onGoToProfiles?: () => void;
    onGoToDevices?: () => void;
  }

  let {
    activeTab,
    cameraMounts,
    isScanningMounts,
    latestExtractionMs,
    flaggedCount,
    totalPhotos,
    activeQueueLength,
    exportMode,
    isExporting,
    currentDirectoryName = "",
    onSelectMount,
    onPickDirectory,
    onAppendDirectory,
    onAppendFiles,
    onSelectRecentDirectory,
    onLoadCameraMount,
    onGoToCatalog,
    onGoToRetouch,
    onGoToExport,
    onOpenQuickExport,
    onTriggerExport,
    onOpenHelp,
    onGoToProfiles,
    onGoToDevices,
  }: Props = $props();

  let isDirMenuOpen = $state<boolean>(false);
  let isLocaleMenuOpen = $state<boolean>(false);
  let recentDirs = $state<RecentDirectoryEntry[]>([]);
  let isMobile = $state<boolean>(false);

  $effect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    isMobile = mq.matches;
    const handleChange = (e: MediaQueryListEvent) => {
      isMobile = e.matches;
    };
    mq.addEventListener?.("change", handleChange);
    return () => mq.removeEventListener?.("change", handleChange);
  });

  function toggleDirMenu() {
    isDirMenuOpen = !isDirMenuOpen;
    if (isDirMenuOpen) {
      recentDirs = IngestionService.getRecentDirectories();
    }
  }

  function handleTelemetryClick(e: MouseEvent) {
    if (cameraMounts.length > 0) {
      // 偵測到外接相機連線時，點擊膠囊本體優先觸發相機智慧載入
      onSelectMount();
    } else {
      toggleDirMenu();
    }
  }

  function handleDropdownTriggerClick(e: MouseEvent) {
    e.stopPropagation();
    toggleDirMenu();
  }
</script>

<header class="top-nav hairline-b">
  <div class="brand-block">
    <img
      src="/brand-logo.png"
      alt={t("nav.brandLogoAlt")}
      class="brand-icon-img"
    />
    <div class="brand-titles">
      <h1 class="brand-title font-headline">{t("nav.brandTitle")}</h1>
      <span class="brand-sub font-mono"
        >SLIPKNOTTING ON HEAVEN'S DOOR · 0.1.0</span
      >
    </div>
  </div>

  <!-- Global Directory / Hardware Ingestion Telemetry -->
  <div class="dir-telemetry-wrapper">
    <div
      class="device-telemetry hairline-all"
      class:camera-detected={cameraMounts.length > 0}
      role="button"
      tabindex="0"
      onclick={handleTelemetryClick}
      onkeydown={(e) => {
        if (e.key === "Enter") handleTelemetryClick(e as any);
      }}
      title={cameraMounts.length > 0
        ? t("nav.cameraDetectedTitle", {
            volume: cameraMounts[0].volume_name,
            count: cameraMounts[0].file_count,
          })
        : totalPhotos > 0
          ? t("nav.dirMenuTitle")
          : t("nav.selectDirTitle")}
    >
      <span
        class="status-dot"
        class:scanning={isScanningMounts}
        class:connected={cameraMounts.length > 0 || totalPhotos > 0}
        class:has-camera={cameraMounts.length > 0}
      ></span>
      <span class="device-name font-mono">
        {#if totalPhotos > 0 && cameraMounts.length > 0}
          📁 {currentDirectoryName || t("nav.currentDirFallback")} // 📷 {cameraMounts[0]
            .volume_name}
        {:else if totalPhotos > 0}
          📁 {currentDirectoryName || t("nav.photoDirFallback")}
        {:else if cameraMounts.length > 0}
          📷 {cameraMounts[0].volume_name} // {t("nav.cameraOneClick")}
        {:else}
          <span class="btn-text-full">📁 {t("nav.openDirOrCamera")}</span>
          <span class="btn-text-short">📁 {t("nav.openDirShort")}</span>
        {/if}
      </span>
      <span class="divider">|</span>
      <span class="device-metric font-mono">
        {#if cameraMounts.length > 0}
          <span class="camera-badge"
            >{t("nav.cameraBadge", { count: cameraMounts[0].file_count })}</span
          >
        {:else if totalPhotos > 0}
          {t("nav.loadedCount", { count: totalPhotos })}
        {:else}
          {t("nav.selectDir")}
        {/if}
      </span>
      <button
        type="button"
        class="dropdown-chevron font-mono"
        onclick={handleDropdownTriggerClick}
        title={t("nav.expandDirMenu")}
        aria-label={t("nav.expandDirMenuAria")}
      >
        ▾
      </button>
    </div>

    {#if isDirMenuOpen}
      <div
        class="dir-menu-backdrop"
        onclick={() => (isDirMenuOpen = false)}
        role="presentation"
      ></div>
      <div class="dir-dropdown-menu hairline-all font-mono" role="menu">
        <div class="dir-menu-header">
          <span class="dir-menu-title font-headline"
            >{t("nav.dirMenuHeader")}</span
          >
          <button
            type="button"
            class="dir-menu-close"
            onclick={() => (isDirMenuOpen = false)}
            title={t("nav.close")}>✕</button
          >
        </div>

        <div class="dir-menu-section">
          <button
            type="button"
            class="dir-menu-item"
            onclick={() => {
              isDirMenuOpen = false;
              if (onPickDirectory) onPickDirectory();
              else onSelectMount();
            }}
          >
            <span class="material-symbols-outlined icon">folder_open</span>
            <div class="item-text">
              <span class="item-title">{t("nav.openNewDir")}</span>
              <span class="item-desc">{t("nav.openNewDirDesc")}</span>
            </div>
          </button>

          {#if onAppendDirectory}
            <button
              type="button"
              class="dir-menu-item"
              onclick={() => {
                isDirMenuOpen = false;
                onAppendDirectory();
              }}
            >
              <span class="material-symbols-outlined icon"
                >create_new_folder</span
              >
              <div class="item-text">
                <span class="item-title">{t("nav.appendDir")}</span>
                <span class="item-desc">{t("nav.appendDirDesc")}</span>
              </div>
            </button>
          {/if}

          {#if onAppendFiles}
            <button
              type="button"
              class="dir-menu-item"
              onclick={() => {
                isDirMenuOpen = false;
                onAppendFiles();
              }}
            >
              <span class="material-symbols-outlined icon"
                >add_photo_alternate</span
              >
              <div class="item-text">
                <span class="item-title">{t("nav.appendFiles")}</span>
                <span class="item-desc">{t("nav.appendFilesDesc")}</span>
              </div>
            </button>
          {/if}
        </div>

        {#if cameraMounts.length > 0}
          <div class="dir-menu-divider"></div>
          <div class="dir-menu-label">{t("nav.cameraSection")}</div>
          <div class="dir-menu-section">
            {#each cameraMounts as mount}
              <button
                type="button"
                class="dir-menu-item camera-item"
                onclick={() => {
                  isDirMenuOpen = false;
                  if (onLoadCameraMount) onLoadCameraMount(mount);
                  else onSelectMount();
                }}
              >
                <span class="material-symbols-outlined icon">photo_camera</span>
                <div class="item-text">
                  <span class="item-title">{mount.volume_name}</span>
                  <span class="item-desc"
                    >{t("nav.cameraMountDesc", {
                      count: mount.file_count,
                    })}</span
                  >
                </div>
              </button>
            {/each}
          </div>
        {/if}

        {#if recentDirs.length > 0}
          <div class="dir-menu-divider"></div>
          <div class="dir-menu-label">{t("nav.recentDirs")}</div>
          <div class="dir-menu-section recent-list">
            {#each recentDirs as dir}
              <button
                type="button"
                class="dir-menu-item recent-item"
                onclick={() => {
                  isDirMenuOpen = false;
                  if (onSelectRecentDirectory)
                    onSelectRecentDirectory(dir.path);
                }}
                title={dir.path}
              >
                <span class="material-symbols-outlined icon">history</span>
                <div class="item-text">
                  <span class="item-title truncate">{dir.name}</span>
                  <span class="item-desc truncate">{dir.path}</span>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- 3-STEP SEQUENTIAL WORKFLOW BUTTONS -->
  <div class="stepper-pipeline hairline-all font-mono">
    <!-- Step 1: Catalog Selection -->
    <button
      type="button"
      class="stepper-step"
      class:active={activeTab === "catalog"}
      onclick={onGoToCatalog}
      title={t("nav.step1Title")}
    >
      <span class="step-num">01</span>
      <span class="step-label">{t("nav.catalog")}</span>
      {#if flaggedCount > 0}
        <span class="step-tag amber"
          >{t("nav.framesCount", { count: flaggedCount })}</span
        >
      {:else if totalPhotos > 0}
        <span class="step-tag"
          >{t("nav.framesCount", { count: totalPhotos })}</span
        >
      {/if}
    </button>

    <span class="stepper-sep">➔</span>

    <!-- Step 2: Darkroom Retouch -->
    <button
      type="button"
      class="stepper-step"
      class:active={activeTab === "retouch"}
      onclick={onGoToRetouch}
      title={t("nav.step2Title")}
    >
      <span class="step-num">02</span>
      <span class="step-label">{t("nav.retouch")}</span>
      {#if activeQueueLength > 0}
        <span class="step-tag" class:amber={flaggedCount > 0}>
          {t("nav.framesCount", { count: activeQueueLength })}
          {flaggedCount > 0 ? t("nav.pickedMode") : t("nav.allMode")}
        </span>
      {/if}
    </button>

    <span class="stepper-sep">➔</span>

    <!-- Step 3: Batch Export -->
    <button
      type="button"
      class="stepper-step"
      class:active={activeTab === "export"}
      onclick={onGoToExport}
      title={t("nav.step3Title")}
    >
      <span class="step-num">03</span>
      <span class="step-label">{t("nav.export")}</span>
      {#if activeQueueLength > 0}
        <span class="step-tag"
          >{t("nav.framesCount", { count: activeQueueLength })}</span
        >
      {/if}
    </button>
  </div>

  <!-- Right Controls: Dynamic Sequential Action Button -->
  <div class="top-actions">
    {#if activeTab === "catalog"}
      {#if totalPhotos > 0}
        <!-- STEP 1 PRIMARY ACTION (僅在已載入照片時顯示) -->
        <button
          class="archival-btn-primary stepper-cta amber-glow"
          onclick={onGoToRetouch}
          title={t("nav.step1ActionTitle")}
        >
          <span class="material-symbols-outlined" style="font-size: 16px;"
            >tonality</span
          >
          <span class="btn-text-full">
            {#if flaggedCount > 0}
              {t("nav.retouchSelectedFull", { count: flaggedCount })}
            {:else}
              {t("nav.retouchAllFull")}
            {/if}
          </span>
          <span class="btn-text-short">
            {#if flaggedCount > 0}
              {t("nav.retouchSelectedShort", { count: flaggedCount })}
            {:else}
              {t("nav.retouchAllShort")}
            {/if}
          </span>
        </button>
      {/if}
    {:else if activeTab === "retouch"}
      {#if activeQueueLength > 0}
        <button
          class="archival-btn-secondary"
          onclick={onOpenQuickExport}
          title={t("nav.quickExport")}
          style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: var(--radius-xs); border: 1px solid var(--hairline-slate); background: var(--surface-panel); color: var(--amber-highlight); cursor: pointer; font-size: 11px; white-space: nowrap; flex-shrink: 0;"
        >
          <span class="material-symbols-outlined" style="font-size: 15px;"
            >bolt</span
          >
          <span class="btn-text-full">{t("nav.quickExport")}</span>
          <span class="btn-text-short">{t("nav.quickExportShort")}</span>
        </button>
        <!-- STEP 2 PRIMARY ACTION (僅在精修佇列有照片時顯示) -->
        <button
          class="archival-btn-primary stepper-cta cyan-glow"
          onclick={onGoToExport}
          title={t("nav.step2ActionTitle")}
        >
          <span class="material-symbols-outlined" style="font-size: 16px;"
            >output_circle</span
          >
          <span class="btn-text-full"
            >{t("nav.goToExportFull", { count: activeQueueLength })}</span
          >
          <span class="btn-text-short"
            >{t("nav.goToExportShort", { count: activeQueueLength })}</span
          >
        </button>
      {/if}
    {:else}
      <!-- STEP 3 PRIMARY ACTION (僅在導出佇列有照片時顯示) -->
      {#if activeQueueLength > 0}
        <button
          class="archival-btn-primary stepper-cta"
          onclick={onTriggerExport}
          disabled={isExporting}
          title={t("nav.step3ActionTitle")}
        >
          <span class="material-symbols-outlined" style="font-size: 16px;">
            {exportMode === "modeA" ? "bolt" : "hd"}
          </span>
          <span class="btn-text-full"
            >{isExporting
              ? t("nav.exporting")
              : t("nav.batchExportFull", { count: activeQueueLength })}</span
          >
          <span class="btn-text-short"
            >{isExporting
              ? t("nav.exporting")
              : t("nav.batchExportShort", { count: activeQueueLength })}</span
          >
        </button>
      {/if}
    {/if}

    <!-- Module Shortcuts: Profiles & Devices Settings (手機版已有底部導航，隱藏重複捷徑) -->
    {#if onGoToProfiles}
      <button
        type="button"
        class="help-trigger-btn hairline-all font-mono mobile-hide-shortcut"
        class:active={activeTab === "profiles"}
        onclick={onGoToProfiles}
        title={t("nav.profiles")}
        aria-label={t("nav.profiles")}
      >
        <span class="material-symbols-outlined icon">palette</span>
      </button>
    {/if}

    {#if onGoToDevices}
      <button
        type="button"
        class="help-trigger-btn hairline-all font-mono mobile-hide-shortcut"
        class:active={activeTab === "devices"}
        onclick={onGoToDevices}
        title={t("nav.devices")}
        aria-label={t("nav.devices")}
      >
        <span class="material-symbols-outlined icon">settings</span>
      </button>
    {/if}

    <!-- Language Switcher Dropdown -->
    <div class="locale-menu-wrapper">
      <button
        type="button"
        class="locale-trigger-btn hairline-all font-mono"
        class:active={isLocaleMenuOpen}
        onclick={() => { isLocaleMenuOpen = !isLocaleMenuOpen; }}
        title={t("locale.label")}
        aria-label={t("locale.label")}
        aria-expanded={isLocaleMenuOpen}
        aria-haspopup="menu"
      >
        <span class="material-symbols-outlined locale-icon">language</span>
        <span class="locale-code">{LOCALE_SHORT_LABELS[i18nStore.locale]}</span>
        <span class="locale-caret">▾</span>
      </button>

      {#if isLocaleMenuOpen}
        <div class="locale-menu-backdrop" onclick={() => { isLocaleMenuOpen = false; }} role="presentation"></div>
        <div class="locale-dropdown-menu hairline-all font-mono" role="menu">
          {#each SUPPORTED_LOCALES as loc}
            <button
              type="button"
              role="menuitemradio"
              aria-checked={i18nStore.locale === loc}
              class="locale-menu-item"
              class:selected={i18nStore.locale === loc}
              onclick={() => {
                i18nStore.setLocale(loc);
                isLocaleMenuOpen = false;
              }}
            >
              <span class="locale-item-label">{LOCALE_LABELS[loc]}</span>
              {#if i18nStore.locale === loc}
                <span class="material-symbols-outlined locale-check">check</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Help & Shortcuts Button -->
    <button
      type="button"
      class="help-trigger-btn hairline-all font-mono"
      onclick={onOpenHelp}
      title={isMobile ? t("nav.help") : t("nav.helpDesktop")}
      aria-label={isMobile ? t("nav.help") : t("nav.helpAriaDesktop")}
    >
      <span class="material-symbols-outlined icon">help_outline</span>
    </button>
  </div>
</header>

<style>
  .top-nav {
    height: 52px;
    background-color: var(--surface-panel);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
  }

  .locale-menu-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .locale-trigger-btn {
    height: 30px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
    background-color: var(--surface-elevated);
    color: var(--parchment-muted);
    font-size: 11px;
    letter-spacing: 0.04em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background-color 0.15s ease,
      border-color 0.15s ease;
  }

  .locale-trigger-btn:hover,
  .locale-trigger-btn.active {
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
  }

  .locale-icon {
    font-size: 14px;
  }

  .locale-caret {
    font-size: 10px;
    opacity: 0.75;
  }

  .locale-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 98;
  }

  .locale-dropdown-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 140px;
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    z-index: 99;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .locale-menu-item {
    width: 100%;
    padding: 6px 10px;
    border: none;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--parchment-muted);
    font-size: 12px;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    cursor: pointer;
    transition: background-color 0.12s ease, color 0.12s ease;
  }

  .locale-menu-item:hover {
    background-color: var(--surface-overlay);
    color: var(--parchment-bright);
  }

  .locale-menu-item.selected {
    color: var(--amber-highlight);
    background-color: rgba(212, 163, 115, 0.08);
  }

  .locale-check {
    font-size: 14px;
  }

  .brand-block {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .brand-icon-img {
    width: 24px;
    height: 24px;
    object-fit: contain;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.45));
    user-select: none;
    -webkit-user-drag: none;
  }
  .brand-titles {
    display: flex;
    flex-direction: column;
    white-space: nowrap;
  }
  .brand-title {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }
  .brand-sub {
    font-size: 9px;
    color: var(--parchment-dim);
    letter-spacing: 0.08em;
  }

  .dir-telemetry-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .dir-menu-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
  }

  .dir-dropdown-menu {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    width: 320px;
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-sm);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.65);
    z-index: 1001;
    display: flex;
    flex-direction: column;
    padding: 10px;
    animation: menuFadeIn 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes menuFadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dir-menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--hairline-slate);
    margin-bottom: 8px;
  }

  .dir-menu-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--parchment-bright);
    letter-spacing: 0.05em;
  }

  .dir-menu-close {
    background: transparent;
    border: none;
    color: var(--parchment-dim);
    cursor: pointer;
    font-size: 14px;
    padding: 2px 6px;
    border-radius: var(--radius-xs);
  }
  .dir-menu-close:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
  }

  .dir-menu-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .dir-menu-divider {
    height: 1px;
    background-color: var(--hairline-slate);
    margin: 8px 0;
  }

  .dir-menu-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--parchment-dim);
    margin-bottom: 6px;
    padding-left: 4px;
  }

  .dir-menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--radius-xs);
    background: transparent;
    border: 1px solid transparent;
    color: var(--parchment-bright);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }
  .dir-menu-item:hover {
    background-color: var(--surface-overlay);
    border-color: var(--hairline-slate);
  }
  .dir-menu-item.camera-item {
    background-color: rgba(94, 234, 212, 0.06);
    border-color: rgba(94, 234, 212, 0.2);
  }
  .dir-menu-item.camera-item:hover {
    background-color: rgba(94, 234, 212, 0.12);
    border-color: rgba(94, 234, 212, 0.4);
  }
  .dir-menu-item.camera-item .icon {
    color: #5eead4;
  }

  .dir-menu-item .icon {
    font-size: 18px;
    color: var(--parchment-muted);
    flex-shrink: 0;
  }

  .dir-menu-item:hover .icon {
    color: var(--amber-highlight);
  }

  .item-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .item-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--parchment-bright);
    line-height: 1.3;
  }

  .item-desc {
    font-size: 10px;
    color: var(--parchment-dim);
    line-height: 1.2;
    margin-top: 1px;
  }

  .recent-list {
    max-height: 140px;
    overflow-y: auto;
  }

  .device-telemetry {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    cursor: pointer;
    border: 1px solid var(--hairline-slate);
    color: inherit;
    transition: all 0.15s ease;
  }
  .device-telemetry:hover {
    border-color: var(--primary-indigo);
    background-color: var(--surface-overlay);
  }
  .device-telemetry.camera-detected {
    border-color: rgba(94, 234, 212, 0.4);
    background-color: rgba(94, 234, 212, 0.08);
  }
  .status-dot.has-camera {
    background-color: #5eead4;
    box-shadow: 0 0 8px #5eead4;
  }
  .camera-badge {
    color: #5eead4;
    font-weight: 600;
  }
  .status-dot {
    width: 6px;
    height: 6px;
    flex-shrink: 0;
    border-radius: 50%;
    background-color: var(--primary-indigo);
    box-shadow: 0 0 6px var(--primary-indigo);
  }
  .status-dot.scanning {
    background-color: var(--amber-highlight);
    box-shadow: 0 0 6px var(--amber-highlight);
    animation: dotPulse 0.8s ease-in-out infinite alternate;
  }
  @keyframes dotPulse {
    from {
      opacity: 0.4;
    }
    to {
      opacity: 1;
    }
  }
  .device-name {
    color: var(--parchment-bright);
  }
  .divider {
    color: var(--parchment-ghost);
  }
  .device-metric {
    color: var(--amber-highlight);
  }
  .dropdown-chevron {
    background: transparent;
    border: none;
    color: var(--parchment-dim);
    font-size: 11px;
    margin-left: 2px;
    padding: 0 4px;
    flex-shrink: 0;
    cursor: pointer;
    border-radius: var(--radius-xs);
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .dropdown-chevron:hover {
    color: var(--amber-highlight);
    background-color: var(--surface-overlay);
  }
  .device-telemetry:hover .dropdown-chevron {
    color: var(--parchment-bright);
  }

  .top-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .help-trigger-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-sm);
    color: var(--parchment-muted);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .help-trigger-btn:hover {
    color: var(--parchment-bright);
    border-color: var(--amber-highlight);
    background-color: var(--surface-overlay);
  }
  .help-trigger-btn.active {
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
    background-color: var(--surface-overlay);
    box-shadow: 0 0 10px rgba(212, 163, 115, 0.25);
  }
  .help-trigger-btn .icon {
    font-size: 18px;
    color: var(--amber-highlight);
  }

  /* 3-STEP SEQUENTIAL PIPELINE */
  .stepper-pipeline {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: rgba(22, 23, 26, 0.85);
    padding: 3px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--hairline-slate);
    user-select: none;
  }

  .stepper-step {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--parchment-dim);
    padding: 4px 8px;
    border-radius: var(--radius-xs);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .stepper-step:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-elevated);
  }

  .stepper-step.active {
    background-color: var(--surface-overlay);
    color: var(--parchment-bright);
    border-color: var(--hairline-slate);
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
  }

  .step-num {
    color: var(--primary-indigo);
    font-weight: 700;
    font-size: 10px;
  }

  .stepper-step.active .step-num {
    color: var(--amber-highlight);
  }

  .step-label {
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .step-tag {
    font-size: 10px;
    background-color: var(--surface-elevated);
    color: var(--parchment-dim);
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .step-tag.amber {
    color: var(--amber-highlight);
    border-color: rgba(226, 157, 82, 0.3);
    background-color: rgba(226, 157, 82, 0.1);
  }

  .stepper-sep {
    font-size: 10px;
    color: var(--parchment-ghost);
    opacity: 0.6;
  }

  /* 按鈕長短文案切換（預設桌面版顯示完整文案） */
  .btn-text-full {
    display: inline;
    white-space: nowrap;
  }
  .btn-text-short {
    display: none;
    white-space: nowrap;
  }

  /* STEPPER CTA HIGHLIGHTS */
  .stepper-cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .amber-glow {
    background: linear-gradient(
      135deg,
      var(--amber-highlight),
      #d48b3b
    ) !important;
    color: #121214 !important;
    border: 1px solid rgba(226, 157, 82, 0.9) !important;
    box-shadow: 0 0 14px rgba(226, 157, 82, 0.3);
  }

  .amber-glow:hover {
    filter: brightness(1.1);
    box-shadow: 0 0 18px rgba(226, 157, 82, 0.45);
  }

  .cyan-glow {
    background: linear-gradient(135deg, #4b92b6, #2d6b8c) !important;
    color: #ffffff !important;
    border: 1px solid rgba(75, 146, 182, 0.9) !important;
    box-shadow: 0 0 14px rgba(75, 146, 182, 0.3);
  }

  .cyan-glow:hover {
    filter: brightness(1.1);
    box-shadow: 0 0 18px rgba(75, 146, 182, 0.45);
  }

  /* ── 行動端頂部列響應式 (Mobile TopNav Layout) ── */
  @media (max-width: 768px) {
    .top-nav {
      height: 48px;
      padding: 0 10px;
      gap: 6px;
    }

    .mobile-hide-shortcut,
    .brand-sub,
    .device-metric,
    .divider,
    .stepper-pipeline,
    .btn-text-full {
      display: none;
    }

    .dir-telemetry-wrapper {
      min-width: 0;
      flex-shrink: 1;
    }

    .btn-text-short {
      display: inline;
    }

    .brand-title {
      font-size: 14px;
    }

    .device-telemetry {
      padding: 4px 8px;
      font-size: 10px;
      max-width: 140px;
      gap: 6px;
    }

    .device-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .top-actions {
      gap: 6px;
      flex-shrink: 0;
    }
  }

  @media (max-width: 480px) {
    .top-nav {
      padding: 0 8px;
    }

    .brand-block {
      gap: 6px;
    }

    .brand-title {
      font-size: 13px;
    }

    .device-telemetry {
      max-width: 120px;
      padding: 3px 6px;
      gap: 4px;
      font-size: 10px;
    }

    .help-trigger-btn {
      width: 28px;
      height: 28px;
    }

    .help-trigger-btn .icon {
      font-size: 16px;
    }
  }
</style>
