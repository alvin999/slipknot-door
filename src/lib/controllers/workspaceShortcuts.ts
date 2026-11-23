import { darkroomState } from "$lib/stores/darkroomState.svelte";
import { exportState } from "$lib/stores/exportState.svelte";
import {
  photoLibrary,
  type PhotoPlateItem,
} from "$lib/stores/photoLibrary.svelte";
import { toastStore } from "$lib/stores/toastStore.svelte";
import { workspaceUi } from "$lib/stores/workspaceUi.svelte";

export interface WorkspaceShortcutCallbacks {
  applyProfile: (profileId: string) => void;
  handleDeletePhotoFromDisk: (photo: PhotoPlateItem) => void;
  handleRemovePhoto: (photoId: string) => void;
  triggerExport: () => void;
}

function isEditableTarget(target: HTMLElement | null): boolean {
  return Boolean(
    target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable),
  );
}

/**
 * 全域工作流程導航與精修鍵盤操作 (方案 A 流水線)
 */
export function createWorkspaceShortcuts(
  callbacks: WorkspaceShortcutCallbacks,
) {
  function handleKeydown(e: KeyboardEvent) {
    if (isEditableTarget(e.target as HTMLElement | null)) {
      return;
    }

    // 全域叫出或關閉說明指南 (? 鍵)
    if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
      e.preventDefault();
      workspaceUi.isHelpOpen = !workspaceUi.isHelpOpen;
      return;
    }

    // 若說明、金庫或即時出圖視窗開啟，Esc 優先關閉浮層
    if (e.key === "Escape") {
      if (workspaceUi.isQuickExportOpen) {
        e.preventDefault();
        workspaceUi.isQuickExportOpen = false;
        return;
      }
      if (workspaceUi.isHelpOpen) {
        e.preventDefault();
        workspaceUi.isHelpOpen = false;
        return;
      }
      if (workspaceUi.isVaultOpen) {
        e.preventDefault();
        workspaceUi.isVaultOpen = false;
        return;
      }
    }

    if (workspaceUi.activeTab === "retouch") {
      handleRetouchKeydown(e);
    } else if (workspaceUi.activeTab === "export") {
      handleExportKeydown(e);
    }
  }

  function handleRetouchKeydown(e: KeyboardEvent) {
    const activePhoto = photoLibrary.activePhoto;

    // 支援 Cmd/Ctrl + E 叫出單張即時出圖視窗
    if ((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E")) {
      e.preventDefault();
      workspaceUi.isQuickExportOpen = true;
      return;
    }

    // 支援 Ctrl/Cmd + Shift + C 複製調色
    if (
      (e.metaKey || e.ctrlKey) &&
      e.shiftKey &&
      (e.key === "c" || e.key === "C")
    ) {
      e.preventDefault();
      if (activePhoto) {
        darkroomState.copyCurrentTuning(activePhoto.appliedProfile);
        toastStore.show("已複製調色參數 (Ctrl+Shift+C) ✓", "success", 2000);
      }
      return;
    }

    // 支援 Ctrl/Cmd + Shift + V 貼上調色
    if (
      (e.metaKey || e.ctrlKey) &&
      e.shiftKey &&
      (e.key === "v" || e.key === "V")
    ) {
      e.preventDefault();
      const pasted = darkroomState.pasteCopiedTuning();
      if (pasted) {
        callbacks.applyProfile(pasted.appliedProfile);
        toastStore.show(
          "已套用貼上調色參數 (Ctrl+Shift+V) ✓",
          "success",
          2000,
        );
      }
      return;
    }

    // 支援 P / F 鍵切換挑圖標記 (Pick / Flag)
    if (e.key === "p" || e.key === "P" || e.key === "f" || e.key === "F") {
      if (activePhoto) {
        e.preventDefault();
        photoLibrary.togglePhotoFlag(activePhoto);
        toastStore.show(
          activePhoto.flagged ? "已標記為挑選底片 ★" : "已取消挑選標記",
          "info",
          1500,
        );
        return;
      }
    }

    // 支援 Shift + Delete / Shift + Backspace 鍵實體刪除磁碟底片檔案（移至資源回收筒 / 廢紙簍）
    if (e.shiftKey && (e.key === "Delete" || e.key === "Backspace")) {
      if (activePhoto) {
        e.preventDefault();
        callbacks.handleDeletePhotoFromDisk(activePhoto);
        return;
      }
    }

    // 支援 Delete / Backspace 鍵從相卷排除相片 (Remove / Cull)
    if (e.key === "Delete" || e.key === "Backspace") {
      if (activePhoto) {
        e.preventDefault();
        callbacks.handleRemovePhoto(activePhoto.id);
        return;
      }
    }

    if (e.key === "h" || e.key === "ArrowLeft") {
      e.preventDefault();
      photoLibrary.selectAdjacentPhoto(-1);
    } else if (e.key === "l" || e.key === "ArrowRight") {
      e.preventDefault();
      photoLibrary.selectAdjacentPhoto(1);
    } else if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      // 方案 1：按住 Space 顯示原始本相（避免按鍵長按自動重複 repeat 重複觸發）
      if (!e.repeat) {
        darkroomState.showABComparison = true;
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (darkroomState.isCropMode) {
        darkroomState.isCropMode = false;
      } else {
        workspaceUi.goToExport();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (darkroomState.isCropMode) {
        darkroomState.isCropMode = false;
      } else {
        workspaceUi.goToCatalog();
      }
    }
  }

  function handleExportKeydown(e: KeyboardEvent) {
    // 方案 A 流水線 Step 3：按 Enter 直接觸發批次出圖，按 Esc 返回暗房精修
    if (e.key === "Enter") {
      e.preventDefault();
      if (!exportState.isExporting) {
        callbacks.triggerExport();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      workspaceUi.goToRetouch();
    }
  }

  function handleKeyup(e: KeyboardEvent) {
    // 放開 Space 鍵時瞬間恢復調色本態
    if (e.key === " " || e.code === "Space") {
      if (darkroomState.showABComparison) {
        e.preventDefault();
        darkroomState.showABComparison = false;
      }
    }
  }

  function handleWindowBlur() {
    // 視窗失去焦點時安全復原比對狀態，避免放開事件遺失而卡在原圖
    darkroomState.showABComparison = false;
  }

  return {
    handleKeydown,
    handleKeyup,
    handleWindowBlur,
  };
}
