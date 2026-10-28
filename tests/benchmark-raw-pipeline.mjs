// @ts-check
/**
 * =========================================================================
 * Slipknot AI 暗房：真實相機 RAW / 影像端對端推論延遲精準 Benchmark 測試工具
 *
 * 用途：
 * 1. 測量真實 RAW 檔案（ARW / CR2 / NEF）或高解析度圖片之內嵌預覽圖萃取耗時
 * 2. 測量 512px 多模態影像 Payload 體積大小（KB / MB）
 * 3. 精準測量 Google Gemini API 端點連線往返與多模態推論真實耗時（以毫秒精度計時）
 * 4. 診斷為什麼批次顯影過去會遭遇 25 秒超時（是本機解碼卡住？Payload 過大？還是網路延遲？）
 *
 * 執行方式：
 *   node ./tests/benchmark-raw-pipeline.mjs <API_KEY> [RAW_OR_PHOTO_PATH] [MODEL_NAME]
 * 範例：
 *   node ./tests/benchmark-raw-pipeline.mjs AIzaSy... "C:\Photos\DSC01873.ARW" gemini-flash-latest
 * =========================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const apiKey = process.argv[2] || process.env.GEMINI_API_KEY;
const rawPathInput = process.argv[3];
const modelName = process.argv[4] || 'gemini-flash-latest';

// 啟用 SSL 憑證鏈寬容處理（避免開發者本機代理、防毒軟體 HTTPS 掃描或公司內部憑證鏈中斷 fetch）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║  🔬 [SLIPKNOT BENCHMARK] 真實相機 RAW 影像推論管線端對端精準測速工具   ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

if (!apiKey) {
  console.error('❌ 未提供 Gemini API 金鑰！');
  console.log('\n📖 使用方式：');
  console.log('  node ./tests/benchmark-raw-pipeline.mjs <API_KEY> [PHOTO_OR_RAW_PATH] [MODEL_NAME]');
  console.log('\n範例：');
  console.log('  node ./tests/benchmark-raw-pipeline.mjs AIzaSy... "D:\\DCIM\\DSC01874.ARW" gemini-flash-latest');
  console.log('  node ./tests/benchmark-raw-pipeline.mjs AIzaSy... "test.jpg"\n');
  process.exit(1);
}

/**
 * 智慧相片路徑校正（例如使用者輸入 DSC1874.ARW 時，自動匹配目錄下真實存在的 DSC01874.ARW）
 * @param {string | undefined} inputPath
 * @returns {string | null}
 */
function resolveSmartPhotoPath(inputPath) {
  if (!inputPath) return null;
  if (fs.existsSync(inputPath)) return path.resolve(inputPath);

  const parsed = path.parse(path.resolve(inputPath));
  const dir = parsed.dir;
  if (fs.existsSync(dir)) {
    try {
      const files = fs.readdirSync(dir);
      const targetBase = parsed.name.toLowerCase();
      // 擷取輸入檔名中的數字序號 (例如 DSC1874 -> 1874)
      const digitsMatch = targetBase.match(/\d+/);
      const targetDigits = digitsMatch ? digitsMatch[0] : '';

      // 1. 先找包含相同數字序號且副檔名相同的檔案
      const matched = files.find(f => {
        const fLower = f.toLowerCase();
        const hasExt = fLower.endsWith(parsed.ext.toLowerCase()) || fLower.endsWith('.arw') || fLower.endsWith('.raw');
        return hasExt && targetDigits && fLower.includes(targetDigits);
      });

      if (matched) {
        const resolvedPath = path.join(dir, matched);
        console.log(`✨ [智慧校正] 原輸入路徑不存在，已在目錄中自動匹配真實相機檔案：${matched}`);
        return resolvedPath;
      }

      // 2. 若依然未找到，列出目錄中前 3 張 RAW/相片檔供使用者參考
      const rawCandidates = files.filter(f => /\.(arw|cr2|nef|dng|raw|jpg|jpeg|png)$/i.test(f)).slice(0, 3);
      if (rawCandidates.length > 0) {
        console.warn(`⚠️ 該目錄下現有相片範例：${rawCandidates.join(', ')}`);
      }
    } catch {
      // 略過目錄讀取異常
    }
  }
  return null;
}

/**
 * 將 JPEG 緩衝區等比例縮放壓縮至最長邊 maxDim (預設 512px)
 * 模擬前端 HTML5 Canvas 之縮圖壓縮管線
 * @param {Buffer} jpegBuf
 * @param {number} maxDim
 * @returns {Buffer | null}
 */
function scaleJpegBuffer(jpegBuf, maxDim = 512) {
  if (!jpegBuf || jpegBuf.length === 0) return null;
  const tempDir = os.tmpdir();
  const tmpIn = path.join(tempDir, `slipknot_raw_${Date.now()}_in.jpg`);
  const tmpOut = path.join(tempDir, `slipknot_raw_${Date.now()}_out.jpg`);

  try {
    fs.writeFileSync(tmpIn, jpegBuf);
    const psScript = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${tmpIn.replace(/\\/g, '\\\\')}')
$maxD = ${maxDim}.0
$scale = [Math]::Min($maxD / $img.Width, $maxD / $img.Height)
if ($scale -ge 1.0) {
  $img.Dispose()
  exit 0
}
$w = [int]($img.Width * $scale)
$h = [int]($img.Height * $scale)
$bmp = [System.Drawing.Bitmap]::new($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, $w, $h)
$bmp.Save('${tmpOut.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Jpeg)
$img.Dispose()
$bmp.Dispose()
$g.Dispose()
`;
    execFileSync('powershell', ['-NoProfile', '-Command', psScript], { stdio: 'pipe' });
    if (fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 0) {
      return fs.readFileSync(tmpOut);
    }
    return jpegBuf;
  } catch (err) {
    console.warn(`  ⚠️ 縮圖壓縮呼叫異常，採用原始預覽圖：${err?.message || err}`);
    return jpegBuf;
  } finally {
    try {
      if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    } catch {
      // 略過刪除暫存例外
    }
  }
}

/**
 * 從 Sony ARW 或一般 RAW 檔案二進位中搜尋並萃取內嵌 JPEG 縮圖
 * @param {Buffer} buffer 
 * @returns {Buffer | null}
 */
function extractEmbeddedJpegFromRaw(buffer) {
  let largestJpeg = null;
  let maxLen = 0;

  // 尋找 JPEG SOI 標頭 (0xFF 0xD8 0xFF)
  for (let i = 0; i < buffer.length - 4; i++) {
    if (buffer[i] === 0xFF && buffer[i + 1] === 0xD8 && buffer[i + 2] === 0xFF) {
      // 搜尋對應的 EOI (0xFF 0xD9)
      for (let j = i + 1024; j < buffer.length - 1; j++) {
        if (buffer[j] === 0xFF && buffer[j + 1] === 0xD9) {
          const len = j - i + 2;
          // 若大於 10KB 且大於目前找到的最大預覽
          if (len > 10240 && len > maxLen) {
            maxLen = len;
            largestJpeg = buffer.subarray(i, j + 2);
          }
          i = j + 2; // 跳過已搜尋段落
          break;
        }
      }
    }
  }
  return largestJpeg;
}

// 產生一張標準 512px 測試影像 Base64（當未指定本機檔案時之基準）
const DUMMY_BASE64_JPEG =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function runBenchmark() {
  const perfReport = {
    ioMs: 0,
    extractMs: 0,
    rawFileSizeMb: 0,
    extractedJpegKb: 0,
    payloadKb: 0,
    apiPingMs: 0,
    inferenceMs: 0,
    totalElapsedMs: 0,
    success: false,
    modelUsed: modelName
  };

  const globalStart = Date.now();

  console.log(`🔑 金鑰遮罩：${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`);
  console.log(`🤖 目標多模態模型：${modelName}`);

  let jpegBase64 = DUMMY_BASE64_JPEG;
  let rawSourceDesc = '內建 1x1 基準 JPEG 影像 (無本機檔案模式)';

  // ─────────────────────────────────────────────────────────────
  // 階段 1：本機 RAW 檔案讀取與內嵌縮圖萃取
  // ─────────────────────────────────────────────────────────────
  const resolvedRawPath = resolveSmartPhotoPath(rawPathInput);
  if (resolvedRawPath && fs.existsSync(resolvedRawPath)) {
    const rawFileAbs = resolvedRawPath;
    rawSourceDesc = `${path.basename(rawFileAbs)} (${(fs.statSync(rawFileAbs).size / 1024 / 1024).toFixed(2)} MB)`;
    console.log(`\n▶ [階段 1/4] 讀取本機 RAW / 相片檔案：${rawFileAbs}`);

    const t0 = Date.now();
    const fileBuf = fs.readFileSync(rawFileAbs);
    perfReport.ioMs = Date.now() - t0;
    perfReport.rawFileSizeMb = parseFloat((fileBuf.length / 1024 / 1024).toFixed(2));
    console.log(`  ✓ 磁碟 I/O 讀取完成 (耗時: ${perfReport.ioMs}ms · 檔案大小: ${perfReport.rawFileSizeMb} MB)`);

    const ext = path.extname(rawFileAbs).toLowerCase();
    if (ext === '.arw' || ext === '.cr2' || ext === '.nef' || ext === '.dng' || ext === '.raw') {
      console.log(`  🔍 正在從 ${ext.toUpperCase()} 相機 RAW 結構中搜尋內嵌 JPEG 預覽圖...`);
      const tExtract = Date.now();
      const extracted = extractEmbeddedJpegFromRaw(fileBuf);
      perfReport.extractMs = Date.now() - tExtract;

      if (extracted) {
        perfReport.extractedJpegKb = parseFloat((extracted.length / 1024).toFixed(1));
        console.log(`  ✓ 成功萃取出 RAW 內嵌預覽圖！(耗時: ${perfReport.extractMs}ms · 原始預覽圖: ${perfReport.extractedJpegKb} KB)`);

        // 模擬前端 HTML5 Canvas 之 512px 等比例高品質壓縮
        console.log(`  ⚡ 正在執行 512px 多模態視覺縮圖壓縮 (比照暗房前端 Canvas 管線)...`);
        const tScale = Date.now();
        const scaled = scaleJpegBuffer(extracted, 512);
        const scaleMs = Date.now() - tScale;

        if (scaled) {
          const scaledKb = parseFloat((scaled.length / 1024).toFixed(1));
          jpegBase64 = scaled.toString('base64');
          console.log(`  ✓ 512px 壓縮完成 (耗時: ${scaleMs}ms · 體積: ${perfReport.extractedJpegKb} KB ➔ ${scaledKb} KB，壓縮率: ${((1 - scaledKb / perfReport.extractedJpegKb) * 100).toFixed(1)}%)`);
        } else {
          jpegBase64 = extracted.toString('base64');
        }
      } else {
        console.warn(`  ⚠️ 未於 RAW 結構中搜尋到高解析 JPEG 預覽圖，改採用檔案開頭緩衝區。`);
        jpegBase64 = fileBuf.subarray(0, 1024 * 512).toString('base64');
      }
    } else {
      // 一般 JPEG / PNG
      perfReport.extractedJpegKb = parseFloat((fileBuf.length / 1024).toFixed(1));
      const scaled = scaleJpegBuffer(fileBuf, 512);
      if (scaled) {
        jpegBase64 = scaled.toString('base64');
        console.log(`  ✓ 載入並壓縮一般相片影像 (512px 體積: ${(scaled.length / 1024).toFixed(1)} KB)`);
      } else {
        jpegBase64 = fileBuf.toString('base64');
        console.log(`  ✓ 載入一般相片影像 (體積: ${perfReport.extractedJpegKb} KB)`);
      }
    }
  } else {
    if (rawPathInput) {
      console.warn(`\n⚠️ 指定的檔案不存在：${rawPathInput}，切換為基準測試影像。`);
    } else {
      console.log(`\n💡 提示：未傳入相片路徑，本次採用標準基準影像測量端點雲端純推論耗時。`);
      console.log(`   若要測量真實 Sony RAW，可加上路徑參數：node ./tests/benchmark-raw-pipeline.mjs <KEY> "DSC01874.ARW"`);
    }
  }

  perfReport.payloadKb = parseFloat((Buffer.byteLength(jpegBase64, 'base64') / 1024).toFixed(1));
  console.log(`  📦 預備傳輸之影像 Payload 體積: ${perfReport.payloadKb} KB (Base64 字串長度: ${jpegBase64.length} 字元)`);

  // ─────────────────────────────────────────────────────────────
  // 階段 2：端點網路延遲 (RTT Ping) 檢測
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [階段 2/4] 測量 Google Gemini API 端點連通性與 RTT 網路延遲...');
  const tPing = Date.now();
  try {
    const pingRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    perfReport.apiPingMs = Date.now() - tPing;
    if (!pingRes.ok) {
      const errTxt = await pingRes.text();
      console.error(`  ❌ Google 端點連線失敗 (HTTP ${pingRes.status}): ${errTxt}`);
      return;
    }
    const pingData = await pingRes.json();
    const count = (pingData.models || []).length;
    console.log(`  ✓ 端點連線正常 (網路 RTT: ${perfReport.apiPingMs}ms · 端點回傳 ${count} 個可用模型)`);
  } catch (err) {
    perfReport.apiPingMs = Date.now() - tPing;
    console.error(`  ❌ 無法連線至 Google 端點 (耗時 ${perfReport.apiPingMs}ms)：${err?.message || err}`);
    return;
  }

  // ─────────────────────────────────────────────────────────────
  // 階段 3：真實多模態神經推論（暗房調色與光學幾何決策）
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [階段 3/4] 發送多模態照片與 EXIF 數據至雲端神經網路...');
  console.log(`  📡 呼叫端點：models/${modelName}:generateContent`);

  const promptText = `You are a master analog darkroom colorist and curatorial director.
Analyze this photographic image and optical EXIF (ISO: 100, Shutter: 1/250s, Aperture: f/2.8, Lens/Focal: 50mm).
Provide artistic color grading decisions, lighting dynamics, and composition crop recommendations (Rule of Thirds, horizon leveling, perspective correction).
Respond ONLY with raw JSON matching this schema:
{
  "scene_title": "午後斜陽微光街角 (Poetic scene title in Traditional Chinese, 4-8 chars)",
  "scene_type": "outdoor_street",
  "style_insight": "主體處於側逆光環境，建議壓制高光並微提暗部細節。(1-2 sentences professional insight in Traditional Chinese)",
  "recommended_mood": "經典暖調底片 (Mood / style label in Traditional Chinese)",
  "recommended_profile": "Profile_05_DocumentaryChrome",
  "confidence": 0.94,
  "exposure_compensation": 0.15,
  "contrast": 0.05,
  "color_temp": 5600,
  "tint": 2.0,
  "lift_shadows": 0.1,
  "lut_intensity": 0.85,
  "tags": ["側逆光", "斜陽街角", "暖調底片", "微光散景"],
  "crop_box": [0.04, 0.06, 0.96, 0.94],
  "rotation_deg": -0.8,
  "keystone_v": 0.0,
  "aspect_ratio": "original",
  "crop_rationale": "微幅旋轉校正地平線傾斜，適度收緊邊界以強化畫面視覺重心。(Traditional Chinese)"
}`;

  const cleanBase64 = jpegBase64.includes(',') ? jpegBase64.slice(jpegBase64.indexOf(',') + 1) : jpegBase64;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  });

  const tInf = Date.now();
  let timer = setInterval(() => {
    const elapsed = ((Date.now() - tInf) / 1000).toFixed(1);
    process.stdout.write(`\r  ⏳ 正在等待雲端多模態推論... 已耗時: ${elapsed} 秒 (上限: 25.0s)`);
  }, 250);

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody
    });
  } catch (err) {
    clearInterval(timer);
    perfReport.inferenceMs = Date.now() - tInf;
    console.error(`\n\n❌ 請求發送失敗 (耗時 ${(perfReport.inferenceMs / 1000).toFixed(2)}s)：`, err?.message || err);
    return;
  }

  clearInterval(timer);
  perfReport.inferenceMs = Date.now() - tInf;
  console.log(`\n  ✓ 伺服器 HTTP 狀態碼：${response.status} (耗時: ${(perfReport.inferenceMs / 1000).toFixed(2)} 秒)`);

  if (!response.ok) {
    const errText = await response.text();
    console.error(`\n❌ 端點回傳錯誤：\n${errText}`);
    return;
  }

  // ─────────────────────────────────────────────────────────────
  // 階段 4：JSON 解析與風格決策產出
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [階段 4/4] 解析 AI 顯影色溫、風格檔與智慧構圖決策...');
  const jsonRes = await response.json();
  const rawText = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    console.error('❌ 模型回傳為空或格式異常：', JSON.stringify(jsonRes, null, 2));
    return;
  }

  let decision;
  try {
    decision = JSON.parse(rawText);
    perfReport.success = true;
    perfReport.totalElapsedMs = Date.now() - globalStart;
  } catch (err) {
    console.error('❌ JSON Schema 解析失敗：', rawText);
    return;
  }

  console.log('  ✓ AI 多模態風格決策成功產出！');
  console.log(`    · 場景主題：【${decision.scene_title}】`);
  console.log(`    · 建議風格：${decision.recommended_mood} (LUT: ${decision.recommended_profile})`);
  console.log(`    · 信心指數：${(decision.confidence * 100).toFixed(0)}%`);
  console.log(`    · 曝光補償：${decision.exposure_compensation > 0 ? '+' : ''}${decision.exposure_compensation} EV`);
  console.log(`    · 色溫校正：${decision.color_temp}K (Tint: ${decision.tint})`);
  console.log(`    · 智慧構圖：${decision.crop_rationale}`);

  // ─────────────────────────────────────────────────────────────
  // 效能總結評測報告
  // ─────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log('📊 【SLIPKNOT AI 顯影效能精密評測報告】');
  console.log('================================================================');
  console.log(`  測試來源相片：${rawSourceDesc}`);
  console.log(`  調用模型名稱：${perfReport.modelUsed}`);
  console.log('----------------------------------------------------------------');
  console.log(`  1. 磁碟 I/O 讀取耗時        : ${perfReport.ioMs} ms`);
  console.log(`  2. RAW 內嵌預覽圖萃取耗時  : ${perfReport.extractMs} ms`);
  console.log(`  3. 傳輸 Payload 體積大小   : ${perfReport.payloadKb} KB`);
  console.log(`  4. 伺服器網路往返延遲 (RTT) : ${perfReport.apiPingMs} ms`);
  console.log(`  5. 雲端多模態神經推論耗時   : ${(perfReport.inferenceMs / 1000).toFixed(2)} 秒 (${perfReport.inferenceMs} ms)`);
  console.log('----------------------------------------------------------------');
  console.log(`  🏁 端對端總耗時             : ${(perfReport.totalElapsedMs / 1000).toFixed(2)} 秒`);
  console.log('================================================================');

  if (perfReport.inferenceMs > 20000) {
    console.warn('\n⚠️ 診斷警告：雲端多模態推論耗時接近或超過 20 秒！');
    console.warn('   原因分析：若 Payload 超過 1MB 或網路頻寬受限，極易觸發暗房的 25 秒超時降級保護。');
    console.warn('   解決對策：前端已實作 512px Canvas 壓縮（將 Payload 壓在 40KB 內），可大幅降低推論延遲。');
  } else {
    console.log(`\n🎉 效能評測極優！本次推論在 ${(perfReport.inferenceMs / 1000).toFixed(2)} 秒內順利完成，遠低於 25 秒保護上限。✓`);
  }
}

runBenchmark().catch((err) => {
  console.error('\n💥 測試過程發生未預期異常：', err);
  process.exit(1);
});
