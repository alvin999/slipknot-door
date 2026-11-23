import { thumbnailRenderService } from "$lib/services/thumbnailRenderService.svelte";
import { aiPipeline } from "$lib/stores/aiPipeline.svelte";
import { exportState } from "$lib/stores/exportState.svelte";
import { lutCatalog } from "$lib/stores/lutCatalog.svelte";
import { photoLibrary } from "$lib/stores/photoLibrary.svelte";
import { workspaceUi } from "$lib/stores/workspaceUi.svelte";

/**
 * 初始化工作區跨 Store 回呼、自訂 LUT 載入與外接裝置熱插拔輪詢
 * 回傳清理函式供 Svelte onMount 釋放資源
 */
export function initWorkspace(): () => void {
  void photoLibrary.refreshCameraMounts();
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
    void photoLibrary.refreshCameraMounts();
  }, 4000);

  const handleFocus = () => {
    void photoLibrary.refreshCameraMounts();
  };
  window.addEventListener("focus", handleFocus);

  return () => {
    clearInterval(mountPollTimer);
    window.removeEventListener("focus", handleFocus);
  };
}
