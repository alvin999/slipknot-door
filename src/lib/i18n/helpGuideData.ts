import type { Locale } from './types';

export interface ShortcutRowData {
  keysHtml: string;
  main: string;
  sub: string;
  highlight?: boolean;
}

export interface ShortcutGroupData {
  badge: string;
  title: string;
  rows: ShortcutRowData[];
}

export const HELP_SHORTCUT_GROUPS: Record<Locale, ShortcutGroupData[]> = {
  'zh-TW': [
    {
      badge: 'STEP 01',
      title: '膠卷目錄挑圖矩陣 (CATALOG)',
      rows: [
        { keysHtml: '<kbd class="kbd-chip">H</kbd><kbd class="kbd-chip">L</kbd><span class="or">或</span><kbd class="kbd-chip">←</kbd><kbd class="kbd-chip">→</kbd>', main: '前後切換照片', sub: 'Vim 式左/右移動遊標' },
        { keysHtml: '<kbd class="kbd-chip">J</kbd><kbd class="kbd-chip">K</kbd><span class="or">或</span><kbd class="kbd-chip">↓</kbd><kbd class="kbd-chip">↑</kbd>', main: '跨列跳轉照片', sub: '依網格排版上下翻動一整列' },
        { keysHtml: '<kbd class="kbd-chip amber">Space</kbd>', main: '大圖即時預覽 (Quick Look)', sub: '彈出高畫質大圖審查合焦，再按一次關閉', highlight: true },
        { keysHtml: '<kbd class="kbd-chip amber">P</kbd>', main: '挑選 / 取消挑選 (Toggle Pick)', sub: '單鍵標記入隊，再按一次立即取消', highlight: true },
        { keysHtml: '<kbd class="kbd-chip font-mono">Ctrl</kbd><span class="or">+</span><span class="action-mouse">點選</span>', main: '個別多選 / 退選底片', sub: '按住 Ctrl (或 macOS ⌘) 點擊相片，不連續加選或單獨剔除' },
        { keysHtml: '<kbd class="kbd-chip font-mono">Shift</kbd><span class="or">+</span><span class="action-mouse">點選</span>', main: '連續區間範圍連選', sub: '按住 Shift 點擊相片，一次選取與起點之間的整段底片' },
        { keysHtml: '<kbd class="kbd-chip font-mono">Ctrl</kbd><span class="or">+</span><kbd class="kbd-chip font-mono">A</kbd>', main: '全選所有底片 (Select All)', sub: '一鍵全選相卷所有相片，進入多選批次工作列' },
        { keysHtml: '<kbd class="kbd-chip">Del</kbd><span class="or">/</span><kbd class="kbd-chip">Backspace</kbd>', main: '排除底片 / 剔除淘汰 (Remove / Cull)', sub: '自相卷工作區排除並自動移至下一張（保留磁碟原檔，附帶 5 秒一鍵復原 ↺）' },
        { keysHtml: '<kbd class="kbd-chip amber">⇧</kbd><span class="or">+</span><kbd class="kbd-chip amber">Del</kbd>', main: '實體刪除磁碟檔案 (Delete from Disk)', sub: '彈出二次確認後將磁碟 RAW/照片移入資源回收筒 / 廢紙簍（支援多選批次刪除）' },
        { keysHtml: '<kbd class="kbd-chip">Enter</kbd>', main: '進入下一步 ➔ 一鍵暗房精修', sub: '將已選底片（或全量）載入精修工作台' },
      ],
    },
    {
      badge: 'STEP 02',
      title: '暗房精修與微調 (DARKROOM)',
      rows: [
        { keysHtml: '<kbd class="kbd-chip">H</kbd><kbd class="kbd-chip">L</kbd><span class="or">或</span><kbd class="kbd-chip">←</kbd><kbd class="kbd-chip">→</kbd>', main: '切換上 / 下一張精修底片', sub: '於底部膠卷軸快速切換待修幀' },
        { keysHtml: '<kbd class="kbd-chip amber">Space</kbd>', main: 'A/B 原圖即時比對', sub: '按住顯示未修圖 RAW 原貌，放開恢復顯影成果', highlight: true },
        { keysHtml: '<kbd class="kbd-chip">Ctrl</kbd><span class="or">+</span><kbd class="kbd-chip">Z</kbd><span class="or">/</span><kbd class="kbd-chip">Y</kbd>', main: '復原 / 重做調色 (Undo / Redo)', sub: '支援連續多步調色參數快照復原' },
        { keysHtml: '<span class="action-mouse">雙擊滑桿</span>', main: '單項參數快速歸零', sub: '雙擊滑桿標籤、數值或軌道立即還原基準值' },
        { keysHtml: '<span class="action-mouse">滾輪懸停</span>', main: '精密微調滑桿 (Wheel Scrubbing)', sub: '滑鼠懸停滾輪微調，按住 Shift (5x 快速) / Alt (0.2x 細微)' },
        { keysHtml: '<kbd class="kbd-chip amber">⌘</kbd><span class="or">/</span><kbd class="kbd-chip amber">Ctrl</kbd><span class="or">+</span><kbd class="kbd-chip amber">E</kbd>', main: '快速匯出這張相片 (Quick Export)', sub: '跳出快速匯出視窗（按 1 社群 / 2 高畫質 / 3 無損原圖），免進批次頁即可儲存', highlight: true },
        { keysHtml: '<kbd class="kbd-chip">Enter</kbd>', main: '進入下一步 ➔ 前往批次導出', sub: '帶著所有調色參數進入匯出隊列' },
        { keysHtml: '<kbd class="kbd-chip">Del</kbd><span class="or">/</span><kbd class="kbd-chip">Backspace</kbd>', main: '自工作區排除此幀', sub: '剔除底片並自動推進至下一張（支援一鍵復原 ↺）' },
        { keysHtml: '<kbd class="kbd-chip amber">⇧</kbd><span class="or">+</span><kbd class="kbd-chip amber">Del</kbd>', main: '實體刪除此底片 (Delete from Disk)', sub: '彈出二次確認後將磁碟原檔移至資源回收筒 / 廢紙簍' },
        { keysHtml: '<kbd class="kbd-chip">Esc</kbd>', main: '返回上一步 ➔ 膠卷目錄', sub: '回到挑圖矩陣重新選片' },
      ],
    },
    {
      badge: 'STEP 03',
      title: '相片匯出設定 (EXPORT)',
      rows: [
        { keysHtml: '<kbd class="kbd-chip amber">Enter</kbd>', main: '開始匯出已選相片', sub: '依所選格式（JPG / PNG / WebP）、畫質與長邊尺寸立即輸出並歸檔', highlight: true },
        { keysHtml: '<kbd class="kbd-chip">Del</kbd><span class="or">/</span><kbd class="kbd-chip">Backspace</kbd>', main: '自工作區排除此幀', sub: '剔除底片並自動推進至下一張（支援一鍵復原 ↺）' },
        { keysHtml: '<kbd class="kbd-chip">Esc</kbd>', main: '返回上一步 ➔ 暗房精修', sub: '繼續微調光影或更換 LUT 風格' },
      ],
    },
    {
      badge: 'GLOBAL',
      title: '全域輔助與導航',
      rows: [
        { keysHtml: '<kbd class="kbd-chip">?</kbd>', main: '開啟 / 關閉此指南', sub: '隨時叫出操作指引與快捷鍵速查' },
        { keysHtml: '<kbd class="kbd-chip">Esc</kbd>', main: '關閉彈窗 / 返回上一層', sub: '優先關閉浮層（大圖、說明、金鑰保險庫）' },
      ],
    },
  ],
  en: [
    {
      badge: 'STEP 01',
      title: 'CATALOG & CULLING MATRIX',
      rows: [
        { keysHtml: '<kbd class="kbd-chip">H</kbd><kbd class="kbd-chip">L</kbd><span class="or">or</span><kbd class="kbd-chip">←</kbd><kbd class="kbd-chip">→</kbd>', main: 'Previous / Next Frame', sub: 'Vim-style left/right cursor navigation' },
        { keysHtml: '<kbd class="kbd-chip">J</kbd><kbd class="kbd-chip">K</kbd><span class="or">or</span><kbd class="kbd-chip">↓</kbd><kbd class="kbd-chip">↑</kbd>', main: 'Jump Across Rows', sub: 'Move up/down a full grid row' },
        { keysHtml: '<kbd class="kbd-chip amber">Space</kbd>', main: 'Quick Look Preview', sub: 'Open high-res focus inspection modal; press again to close', highlight: true },
        { keysHtml: '<kbd class="kbd-chip amber">P</kbd>', main: 'Toggle Pick / Flag', sub: 'Flag frame for darkroom queue; press again to unpick', highlight: true },
        { keysHtml: '<kbd class="kbd-chip font-mono">Ctrl</kbd><span class="or">+</span><span class="action-mouse">Click</span>', main: 'Multi-Select / Deselect', sub: 'Hold Ctrl (or macOS ⌘) + click to toggle individual frames' },
        { keysHtml: '<kbd class="kbd-chip font-mono">Shift</kbd><span class="or">+</span><span class="action-mouse">Click</span>', main: 'Range Select', sub: 'Hold Shift + click to select a continuous range of frames' },
        { keysHtml: '<kbd class="kbd-chip font-mono">Ctrl</kbd><span class="or">+</span><kbd class="kbd-chip font-mono">A</kbd>', main: 'Select All Frames', sub: 'Select all frames in the roll and open batch action bar' },
        { keysHtml: '<kbd class="kbd-chip">Del</kbd><span class="or">/</span><kbd class="kbd-chip">Backspace</kbd>', main: 'Remove / Cull from Roll', sub: 'Exclude from workspace and advance (keeps file on disk, 5s undo ↺)' },
        { keysHtml: '<kbd class="kbd-chip amber">⇧</kbd><span class="or">+</span><kbd class="kbd-chip amber">Del</kbd>', main: 'Delete from Disk', sub: 'Confirm to move original RAW/JPG files to Trash / Recycle Bin' },
        { keysHtml: '<kbd class="kbd-chip">Enter</kbd>', main: 'Next Step ➔ Darkroom Retouch', sub: 'Load picked frames (or all) into the Darkroom' },
      ],
    },
    {
      badge: 'STEP 02',
      title: 'DARKROOM RETOUCH & GRADING',
      rows: [
        { keysHtml: '<kbd class="kbd-chip">H</kbd><kbd class="kbd-chip">L</kbd><span class="or">or</span><kbd class="kbd-chip">←</kbd><kbd class="kbd-chip">→</kbd>', main: 'Switch Frame', sub: 'Move between frames in the bottom contact strip' },
        { keysHtml: '<kbd class="kbd-chip amber">Space</kbd>', main: 'Hold for A/B Original Compare', sub: 'Hold to view raw ungraded image; release to restore grading', highlight: true },
        { keysHtml: '<kbd class="kbd-chip">Ctrl</kbd><span class="or">+</span><kbd class="kbd-chip">Z</kbd><span class="or">/</span><kbd class="kbd-chip">Y</kbd>', main: 'Undo / Redo Grading', sub: 'Step backward or forward through grading snapshots' },
        { keysHtml: '<span class="action-mouse">Double-Click</span>', main: 'Reset Single Slider', sub: 'Double-click slider label, value, or track to reset' },
        { keysHtml: '<span class="action-mouse">Hover Wheel</span>', main: 'Precision Wheel Scrubbing', sub: 'Scroll over slider; hold Shift (5x fast) or Alt (0.2x fine)' },
        { keysHtml: '<kbd class="kbd-chip amber">⌘</kbd><span class="or">/</span><kbd class="kbd-chip amber">Ctrl</kbd><span class="or">+</span><kbd class="kbd-chip amber">E</kbd>', main: 'Quick Export Photo', sub: 'Open Quick Export (1 Social / 2 High / 3 Lossless) without leaving Darkroom', highlight: true },
        { keysHtml: '<kbd class="kbd-chip">Enter</kbd>', main: 'Next Step ➔ Batch Export', sub: 'Proceed to Export view with all grading parameters' },
        { keysHtml: '<kbd class="kbd-chip">Del</kbd><span class="or">/</span><kbd class="kbd-chip">Backspace</kbd>', main: 'Exclude Frame from Workspace', sub: 'Remove frame and advance to next (with 5s undo ↺)' },
        { keysHtml: '<kbd class="kbd-chip amber">⇧</kbd><span class="or">+</span><kbd class="kbd-chip amber">Del</kbd>', main: 'Delete from Disk', sub: 'Confirm to move original file to Trash / Recycle Bin' },
        { keysHtml: '<kbd class="kbd-chip">Esc</kbd>', main: 'Back ➔ Catalog', sub: 'Return to Catalog culling grid' },
      ],
    },
    {
      badge: 'STEP 03',
      title: 'EXPORT & ARCHIVE',
      rows: [
        { keysHtml: '<kbd class="kbd-chip amber">Enter</kbd>', main: 'Start Batch Export', sub: 'Export & archive selected photos with chosen format, quality & size', highlight: true },
        { keysHtml: '<kbd class="kbd-chip">Del</kbd><span class="or">/</span><kbd class="kbd-chip">Backspace</kbd>', main: 'Exclude Frame', sub: 'Remove frame from export queue (with 5s undo ↺)' },
        { keysHtml: '<kbd class="kbd-chip">Esc</kbd>', main: 'Back ➔ Darkroom', sub: 'Return to Darkroom to continue grading' },
      ],
    },
    {
      badge: 'GLOBAL',
      title: 'GLOBAL NAVIGATION',
      rows: [
        { keysHtml: '<kbd class="kbd-chip">?</kbd>', main: 'Toggle This Guide', sub: 'Open or close shortcuts & workflow guide anytime' },
        { keysHtml: '<kbd class="kbd-chip">Esc</kbd>', main: 'Close Modal / Go Back', sub: 'Dismiss active overlay (Quick Look, Guide, Key Vault)' },
      ],
    },
  ],
  ja: [
    {
      badge: 'STEP 01',
      title: 'カタログ選別マトリクス (CATALOG)',
      rows: [
        { keysHtml: '<kbd class="kbd-chip">H</kbd><kbd class="kbd-chip">L</kbd><span class="or">または</span><kbd class="kbd-chip">←</kbd><kbd class="kbd-chip">→</kbd>', main: '前後の写真へ移動', sub: 'Vim 風の左右カーソル移動' },
        { keysHtml: '<kbd class="kbd-chip">J</kbd><kbd class="kbd-chip">K</kbd><span class="or">または</span><kbd class="kbd-chip">↓</kbd><kbd class="kbd-chip">↑</kbd>', main: '行をまたいで移動', sub: 'グリッドの1行上下へジャンプ' },
        { keysHtml: '<kbd class="kbd-chip amber">Space</kbd>', main: '拡大プレビュー (Quick Look)', sub: '高画質プレビューでピント確認（再押しで閉じる）', highlight: true },
        { keysHtml: '<kbd class="kbd-chip amber">P</kbd>', main: '選択 / 解除 (Toggle Pick)', sub: '現像キューへマーク（再押しで解除）', highlight: true },
        { keysHtml: '<kbd class="kbd-chip font-mono">Ctrl</kbd><span class="or">+</span><span class="action-mouse">クリック</span>', main: '個別複数選択 / 解除', sub: 'Ctrl（macOS は ⌘）を押しながらクリックで個別選択' },
        { keysHtml: '<kbd class="kbd-chip font-mono">Shift</kbd><span class="or">+</span><span class="action-mouse">クリック</span>', main: '連続範囲選択', sub: 'Shift を押しながらクリックで始点から連続選択' },
        { keysHtml: '<kbd class="kbd-chip font-mono">Ctrl</kbd><span class="or">+</span><kbd class="kbd-chip font-mono">A</kbd>', main: 'すべて選択 (Select All)', sub: 'ロール内の全写真を選択し一括バーを表示' },
        { keysHtml: '<kbd class="kbd-chip">Del</kbd><span class="or">/</span><kbd class="kbd-chip">Backspace</kbd>', main: 'ロールから除外 (Remove / Cull)', sub: '作業スペースから除外して次へ（元ファイルは保持・5秒以内元に戻す可 ↺）' },
        { keysHtml: '<kbd class="kbd-chip amber">⇧</kbd><span class="or">+</span><kbd class="kbd-chip amber">Del</kbd>', main: 'ディスクから削除 (Delete from Disk)', sub: '確認後に元ファイルをゴミ箱へ移動（複数選択対応）' },
        { keysHtml: '<kbd class="kbd-chip">Enter</kbd>', main: '次へ ➔ 現像室レタッチ', sub: '選択した写真（または全件）を現像室へ読み込む' },
      ],
    },
    {
      badge: 'STEP 02',
      title: '現像室レタッチ & 調整 (DARKROOM)',
      rows: [
        { keysHtml: '<kbd class="kbd-chip">H</kbd><kbd class="kbd-chip">L</kbd><span class="or">または</span><kbd class="kbd-chip">←</kbd><kbd class="kbd-chip">→</kbd>', main: '前後のコマへ切替', sub: '下部フィルムストリップで素早く移動' },
        { keysHtml: '<kbd class="kbd-chip amber">Space</kbd>', main: 'A/B 原版比較', sub: '長押しで未調整の RAW 原版を表示、離すと現像後へ戻す', highlight: true },
        { keysHtml: '<kbd class="kbd-chip">Ctrl</kbd><span class="or">+</span><kbd class="kbd-chip">Z</kbd><span class="or">/</span><kbd class="kbd-chip">Y</kbd>', main: '元に戻す / やり直す', sub: '調色スナップショットを段階的に戻す・進める' },
        { keysHtml: '<span class="action-mouse">ダブルクリック</span>', main: 'スライダー単体リセット', sub: 'ラベル・数値・トラックをダブルクリックで基準値へ戻す' },
        { keysHtml: '<span class="action-mouse">ホイール微調整</span>', main: '精密ホイール調整', sub: 'スライダー上でホイール操作。Shift (5倍速) / Alt (0.2倍微細)' },
        { keysHtml: '<kbd class="kbd-chip amber">⌘</kbd><span class="or">/</span><kbd class="kbd-chip amber">Ctrl</kbd><span class="or">+</span><kbd class="kbd-chip amber">E</kbd>', main: 'クイック書き出し (Quick Export)', sub: '1 SNS / 2 高画質 / 3 可逆原寸 を即時書き出し', highlight: true },
        { keysHtml: '<kbd class="kbd-chip">Enter</kbd>', main: '次へ ➔ 一括書き出し', sub: '調整パラメータを保持したまま書き出し画面へ' },
        { keysHtml: '<kbd class="kbd-chip">Del</kbd><span class="or">/</span><kbd class="kbd-chip">Backspace</kbd>', main: '作業スペースから除外', sub: '除外して次のコマへ進む（元に戻す対応 ↺）' },
        { keysHtml: '<kbd class="kbd-chip amber">⇧</kbd><span class="or">+</span><kbd class="kbd-chip amber">Del</kbd>', main: 'ディスクから削除', sub: '確認後に元ファイルをゴミ箱へ移動' },
        { keysHtml: '<kbd class="kbd-chip">Esc</kbd>', main: '戻る ➔ カタログ', sub: 'カタログ選別画面へ戻る' },
      ],
    },
    {
      badge: 'STEP 03',
      title: '書き出し & アーカイブ (EXPORT)',
      rows: [
        { keysHtml: '<kbd class="kbd-chip amber">Enter</kbd>', main: '書き出し開始', sub: '選択した形式（JPG / PNG / WebP）・画質・サイズで保存', highlight: true },
        { keysHtml: '<kbd class="kbd-chip">Del</kbd><span class="or">/</span><kbd class="kbd-chip">Backspace</kbd>', main: '書き出し対象から除外', sub: 'キューから除外して次へ（元に戻す対応 ↺）' },
        { keysHtml: '<kbd class="kbd-chip">Esc</kbd>', main: '戻る ➔ 現像室', sub: '現像室に戻って調整を続ける' },
      ],
    },
    {
      badge: 'GLOBAL',
      title: 'グローバル操作',
      rows: [
        { keysHtml: '<kbd class="kbd-chip">?</kbd>', main: 'このガイドを開閉', sub: 'いつでも操作ガイドとショートカット一覧を表示' },
        { keysHtml: '<kbd class="kbd-chip">Esc</kbd>', main: 'モーダルを閉じる / 戻る', sub: '開いているオーバーレイ（拡大・ガイド・キー保管庫）を閉じる' },
      ],
    },
  ],
};
