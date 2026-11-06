<script lang="ts">
  import { toastStore, type ToastType } from '$lib/stores/toastStore.svelte';

  function getBadgeLabel(type: ToastType): string {
    switch (type) {
      case 'success': return 'OK';
      case 'error': return 'ERR';
      case 'warning': return 'WARN';
      case 'info': return 'INFO';
    }
  }
</script>

<aside class="toast-container" aria-live="polite" aria-atomic="true">
  {#each toastStore.toasts as toast (toast.id)}
    <div class="toast-item {toast.type}" role="status">
      <span class="toast-badge">{getBadgeLabel(toast.type)}</span>
      <span class="toast-message">{toast.message}</span>
      {#if toast.action}
        <button
          type="button"
          class="toast-action-btn font-mono"
          onclick={() => {
            const act = toast.action;
            toastStore.dismiss(toast.id);
            act?.onClick();
          }}
        >
          {toast.action.label}
        </button>
      {/if}
      <button
        class="toast-close"
        onclick={() => toastStore.dismiss(toast.id)}
        aria-label="關閉通知"
      >×</button>
    </div>
  {/each}
</aside>

<style>
  .toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
    max-width: 420px;
  }
  .toast-item {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    color: var(--parchment-bright);
    font-family: var(--font-body);
    font-size: 13px;
    animation: toast-slide-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .toast-item.success { border-left: 3px solid var(--success-green); }
  .toast-item.error { border-left: 3px solid var(--alert-red); }
  .toast-item.warning { border-left: 3px solid var(--amber-highlight); }
  .toast-item.info { border-left: 3px solid var(--primary-indigo); }
  .toast-badge {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.05em;
    padding: 2px 5px;
    background-color: var(--surface-elevated);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    color: var(--parchment-muted);
  }
  .toast-item.success .toast-badge { color: var(--success-green); }
  .toast-item.error .toast-badge { color: var(--alert-red); }
  .toast-item.warning .toast-badge { color: var(--amber-highlight); }
  .toast-item.info .toast-badge { color: var(--primary-indigo); }
  .toast-message {
    flex: 1;
    line-height: 1.4;
  }
  .toast-close {
    background: transparent;
    border: none;
    color: var(--parchment-dim);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 2px;
  }
  .toast-close:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
  }
  .toast-action-btn {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid var(--amber-highlight, #f59e0b);
    color: var(--amber-highlight, #f59e0b);
    font-size: 11px;
    letter-spacing: 0.05em;
    padding: 3px 9px;
    border-radius: var(--radius-xs, 2px);
    cursor: pointer;
    font-weight: 600;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .toast-action-btn:hover {
    background: var(--amber-highlight, #f59e0b);
    color: #0b0c10;
  }
  @keyframes toast-slide-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
