/**
 * Global Toast Notification Store for Alexandria Darkroom
 * Powered by Svelte 5 Runes for reactive notifications across all modals and views.
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  durationMs: number;
}

class ToastStore {
  toasts = $state<ToastItem[]>([]);

  show(message: string, type: ToastType = 'info', durationMs: number = 3200) {
    const id = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newToast: ToastItem = { id, message, type, durationMs };

    this.toasts = [...this.toasts, newToast];

    if (durationMs > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, durationMs);
    }
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter(t => t.id !== id);
  }

  clear() {
    this.toasts = [];
  }
}

export const toastStore = new ToastStore();
