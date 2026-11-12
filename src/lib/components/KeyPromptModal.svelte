<script lang="ts">
  interface Props {
    isOpen?: boolean;
    onOpenVault: () => void;
    onClose?: () => void;
  }

  let { isOpen = $bindable(false), onOpenVault, onClose }: Props = $props();

  function handleClose() {
    isOpen = false;
    onClose?.();
  }

  function handleGoToVault() {
    isOpen = false;
    onOpenVault();
  }
</script>

{#if isOpen}
  <div
    class="key-prompt-backdrop"
    onclick={handleClose}
    role="presentation"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="key-prompt-modal hairline-all"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="prompt-modal-title"
    >
      <div class="prompt-header hairline-b">
        <div class="prompt-title-group">
          <span class="material-symbols-outlined prompt-icon amber">vpn_key_off</span>
          <div>
            <div id="prompt-modal-title" class="prompt-title font-headline">
              尚未配置 AI 雲端金鑰
            </div>
            <div class="prompt-subtitle font-mono">
              NEURAL DEVELOP // API KEY REQUIRED
            </div>
          </div>
        </div>
        <button
          type="button"
          class="prompt-close-btn"
          onclick={handleClose}
          aria-label="關閉對話框"
        >
          <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
        </button>
      </div>

      <div class="prompt-body">
        <p class="prompt-desc">
          目前尚未檢測到已配置的 AI 雲端金鑰。您可前往模型調度中心配置 <strong>Google Gemini</strong>、<strong>OpenAI</strong>、<strong>Anthropic Claude</strong>、<strong>Groq</strong>、<strong>OpenRouter</strong> 金鑰，或直接切換為免金鑰的本地端 <strong>Ollama</strong> 進行離線顯影。
        </p>

        <div class="prompt-modes-grid">
          <div class="prompt-mode-card highlight">
            <div class="mode-card-header font-mono amber">
              <span class="material-symbols-outlined">psychology</span>
              <span>雲端主流模型 & 本地端 Ollama 雙軌支援</span>
            </div>
            <p class="mode-card-text">
              支援六大主流 AI 供應商與本地端 Ollama 視覺多模態模型（如 Qwen2.5-VL、Gemma 3），可在單一面板隨時切換模型與管理金鑰。
            </p>
          </div>
        </div>
      </div>

      <div class="prompt-actions hairline-t">
        <button
          type="button"
          class="archival-btn-secondary prompt-action-btn font-mono"
          onclick={handleClose}
        >
          取消
        </button>
        <button
          type="button"
          class="archival-btn-primary prompt-action-btn font-mono"
          onclick={handleGoToVault}
        >
          <span class="material-symbols-outlined" style="font-size: 15px;">vpn_key</span>
          <span>前往配置金鑰 🔑</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .key-prompt-backdrop {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .key-prompt-modal {
    width: 90%;
    max-width: 520px;
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-md);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .prompt-header {
    padding: 16px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: var(--surface-elevated);
  }
  .prompt-title-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .prompt-icon {
    font-size: 24px;
  }
  .prompt-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--parchment-bright);
    letter-spacing: 0.04em;
  }
  .prompt-subtitle {
    font-size: 10px;
    color: var(--parchment-dim);
    letter-spacing: 0.08em;
  }
  .prompt-close-btn {
    background: transparent;
    border: none;
    color: var(--parchment-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.15s ease;
  }
  .prompt-close-btn:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
  }
  .prompt-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .prompt-desc {
    font-size: 13px;
    line-height: 1.5;
    color: var(--parchment-muted);
    margin: 0;
  }
  .prompt-modes-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .prompt-mode-card {
    padding: 12px 14px;
    border-radius: var(--radius-xs);
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .prompt-mode-card.highlight {
    border-color: rgba(212, 163, 115, 0.5);
    background-color: rgba(212, 163, 115, 0.05);
  }
  .mode-card-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--parchment-bright);
  }
  .mode-card-text {
    font-size: 11px;
    line-height: 1.45;
    color: var(--parchment-dim);
    margin: 0;
  }
  .prompt-actions {
    padding: 14px 20px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    background-color: var(--surface-elevated);
  }
  .prompt-action-btn {
    padding: 8px 14px;
    font-size: 12px;
    cursor: pointer;
  }
</style>

