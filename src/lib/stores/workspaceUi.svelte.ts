import { KeyVaultService } from "$lib/services/keyVaultService";
import { aiPipeline } from "$lib/stores/aiPipeline.svelte";
import {
  photoLibrary,
  type PhotoPlateItem,
} from "$lib/stores/photoLibrary.svelte";

export type ModuleTab =
  | "catalog"
  | "retouch"
  | "profiles"
  | "export"
  | "devices";

export interface KeyStatus {
  exists: boolean;
  mode: string | null;
}

function createWorkspaceUiState() {
  let activeTab = $state<ModuleTab>("catalog"); // Default to catalog on fresh load for curatorial overview
  let retouchViewRef = $state<{ triggerRender?: () => void } | null>(null);

  // Key Vault & Help Modal State
  let isVaultOpen = $state<boolean>(false);
  let isHelpOpen = $state<boolean>(false);
  let isQuickExportOpen = $state<boolean>(false);
  let isKeyPromptModalOpen = $state<boolean>(false);
  let geminiKeyStatus = $state<KeyStatus>({ exists: false, mode: null });
  let groqKeyStatus = $state<KeyStatus>({ exists: false, mode: null });
  let hasKey = $state<boolean>(false);

  function hasActiveApiKey(): boolean {
    return KeyVaultService.hasAnyConfiguredProvider(aiPipeline.visionProvider);
  }

  function refreshKeyStatus() {
    const sGemini = KeyVaultService.getKeyStatus("gemini");
    const sGroq = KeyVaultService.getKeyStatus("groq");
    hasKey = hasActiveApiKey();
    aiPipeline.reloadEngineSettings();
    geminiKeyStatus = {
      exists: hasKey,
      mode:
        aiPipeline.visionProvider === "ollama"
          ? "transparent"
          : sGemini.mode || sGroq.mode,
    };
    groqKeyStatus = { exists: sGroq.exists, mode: sGroq.mode };
  }

  function openVaultFromPrompt() {
    isKeyPromptModalOpen = false;
    isVaultOpen = true;
  }

  /**
   * 觸發暗房 WebGL 畫布重繪（委託 RetouchView 內部視圖）
   */
  function triggerWebglRender() {
    retouchViewRef?.triggerRender?.();
  }

  function openRetouchForPhoto(plate: PhotoPlateItem) {
    photoLibrary.selectPhoto(plate);
    activeTab = "retouch";
    requestAnimationFrame(() => {
      triggerWebglRender();
    });
  }

  // 步驟一：一鍵進入精修頁面 (優先以當前焦點或選取相片作為首幀)
  function goToRetouch() {
    const active = photoLibrary.activePhoto;
    const queue = photoLibrary.activeQueue;
    const target =
      active && queue.some((p) => p.id === active.id)
        ? active
        : queue.length > 0
          ? queue[0]
          : active;
    if (target) {
      photoLibrary.selectPhoto(target);
    }
    activeTab = "retouch";
    requestAnimationFrame(() => {
      triggerWebglRender();
    });
  }

  // 步驟二：前往批次導出頁面
  function goToExport() {
    activeTab = "export";
  }

  // 返回膠卷目錄挑圖
  function goToCatalog() {
    activeTab = "catalog";
  }

  return {
    get activeTab() {
      return activeTab;
    },
    set activeTab(value: ModuleTab) {
      activeTab = value;
    },
    get retouchViewRef() {
      return retouchViewRef;
    },
    set retouchViewRef(value: { triggerRender?: () => void } | null) {
      retouchViewRef = value;
    },
    get isVaultOpen() {
      return isVaultOpen;
    },
    set isVaultOpen(value: boolean) {
      isVaultOpen = value;
    },
    get isHelpOpen() {
      return isHelpOpen;
    },
    set isHelpOpen(value: boolean) {
      isHelpOpen = value;
    },
    get isQuickExportOpen() {
      return isQuickExportOpen;
    },
    set isQuickExportOpen(value: boolean) {
      isQuickExportOpen = value;
    },
    get isKeyPromptModalOpen() {
      return isKeyPromptModalOpen;
    },
    set isKeyPromptModalOpen(value: boolean) {
      isKeyPromptModalOpen = value;
    },
    get geminiKeyStatus() {
      return geminiKeyStatus;
    },
    get groqKeyStatus() {
      return groqKeyStatus;
    },
    get hasKey() {
      return hasKey;
    },
    refreshKeyStatus,
    openVaultFromPrompt,
    triggerWebglRender,
    openRetouchForPhoto,
    goToRetouch,
    goToExport,
    goToCatalog,
  };
}

export const workspaceUi = createWorkspaceUiState();
