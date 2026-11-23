<script lang="ts">
  import { onMount } from "svelte";
  import { type CameraMountInfo } from "$lib/services/ingestionService";
  import KeyVaultModal from "$lib/components/KeyVaultModal.svelte";
  import HelpGuideModal from "$lib/components/HelpGuideModal.svelte";
  import QuickExportModal from "$lib/components/QuickExportModal.svelte";
  import KeyPromptModal from "$lib/components/KeyPromptModal.svelte";
  import TopNav from "$lib/components/navigation/TopNav.svelte";
  import MobileDrawerHandle from "$lib/components/navigation/MobileDrawerHandle.svelte";
  import MobileRetouchBar from "$lib/components/navigation/MobileRetouchBar.svelte";
  import MobileBottomNav from "$lib/components/navigation/MobileBottomNav.svelte";
  import PickedPreviewsRack from "$lib/components/catalog/PickedPreviewsRack.svelte";
  import AiProgressHud from "$lib/components/AiProgressHud.svelte";
  import CatalogView from "$lib/components/views/CatalogView.svelte";
  import RetouchView from "$lib/components/views/RetouchView.svelte";
  import AiAssistPanel from "$lib/components/retouch/AiAssistPanel.svelte";
  import TuningPanel from "$lib/components/retouch/TuningPanel.svelte";
  import ProfilesView from "$lib/components/views/ProfilesView.svelte";
  import ExportView from "$lib/components/views/ExportView.svelte";
  import DevicesView from "$lib/components/views/DevicesView.svelte";
  import { photoLibrary } from "$lib/stores/photoLibrary.svelte";
  import { darkroomState } from "$lib/stores/darkroomState.svelte";
  import { aiPipeline } from "$lib/stores/aiPipeline.svelte";
  import { lutCatalog } from "$lib/stores/lutCatalog.svelte";
  import {
    exportState,
    type BatchExportOptions,
  } from "$lib/stores/exportState.svelte";
  import { thumbnailRenderService } from "$lib/services/thumbnailRenderService.svelte";
  import { type CustomLutRecord } from "$lib/services/customLutService";
  import { type ExportFormat } from "$lib/services/exportService";
  import { SessionService } from "$lib/services/sessionService";
  import FilmFilterDefs from "$lib/components/FilmFilterDefs.svelte";
  import { mobileDrawerState } from "$lib/stores/mobileDrawer.svelte";
  import { drawerScrollPullDown } from "$lib/actions/drawerScrollPullDown";
  import { workspaceUi } from "$lib/stores/workspaceUi.svelte";
  import { createWorkspaceShortcuts } from "$lib/controllers/workspaceShortcuts";
  import { darkroomSync } from "$lib/stores/darkroomSync.svelte";
  import { type AiScopePreferences } from "$lib/types/photo";

  const drawerPullDownOptions = {
    isEnabled: () =>
      workspaceUi.activeTab === "retouch" &&
      mobileDrawerState.activeMobileDrawer !== "none",
    onDragStart: mobileDrawerState.handleDrawerDragStart,
    onDragMove: mobileDrawerState.handleDrawerDragMove,
    onDragEnd: mobileDrawerState.handleDrawerDragEnd,
  };

  const shortcuts = createWorkspaceShortcuts({
    applyProfile: darkroomSync.applyProfile,
    handleDeletePhotoFromDisk: (photo) => handleDeletePhotoFromDisk(photo),
    handleRemovePhoto: (photoId) => handleRemovePhoto(photoId),
    triggerExport: () => triggerExport(),
  });

  // Hardware & Photo Library State (由 photoLibrary Store 統一管理)
  type PhotoPlate = import("$lib/stores/photoLibrary.svelte").PhotoPlateItem;
  const photoPlates = $derived(photoLibrary.photoPlates);
  const activePhoto = $derived(photoLibrary.activePhoto);
  const isLoadingPhotos = $derived(photoLibrary.isLoadingPhotos);
  const currentDirectoryName = $derived(photoLibrary.currentDirectoryName);
  const cameraMounts = $derived(photoLibrary.cameraMounts);
  const isScanningMounts = $derived(photoLibrary.isScanningMounts);
  const latestExtractionMs = $derived(photoLibrary.latestExtractionMs);

  onMount(() => {
    refreshCameraMounts();
    workspaceUi.refreshKeyStatus();

    photoLibrary.onCatalogLoaded = () => {
      workspaceUi.activeTab = "catalog";
    };

    photoLibrary.onPhotoSelected = (plate) => {
      aiPipeline.loadFromPhoto(plate);
    };

    aiPipeline.onRequireApiKey = () => {
      workspaceUi.isKeyPromptModalOpen = true;
    };

    aiPipeline.onNotice = (message) => {
      exportState.showNotice(message, 2500);
    };

    aiPipeline.onTriggerRender = () => {
      workspaceUi.triggerWebglRender();
    };

    // 註冊離屏縮圖渲染完成後的狀態同步回呼
    thumbnailRenderService.onThumbnailRendered = (photoId, dataUrl) => {
      photoLibrary.photoPlates = photoLibrary.photoPlates.map((p) =>
        p.id === photoId ? { ...p, gradedThumbnail: dataUrl } : p,
      );
      if (
        photoLibrary.activePhoto &&
        photoLibrary.activePhoto.id === photoId &&
        photoLibrary.activePhoto.gradedThumbnail !== dataUrl
      ) {
        photoLibrary.activePhoto.gradedThumbnail = dataUrl;
      }
    };

    // 載入使用者自訂 3D LUT 並同步至 WebGL 著色器
    lutCatalog.loadCustomLuts().then(() => {
      thumbnailRenderService.syncCustomLuts();
    });

    // 背景熱插拔偵測：每 4 秒檢查一次外接相機與儲存裝置連線狀態
    const mountPollTimer = setInterval(() => {
      refreshCameraMounts();
    }, 4000);

    const handleFocus = () => {
      refreshCameraMounts();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(mountPollTimer);
      window.removeEventListener("focus", handleFocus);
    };
  });

  async function refreshCameraMounts() {
    await photoLibrary.refreshCameraMounts();
  }

  // AI 職責範圍偏好矩陣與推論狀態（由 aiPipeline Store 統一管理）
  const aiScope = $derived(aiPipeline.aiScope);
  const isAiScopeOpen = $derived(aiPipeline.isAiScopeOpen);
  const isAiAnalyzing = $derived(aiPipeline.isAiAnalyzing);
  const isBatchAiRunning = $derived(aiPipeline.isBatchAiRunning);
  const batchProgress = $derived(aiPipeline.batchProgress);
  const aiSuggestedScene = $derived(aiPipeline.aiSuggestedScene);
  const aiSceneTitle = $derived(aiPipeline.aiSceneTitle);
  const aiStyleInsight = $derived(aiPipeline.aiStyleInsight);
  const aiRecommendedMood = $derived(aiPipeline.aiRecommendedMood);
  const aiRecommendedProfile = $derived(aiPipeline.aiRecommendedProfile);
  const aiTerminalLogs = $derived(aiPipeline.aiTerminalLogs);
  const copiedLogNotice = $derived(aiPipeline.copiedLogNotice);
  const aiVisionTags = $derived(aiPipeline.aiVisionTags);

  function toggleAiScope(key: keyof AiScopePreferences) {
    aiPipeline.toggleAiScope(key);
  }

  // 3D LUT 典藏與自訂 LUT 清單（由 lutCatalog Store 統一管理）
  const profiles = lutCatalog.builtinProfiles;
  const userCustomLuts = $derived(lutCatalog.userCustomLuts);
  const allProfiles = $derived(lutCatalog.allProfiles);
  const allStyleGradingPresets = $derived(lutCatalog.allStyleGradingPresets);
  const stylePreviewThumbs = $derived(
    thumbnailRenderService.stylePreviewThumbs,
  );

  async function handleImportCustomLut(lut: CustomLutRecord) {
    await lutCatalog.importCustomLut(lut);
    thumbnailRenderService.syncCustomLuts();
    if (activePhoto?.thumbnail) {
      thumbnailRenderService.updateStylePreviewsForThumbnail(
        activePhoto.thumbnail,
        true,
      );
    }
  }

  async function handleDeleteCustomLut(id: string) {
    await lutCatalog.deleteCustomLut(id);
  }

  async function handleUpdateCustomLut(lut: CustomLutRecord) {
    await lutCatalog.updateCustomLut(lut);
    thumbnailRenderService.syncCustomLuts();
    if (activePhoto?.thumbnail) {
      thumbnailRenderService.updateStylePreviewsForThumbnail(
        activePhoto.thumbnail,
        true,
      );
    }
  }

  // Curatorial Queue: 若有標記挑圖 (flagged)，精修與匯出僅聚焦選取的相片；若無選取則全部顯示
  const activeQueue = $derived(photoLibrary.activeQueue);
  const flaggedCount = $derived(photoLibrary.flaggedCount);
  const flaggedPhotos = $derived(photoLibrary.flaggedPhotos);

  function togglePhotoFlag(photo: PhotoPlate, event?: MouseEvent) {
    photoLibrary.togglePhotoFlag(photo, event);
  }

  function clearAllFlags() {
    photoLibrary.clearAllFlags();
  }

  function handleFlagToggled() {
    photoLibrary.handleFlagToggled();
  }

  function selectPhoto(plate: PhotoPlate) {
    photoLibrary.selectPhoto(plate);
  }

  // 自動持久化相卷工作區進度至本機快取 (Session Auto-Persistence)
  $effect(() => {
    if (currentDirectoryName && photoPlates.length > 0) {
      SessionService.debouncedSaveSession(currentDirectoryName, photoPlates);
    }
  });

  // 保持 darkroomState 變更同步持久化到 activePhoto.tuning 與 activePhoto.crop
  $effect(() => {
    darkroomSync.trackAndSync();
  });

  $effect(() => {
    thumbnailRenderService.updateStylePreviewsForThumbnail(
      activePhoto?.thumbnail,
    );
  });

  async function handleDeletePhotoFromDisk(photo: PhotoPlate) {
    await photoLibrary.handleDeletePhotoFromDisk(photo);
  }

  async function handleBatchDeletePhotosFromDisk(photos: PhotoPlate[]) {
    await photoLibrary.handleBatchDeletePhotosFromDisk(photos);
  }

  function handleRemovePhoto(photoId: string) {
    photoLibrary.handleRemovePhoto(photoId);
  }

  function handleBatchRemovePhotos(photoIds: string[]) {
    photoLibrary.handleBatchRemovePhotos(photoIds);
  }

  async function handlePickDirectory() {
    await photoLibrary.handlePickDirectory();
  }

  async function handleAppendDirectory() {
    await photoLibrary.handleAppendDirectory();
  }

  async function handleAppendFiles() {
    await photoLibrary.handleAppendFiles();
  }

  async function handlePickGalleryPhotos() {
    await photoLibrary.handlePickGalleryPhotos();
  }

  async function handleAppendGalleryPhotos() {
    await photoLibrary.handleAppendGalleryPhotos();
  }

  async function handleLoadDirectoryByPath(path: string) {
    await photoLibrary.handleLoadDirectoryByPath(path);
  }

  async function handleFilesDropped(dataTransfer: DataTransfer) {
    await photoLibrary.handleFilesDropped(dataTransfer);
  }

  async function handleLoadCameraMount(mount: CameraMountInfo) {
    await photoLibrary.handleLoadCameraMount(mount);
  }

  async function handleSelectMountOrDirectory() {
    await photoLibrary.handleSelectMountOrDirectory();
  }

  // AI 管線操作委派至 aiPipeline Store
  async function copyTerminalLogs() {
    await aiPipeline.copyTerminalLogs();
  }

  async function runAiAnalysis(targetPhoto?: PhotoPlate): Promise<boolean> {
    return aiPipeline.runAiAnalysis(targetPhoto);
  }

  async function quickAiCrop() {
    await aiPipeline.quickAiCrop();
  }

  async function quickAiHorizon() {
    await aiPipeline.quickAiHorizon();
  }

  async function quickAiWhiteBalance() {
    await aiPipeline.quickAiWhiteBalance();
  }

  async function quickAiTone() {
    await aiPipeline.quickAiTone();
  }

  async function quickAiProfile() {
    await aiPipeline.quickAiProfile();
  }

  function requestBatchAiAnalysis() {
    aiPipeline.requestBatchAiAnalysis();
  }

  function cancelBatchAi() {
    aiPipeline.cancelBatchAi();
  }

  // Export Pipeline State (由 exportState Store 統一管理)
  const exportMode = $derived(exportState.exportMode);
  const exportProgress = $derived(exportState.exportProgress);
  const isExporting = $derived(exportState.isExporting);
  const exportNotice = $derived(exportState.exportNotice);

  async function handleSingleQuickExport(
    quickOptions:
      | "modeA"
      | "modeB"
      | {
          mode: "modeA" | "modeB";
          format: ExportFormat;
          quality: number;
          maxLongEdge: number | null;
        },
  ) {
    await exportState.handleSingleQuickExport(quickOptions);
  }

  async function triggerExport(
    subset?: PhotoPlate[],
    options?: BatchExportOptions,
  ) {
    await exportState.triggerExport(subset, options);
  }
</script>

<svelte:window
  onkeydown={shortcuts.handleKeydown}
  onkeyup={shortcuts.handleKeyup}
  onblur={shortcuts.handleWindowBlur}
/>

<div
  class="workspace-container"
  class:mobile-retouch-split={workspaceUi.activeTab === "retouch" &&
    mobileDrawerState.activeMobileDrawer !== "none"}
  class:mobile-drawer-expanded={workspaceUi.activeTab === "retouch" &&
    mobileDrawerState.activeMobileDrawer !== "none" &&
    mobileDrawerState.isMobileDrawerExpanded}
  class:mobile-drawer-dragging={mobileDrawerState.mobileDrawerDragHeight !== null}
  style:--mobile-drawer-drag-height={mobileDrawerState.mobileDrawerDragHeight !==
  null
    ? `${mobileDrawerState.mobileDrawerDragHeight}px`
    : undefined}
>
  <FilmFilterDefs />

  <!-- TOP HEADER / TELEMETRY STATUS BAR -->
  <TopNav
    activeTab={workspaceUi.activeTab}
    {cameraMounts}
    {isScanningMounts}
    {latestExtractionMs}
    {flaggedCount}
    totalPhotos={photoPlates.length}
    activeQueueLength={activeQueue.length}
    {exportMode}
    {isExporting}
    {currentDirectoryName}
    onSelectMount={handleSelectMountOrDirectory}
    onPickDirectory={handlePickDirectory}
    onAppendDirectory={handleAppendDirectory}
    onAppendFiles={handleAppendFiles}
    onPickGallery={handlePickGalleryPhotos}
    onAppendGallery={handleAppendGalleryPhotos}
    onSelectRecentDirectory={(path) => handleLoadDirectoryByPath(path)}
    onLoadCameraMount={(mount) => handleLoadCameraMount(mount)}
    onGoToCatalog={workspaceUi.goToCatalog}
    onGoToRetouch={workspaceUi.goToRetouch}
    onGoToExport={workspaceUi.goToExport}
    onGoToProfiles={() => (workspaceUi.activeTab = "profiles")}
    onGoToDevices={() => (workspaceUi.activeTab = "devices")}
    onOpenQuickExport={() => (workspaceUi.isQuickExportOpen = true)}
    onTriggerExport={() => triggerExport()}
    onOpenHelp={() => (workspaceUi.isHelpOpen = true)}
  />

  <!-- MAIN CURATORIAL WORKSPACE -->
  <main class="main-body">
    <!-- LEFT SIDEBAR: AI ASSISTANT PANEL (僅在暗房精修專屬呈現，其他頁面全幅展開) -->
    {#if workspaceUi.activeTab === "retouch"}
      <aside
        class="left-sidebar hairline-r"
        class:drawer-open={mobileDrawerState.activeMobileDrawer === "ai"}
        use:drawerScrollPullDown={drawerPullDownOptions}
      >
        <MobileDrawerHandle
          variant="split"
          activeMobileDrawer={mobileDrawerState.activeMobileDrawer}
          isExpanded={mobileDrawerState.isMobileDrawerExpanded}
          onSelectDrawer={(drawer) => mobileDrawerState.openMobileDrawer(drawer)}
          onToggleExpand={mobileDrawerState.toggleExpanded}
          onClose={() => mobileDrawerState.openMobileDrawer("none")}
          onDragStart={mobileDrawerState.handleDrawerDragStart}
          onDragMove={mobileDrawerState.handleDrawerDragMove}
          onDragEnd={mobileDrawerState.handleDrawerDragEnd}
        />

        <!-- AI Scene Assistant (100% 垂直高度專屬呈現，免去冗長捲動) -->
        <AiAssistPanel
          styleGradingPresets={allStyleGradingPresets}
          {stylePreviewThumbs}
          geminiKeyStatus={workspaceUi.geminiKeyStatus}
          {activePhoto}
          photos={photoPlates}
          hasAiBaseline={darkroomSync.hasAiBaseline}
          isModifiedFromAi={darkroomSync.isModifiedFromAi}
          onRestoreAiTuning={darkroomSync.restoreAiTuning}
          {isAiAnalyzing}
          {isBatchAiRunning}
          {batchProgress}
          {aiTerminalLogs}
          {aiSceneTitle}
          {aiSuggestedScene}
          {aiRecommendedMood}
          {aiStyleInsight}
          aiCropRationale={darkroomState.aiCropRationale}
          {aiVisionTags}
          {aiScope}
          {isAiScopeOpen}
          {copiedLogNotice}
          onToggleAiScope={toggleAiScope}
          onToggleIsAiScopeOpen={() => {
            aiPipeline.toggleAiScopeOpen();
          }}
          onCopyTerminalLogs={copyTerminalLogs}
          onRunAiAnalysis={() => runAiAnalysis()}
          onIterateAiTuning={(prompt?: string) =>
            darkroomSync.runIterativeAiRefinement(prompt)}
          onRequestBatchAi={requestBatchAiAnalysis}
          onCancelBatchAi={cancelBatchAi}
          onOpenVault={() => (workspaceUi.isVaultOpen = true)}
          onHoverProfile={(profileId) => {
            darkroomSync.previewHoverProfileId = profileId;
            workspaceUi.triggerWebglRender();
          }}
          onApplyProfile={(id) => darkroomSync.applyProfile(id)}
        />
      </aside>
    {/if}

    <!-- CENTER STAGE: PHOTOGRAPHIC PLATE VIEWPORT -->
    <section class="center-stage">
      {#if workspaceUi.activeTab === "catalog"}
        <!-- MODULE 1: CATALOG MATRIX (Phase 3 Virtual Grid) -->
        <CatalogView
          photos={photoPlates}
          {activePhoto}
          {isLoadingPhotos}
          hasApiKey={workspaceUi.hasKey}
          onOpenVault={() => (workspaceUi.isVaultOpen = true)}
          onSelectPhoto={(p) => selectPhoto(p)}
          onOpenRetouch={(p) => workspaceUi.openRetouchForPhoto(p)}
          onGoToRetouch={workspaceUi.goToRetouch}
          onPickDirectory={handlePickDirectory}
          onAppendDirectory={handleAppendDirectory}
          onAppendFiles={handleAppendFiles}
          onPickGallery={handlePickGalleryPhotos}
          onAppendGallery={handleAppendGalleryPhotos}
          onRemovePhoto={(p) => handleRemovePhoto(p.id)}
          onBatchRemovePhotos={(ids) => handleBatchRemovePhotos(ids)}
          onDeletePhotoFromDisk={(p) => handleDeletePhotoFromDisk(p)}
          onBatchDeletePhotosFromDisk={(photos) =>
            handleBatchDeletePhotosFromDisk(photos)}
          onRefreshMounts={refreshCameraMounts}
          onToggleFlag={handleFlagToggled}
          onFilesDropped={handleFilesDropped}
          {cameraMounts}
          onLoadCameraMount={(m) => handleLoadCameraMount(m)}
          onRetryThumbnail={(photoId) => photoLibrary.retryPhotoThumbnail(photoId)}
          onPrioritizePhotos={(ids) => photoLibrary.prioritizePhotoIds(ids)}
        />
      {:else if workspaceUi.activeTab === "retouch"}
        <!-- MODULE 2: RETOUCH DARKROOM WORKBENCH -->
        <RetouchView
          bind:this={workspaceUi.retouchViewRef}
          {activePhoto}
          photos={photoPlates}
          {activeQueue}
          {exportNotice}
          showABComparison={darkroomState.showABComparison}
          previewHoverProfileId={darkroomSync.previewHoverProfileId}
          hasApiKey={workspaceUi.hasKey}
          {isAiAnalyzing}
          {isBatchAiRunning}
          {batchProgress}
          {aiSceneTitle}
          {aiTerminalLogs}
          hasAiBaseline={darkroomSync.hasAiBaseline}
          isModifiedFromAi={darkroomSync.isModifiedFromAi}
          isMobileDrawerOpen={mobileDrawerState.activeMobileDrawer !== "none"}
          onRestoreAiTuning={darkroomSync.restoreAiTuning}
          onOpenAiDrawer={() => mobileDrawerState.openMobileDrawer("ai")}
          onOpenVault={() => (workspaceUi.isVaultOpen = true)}
          onSelectPhoto={(p) => selectPhoto(p as any)}
          onOpenQuickExport={() => (workspaceUi.isQuickExportOpen = true)}
          onGoToCatalog={workspaceUi.goToCatalog}
          onPickDirectory={handlePickDirectory}
          onPickGallery={handlePickGalleryPhotos}
          onRefreshMounts={refreshCameraMounts}
          onResetCropState={darkroomSync.resetCropState}
          onSyncCropToActivePhoto={darkroomSync.syncCropToActivePhoto}
        />
      {:else if workspaceUi.activeTab === "profiles"}
        <!-- MODULE 3: 3D LUT PROFILES VAULT -->
        <ProfilesView
          profiles={allProfiles}
          activeProfileId={activePhoto
            ? activePhoto.appliedProfile
            : "Profile_01_Fieldnote"}
          activePhotoTitle={activePhoto ? activePhoto.filename : "尚未選取相片"}
          onApplyProfile={(id) => darkroomSync.applyProfile(id)}
          onApplyToAll={(id) => darkroomSync.applyProfileToAll(id)}
          onImportCustomLut={handleImportCustomLut}
          onUpdateCustomLut={handleUpdateCustomLut}
          onDeleteCustomLut={handleDeleteCustomLut}
          onGoToRetouch={workspaceUi.goToRetouch}
          onGoToCatalog={workspaceUi.goToCatalog}
        />
      {:else if workspaceUi.activeTab === "export"}
        <!-- MODULE 4: DUAL PIPELINE EXPORT DOCK (BOUND TO PHOTO PLATES WITH SCOPE SELECTOR) -->
        <ExportView
          photos={photoPlates}
          {activePhoto}
          {exportMode}
          {isExporting}
          {exportProgress}
          {exportNotice}
          {aiVisionTags}
          {aiSceneTitle}
          onSetExportMode={(m: "modeA" | "modeB") =>
            (exportState.exportMode = m)}
          onTriggerExport={(subset, options) =>
            triggerExport(subset as PhotoPlate[], options)}
          onGoToRetouch={workspaceUi.goToRetouch}
          onGoToCatalog={workspaceUi.goToCatalog}
        />
      {:else if workspaceUi.activeTab === "devices"}
        <!-- MODULE 5: HARDWARE MOUNTS & STORAGE SETTINGS -->
        <DevicesView
          {cameraMounts}
          {isScanningMounts}
          geminiKeyStatus={workspaceUi.geminiKeyStatus}
          groqKeyStatus={workspaceUi.groqKeyStatus}
          onRefreshMounts={refreshCameraMounts}
          onOpenVault={() => (workspaceUi.isVaultOpen = true)}
          onLoadMount={(m: CameraMountInfo) => handleLoadCameraMount(m)}
          onPickDirectory={handlePickDirectory}
          onGoToCatalog={workspaceUi.goToCatalog}
          onGoToRetouch={workspaceUi.goToRetouch}
        />
      {/if}

      <AiProgressHud
        activeTab={workspaceUi.activeTab}
        activePhotoId={activePhoto?.id}
        onFocusPhoto={() => {
          workspaceUi.activeTab = "retouch";
          requestAnimationFrame(() => {
            workspaceUi.triggerWebglRender();
          });
        }}
      />
    </section>

    {#if workspaceUi.activeTab === "retouch" || (workspaceUi.activeTab === "catalog" && flaggedCount > 0)}
      <!-- RIGHT SIDEBAR: RETOUCH COLOR DOCK OR CATALOG SELECTION RACK (僅在精修或有挑圖時滑出) -->
      <aside
        class="right-telemetry hairline-l"
        class:drawer-open={mobileDrawerState.activeMobileDrawer === "tuning"}
        use:drawerScrollPullDown={drawerPullDownOptions}
      >
        <MobileDrawerHandle
          variant={workspaceUi.activeTab === "retouch" ? "split" : "drag"}
          activeMobileDrawer={mobileDrawerState.activeMobileDrawer}
          isExpanded={mobileDrawerState.isMobileDrawerExpanded}
          onSelectDrawer={(drawer) => mobileDrawerState.openMobileDrawer(drawer)}
          onToggleExpand={workspaceUi.activeTab === "retouch"
            ? mobileDrawerState.toggleExpanded
            : undefined}
          onClose={() => mobileDrawerState.openMobileDrawer("none")}
          onDragStart={mobileDrawerState.handleDrawerDragStart}
          onDragMove={mobileDrawerState.handleDrawerDragMove}
          onDragEnd={mobileDrawerState.handleDrawerDragEnd}
        />
        {#if workspaceUi.activeTab === "retouch"}
          <TuningPanel
            profiles={allProfiles}
            styleGradingPresets={allStyleGradingPresets}
            hasAiBaseline={darkroomSync.hasAiBaseline}
            isModifiedFromAi={darkroomSync.isModifiedFromAi}
            {activePhoto}
            activeProfileId={activePhoto?.appliedProfile}
            onRestoreAiTuning={darkroomSync.restoreAiTuning}
            onIterateAiTuning={() =>
              darkroomSync.runIterativeAiRefinement(undefined, true)}
            onQuickAiTone={quickAiTone}
            onQuickAiWhiteBalance={quickAiWhiteBalance}
            onResetToAsShot={darkroomSync.resetToAsShot}
            onResetTuningParams={darkroomSync.resetTuningParams}
            onQuickAiCrop={quickAiCrop}
            onQuickAiHorizon={quickAiHorizon}
            onQuickAiProfile={quickAiProfile}
            onApplyProfile={(id) => darkroomSync.applyProfile(id)}
            onHoverProfile={(profileId) => {
              darkroomSync.previewHoverProfileId = profileId;
              workspaceUi.triggerWebglRender();
            }}
            onOpenQuickExport={() => (workspaceUi.isQuickExportOpen = true)}
            onGoToExport={workspaceUi.goToExport}
          />
        {:else if workspaceUi.activeTab === "catalog"}
          <!-- CATALOG STAGE: 勾選的圖片預覽清單與前往精修導引 -->
          <PickedPreviewsRack
            {flaggedPhotos}
            activePhotoId={activePhoto?.id}
            totalPhotos={photoPlates.length}
            onSelectPhoto={(p) => selectPhoto(p)}
            onOpenRetouch={(p) => workspaceUi.openRetouchForPhoto(p)}
            onToggleFlag={(p, e) => togglePhotoFlag(p, e)}
            onClearAllFlags={clearAllFlags}
            onGoToRetouch={workspaceUi.goToRetouch}
          />
        {/if}
      </aside>
    {/if}
  </main>

  {#if mobileDrawerState.activeMobileDrawer !== "none" && workspaceUi.activeTab !== "retouch"}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="mobile-drawer-backdrop"
      onclick={() => mobileDrawerState.openMobileDrawer("none")}
    ></div>
  {/if}

  {#if workspaceUi.activeTab === "retouch"}
    <MobileRetouchBar
      isHidden={mobileDrawerState.activeMobileDrawer !== "none"}
      {isAiAnalyzing}
      {isBatchAiRunning}
      hasActivePhoto={Boolean(activePhoto)}
      hasCustomStylePrompt={Boolean(darkroomState.customStylePrompt.trim())}
      totalPhotos={photoPlates.length}
      {flaggedCount}
      {batchProgress}
      activeMobileDrawer={mobileDrawerState.activeMobileDrawer}
      onRunAiAnalysis={() => runAiAnalysis()}
      onCancelBatchAi={cancelBatchAi}
      onRequestBatchAi={requestBatchAiAnalysis}
      onToggleDrawer={(drawer) =>
        mobileDrawerState.openMobileDrawer(
          mobileDrawerState.activeMobileDrawer === drawer ? "none" : drawer,
        )}
      onSwipeOpen={() =>
        mobileDrawerState.openMobileDrawer(mobileDrawerState.lastRetouchDrawer)}
    />
  {/if}

  <MobileBottomNav
    activeTab={workspaceUi.activeTab}
    {flaggedCount}
    isHidden={workspaceUi.activeTab === "retouch" &&
      mobileDrawerState.activeMobileDrawer !== "none"}
    onSelectTab={(tab) => {
      workspaceUi.activeTab = tab;
      mobileDrawerState.openMobileDrawer("none");
    }}
  />

  <!-- 未配置金鑰引導確認 Modal (API Key Required Prompt) -->
  <KeyPromptModal
    bind:isOpen={workspaceUi.isKeyPromptModalOpen}
    onOpenVault={workspaceUi.openVaultFromPrompt}
  />

  <!-- AI Key Vault Modal -->
  <KeyVaultModal
    bind:isOpen={workspaceUi.isVaultOpen}
    onClose={workspaceUi.refreshKeyStatus}
  />

  <!-- Curatorial Workflow & Keyboard Shortcuts Cheat Sheet Modal -->
  <HelpGuideModal
    bind:isOpen={workspaceUi.isHelpOpen}
    onClose={() => (workspaceUi.isHelpOpen = false)}
  />

  <!-- Single Photo Quick Export Modal (⌘E) -->
  <QuickExportModal
    bind:isOpen={workspaceUi.isQuickExportOpen}
    photo={activePhoto}
    {exportMode}
    onClose={() => (workspaceUi.isQuickExportOpen = false)}
    onExport={handleSingleQuickExport}
  />
</div>

<style>
  .workspace-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    width: 100vw;
    background-color: var(--canvas-base);
    color: var(--parchment-bright);
    overflow: hidden;
  }

  /* MAIN WORKSPACE LAYOUT */
  .main-body {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  /* LEFT SIDEBAR */
  .left-sidebar {
    width: var(--sidebar-width);
    background-color: var(--surface-panel);
    display: flex;
    flex-direction: column;
    padding: 0;
    flex-shrink: 0;
    /* 讓內部 AiAssistPanel 自行管理彈性捲動區與底部常駐執行列 */
    min-height: 0;
    overflow: hidden;
  }

  /* CENTER STAGE */
  .center-stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: var(--canvas-base);
    overflow: hidden;
    position: relative;
    min-height: 0;
    min-width: 0;
  }

  /* RIGHT TELEMETRY SIDEBAR */
  .right-telemetry {
    width: var(--telemetry-width);
    background-color: var(--surface-panel);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable;
    flex-shrink: 0;
  }

  /* 桌面端預設隱藏手機專屬抽屜遮罩 */
  .mobile-drawer-backdrop {
    display: none;
  }

  /* ── 行動端暗房佈局與抽屜動效 (Mobile Darkroom Responsive Layout & Bottom Sheet) ── */
  @media (max-width: 768px) {
    .left-sidebar,
    .right-telemetry {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100% !important;
      max-height: 72vh;
      z-index: 1000;
      background-color: var(--surface-panel);
      border-radius: 18px 18px 0 0;
      box-shadow: 0 -8px 36px rgba(0, 0, 0, 0.85);
      border-top: 1px solid var(--hairline-slate);
      transform: translateY(100%);
      transition:
        transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
        opacity 0.2s ease,
        visibility 0.28s;
      padding: 10px 14px 20px;
      display: flex;
      visibility: hidden;
      pointer-events: none;
      opacity: 0;
    }

    .left-sidebar.drawer-open,
    .right-telemetry.drawer-open {
      bottom: 50px;
      transform: translateY(0);
      visibility: visible;
      pointer-events: auto;
      opacity: 1;
    }

    /* 手機版精修分割視窗（上圖下控）：展開風格／微調時不遮蓋照片 */
    .workspace-container.mobile-retouch-split .main-body {
      flex-direction: column;
    }

    .workspace-container.mobile-retouch-split .center-stage {
      order: 1;
      flex: 1 1 0%;
      min-height: 0;
    }

    .workspace-container.mobile-retouch-split .left-sidebar:not(.drawer-open),
    .workspace-container.mobile-retouch-split
      .right-telemetry:not(.drawer-open) {
      display: none;
    }

    .workspace-container.mobile-retouch-split .left-sidebar.drawer-open,
    .workspace-container.mobile-retouch-split .right-telemetry.drawer-open {
      order: 2;
      position: static;
      transform: none;
      bottom: auto;
      flex: 0 0 46dvh;
      height: 46dvh;
      max-height: 46dvh;
      min-height: 0;
      width: 100% !important;
      border-radius: 14px 14px 0 0;
      padding: 0 12px calc(12px + env(safe-area-inset-bottom, 0px));
      box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.75);
      z-index: 20;
      transition:
        flex-basis 0.2s ease,
        height 0.2s ease,
        max-height 0.2s ease;
    }

    .workspace-container.mobile-retouch-split.mobile-drawer-expanded
      .left-sidebar.drawer-open,
    .workspace-container.mobile-retouch-split.mobile-drawer-expanded
      .right-telemetry.drawer-open {
      flex: 0 0 74dvh;
      height: 74dvh;
      max-height: 74dvh;
    }

    /* 拖曳手勢進行中：即時跟手高度並暫停過渡動畫 */
    .workspace-container.mobile-retouch-split.mobile-drawer-dragging
      .left-sidebar.drawer-open,
    .workspace-container.mobile-retouch-split.mobile-drawer-dragging
      .right-telemetry.drawer-open {
      flex: 0 0 var(--mobile-drawer-drag-height, 46dvh);
      height: var(--mobile-drawer-drag-height, 46dvh);
      max-height: var(--mobile-drawer-drag-height, 46dvh);
      transition: none;
    }

    /* 抽屜全螢幕暗色遮罩 */
    .mobile-drawer-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(3px);
      z-index: 999;
    }
  }
</style>
