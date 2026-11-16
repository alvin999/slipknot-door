/**
 * PWA Install & Lifecycle Management Service
 *
 * 設計考量（Design Rationale）:
 * 1. 雙模防禦：在 Tauri 桌面端環境完全靜默，不註冊 Service Worker、不觸發安裝提示。
 * 2. 跨平台相容：
 *    - Android / Chromium：監聽 beforeinstallprompt 並保存事件，供使用者自訂觸發原生對話框。
 *    - iOS / Safari：由於 iOS 不支援 beforeinstallprompt，提供步驟指引（分享 -> 加入主畫面）。
 * 3. 獨立模式偵測：已處於 standalone 模式時不重複提示。
 * 4. 體驗保護：提供 7 天防打擾冷卻期，避免使用者每次造訪都被打擾。
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'slipknot_pwa_install_dismissed_at';
const COOLDOWN_DAYS = 7;

class PWAInstallService {
  // Svelte 5 Runes 響應式狀態
  public canInstall = $state(false);
  public isIOS = $state(false);
  public isStandalone = $state(false);
  public isTauri = $state(false);
  public showBanner = $state(false);

  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private initialized = false;

  public init() {
    if (typeof window === 'undefined' || this.initialized) return;
    this.initialized = true;

    // 1. 偵測是否為 Tauri 桌面環境
    this.isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
    if (this.isTauri) {
      return; // Tauri 環境下完全不啟用 PWA 模組
    }

    // 2. 偵測是否已在 Standalone 模式（已安裝並從主畫面啟動）
    const isStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
    this.isStandalone = isStandaloneDisplay || isIOSStandalone;

    if (this.isStandalone) {
      return; // 已安裝狀態，無須顯示安裝提示
    }

    // 3. 偵測作業系統（特別是 iOS Safari）
    const userAgent = navigator.userAgent || '';
    const isIOSDevice = /iPad|iPhone|iPod/.test(userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
    const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(userAgent);
    this.isIOS = isIOSDevice && isSafari;

    // 4. 註冊輕量 Service Worker
    this.registerServiceWorker();

    // 5. 監聽 Chromium / Android beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.canInstall = true;
      this.checkAndShowBanner();
    });

    // 6. 監聽安裝成功事件
    window.addEventListener('appinstalled', () => {
      this.canInstall = false;
      this.showBanner = false;
      this.deferredPrompt = null;
      console.log('[PWA] 大相無形 已成功安裝至裝置主畫面');
    });

    // 7. 若為 iOS 裝置，檢查冷卻期後可展示教學提示
    if (this.isIOS) {
      this.checkAndShowBanner();
    }
  }

  /**
   * 註冊本地 Service Worker（排除 Tauri）
   */
  private registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('./sw.js')
          .then((reg) => {
            console.log('[PWA] Service Worker 註冊成功，範疇：', reg.scope);
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker 註冊失敗：', err);
          });
      });
    }
  }

  /**
   * 檢查是否在冷卻期內，若否則延遲展示安裝提示
   */
  private checkAndShowBanner() {
    if (typeof localStorage === 'undefined') return;

    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const pastMs = Date.now() - parseInt(dismissedAt, 10);
      const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
      if (pastMs < cooldownMs) {
        return; // 仍處於冷卻期內
      }
    }

    // 延遲 3 秒展示，避免一進網站就打擾使用者瀏覽
    setTimeout(() => {
      if (!this.isStandalone) {
        this.showBanner = true;
      }
    }, 3000);
  }

  /**
   * 使用者點擊安裝按鈕（Android 原生觸發）
   */
  public async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) {
      return false;
    }

    try {
      await this.deferredPrompt.prompt();
      const choice = await this.deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        this.canInstall = false;
        this.showBanner = false;
        this.deferredPrompt = null;
        return true;
      }
    } catch (err) {
      console.warn('[PWA] 觸發安裝時發生錯誤：', err);
    }
    return false;
  }

  /**
   * 關閉提示並記錄冷卻期
   */
  public dismiss() {
    this.showBanner = false;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    }
  }

  /**
   * 手動由選單點擊叫出安裝提示（無視冷卻期）
   */
  public openManually() {
    this.showBanner = true;
  }
}

export const pwaInstallService = new PWAInstallService();
