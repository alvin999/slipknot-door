<script lang="ts">
  interface Props {
    isOpen?: boolean;
    onClose: () => void;
  }

  let { isOpen = $bindable(false), onClose }: Props = $props();

  let activeSection = $state<"guide" | "workflow">("guide");
  let isMobile = $state<boolean>(false);

  $effect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    isMobile = mq.matches;
    const handleChange = (e: MediaQueryListEvent) => {
      isMobile = e.matches;
    };
    mq.addEventListener?.("change", handleChange);
    return () => mq.removeEventListener?.("change", handleChange);
  });

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;

    if (e.key === "Escape" || e.key === "?") {
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
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
    onkeydown={(e) => {
      if (e.key === "Escape" && e.target === e.currentTarget) onClose();
    }}
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
            <h2 class="title font-headline">
              {isMobile
                ? "大相無形 · AI 顯影與流水線指引"
                : "大相無形 · 系統操作與快捷鍵指南"}
            </h2>
            <p class="subtitle font-mono">
              {isMobile
                ? "AI DARKROOM WORKFLOW & VISUAL GUIDE"
                : "CURATORIAL WORKFLOW & KEYBOARD CHEAT SHEET"}
            </p>
          </div>
        </div>

        <button
          type="button"
          class="close-btn"
          onclick={onClose}
          title={isMobile ? "關閉指引" : "關閉 (Esc 或 ?)"}
        >
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>

      <!-- Section Tabs (僅桌機版顯示雙分頁；手機版直接整合為單一流水線 × AI 實戰指引) -->
      {#if !isMobile}
        <div class="section-tabs hairline-b font-mono">
          <button
            type="button"
            class="tab-btn"
            class:active={activeSection === "guide"}
            onclick={() => (activeSection = "guide")}
          >
            <span class="material-symbols-outlined tab-icon">keyboard</span>
            <span>鍵盤快捷鍵速查 (SHORTCUTS)</span>
          </button>
          <button
            type="button"
            class="tab-btn"
            class:active={activeSection === "workflow"}
            onclick={() => (activeSection = "workflow")}
          >
            <span class="material-symbols-outlined tab-icon">schema</span>
            <span>3 步驟流水線指引 (WORKFLOW)</span>
          </button>
        </div>
      {/if}

      <!-- Modal Body -->
      <div class="modal-body custom-scroll">
        {#if isMobile}
          <!-- 手機版：流水線 × AI 實戰視覺指引（嵌入真實網頁元素樣式） -->
          <div class="mobile-visual-workflow">
            <!-- 00 · 金鑰配置 -->
            <div class="workflow-step-card mobile-card hairline-all">
              <div class="mobile-card-head">
                <span class="step-num-badge">00</span>
                <div>
                  <h3 class="step-title font-headline">配置 AI 雲端金鑰（選填）</h3>
                  <p class="mobile-step-sub font-mono">API KEY VAULT · 顯影與文案核心</p>
                </div>
              </div>
              <p class="step-desc">
                在挑圖頂部、暗房「風格」面板或底部「設定」頁，點擊下方任一金鑰入口即可開啟保險庫，貼上
                <span class="highlight-text">Gemini</span>（視覺顯影調色）或
                <span class="highlight-text">Groq</span>（社群文案）API Key。
              </p>
              <div class="ui-preview-stage" aria-hidden="true">
                <div class="ui-preview-row">
                  <span class="ui-vault-pill">
                    <span class="material-symbols-outlined" style="font-size: 13px;">vpn_key</span>
                    <span>未配置金鑰 / 設定金鑰</span>
                  </span>
                  <span class="ui-preview-arrow font-mono">➔</span>
                  <span class="ui-vault-pill ready">
                    <span class="material-symbols-outlined" style="font-size: 13px;">verified_user</span>
                    <span>金鑰就緒</span>
                  </span>
                </div>
                <p class="ui-preview-caption font-mono">
                  支援「透明加密」（本機免密碼即存）或「主密碼保護」；未設金鑰仍可使用在地光學降級。
                </p>
              </div>
            </div>

            <div class="workflow-arrow mobile-arrow">↓</div>

            <!-- 01 · 挑圖與手勢 -->
            <div class="workflow-step-card mobile-card hairline-all">
              <div class="mobile-card-head">
                <span class="step-num-badge">01</span>
                <div>
                  <h3 class="step-title font-headline">膠卷目錄挑圖 (Catalog)</h3>
                  <p class="mobile-step-sub font-mono">INGESTION & CURATION</p>
                </div>
              </div>
              <p class="step-desc">
                載入記憶卡或資料夾後，點卡片右上角書籤加入精修佇列，或輕點縮圖直接進暗房。
                <span class="highlight-text">長按相片並滑動</span> 可開啟多選滑刷連選，一次批次挑選或排除。
              </p>
            </div>

            <div class="workflow-arrow mobile-arrow">↓</div>

            <!-- 02 · AI 關鍵字與顯影 -->
            <div class="workflow-step-card mobile-card hairline-all">
              <div class="mobile-card-head">
                <span class="step-num-badge">02</span>
                <div>
                  <h3 class="step-title font-headline">AI 關鍵字設定與顯影 (AI Retouch)</h3>
                  <p class="mobile-step-sub font-mono">STYLE LUT × VIBE KEYWORDS × 1-TAP AI</p>
                </div>
              </div>

              <div class="mobile-sub-block">
                <div class="sub-step-label font-mono">① 設定風格、意境關鍵字或自訂描述</div>
                <p class="step-desc">
                  點擊底部暗房列「風格」開啟 AI 抽屜，挑選 3D LUT、點選意境標籤或輸入描述（也可按「試試範例」或「編輯Prompt」微調）。
                </p>
                <div class="ui-preview-stage" aria-hidden="true">
                  <div class="ui-preview-row">
                    <span class="ui-action-pill compact active">
                      <span class="material-symbols-outlined" style="font-size: 14px;">palette</span>
                      <span>風格</span>
                    </span>
                    <span class="ui-preview-arrow font-mono">➔</span>
                    <span class="ui-vibe-chip active">
                      <span class="ui-vibe-dot"></span>
                      <span>日系空氣感</span>
                    </span>
                    <span class="ui-vibe-chip">
                      <span class="ui-vibe-dot"></span>
                      <span>Film Like</span>
                    </span>
                    <span class="ui-vibe-chip">
                      <span class="ui-vibe-dot"></span>
                      <span>電影感</span>
                    </span>
                  </div>
                  <div class="ui-custom-prompt-box font-body">
                    <span class="ui-prompt-placeholder">輸入自訂調色想法，如：微過曝通透日光...</span>
                    <span class="ui-sample-btn font-mono">
                      <span class="material-symbols-outlined" style="font-size: 11px;">casino</span>
                      <span>試試範例</span>
                    </span>
                  </div>
                </div>
              </div>

              <div class="mobile-sub-block">
                <div class="sub-step-label font-mono">② 不開抽屜直接顯影，點膠囊看理念</div>
                <p class="step-desc">
                  設定會自動保留；回到畫布直接點底部操作列即可執行單張或批次 AI（有設關鍵字會顯示為「依意境 AI」）。顯影後點擊畫布下方狀態膠囊，就能展開完整調色理念與裁切診斷。
                </p>
                <div class="ui-preview-stage" aria-hidden="true">
                  <div class="ui-preview-row">
                    <span class="ui-action-pill primary-ai">
                      <span class="material-symbols-outlined" style="font-size: 15px;">auto_awesome</span>
                      <span>一鍵 AI / 依意境 AI</span>
                    </span>
                    <span class="ui-action-pill secondary-batch">
                      <span class="material-symbols-outlined" style="font-size: 14px;">auto_mode</span>
                      <span>批次 (N)</span>
                    </span>
                  </div>
                  <div class="ui-ai-status-pill font-mono">
                    <span class="ui-status-left">
                      <span class="material-symbols-outlined" style="font-size: 13px; color: var(--amber-highlight);">auto_awesome</span>
                      <span>日系空氣感 · AI 調色完成（點我看報告）</span>
                    </span>
                    <span class="material-symbols-outlined" style="font-size: 14px; color: var(--parchment-dim);">chevron_right</span>
                  </div>
                </div>
              </div>

              <p class="mobile-gesture-note font-mono">
                手勢提示：畫布左右滑動切換底片 · 雙擊畫布局部放大檢視合焦
              </p>
            </div>

            <div class="workflow-arrow mobile-arrow">↓</div>

            <!-- 02.5 · 四種還原與對比 -->
            <div class="workflow-step-card mobile-card hairline-all">
              <div class="mobile-card-head">
                <span class="step-num-badge cyan">↺</span>
                <div>
                  <h3 class="step-title font-headline">對比原圖與各種「還原」怎麼分？</h3>
                  <p class="mobile-step-sub font-mono">COMPARE · RESTORE AI · UNDO · RESET</p>
                </div>
              </div>
              <div class="restore-matrix" aria-label="還原功能對照">
                <div class="restore-item">
                  <div class="restore-badge-slot" aria-hidden="true">
                    <span class="ui-ab-btn font-mono">
                      <span class="material-symbols-outlined" style="font-size: 13px;">compare</span>
                      <span>按住比對原圖</span>
                    </span>
                  </div>
                  <p class="restore-desc">
                    <strong>僅暫時預覽</strong>：長按畫布浮動鈕看 RAW 原圖，放開即恢復目前調色。
                  </p>
                </div>

                <div class="restore-item">
                  <div class="restore-badge-slot" aria-hidden="true">
                    <span class="ui-restore-ai-btn font-mono">
                      <span class="material-symbols-outlined" style="font-size: 12px;">settings_backup_restore</span>
                      <span>還原 AI</span>
                    </span>
                  </div>
                  <p class="restore-desc">
                    <strong>退回 AI 基準</strong>：手動微調跑偏後，點狀態膠囊或「微調」抽屜內的此鈕，一鍵回到 AI 顯影結果。
                  </p>
                </div>

                <div class="restore-item">
                  <div class="restore-badge-slot" aria-hidden="true">
                    <span class="ui-toolbar-btn font-mono">
                      <span class="material-symbols-outlined" style="font-size: 12px;">undo</span>
                      <span>復原</span>
                    </span>
                    <span class="ui-toolbar-btn font-mono">
                      <span class="material-symbols-outlined" style="font-size: 12px;">redo</span>
                      <span>重做</span>
                    </span>
                  </div>
                  <p class="restore-desc">
                    <strong>單步撤銷／單項歸零</strong>：在「微調」抽屜頂部撤銷上一步；<strong>雙擊滑桿名稱或數值</strong>可單項歸零。
                  </p>
                </div>

                <div class="restore-item">
                  <div class="restore-badge-slot" aria-hidden="true">
                    <span class="ui-toolbar-btn font-mono">
                      <span class="material-symbols-outlined" style="font-size: 12px;">photo_camera</span>
                      <span>相機原值</span>
                    </span>
                    <span class="ui-toolbar-btn danger font-mono">
                      <span class="material-symbols-outlined" style="font-size: 12px;">restart_alt</span>
                      <span>全重設</span>
                    </span>
                  </div>
                  <p class="restore-desc">
                    <strong>徹底還原</strong>：「相機原值」回到拍攝色溫曝光；「全重設」會清除所有調色、風格與裁切。
                  </p>
                </div>
              </div>
            </div>

            <div class="workflow-arrow mobile-arrow">↓</div>

            <!-- 03 · 導出與分享 -->
            <div class="workflow-step-card mobile-card hairline-all">
              <div class="mobile-card-head">
                <span class="step-num-badge green">03</span>
                <div>
                  <h3 class="step-title font-headline">AI 文案與導出分享 (Export)</h3>
                  <p class="mobile-step-sub font-mono">PRESETS · AI CAPTION · SYSTEM SHARE</p>
                </div>
              </div>
              <p class="step-desc">
                切換底部「導出/分享」，挑選 <span class="highlight-text">社群分享、高畫質或無損原圖</span> 預設（支援 JPG / PNG / WebP）。產生 AI 策展文案後，可直接匯出或呼叫手機原生分享面板發出成品。
              </p>
            </div>
          </div>
        {:else if activeSection === "guide"}
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
                    <span class="desc-sub font-mono"
                      >依網格排版上下翻動一整列</span
                    >
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">Space</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">大圖即時預覽 (Quick Look)</span>
                    <span class="desc-sub font-mono"
                      >彈出高畫質大圖審查合焦，再按一次關閉</span
                    >
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">P</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">挑選 / 取消挑選 (Toggle Pick)</span>
                    <span class="desc-sub font-mono"
                      >單鍵標記入隊，再按一次立即取消</span
                    >
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip font-mono">Ctrl</kbd>
                    <span class="or">+</span>
                    <span class="action-mouse">點選</span>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">個別多選 / 退選底片</span>
                    <span class="desc-sub font-mono"
                      >按住 Ctrl (或 macOS ⌘) 點擊相片，不連續加選或單獨剔除</span
                    >
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip font-mono">Shift</kbd>
                    <span class="or">+</span>
                    <span class="action-mouse">點選</span>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">連續區間範圍連選</span>
                    <span class="desc-sub font-mono"
                      >按住 Shift 點擊相片，一次選取與起點之間的整段底片</span
                    >
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip font-mono">Ctrl</kbd>
                    <span class="or">+</span>
                    <kbd class="kbd-chip font-mono">A</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">全選所有底片 (Select All)</span>
                    <span class="desc-sub font-mono"
                      >一鍵全選相卷所有相片，進入多選批次工作列</span
                    >
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip">Del</kbd>
                    <span class="or">/</span>
                    <kbd class="kbd-chip">Backspace</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main"
                      >排除底片 / 剔除淘汰 (Remove / Cull)</span
                    >
                    <span class="desc-sub font-mono"
                      >自相卷工作區排除並自動移至下一張（保留磁碟原檔，附帶 5
                      秒一鍵復原 ↺）</span
                    >
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">⇧</kbd>
                    <span class="or">+</span>
                    <kbd class="kbd-chip amber">Del</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main"
                      >實體刪除磁碟檔案 (Delete from Disk)</span
                    >
                    <span class="desc-sub font-mono"
                      >彈出二次確認後將磁碟 RAW/照片移入資源回收筒 /
                      廢紙簍（支援多選批次刪除）</span
                    >
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Enter</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">進入下一步 ➔ 一鍵暗房精修</span>
                    <span class="desc-sub font-mono"
                      >將已選底片（或全量）載入精修工作台</span
                    >
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
                    <span class="desc-sub font-mono"
                      >依序檢視隊列中的下一張底片</span
                    >
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip cyan">Space</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">A/B 原始本相即時對比</span>
                    <span class="desc-sub font-mono"
                      >瞬間切換 RAW 原始狀態與顯影調色成果</span
                    >
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">Ctrl+Z</kbd>
                    <span class="or">/</span>
                    <kbd class="kbd-chip">⌘Z</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">復原上一步調色 (Undo)</span>
                    <span class="desc-sub font-mono"
                      >復原上一步曝光、對比、陰影、色溫或構圖調整</span
                    >
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">Ctrl+Y</kbd>
                    <span class="or">/</span>
                    <kbd class="kbd-chip">⌘⇧Z</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">重做下一步調色 (Redo)</span>
                    <span class="desc-sub font-mono"
                      >重做調色步進（亦支援 Ctrl+Shift+Z / ⌘Shift+Z）</span
                    >
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">雙擊滑桿</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main"
                      >單項參數快速歸零 (Reset to Default)</span
                    >
                    <span class="desc-sub font-mono"
                      >點兩下滑桿標籤、數值或軌道即刻還原標準基準值</span
                    >
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">滾輪</kbd>
                    <kbd class="kbd-chip">⇧</kbd>
                    <kbd class="kbd-chip">⌥</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">懸停滾輪微調 (Wheel Scrubbing)</span
                    >
                    <span class="desc-sub font-mono"
                      >滑鼠懸停滾輪微調，按住 Shift (5x 快速) / Alt (0.2x 細微)</span
                    >
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">⌘E</kbd>
                    <span class="or">/</span>
                    <kbd class="kbd-chip">Ctrl+E</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main"
                      >快速匯出這張相片 (Quick Export)</span
                    >
                    <span class="desc-sub font-mono"
                      >跳出快速匯出視窗（按 1 社群分享 / 2 高畫質 / 3
                      無損原圖），免進批次頁面即可儲存</span
                    >
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Enter</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">進入下一步 ➔ 前往批次導出</span>
                    <span class="desc-sub font-mono"
                      >帶著所有調色參數進入匯出隊列</span
                    >
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Del</kbd>
                    <span class="or">/</span>
                    <kbd class="kbd-chip">Backspace</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">自工作區排除此幀</span>
                    <span class="desc-sub font-mono"
                      >剔除底片並自動推進至下一張（支援一鍵復原 ↺）</span
                    >
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">⇧</kbd>
                    <span class="or">+</span>
                    <kbd class="kbd-chip amber">Del</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main"
                      >實體刪除此底片 (Delete from Disk)</span
                    >
                    <span class="desc-sub font-mono"
                      >彈出二次確認後將磁碟原檔移至資源回收筒 / 廢紙簍</span
                    >
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

            <!-- 模組 3: 相片匯出設定 -->
            <div class="shortcut-group hairline-all">
              <div class="group-header font-mono">
                <span class="group-badge">STEP 03</span>
                <span class="group-title">相片匯出設定 (EXPORT)</span>
              </div>
              <div class="shortcut-list">
                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip green">Enter</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">開始匯出已選相片</span>
                    <span class="desc-sub font-mono"
                      >依所選格式（JPG / PNG /
                      WebP）、畫質與長邊尺寸立即輸出並歸檔</span
                    >
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Del</kbd>
                    <span class="or">/</span>
                    <kbd class="kbd-chip">Backspace</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">自工作區排除此幀</span>
                    <span class="desc-sub font-mono"
                      >剔除底片並自動推進至下一張（支援一鍵復原 ↺）</span
                    >
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Esc</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">返回上一步 ➔ 暗房精修</span>
                    <span class="desc-sub font-mono"
                      >繼續微調光影或更換 LUT 風格</span
                    >
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
                    <span class="desc-sub font-mono"
                      >隨時叫出操作指引與快捷鍵速查</span
                    >
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Del</kbd>
                    <span class="or">/</span>
                    <kbd class="kbd-chip">Backspace</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">自工作區排除此幀</span>
                    <span class="desc-sub font-mono"
                      >剔除底片並自動推進至下一張（支援一鍵復原 ↺）</span
                    >
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Esc</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">關閉彈窗 / 返回上一層</span>
                    <span class="desc-sub font-mono"
                      >優先關閉浮層（大圖、說明、金鑰金庫）</span
                    >
                  </div>
                </div>
              </div>
            </div>
          </div>
        {:else}
          <!-- 桌機版：3 步驟流水線指引 -->
          <div class="workflow-container font-mono">
            <div class="workflow-step-card hairline-all">
              <div class="step-num-badge">01</div>
              <div class="step-content">
                <h3 class="step-title font-headline">
                  相機連線與膠卷挑圖 (Ingestion & Curation)
                </h3>
                <p class="step-desc">
                  插入相機記憶卡或連接傳輸線，系統即插即讀自動探測 DCIM 目錄與
                  RAW 檔案。 在目錄矩陣中，利用右手 <span
                    class="highlight-text">HJKL</span
                  >
                  瀏覽底片， 按下 <span class="highlight-text">Space</span>
                  叫出 Quick Look 審視合焦細節， 左手按下
                  <span class="highlight-text">P</span>
                  鍵加入挑選清單。挑選完畢後按
                  <span class="highlight-text">Enter</span> 順暢進入暗房。
                </p>
              </div>
            </div>

            <div class="workflow-arrow">↓</div>

            <div class="workflow-step-card hairline-all">
              <div class="step-num-badge">02</div>
              <div class="step-content">
                <h3 class="step-title font-headline">
                  單張暗房精修 (Darkroom Retouch)
                </h3>
                <p class="step-desc">
                  暗房工作台載入挑選底片，具備 60FPS WebGL 2.0 即時 3D LUT
                  色彩模擬。 支援多模態 AI 智慧顯影調色與獨立微型快捷動作（AI
                  裁切、AI 拉平、AI 白平衡、AI 光比）。 修圖過程中長按或按一下 <span
                    class="highlight-text">Space</span
                  >
                  進行 A/B 原始本相對比。滿意後按
                  <span class="highlight-text">Enter</span> 推進至導出。
                </p>
              </div>
            </div>

            <div class="workflow-arrow">↓</div>

            <div class="workflow-step-card hairline-all">
              <div class="step-num-badge">03</div>
              <div class="step-content">
                <h3 class="step-title font-headline">
                  智慧分類與批次匯出 (Export & Archive)
                </h3>
                <p class="step-desc">
                  自由挑選 <span class="highlight-text"
                    >社群分享、高畫質相片或無損典藏</span
                  >
                  用途預設，亦可自訂格式（JPG / PNG /
                  WebP）、畫質百分比與長邊像素限制。 支援 AI 場景資料夾分類與
                  RAW 備份，確認後按下
                  <span class="highlight-text">Enter</span> 立即開始匯出。
                </p>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Modal Footer -->
      <footer class="modal-footer hairline-t font-mono">
        <div class="footer-tip">
          <span class="material-symbols-outlined tip-icon"
            >tips_and_updates</span
          >
          {#if isMobile}
            <span>提示：點擊右上角「?」圖示可隨時開啟或關閉此指引。</span>
          {:else}
            <span
              >提示：在任何介面隨時按下 <kbd class="kbd-chip">?</kbd> 鍵即可快速叫出或關閉此說明視窗。</span
            >
          {/if}
        </div>
        <button type="button" class="archival-btn-primary" onclick={onClose}>
          <span>{isMobile ? "瞭解並關閉" : "瞭解並關閉 (Esc)"}</span>
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
    from {
      opacity: 0;
      transform: scale(0.99);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
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

  /* 手機版視覺化流水線 × 嵌入網頁元素預覽 */
  .mobile-visual-workflow {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
  }

  .mobile-card {
    flex-direction: column;
    gap: 10px;
  }

  .mobile-card-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .mobile-card-head .step-title {
    margin-bottom: 2px;
  }

  .mobile-step-sub {
    font-size: 10px;
    color: var(--parchment-dim);
    letter-spacing: 0.06em;
  }

  .step-num-badge.cyan {
    color: #5ce1e6;
    background: rgba(92, 225, 230, 0.1);
    border-color: rgba(92, 225, 230, 0.35);
  }

  .step-num-badge.green {
    color: var(--success-green);
    background: rgba(86, 143, 107, 0.12);
    border-color: rgba(86, 143, 107, 0.4);
  }

  .mobile-arrow {
    line-height: 1;
  }

  .mobile-sub-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 6px;
    border-top: 1px dashed rgba(255, 255, 255, 0.08);
  }

  .sub-step-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--amber-highlight);
  }

  .mobile-gesture-note {
    font-size: 10.5px;
    color: var(--parchment-dim);
    padding-top: 6px;
    border-top: 1px dashed rgba(255, 255, 255, 0.08);
  }

  /* 擬真網頁元件展示舞台 */
  .ui-preview-stage {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: var(--radius-xs);
    background-color: rgba(12, 13, 17, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.08);
    pointer-events: none;
    user-select: none;
  }

  .ui-preview-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .ui-preview-arrow {
    font-size: 11px;
    color: var(--parchment-dim);
  }

  .ui-preview-caption {
    font-size: 10.5px;
    color: var(--parchment-dim);
    line-height: 1.45;
  }

  /* 金鑰膠囊預覽 (對應 AiAssistPanel .vault-pill-btn) */
  .ui-vault-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid rgba(226, 157, 82, 0.45);
    background: rgba(226, 157, 82, 0.1);
    color: var(--amber-highlight);
    font-size: 10.5px;
    font-family: var(--font-mono);
  }

  .ui-vault-pill.ready {
    border-color: var(--hairline-slate);
    background: var(--surface-elevated);
    color: var(--parchment-muted);
  }

  /* 行動暗房操作列按鈕預覽 (對應 MobileRetouchBar .retouch-action-pill) */
  .ui-action-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 5px 11px;
    border-radius: 20px;
    border: 1px solid var(--hairline-slate);
    background: rgba(255, 255, 255, 0.05);
    color: var(--parchment-bright);
    font-size: 11px;
    font-family: var(--font-mono);
    white-space: nowrap;
  }

  .ui-action-pill.compact {
    padding: 5px 9px;
  }

  .ui-action-pill.active {
    background: rgba(212, 163, 115, 0.15);
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
  }

  .ui-action-pill.primary-ai {
    background: linear-gradient(
      135deg,
      rgba(226, 157, 82, 0.24),
      rgba(212, 163, 115, 0.12)
    );
    border-color: rgba(226, 157, 82, 0.65);
    color: var(--amber-highlight);
    font-weight: 600;
  }

  .ui-action-pill.secondary-batch {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.18);
  }

  /* 意境關鍵字標籤預覽 (對應 AiAssistPanel .vibe-keyword-chip) */
  .ui-vibe-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    font-size: 10.5px;
    color: var(--parchment-muted);
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-sm);
  }

  .ui-vibe-chip.active {
    background: rgba(226, 157, 82, 0.18);
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    font-weight: 600;
  }

  .ui-vibe-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.25);
  }

  .ui-vibe-chip.active .ui-vibe-dot {
    background: var(--amber-highlight);
    box-shadow: 0 0 6px var(--amber-highlight);
  }

  /* 自訂意境描述框預覽 */
  .ui-custom-prompt-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px;
    border-radius: var(--radius-xs);
    background: rgba(20, 22, 27, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 10.5px;
  }

  .ui-prompt-placeholder {
    color: var(--parchment-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ui-sample-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 6px;
    border-radius: var(--radius-xs);
    border: 1px solid rgba(226, 157, 82, 0.35);
    background: rgba(226, 157, 82, 0.08);
    color: var(--amber-highlight);
    font-size: 10px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* 畫布下方 AI 狀態小膠囊預覽 (對應 DarkroomViewport .mobile-ai-status-pill) */
  .ui-ai-status-pill {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    background-color: rgba(16, 17, 21, 0.92);
    border: 1px solid rgba(212, 163, 115, 0.35);
    font-size: 10.5px;
    color: var(--parchment-bright);
  }

  .ui-status-left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 四種還原對照表 */
  .restore-matrix {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .restore-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 9px 10px;
    border-radius: var(--radius-xs);
    background-color: rgba(12, 13, 17, 0.65);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .restore-badge-slot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    pointer-events: none;
    user-select: none;
  }

  .restore-desc {
    font-size: 11.5px;
    color: var(--parchment-muted);
    line-height: 1.5;
  }

  .restore-desc strong {
    color: var(--parchment-bright);
    font-weight: 600;
  }

  .ui-ab-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(16, 18, 23, 0.88);
    border: 1px solid rgba(92, 225, 230, 0.45);
    color: #5ce1e6;
    font-size: 10.5px;
  }

  .ui-restore-ai-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid rgba(226, 157, 82, 0.45);
    background: rgba(226, 157, 82, 0.14);
    color: var(--amber-highlight);
    font-size: 10.5px;
  }

  .ui-toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px 7px;
    border-radius: var(--radius-xs);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-hairline);
    color: var(--parchment-muted);
    font-size: 10.5px;
  }

  .ui-toolbar-btn.danger {
    border-color: rgba(255, 107, 107, 0.4);
    color: #ff8787;
  }

  @media (max-width: 768px) {
    .modal-card {
      max-width: 94vw;
      max-height: 88vh;
    }

    .modal-header {
      padding: 14px 16px;
    }

    .title {
      font-size: 15px;
    }

    .modal-body {
      padding: 14px;
    }

    .workflow-step-card {
      padding: 14px;
      gap: 12px;
    }

    .step-num-badge {
      width: 34px;
      height: 34px;
      font-size: 15px;
    }

    .modal-footer {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
      padding: 14px 16px;
    }

    .footer-tip {
      font-size: 11px;
      line-height: 1.45;
    }

    .archival-btn-primary {
      justify-content: center;
      width: 100%;
    }
  }
</style>
