<script lang="ts">
  import { type CameraMountInfo } from "$lib/services/ingestionService";
  import { onMount } from "svelte";
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
  import { exportState } from "$lib/stores/exportState.svelte";
  import { thumbnailRenderService } from "$lib/services/thumbnailRenderService.svelte";
  import { type CustomLutRecord } from "$lib/services/customLutService";
  import { SessionService } from "$lib/services/sessionService";
  import FilmFilterDefs from "$lib/components/FilmFilterDefs.svelte";
  import { mobileDrawerState } from "$lib/stores/mobileDrawer.svelte";
  import { drawerScrollPullDown } from "$lib/actions/drawerScrollPullDown";
  import { workspaceUi } from "$lib/stores/workspaceUi.svelte";
  import { createWorkspaceShortcuts } from "$lib/controllers/workspaceShortcuts";
  import { initWorkspace } from "$lib/controllers/workspaceBootstrap";
  import { darkroomSync } from "$lib/stores/darkroomSync.svelte";

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
    handleDeletePhotoFromDisk: (photo) =>
      photoLibrary.handleDeletePhotoFromDisk(photo),
    handleRemovePhoto: (photoId) => photoLibrary.handleRemovePhoto(photoId),
    triggerExport: () => exportState.triggerExport(),
  });

  type PhotoPlate = import("$lib/stores/photoLibrary.svelte").PhotoPlateItem;

  onMount(() => initWorkspace());

  function syncCustomLutPreviews() {
    thumbnailRenderService.syncCustomLuts();
    const thumb = photoLibrary.activePhoto?.thumbnail;
    if (thumb) {
      thumbnailRenderService.updateStylePreviewsForThumbnail(thumb, true);
    }
  }

  async function handleImportCustomLut(lut: CustomLutRecord) {
    await lutCatalog.importCustomLut(lut);
    syncCustomLutPreviews();
  }

  async function handleUpdateCustomLut(lut: CustomLutRecord) {
    await lutCatalog.updateCustomLut(lut);
    syncCustomLutPreviews();
  }

  // 自動持久化相卷工作區進度至本機快取 (Session Auto-Persistence)
  $effect(() => {
    if (
      photoLibrary.currentDirectoryName &&
      photoLibrary.photoPlates.length > 0
    ) {
      SessionService.debouncedSaveSession(
        photoLibrary.currentDirectoryName,
        photoLibrary.photoPlates,
      );
    }
  });

  // 保持 darkroomState 變更同步持久化到 activePhoto.tuning 與 activePhoto.crop
  $effect(() => {
    darkroomSync.trackAndSync();
  });

  $effect(() => {
    thumbnailRenderService.updateStylePreviewsForThumbnail(
      photoLibrary.activePhoto?.thumbnail,
    );
  });
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
    cameraMounts={photoLibrary.cameraMounts}
    isScanningMounts={photoLibrary.isScanningMounts}
    latestExtractionMs={photoLibrary.latestExtractionMs}
    flaggedCount={photoLibrary.flaggedCount}
    totalPhotos={photoLibrary.photoPlates.length}
    activeQueueLength={photoLibrary.activeQueue.length}
    exportMode={exportState.exportMode}
    isExporting={exportState.isExporting}
    currentDirectoryName={photoLibrary.currentDirectoryName}
    onSelectMount={photoLibrary.handleSelectMountOrDirectory}
    onPickDirectory={photoLibrary.handlePickDirectory}
    onAppendDirectory={photoLibrary.handleAppendDirectory}
    onAppendFiles={photoLibrary.handleAppendFiles}
    onPickGallery={photoLibrary.handlePickGalleryPhotos}
    onAppendGallery={photoLibrary.handleAppendGalleryPhotos}
    onSelectRecentDirectory={(path) => photoLibrary.handleLoadDirectoryByPath(path)}
    onLoadCameraMount={(mount) => photoLibrary.handleLoadCameraMount(mount)}
    onGoToCatalog={workspaceUi.goToCatalog}
    onGoToRetouch={workspaceUi.goToRetouch}
    onGoToExport={workspaceUi.goToExport}
    onGoToProfiles={() => (workspaceUi.activeTab = "profiles")}
    onGoToDevices={() => (workspaceUi.activeTab = "devices")}
    onOpenQuickExport={() => (workspaceUi.isQuickExportOpen = true)}
    onTriggerExport={() => exportState.triggerExport()}
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
          styleGradingPresets={lutCatalog.allStyleGradingPresets}
          stylePreviewThumbs={thumbnailRenderService.stylePreviewThumbs}
          geminiKeyStatus={workspaceUi.geminiKeyStatus}
          activePhoto={photoLibrary.activePhoto}
          photos={photoLibrary.photoPlates}
          hasAiBaseline={darkroomSync.hasAiBaseline}
          isModifiedFromAi={darkroomSync.isModifiedFromAi}
          onRestoreAiTuning={darkroomSync.restoreAiTuning}
          isAiAnalyzing={aiPipeline.isAiAnalyzing}
          isBatchAiRunning={aiPipeline.isBatchAiRunning}
          batchProgress={aiPipeline.batchProgress}
          aiTerminalLogs={aiPipeline.aiTerminalLogs}
          aiSceneTitle={aiPipeline.aiSceneTitle}
          aiSuggestedScene={aiPipeline.aiSuggestedScene}
          aiRecommendedMood={aiPipeline.aiRecommendedMood}
          aiStyleInsight={aiPipeline.aiStyleInsight}
          aiCropRationale={darkroomState.aiCropRationale}
          aiVisionTags={aiPipeline.aiVisionTags}
          aiScope={aiPipeline.aiScope}
          isAiScopeOpen={aiPipeline.isAiScopeOpen}
          copiedLogNotice={aiPipeline.copiedLogNotice}
          onToggleAiScope={aiPipeline.toggleAiScope}
          onToggleIsAiScopeOpen={() => {
            aiPipeline.toggleAiScopeOpen();
          }}
          onCopyTerminalLogs={aiPipeline.copyTerminalLogs}
          onRunAiAnalysis={() => aiPipeline.runAiAnalysis()}
          onIterateAiTuning={(prompt?: string) =>
            darkroomSync.runIterativeAiRefinement(prompt)}
          onRequestBatchAi={aiPipeline.requestBatchAiAnalysis}
          onCancelBatchAi={aiPipeline.cancelBatchAi}
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
          photos={photoLibrary.photoPlates}
          activePhoto={photoLibrary.activePhoto}
          isLoadingPhotos={photoLibrary.isLoadingPhotos}
          hasApiKey={workspaceUi.hasKey}
          onOpenVault={() => (workspaceUi.isVaultOpen = true)}
          onSelectPhoto={(p) => photoLibrary.selectPhoto(p)}
          onOpenRetouch={(p) => workspaceUi.openRetouchForPhoto(p)}
          onGoToRetouch={workspaceUi.goToRetouch}
          onPickDirectory={photoLibrary.handlePickDirectory}
          onAppendDirectory={photoLibrary.handleAppendDirectory}
          onAppendFiles={photoLibrary.handleAppendFiles}
          onPickGallery={photoLibrary.handlePickGalleryPhotos}
          onAppendGallery={photoLibrary.handleAppendGalleryPhotos}
          onRemovePhoto={(p) => photoLibrary.handleRemovePhoto(p.id)}
          onBatchRemovePhotos={(ids) => photoLibrary.handleBatchRemovePhotos(ids)}
          onDeletePhotoFromDisk={(p) => photoLibrary.handleDeletePhotoFromDisk(p)}
          onBatchDeletePhotosFromDisk={(photos) =>
            photoLibrary.handleBatchDeletePhotosFromDisk(photos)}
          onRefreshMounts={photoLibrary.refreshCameraMounts}
          onToggleFlag={photoLibrary.handleFlagToggled}
          onFilesDropped={photoLibrary.handleFilesDropped}
          cameraMounts={photoLibrary.cameraMounts}
          onLoadCameraMount={(m) => photoLibrary.handleLoadCameraMount(m)}
          onRetryThumbnail={(photoId) => photoLibrary.retryPhotoThumbnail(photoId)}
          onPrioritizePhotos={(ids) => photoLibrary.prioritizePhotoIds(ids)}
        />
      {:else if workspaceUi.activeTab === "retouch"}
        <!-- MODULE 2: RETOUCH DARKROOM WORKBENCH -->
        <RetouchView
          bind:this={workspaceUi.retouchViewRef}
          activePhoto={photoLibrary.activePhoto}
          photos={photoLibrary.photoPlates}
          activeQueue={photoLibrary.activeQueue}
          exportNotice={exportState.exportNotice}
          showABComparison={darkroomState.showABComparison}
          previewHoverProfileId={darkroomSync.previewHoverProfileId}
          hasApiKey={workspaceUi.hasKey}
          isAiAnalyzing={aiPipeline.isAiAnalyzing}
          isBatchAiRunning={aiPipeline.isBatchAiRunning}
          batchProgress={aiPipeline.batchProgress}
          aiSceneTitle={aiPipeline.aiSceneTitle}
          aiTerminalLogs={aiPipeline.aiTerminalLogs}
          hasAiBaseline={darkroomSync.hasAiBaseline}
          isModifiedFromAi={darkroomSync.isModifiedFromAi}
          isMobileDrawerOpen={mobileDrawerState.activeMobileDrawer !== "none"}
          onRestoreAiTuning={darkroomSync.restoreAiTuning}
          onOpenAiDrawer={() => mobileDrawerState.openMobileDrawer("ai")}
          onOpenVault={() => (workspaceUi.isVaultOpen = true)}
          onSelectPhoto={(p) => photoLibrary.selectPhoto(p as any)}
          onOpenQuickExport={() => (workspaceUi.isQuickExportOpen = true)}
          onGoToCatalog={workspaceUi.goToCatalog}
          onPickDirectory={photoLibrary.handlePickDirectory}
          onPickGallery={photoLibrary.handlePickGalleryPhotos}
          onRefreshMounts={photoLibrary.refreshCameraMounts}
          onResetCropState={darkroomSync.resetCropState}
          onSyncCropToActivePhoto={darkroomSync.syncCropToActivePhoto}
        />
      {:else if workspaceUi.activeTab === "profiles"}
        <!-- MODULE 3: 3D LUT PROFILES VAULT -->
        <ProfilesView
          profiles={lutCatalog.allProfiles}
          activeProfileId={photoLibrary.activePhoto
            ? photoLibrary.activePhoto.appliedProfile
            : "Profile_01_Fieldnote"}
          activePhotoTitle={photoLibrary.activePhoto
            ? photoLibrary.activePhoto.filename
            : "尚未選取相片"}
          onApplyProfile={(id) => darkroomSync.applyProfile(id)}
          onApplyToAll={(id) => darkroomSync.applyProfileToAll(id)}
          onImportCustomLut={handleImportCustomLut}
          onUpdateCustomLut={handleUpdateCustomLut}
          onDeleteCustomLut={async (id) => {
            await lutCatalog.deleteCustomLut(id);
          }}
          onGoToRetouch={workspaceUi.goToRetouch}
          onGoToCatalog={workspaceUi.goToCatalog}
        />
      {:else if workspaceUi.activeTab === "export"}
        <!-- MODULE 4: DUAL PIPELINE EXPORT DOCK (BOUND TO PHOTO PLATES WITH SCOPE SELECTOR) -->
        <ExportView
          photos={photoLibrary.photoPlates}
          activePhoto={photoLibrary.activePhoto}
          exportMode={exportState.exportMode}
          isExporting={exportState.isExporting}
          exportProgress={exportState.exportProgress}
          exportNotice={exportState.exportNotice}
          aiVisionTags={aiPipeline.aiVisionTags}
          aiSceneTitle={aiPipeline.aiSceneTitle}
          onSetExportMode={(m: "modeA" | "modeB") =>
            (exportState.exportMode = m)}
          onTriggerExport={(subset, options) =>
            exportState.triggerExport(subset as PhotoPlate[], options)}
          onGoToRetouch={workspaceUi.goToRetouch}
          onGoToCatalog={workspaceUi.goToCatalog}
        />
      {:else if workspaceUi.activeTab === "devices"}
        <!-- MODULE 5: HARDWARE MOUNTS & STORAGE SETTINGS -->
        <DevicesView
          cameraMounts={photoLibrary.cameraMounts}
          isScanningMounts={photoLibrary.isScanningMounts}
          geminiKeyStatus={workspaceUi.geminiKeyStatus}
          groqKeyStatus={workspaceUi.groqKeyStatus}
          onRefreshMounts={photoLibrary.refreshCameraMounts}
          onOpenVault={() => (workspaceUi.isVaultOpen = true)}
          onLoadMount={(m: CameraMountInfo) => photoLibrary.handleLoadCameraMount(m)}
          onPickDirectory={photoLibrary.handlePickDirectory}
          onGoToCatalog={workspaceUi.goToCatalog}
          onGoToRetouch={workspaceUi.goToRetouch}
        />
      {/if}

      <AiProgressHud
        activeTab={workspaceUi.activeTab}
        activePhotoId={photoLibrary.activePhoto?.id}
        onFocusPhoto={() => {
          workspaceUi.activeTab = "retouch";
          requestAnimationFrame(() => {
            workspaceUi.triggerWebglRender();
          });
        }}
      />
    </section>

    {#if workspaceUi.activeTab === "retouch" || (workspaceUi.activeTab === "catalog" && photoLibrary.flaggedCount > 0)}
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
            profiles={lutCatalog.allProfiles}
            styleGradingPresets={lutCatalog.allStyleGradingPresets}
            hasAiBaseline={darkroomSync.hasAiBaseline}
            isModifiedFromAi={darkroomSync.isModifiedFromAi}
            activePhoto={photoLibrary.activePhoto}
            activeProfileId={photoLibrary.activePhoto?.appliedProfile}
            onRestoreAiTuning={darkroomSync.restoreAiTuning}
            onIterateAiTuning={() =>
              darkroomSync.runIterativeAiRefinement(undefined, true)}
            onQuickAiTone={aiPipeline.quickAiTone}
            onQuickAiWhiteBalance={aiPipeline.quickAiWhiteBalance}
            onResetToAsShot={darkroomSync.resetToAsShot}
            onResetTuningParams={darkroomSync.resetTuningParams}
            onQuickAiCrop={aiPipeline.quickAiCrop}
            onQuickAiHorizon={aiPipeline.quickAiHorizon}
            onQuickAiProfile={aiPipeline.quickAiProfile}
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
            flaggedPhotos={photoLibrary.flaggedPhotos}
            activePhotoId={photoLibrary.activePhoto?.id}
            totalPhotos={photoLibrary.photoPlates.length}
            onSelectPhoto={(p) => photoLibrary.selectPhoto(p)}
            onOpenRetouch={(p) => workspaceUi.openRetouchForPhoto(p)}
            onToggleFlag={(p, e) => photoLibrary.togglePhotoFlag(p, e)}
            onClearAllFlags={photoLibrary.clearAllFlags}
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
      isAiAnalyzing={aiPipeline.isAiAnalyzing}
      isBatchAiRunning={aiPipeline.isBatchAiRunning}
      hasActivePhoto={Boolean(photoLibrary.activePhoto)}
      hasCustomStylePrompt={Boolean(darkroomState.customStylePrompt.trim())}
      totalPhotos={photoLibrary.photoPlates.length}
      flaggedCount={photoLibrary.flaggedCount}
      batchProgress={aiPipeline.batchProgress}
      activeMobileDrawer={mobileDrawerState.activeMobileDrawer}
      onRunAiAnalysis={() => aiPipeline.runAiAnalysis()}
      onCancelBatchAi={aiPipeline.cancelBatchAi}
      onRequestBatchAi={aiPipeline.requestBatchAiAnalysis}
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
    flaggedCount={photoLibrary.flaggedCount}
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
    photo={photoLibrary.activePhoto}
    exportMode={exportState.exportMode}
    onClose={() => (workspaceUi.isQuickExportOpen = false)}
    onExport={exportState.handleSingleQuickExport}
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
