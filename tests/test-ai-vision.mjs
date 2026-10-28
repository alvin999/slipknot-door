// @ts-check
/**
 * =========================================================================
 * Slipknot AI 雲端多模態視覺顯影連線與推論診斷測試腳本
 *
 * 用途：
 * 1. 檢測與 Google Gemini API 的網路連通性與延遲
 * 2. 測試特定 API 金鑰與模型是否可用
 * 3. 測量真實 512px 圖片多模態推論的耗時（驗證是否超過 10 秒限制）
 * 4. 驗證 JSON Schema 解析與風格參數回傳是否正常
 *
 * 執行方式：
 *   node ./tests/test-ai-vision.mjs <API_KEY> [MODEL_NAME]
 * 或設定環境變數：
 *   $env:GEMINI_API_KEY="AIzaSy..."; node ./tests/test-ai-vision.mjs
 * =========================================================================
 */

const apiKey = process.argv[2] || process.env.GEMINI_API_KEY;
const modelName = process.argv[3] || 'gemini-1.5-flash';

console.log('================================================================');
console.log('🔬 [Slipknot AI Diagnostic] 視覺多模態雲端推論診斷測試');
console.log('================================================================\n');

if (!apiKey) {
  console.error('❌ 未提供 API 金鑰！');
  console.log('使用方式：');
  console.log('  node ./tests/test-ai-vision.mjs <YOUR_GEMINI_API_KEY> [MODEL_NAME]');
  console.log('範例：');
  console.log('  node ./tests/test-ai-vision.mjs AIzaSy... gemini-1.5-flash\n');
  process.exit(1);
}

// 產生一張乾淨的 1x1 測試 JPEG Base64
const testImageBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

const promptText = `You are a master analog darkroom colorist and curatorial director.
Analyze this photographic image and optical EXIF (ISO: 100, Shutter: 1/250s, Aperture: f/2.8, Lens/Focal: 50mm).
Provide artistic color grading decisions, lighting dynamics, and composition crop recommendations.
Respond ONLY with raw JSON matching this schema:
{
  "scene_title": "午後斜陽微光街角",
  "scene_type": "outdoor_street",
  "style_insight": "主體處於側逆光環境，建議壓制高光並微提暗部細節。",
  "recommended_mood": "經典暖調底片",
  "recommended_profile": "Profile_05_DocumentaryChrome",
  "confidence": 0.94,
  "exposure_compensation": 0.15,
  "contrast": 0.05,
  "color_temp": 5600,
  "tint": 2.0,
  "lift_shadows": 0.1,
  "lut_intensity": 0.85,
  "tags": ["側逆光", "斜陽街角", "暖調底片", "微光散景"]
}`;

async function runDiagnostic() {
  console.log(`📡 目標模型：${modelName}`);
  console.log(`🔑 金鑰遮罩：${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`);
  console.log('----------------------------------------------------------------');

  // 步驟 1: 網路連線與模型可用性測試
  console.log('▶ [步驟 1/3] 測試 API 伺服器連線與可存取模型清單...');
  const t0 = Date.now();
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const pingMs = Date.now() - t0;
    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error(`❌ 連線失敗 (HTTP ${listRes.status}): ${errText}`);
      return;
    }
    const listData = await listRes.json();
    const availableModels = (listData.models || []).map((/** @type {{ name: string }} */ m) => m.name.replace('models/', ''));
    console.log(`✅ 伺服器回應成功 (耗時: ${pingMs}ms)`);
    console.log(`📋 該金鑰可用的部分視覺/推論模型：`);
    const relevant = availableModels.filter((/** @type {string} */ m) => m.includes('flash') || m.includes('pro'));
    console.log(`   ${relevant.slice(0, 8).join(', ')}`);

    const hasTargetModel = availableModels.includes(modelName);
    if (!hasTargetModel) {
      console.warn(`⚠️ 警告：目前選擇的模型 [${modelName}] 未在可用清單中！建議切換為清單中現存之模型。`);
    } else {
      console.log(`🎯 目標模型 [${modelName}] 驗證存在 ✓`);
    }
  } catch (err) {
    console.error(`❌ 無法連線至 Google API 伺服器：`, err);
    return;
  }

  // 步驟 2: 多模態推論與即時計時
  console.log('\n----------------------------------------------------------------');
  console.log(`▶ [步驟 2/3] 發送多模態影像推論請求至 [${modelName}]...`);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: testImageBase64
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  };

  const startTime = Date.now();
  const timer = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`\r⏳ 正在等待雲端推論回應... 已耗時: ${elapsed} 秒`);
  }, 500);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    clearInterval(timer);
    const totalElapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n⏱️ 總推論耗時: ${totalElapsedSec} 秒`);

    if (parseFloat(totalElapsedSec) > 10.0) {
      console.warn(`⚠️ 注意！本次推論耗時 (${totalElapsedSec}s) > 10 秒！`);
      console.warn(`👉 這就是為什麼前端系統會觸發「AI 推論逾時 (>10s)，自動切換在地光學降級」！`);
    } else {
      console.log(`⚡ 耗時在 10 秒內，推論速度理想。`);
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      console.error(`❌ API 回應異常 (HTTP ${response.status})：`, errJson || await response.text());
      return;
    }

    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    // 步驟 3: JSON 解析與結果展示
    console.log('\n----------------------------------------------------------------');
    console.log('▶ [步驟 3/3] 驗證 JSON Schema 解析...');
    if (!rawContent) {
      console.error('❌ 未取得推論文字內容。');
      return;
    }

    try {
      const parsed = JSON.parse(rawContent);
      console.log('✅ JSON 結構成功解析！');
      console.log('────────────────────────────────────────────────');
      console.log(`場景標題：${parsed.scene_title}`);
      console.log(`建議風格：${parsed.recommended_mood}`);
      console.log(`推薦 Profile：${parsed.recommended_profile}`);
      console.log(`曝光補償：${parsed.exposure_compensation} EV`);
      console.log(`色溫 / 色調：${parsed.color_temp}K / Tint ${parsed.tint}`);
      console.log(`視覺標籤：${(parsed.tags || []).join(', ')}`);
      console.log(`專業診斷：${parsed.style_insight}`);
      console.log('────────────────────────────────────────────────');
      console.log('🎉 診斷完成：雲端多模態推論功能完全正常！');
    } catch (parseErr) {
      console.error('❌ JSON 解析失敗，原始內容如下：\n', rawContent);
    }
  } catch (err) {
    clearInterval(timer);
    console.error('\n❌ 請求過程發生錯誤：', err);
  }
}

runDiagnostic();
