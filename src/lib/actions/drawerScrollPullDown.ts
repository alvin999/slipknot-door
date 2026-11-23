export interface DrawerScrollPullDownOptions {
  isEnabled: () => boolean;
  onDragStart: () => void;
  onDragMove: (deltaY: number) => void;
  onDragEnd: (deltaY: number, velocityY: number) => void;
}

const INTERACTIVE_SELECTOR =
  'input, textarea, select, [role="slider"], .slider-track, .tone-curve-canvas, .hsl-bar-row, .mobile-drawer-handle-bar';

/**
 * 當手機版精修面板內容已捲動至最頂端時，繼續往下滑可直接接續拖曳收合／降階
 */
export function drawerScrollPullDown(
  node: HTMLElement,
  initialOptions: DrawerScrollPullDownOptions,
) {
  let options = initialOptions;
  let startX = 0;
  let startY = 0;
  let lastY = 0;
  let lastTime = 0;
  let velocityY = 0;
  let eligible = false;
  let pulling = false;

  function isAtScrollTop(target: EventTarget | null): boolean {
    let el = target instanceof HTMLElement ? target : null;
    while (el) {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight + 1 &&
        el.scrollTop > 1
      ) {
        return false;
      }
      if (el === node) break;
      el = el.parentElement;
    }
    return true;
  }

  function onTouchStart(e: TouchEvent) {
    if (
      e.touches.length !== 1 ||
      !options.isEnabled() ||
      window.innerWidth > 768
    ) {
      eligible = false;
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target?.closest(INTERACTIVE_SELECTOR)) {
      eligible = false;
      return;
    }
    if (!isAtScrollTop(target)) {
      eligible = false;
      return;
    }

    eligible = true;
    pulling = false;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    lastY = startY;
    lastTime = performance.now();
    velocityY = 0;
  }

  function onTouchMove(e: TouchEvent) {
    if (!eligible || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (!pulling) {
      // 若先往上滑（正常往下瀏覽內容）或橫向滑動，取消下拉接管
      if (dy < -6 || Math.abs(dx) > Math.abs(dy)) {
        eligible = false;
        return;
      }
      if (dy > 10 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        // 再次確認觸控當下仍處於頂端
        if (!isAtScrollTop(e.target)) {
          eligible = false;
          return;
        }
        pulling = true;
        options.onDragStart();
        startY = touch.clientY;
      } else {
        return;
      }
    }

    if (e.cancelable) {
      e.preventDefault();
    }
    const now = performance.now();
    const dt = now - lastTime;
    if (dt > 0) {
      const instantVelocity = (touch.clientY - lastY) / dt;
      velocityY = velocityY * 0.4 + instantVelocity * 0.6;
    }
    lastY = touch.clientY;
    lastTime = now;

    options.onDragMove(touch.clientY - startY);
  }

  function onTouchEnd(e: TouchEvent) {
    if (pulling) {
      const endY = e.changedTouches[0]?.clientY ?? lastY;
      options.onDragEnd(endY - startY, velocityY);
    }
    eligible = false;
    pulling = false;
  }

  node.addEventListener("touchstart", onTouchStart, { passive: true });
  node.addEventListener("touchmove", onTouchMove, { passive: false });
  node.addEventListener("touchend", onTouchEnd, { passive: true });
  node.addEventListener("touchcancel", onTouchEnd, { passive: true });

  return {
    update(newOptions: DrawerScrollPullDownOptions) {
      options = newOptions;
    },
    destroy() {
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", onTouchEnd);
    },
  };
}

