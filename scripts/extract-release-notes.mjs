import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rawTag = process.argv[2] || process.env.GITHUB_REF_NAME || '';
const version = rawTag.replace(/^v/, '');

const changelogPath = resolve(process.cwd(), 'CHANGELOG.md');
const changelog = readFileSync(changelogPath, 'utf-8');

/**
 * 從 CHANGELOG.md 擷取指定版本區段；若未指定或找不到則擷取最新版本區段。
 */
function extractVersionSection(content, targetVersion) {
  const lines = content.split(/\r?\n/);
  const headingPattern = targetVersion
    ? new RegExp(`^## \\[${targetVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`)
    : /^## \[/;

  let startIndex = lines.findIndex((line) => headingPattern.test(line));
  if (startIndex === -1 && targetVersion) {
    // 找不到指定版本時退回抓取最新版本
    startIndex = lines.findIndex((line) => /^## \[/.test(line));
  }

  if (startIndex === -1) {
    return '本次發行包含最新功能更新與效能優化。';
  }

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (/^## \[/.test(lines[i])) {
      endIndex = i;
      break;
    }
  }

  return lines
    .slice(startIndex, endIndex)
    .join('\n')
    .replace(/^---\s*$/gm, '')
    .trim();
}

const versionNotes = extractVersionSection(changelog, version);

const installGuide = `## 📦 跨平台安裝說明 (Installation)

### 🪟 Windows
* 下載 \`*_x64-setup.exe\`（NSIS 安裝程式）或 \`*_x64_en-US.msi\` 直接雙擊安裝。
* 若 Windows SmartScreen 跳出「已保護您的電腦」提示，請點選 **「其他資訊」➔「仍要執行」**（因本專案為個人開源發行，尚未購買商業程式碼簽章憑證）。

### 🍎 macOS (Apple Silicon & Intel)
* **Apple Silicon (M1 / M2 / M3 / M4)**：下載 \`*_aarch64.dmg\`。
* **Intel Mac**：下載 \`*_x64.dmg\`。
* 開啟 \`.dmg\` 並將應用程式拖曳至 \`Applications\`（應用程式）資料夾。
* **首次開啟提醒**：若系統提示「無法驗證開發者」或「檔案已損毀」，請開啟終端機執行以下指令解除隔離屬性後再開啟：
  \`\`\`bash
  xattr -cr "/Applications/tauri-app.app"
  \`\`\`

### 🐧 Linux (AppImage / DEB)
* **AppImage（免安裝可攜版，推薦）**：
  \`\`\`bash
  chmod +x tauri-app_*.AppImage
  ./tauri-app_*.AppImage
  \`\`\`
  > 若在 Ubuntu 22.04 / 24.04 遇到 \`libfuse.so.2\` 缺失錯誤，請先執行 \`sudo apt install libfuse2\`，或加上 \`--appimage-extract-and-run\` 參數啟動。
* **Debian / Ubuntu (\`.deb\`)**：
  \`\`\`bash
  sudo apt install ./tauri-app_*_amd64.deb
  \`\`\`

### 🌐 Web / PWA（免安裝即時體驗）
* 直接開啟線上版：[https://slipknot-door.pages.dev/](https://slipknot-door.pages.dev/)
* 支援瀏覽器安裝為 PWA（漸進式網頁應用），手機與桌面皆可離線開啟使用。

---

`;

const releaseBody = `${installGuide}${versionNotes}`;

if (process.env.GITHUB_OUTPUT) {
  const delimiter = `EOF_${Date.now()}`;
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `body<<${delimiter}\n${releaseBody}\n${delimiter}\n`,
    'utf-8'
  );
} else {
  console.log(releaseBody);
}
