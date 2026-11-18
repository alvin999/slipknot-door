<script lang="ts">
  import { pwaInstallService } from '$lib/services/pwaInstallService.svelte';
  import { t } from '$lib/i18n';

  async function handleInstallClick() {
    await pwaInstallService.promptInstall();
  }

  function handleDismiss() {
    pwaInstallService.dismiss();
  }
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleDismiss();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if pwaInstallService.showBanner && !pwaInstallService.isTauri && !pwaInstallService.isStandalone}
  <div class="pwa-prompt-backdrop" onclick={handleDismiss} role="presentation">
    <div
      class="pwa-prompt-card"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-labelledby="pwa-title"
      aria-modal="true"
      tabindex="-1"
    >
      <div class="pwa-header">
        <div class="pwa-brand">
          <img src="./icons/icon-192.png" alt={t('nav.brandTitle')} class="pwa-icon" />
          <div class="pwa-brand-text">
            <h3 id="pwa-title" class="pwa-title">{t('pwa.title')}</h3>
            <p class="pwa-subtitle">{t('pwa.subtitle')}</p>
          </div>
        </div>
        <button class="pwa-close-btn" onclick={handleDismiss} aria-label={t('pwa.dismissAria')}>×</button>
      </div>

      {#if pwaInstallService.isIOS}
        <!-- iOS Safari 導引指引 -->
        <div class="pwa-ios-instructions">
          <p class="pwa-ios-desc">{t('pwa.iosDesc')}</p>
          <ol class="pwa-steps">
            <li>
              {@html t('pwa.iosStep1')}
              <span class="pwa-symbol">⎋</span>
            </li>
            <li>
              {@html t('pwa.iosStep2')}
              <span class="pwa-symbol">⊞</span>
            </li>
            <li>{@html t('pwa.iosStep3')}</li>
          </ol>
          <button class="pwa-btn pwa-btn-primary" onclick={handleDismiss}>
            {t('pwa.gotIt')}
          </button>
        </div>
      {:else if pwaInstallService.canInstall}
        <!-- Android / Chromium 原生安裝觸發 -->
        <div class="pwa-actions">
          <p class="pwa-desc">{t('pwa.androidDesc')}</p>
          <div class="pwa-btn-group">
            <button class="pwa-btn pwa-btn-secondary" onclick={handleDismiss}>
              {t('pwa.later')}
            </button>
            <button class="pwa-btn pwa-btn-primary" onclick={handleInstallClick}>
              {t('pwa.installNow')}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .pwa-prompt-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 10000;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 16px;
    animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .pwa-prompt-card {
    width: 100%;
    max-width: 440px;
    background: #14161a;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
    color: #e4e4e7;
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .pwa-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .pwa-brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .pwa-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .pwa-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #f4f4f5;
    letter-spacing: 0.02em;
  }

  .pwa-subtitle {
    margin: 2px 0 0;
    font-size: 12px;
    color: #a1a1aa;
  }

  .pwa-close-btn {
    background: transparent;
    border: none;
    color: #71717a;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    padding: 4px 8px;
    transition: color 0.15s;
  }

  .pwa-close-btn:hover {
    color: #f4f4f5;
  }

  .pwa-desc {
    margin: 0 0 16px;
    font-size: 13px;
    line-height: 1.5;
    color: #a1a1aa;
  }

  .pwa-ios-instructions {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .pwa-ios-desc {
    margin: 0;
    font-size: 13px;
    color: #a1a1aa;
  }

  .pwa-steps {
    margin: 0;
    padding-left: 20px;
    font-size: 13px;
    line-height: 1.8;
    color: #d4d4d8;
  }

  .pwa-steps :global(strong) {
    color: #f4f4f5;
  }

  .pwa-symbol {
    display: inline-block;
    padding: 0 4px;
    font-size: 14px;
    color: #93c5fd;
  }

  .pwa-actions {
    display: flex;
    flex-direction: column;
  }

  .pwa-btn-group {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  .pwa-btn {
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .pwa-btn-secondary {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #a1a1aa;
  }

  .pwa-btn-secondary:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #f4f4f5;
  }

  .pwa-btn-primary {
    background: #3b82f6;
    border: 1px solid #3b82f6;
    color: #ffffff;
    flex: 1;
  }

  .pwa-btn-primary:hover {
    background: #2563eb;
    border-color: #2563eb;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
</style>
