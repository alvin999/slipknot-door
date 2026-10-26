<script lang="ts">
  interface Props {
    isOpen?: boolean;
    onClose: () => void;
  }

  let { isOpen = $bindable(false), onClose }: Props = $props();

  let activeSection = $state<'shortcuts' | 'workflow'>('shortcuts');

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;

    if (e.key === 'Escape' || e.key === '?') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div 
    class="modal-backdrop" 
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    role="dialog" 
    aria-modal="true"
    tabindex="-1"
  >
    <div class="modal-card hairline-all">
      <!-- Modal Header -->
      <header class="modal-header hairline-b">
        <div class="header-title-box">
          <span class="material-symbols-outlined help-icon">help_outline</span>
          <div>
            <h2 class="title font-headline">大相無形 · 系統操作與快捷鍵指南</h2>
            <p class="subtitle font-mono">CURATORIAL WORKFLOW & KEYBOARD CHEAT SHEET</p>
          </div>
        </div>

        <button type="button" class="close-btn" onclick={onClose} title="關閉 (Esc 或 ?)">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>

      <!-- Section Tabs -->
      <div class="section-tabs hairline-b font-mono">
        <button 
          type="button" 
          class="tab-btn" 
          class:active={activeSection === 'shortcuts'}
          onclick={() => activeSection = 'shortcuts'}
        >
          <span class="material-symbols-outlined tab-icon">keyboard</span>
          <span>鍵盤快捷鍵速查 (SHORTCUTS)</span>
        </button>
        <button 
          type="button" 
          class="tab-btn" 
          class:active={activeSection === 'workflow'}
          onclick={() => activeSection = 'workflow'}
        >
          <span class="material-symbols-outlined tab-icon">schema</span>
          <span>3 步驟流水線指引 (WORKFLOW)</span>
        </button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body custom-scroll">
        {#if activeSection === 'shortcuts'}
          <!-- 快捷鍵對照表 -->
          <div class="shortcuts-container">
            <!-- 模組 1: 膠卷目錄挑圖 -->
            <div class="shortcut-group hairline-all">
              <div class="group-header font-mono">
                <span class="group-badge">STEP 01</span>
                <span class="group-title">膠卷目錄挑圖矩陣 (CATALOG)</span>
              </div>
              <div class="shortcut-list">
                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">H</kbd>
                    <kbd class="kbd-chip">L</kbd>
                    <span class="or">或</span>
                    <kbd class="kbd-chip">←</kbd>
                    <kbd class="kbd-chip">→</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">前後切換照片</span>
                    <span class="desc-sub font-mono">Vim 式左/右移動遊標</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">J</kbd>
                    <kbd class="kbd-chip">K</kbd>
                    <span class="or">或</span>
                    <kbd class="kbd-chip">↓</kbd>
                    <kbd class="kbd-chip">↑</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">跨列跳轉照片</span>
                    <span class="desc-sub font-mono">依網格排版上下翻動一整列</span>
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">Space</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">大圖即時預覽 (Quick Look)</span>
                    <span class="desc-sub font-mono">彈出高畫質大圖審查合焦，再按一次關閉</span>
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">P</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">挑選 / 取消挑選 (Toggle Pick)</span>
                    <span class="desc-sub font-mono">單鍵標記入隊，再按一次立即取消</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Enter</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">進入下一步 ➔ 一鍵暗房精修</span>
                    <span class="desc-sub font-mono">將已選底片（或全量）載入精修工作台</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 模組 2: 單張暗房精修 -->
            <div class="shortcut-group hairline-all">
              <div class="group-header font-mono">
                <span class="group-badge">STEP 02</span>
                <span class="group-title">單張暗房精修 (RETOUCH)</span>
              </div>
              <div class="shortcut-list">
                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">H</kbd>
                    <kbd class="kbd-chip">L</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">切換精修底片</span>
                    <span class="desc-sub font-mono">依序檢視隊列中的下一張底片</span>
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip cyan">Space</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">A/B 原始本相即時對比</span>
                    <span class="desc-sub font-mono">瞬間切換 RAW 原始狀態與顯影調色成果</span>
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">⌘E</kbd>
                    <span class="or">/</span>
                    <kbd class="kbd-chip">Ctrl+E</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">單張即時出圖 (Quick Export)</span>
                    <span class="desc-sub font-mono">跳出專屬出圖視窗，無需進入批次頁面即可立即儲存</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Enter</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">進入下一步 ➔ 前往批次導出</span>
                    <span class="desc-sub font-mono">帶著所有調色參數進入匯出隊列</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Esc</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">返回上一步 ➔ 膠卷目錄</span>
                    <span class="desc-sub font-mono">回到挑圖矩陣重新選片</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 模組 3: 批次匯出管線 -->
            <div class="shortcut-group hairline-all">
              <div class="group-header font-mono">
                <span class="group-badge">STEP 03</span>
                <span class="group-title">批次導出管線 (EXPORT)</span>
              </div>
              <div class="shortcut-list">
                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip green">Enter</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">啟動批次出圖管線 ⚡</span>
                    <span class="desc-sub font-mono">立即執行 Mode A 極速出圖或 Mode B 滿血典藏</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Esc</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">返回上一步 ➔ 暗房精修</span>
                    <span class="desc-sub font-mono">繼續微調光影或更換 LUT 風格</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 全域通用 -->
            <div class="shortcut-group hairline-all">
              <div class="group-header font-mono">
                <span class="group-badge">GLOBAL</span>
                <span class="group-title">全域輔助與導航</span>
              </div>
              <div class="shortcut-list">
                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">?</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">開啟 / 關閉此指南</span>
                    <span class="desc-sub font-mono">隨時叫出操作指引與快捷鍵速查</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Esc</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">關閉彈窗 / 返回上一層</span>
                    <span class="desc-sub font-mono">優先關閉浮層（大圖、說明、金鑰金庫）</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {:else}
          <!-- 3 步驟流水線指引 -->
          <div class="workflow-container font-mono">
            <div class="workflow-step-card hairline-all">
              <div class="step-num-badge">01</div>
              <div class="step-content">
                <h3 class="step-title font-headline">相機連線與膠卷挑圖 (Ingestion & Curation)</h3>
                <p class="step-desc">
                  插入相機記憶卡或連接傳輸線，系統即插即讀自動探測 DCIM 目錄與 RAW 檔案。
                  在目錄矩陣中，利用右手 <span class="highlight-text">HJKL</span> 瀏覽底片，
                  按下 <span class="highlight-text">Space</span> 叫出 Quick Look 審視合焦細節，
                  左手按下 <span class="highlight-text">P</span> 鍵加入挑選清單。挑選完畢後按 <span class="highlight-text">Enter</span> 順暢進入暗房。
                </p>
              </div>
            </div>

            <div class="workflow-arrow">↓</div>

            <div class="workflow-step-card hairline-all">
              <div class="step-num-badge">02</div>
              <div class="step-content">
                <h3 class="step-title font-headline">單張暗房精修 (Darkroom Retouch)</h3>
                <p class="step-desc">
                  暗房工作台載入挑選底片，具備 60FPS WebGL 2.0 即時 3D LUT 色彩模擬。
                  支援多模態 AI 智慧顯影調色與獨立微型快捷動作（AI 裁切、AI 拉平、AI 白平衡、AI 光比）。
                  修圖過程中長按或按一下 <span class="highlight-text">Space</span> 進行 A/B 原始本相對比。滿意後按 <span class="highlight-text">Enter</span> 推進至導出。
                </p>
              </div>
            </div>

            <div class="workflow-arrow">↓</div>

            <div class="workflow-step-card hairline-all">
              <div class="step-num-badge">03</div>
              <div class="step-content">
                <h3 class="step-title font-headline">雙管線批次導出 (Dual Pipeline Export)</h3>
                <p class="step-desc">
                  自由切換 <span class="highlight-text">Mode A（所見即所得極速出圖）</span> 或 <span class="highlight-text">Mode B（16-bit 滿血無損典藏輸出）</span>。
                  內建 Groq 策展文案自動生成，確認設定後按下 <span class="highlight-text">Enter</span> 立即啟動批次出圖管線，自動保存至指定典藏資料夾。
                </p>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Modal Footer -->
      <footer class="modal-footer hairline-t font-mono">
        <div class="footer-tip">
          <span class="material-symbols-outlined tip-icon">tips_and_updates</span>
          <span>提示：在任何介面隨時按下 <kbd class="kbd-chip">?</kbd> 鍵即可快速叫出或關閉此說明視窗。</span>
        </div>
        <button type="button" class="archival-btn-primary" onclick={onClose}>
          <span>瞭解並關閉 (Esc)</span>
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(8, 9, 11, 0.82);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2100;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.99); }
    to { opacity: 1; transform: scale(1); }
  }

  .modal-card {
    width: 720px;
    max-width: 92vw;
    max-height: 85vh;
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    padding: 18px 24px;
    background-color: var(--surface-elevated);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header-title-box {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .help-icon {
    font-size: 26px;
    color: var(--amber-highlight);
  }

  .title {
    font-size: 16px;
    font-weight: 600;
    color: var(--parchment-bright);
    letter-spacing: 0.02em;
  }

  .subtitle {
    font-size: 10px;
    color: var(--parchment-dim);
    letter-spacing: 0.1em;
    margin-top: 2px;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--parchment-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    border-radius: var(--radius-sm);
    transition: all 0.15s;
  }

  .close-btn:hover {
    color: var(--parchment-bright);
    background-color: rgba(255, 255, 255, 0.08);
  }

  .section-tabs {
    display: flex;
    background-color: rgba(20, 22, 26, 0.6);
    padding: 0 20px;
    gap: 12px;
  }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--parchment-muted);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-btn .tab-icon {
    font-size: 16px;
  }

  .tab-btn:hover {
    color: var(--parchment-bright);
  }

  .tab-btn.active {
    color: var(--amber-highlight);
    border-bottom-color: var(--amber-highlight);
  }

  .modal-body {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
  }

  /* Shortcuts Table */
  .shortcuts-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .shortcut-group {
    background-color: rgba(28, 30, 36, 0.4);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    background-color: rgba(35, 38, 45, 0.5);
    font-size: 11px;
    border-bottom: 1px solid var(--hairline-dim);
  }

  .group-badge {
    padding: 1px 6px;
    background-color: rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-xs);
    color: var(--parchment-bright);
    font-size: 10px;
  }

  .group-title {
    color: var(--parchment-bright);
    font-weight: 500;
  }

  .shortcut-list {
    display: flex;
    flex-direction: column;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--hairline-dim);
    transition: background-color 0.1s;
  }

  .shortcut-row:last-child {
    border-bottom: none;
  }

  .shortcut-row:hover {
    background-color: rgba(255, 255, 255, 0.02);
  }

  .shortcut-row.highlight {
    background-color: rgba(212, 163, 115, 0.04);
  }

  .keys {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 180px;
  }

  .keys .or {
    font-size: 11px;
    color: var(--parchment-dim);
    font-family: var(--font-mono);
  }

  .kbd-chip {
    display: inline-block;
    padding: 2px 8px;
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--parchment-bright);
    background-color: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: var(--radius-xs);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  .kbd-chip.amber {
    color: var(--amber-highlight);
    border-color: rgba(212, 163, 115, 0.5);
    background-color: rgba(212, 163, 115, 0.12);
  }

  .kbd-chip.cyan {
    color: #5ce1e6;
    border-color: rgba(92, 225, 230, 0.5);
    background-color: rgba(92, 225, 230, 0.12);
  }

  .kbd-chip.green {
    color: var(--success-green);
    border-color: rgba(86, 143, 107, 0.5);
    background-color: rgba(86, 143, 107, 0.12);
  }

  .action-desc {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .desc-main {
    font-size: 13px;
    color: var(--parchment-bright);
  }

  .desc-sub {
    font-size: 11px;
    color: var(--parchment-muted);
  }

  /* Workflow View */
  .workflow-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
  }

  .workflow-step-card {
    display: flex;
    gap: 16px;
    padding: 16px 20px;
    background-color: rgba(28, 30, 36, 0.4);
    border-radius: var(--radius-sm);
    width: 100%;
  }

  .step-num-badge {
    font-size: 20px;
    font-weight: 700;
    color: var(--amber-highlight);
    background: rgba(212, 163, 115, 0.1);
    border: 1px solid rgba(212, 163, 115, 0.3);
    border-radius: var(--radius-xs);
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .step-content {
    flex: 1;
  }

  .step-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--parchment-bright);
    margin-bottom: 6px;
  }

  .step-desc {
    font-size: 12px;
    color: var(--parchment-muted);
    line-height: 1.6;
  }

  .highlight-text {
    color: var(--amber-highlight);
    font-weight: 600;
  }

  .workflow-arrow {
    color: var(--parchment-dim);
    font-size: 16px;
  }

  /* Modal Footer */
  .modal-footer {
    padding: 16px 24px;
    background-color: var(--surface-elevated);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .footer-tip {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--parchment-muted);
  }

  .tip-icon {
    font-size: 16px;
    color: var(--amber-highlight);
  }

  .archival-btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    border-radius: var(--radius-sm);
    background-color: var(--primary-indigo);
    border: 1px solid var(--primary-hover);
    color: var(--parchment-bright);
    font-size: 12px;
    font-family: var(--font-mono);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .archival-btn-primary:hover {
    background-color: var(--primary-hover);
  }
</style>
