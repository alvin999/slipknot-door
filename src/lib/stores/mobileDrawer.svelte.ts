// Mobile Bottom Drawer State (行動端抽屜狀態)
export type MobileDrawer = "none" | "ai" | "tuning";

function createMobileDrawerState() {
  let activeMobileDrawer = $state<MobileDrawer>("none");
  let isMobileDrawerExpanded = $state<boolean>(false);
  let lastRetouchDrawer = $state<"ai" | "tuning">("tuning");
  let mobileDrawerDragHeight = $state<number | null>(null);
  let drawerDragBaseHeight = 0;

  function openMobileDrawer(drawer: MobileDrawer) {
    activeMobileDrawer = drawer;
    if (drawer === "ai" || drawer === "tuning") {
      lastRetouchDrawer = drawer;
    } else {
      isMobileDrawerExpanded = false;
    }
  }

  function toggleExpanded() {
    isMobileDrawerExpanded = !isMobileDrawerExpanded;
  }

  function getDrawerTargetHeightPx(expanded: boolean): number {
    if (typeof window === "undefined") return 360;
    return Math.round(window.innerHeight * (expanded ? 0.74 : 0.46));
  }

  function handleDrawerDragStart() {
    drawerDragBaseHeight = getDrawerTargetHeightPx(isMobileDrawerExpanded);
    mobileDrawerDragHeight = drawerDragBaseHeight;
  }

  function handleDrawerDragMove(deltaY: number) {
    if (typeof window === "undefined") return;
    const maxH = Math.round(window.innerHeight * 0.84);
    // 允許拖曳到極小高度以提供明確的收合視覺回饋
    const nextH = Math.max(84, Math.min(maxH, drawerDragBaseHeight - deltaY));
    mobileDrawerDragHeight = nextH;
  }

  function handleDrawerDragEnd(deltaY: number, velocityY: number) {
    if (typeof window === "undefined") {
      mobileDrawerDragHeight = null;
      return;
    }
    const vh = window.innerHeight || 800;
    const finalHeight =
      mobileDrawerDragHeight ?? Math.max(84, drawerDragBaseHeight - deltaY);
    mobileDrawerDragHeight = null;

    // 快速上滑直接展開
    if (velocityY < -0.45) {
      isMobileDrawerExpanded = true;
      return;
    }

    // 快速下滑依起始高度決定降階或直接收合
    if (velocityY > 0.45) {
      if (isMobileDrawerExpanded && finalHeight > vh * 0.42 && deltaY < vh * 0.35) {
        isMobileDrawerExpanded = false;
      } else {
        openMobileDrawer("none");
      }
      return;
    }

    // 依放開時的即時高度吸附至：收合 / 半開 (46dvh) / 展開 (74dvh)
    if (finalHeight < vh * 0.3) {
      openMobileDrawer("none");
    } else if (finalHeight < vh * 0.6) {
      isMobileDrawerExpanded = false;
    } else {
      isMobileDrawerExpanded = true;
    }
  }

  return {
    get activeMobileDrawer() {
      return activeMobileDrawer;
    },
    set activeMobileDrawer(value: MobileDrawer) {
      activeMobileDrawer = value;
    },
    get isMobileDrawerExpanded() {
      return isMobileDrawerExpanded;
    },
    set isMobileDrawerExpanded(value: boolean) {
      isMobileDrawerExpanded = value;
    },
    get lastRetouchDrawer() {
      return lastRetouchDrawer;
    },
    get mobileDrawerDragHeight() {
      return mobileDrawerDragHeight;
    },
    openMobileDrawer,
    toggleExpanded,
    handleDrawerDragStart,
    handleDrawerDragMove,
    handleDrawerDragEnd,
  };
}

export const mobileDrawerState = createMobileDrawerState();

