/**
 * ═════════════════════════════════════════════════════════════════════
 * 【AI Prompt 中性化評測迴圈 (Prompt Neutrality Evaluation Loop)】
 * 目的：自動評測純中性、零 e.g. 的 Clarity & Sharpness 提示詞候選，
 *       驗證其能否自發在 Film Like 降低、在粗粒子硬調增加。
 * 執行方式：
 *   node scripts/eval_prompt_loop.mjs <GEMINI_API_KEY> [MODEL_ID]
 * ═════════════════════════════════════════════════════════════════════
 */

const apiKey = process.argv[2] || process.env.GEMINI_API_KEY;
const modelId = process.argv[3] || 'gemini-2.5-flash';

if (!apiKey) {
  console.log(`
┌─────────────────────────────────────────────────────────────┐
│ 【使用說明】請提供 Gemini API Key 啟動自動評測迴圈          │
├─────────────────────────────────────────────────────────────┤
│ 指令範例：                                                  │
│   node scripts/eval_prompt_loop.mjs AIzaSy...               │
│                                                             │
│ 可選指定模型（預設為 gemini-2.5-flash）：                   │
│   node scripts/eval_prompt_loop.mjs AIzaSy... gemini-2.5-flash │
└─────────────────────────────────────────────────────────────┘
`);
  process.exit(1);
}

// 產生最小有效 512px 測試圖片 Base64 (純色帶光影梯度)
const SAMPLE_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

/**
 * 4 組純中性、零 e.g. 的候選 Prompt 描述
 */
const CANDIDATES = [
  {
    name: 'Candidate A: 空間頻率反銳化軸向 (Spatial Frequency Response)',
    promptBlock: `6. clarity & sharpness [-1.0 to 1.0, Baseline: 0.0]: Spatial frequency unsharp masking (high-frequency detail control).
   - Negative values (< 0.0) attenuate high-frequency contrast to produce optical halation, emulsion diffusion, and roll-off.
   - Positive values (> 0.0) amplify mid-tone micro-contrast and edge steepness to accentuate tactile relief, structural texture, and grit.
   - Modulate according to whether the target aesthetic prioritizes optical diffusion (negative) or tactile texture and grit (positive).`
  },
  {
    name: 'Candidate B: 光學擴散 vs 微紋理浮雕 (Diffusion vs Micro-Texture Relief)',
    promptBlock: `6. clarity & sharpness [-1.0 to 1.0, Baseline: 0.0]: Local micro-contrast (clarity) and edge acutance (sharpness).
   - Negative values roll off micro-contrast to simulate optical halation and emulsion diffusion.
   - Positive values elevate micro-contrast and edge acutance to articulate physical texture and granular bite.
   - Modulate symmetrically based on whether the intended aesthetic leans toward optical diffusion or tactile texture.`
  },
  {
    name: 'Candidate C: 高頻衰減 vs 放大 (High-Frequency Filtering)',
    promptBlock: `6. clarity & sharpness [-1.0 to 1.0, Baseline: 0.0]: High-frequency spatial filtering.
   - Negative values: Attenuate high-frequency micro-contrast to introduce optical halation, soft diffusion, and analog roll-off.
   - Positive values: Amplify high-frequency micro-contrast and edge acutance to enhance tactile grain structure, micro-texture, and bite.
   - Modulate symmetrically to fulfill target aesthetic priorities: negative for diffusion and glow; positive for texture and grain definition.`
  },
  {
    name: 'Candidate D: 極簡對稱頻率響應 (Minimal Symmetrical)',
    promptBlock: `6. clarity & sharpness [-1.0 to 1.0, Baseline: 0.0]: Spatial frequency response.
   - Negative: High-frequency attenuation producing optical halation, bloom, and soft roll-off.
   - Positive: High-frequency amplification producing micro-contrast, tactile relief, and edge acutance.
   - Evaluate whether target visual character demands optical diffusion (negative) or structural texture (positive).`
  }
];

/**
 * 測試案例清單（涵蓋預設關鍵字與自由文字自訂意境）
 */
const TEST_CASES = [
  {
    id: 'film_like',
    title: '預設: Film Like (底片感)',
    intent: 'Film Like (Analog Film Aesthetic / 底片感)',
    validate: (res) => res.clarity < 0 && res.sharpness <= 0.05,
    expectedDesc: 'clarity < 0 且 sharpness <= 0.05'
  },
  {
    id: 'gritty_mono',
    title: '預設: 粗粒子硬調',
    intent: 'Daido Moriyama Gritty Monochrome (森山大道 · 粗粒子硬調)',
    validate: (res) => res.clarity > 0 && res.sharpness > 0,
    expectedDesc: 'clarity > 0 且 sharpness > 0'
  },
  {
    id: 'custom_soft',
    title: '自訂輸入: 日系空氣感柔光',
    intent: '日系空氣感、清透溫潤柔焦光暈',
    validate: (res) => res.clarity <= 0 && res.sharpness <= 0.05,
    expectedDesc: 'clarity <= 0 且 sharpness <= 0.05'
  },
  {
    id: 'custom_hard',
    title: '自訂輸入: 黑白街拍強烈粗糙紋理',
    intent: '黑白街拍強烈反差、極致粗糙微紋理咬合',
    validate: (res) => res.clarity > 0 && res.sharpness > 0,
    expectedDesc: 'clarity > 0 且 sharpness > 0'
  },
  {
    id: 'cinematic',
    title: '預設: 電影感 (Cinematic)',
    intent: 'Cinematic Color Grade (電影感)',
    validate: (res) => res.clarity <= 0.05,
    expectedDesc: 'clarity <= 0.05'
  }
];

function parseAiJson(raw) {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  cleaned = cleaned.replace(/(:\s*|\[\s*|,\s*)\+(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, '$1$2');
  return JSON.parse(cleaned);
}

function buildPrompt(candidateBlock, intentText) {
  return `You are a master analog darkroom colorist and curatorial director.
Analyze this photographic image and optical EXIF (ISO: 400, Shutter: 1/250s, Aperture: f/2.8, Lens/Focal: 35mm).

Evaluate lighting dynamics, color harmony, optical texture, and visual composition.

Available 3D LUT Profiles:
- "Profile_00_StandardNatural": Optical Straight-Out-Of-Camera (Zero 3D LUT)
- "Profile_01_MatteShadow": Fujifilm Eterna (Cinema Negative)
- "Profile_04_DocumentaryChrome": Kodak Kodachrome 64 (Documentary Reversal Slide)
- "Profile_10_PlatinumAcros": Fujifilm Neopan Acros 100 (Ultra-Fine Silver B&W)

Target Aesthetic Intent: ${intentText}

WebGL 2.0 Hardware Pipeline Specification:
1. exposure_compensation: Global luminance scaling before LUT.
2. lift_shadows: Shadow toe adjustment affecting darkest 40% luminance. Negative deepens blacks; positive lifts blacks.
3. color_temp & tint: Pre-LUT white balance (5500K / 0.0 baseline).
4. recommended_profile & lut_intensity: 3D film LUT volumetric emulation.
5. contrast: Global linear tonal slope.
${candidateBlock}
7. FILMIC HIGHLIGHT PHILOSOPHY: Analog film prioritizes highlight roll-off over global brightness. Protect organic textures in bright skies, sunlit walls, and skin highlights; preserve highlight headroom rather than pushing exposure.

Respond ONLY with raw JSON matching this schema:
{
  "scene_title": "string (4-8 chars in Traditional Chinese)",
  "recommended_profile": "Profile_00_StandardNatural",
  "exposure_compensation": "number between -2.0 and 2.0",
  "contrast": "number between -0.5 and 0.5",
  "color_temp": "integer between 2500 and 10000",
  "lift_shadows": "number between -0.5 and 0.5",
  "clarity": "number between -1.0 and 1.0",
  "sharpness": "number between -1.0 and 1.0",
  "style_insight": "string (1 concise sentence explaining optical texture and color choices)"
}`;
}

async function evaluateSingle(prompt) {
  const cleanModel = modelId.replace(/^models\//, '');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: SAMPLE_BASE64 } }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3
    }
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    throw new Error(errJson?.error?.message || `HTTP ${res.status}`);
  }

  const json = await res.json();
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('API 未回傳文本');
  return parseAiJson(rawText);
}

async function runEvaluation() {
  console.log(`\n═════════════════════════════════════════════════════════════════`);
  console.log(`🚀 啟動 AI Prompt 中性化評測迴圈 (端點: ${modelId})`);
  console.log(`═════════════════════════════════════════════════════════════════\n`);

  const leaderboard = [];

  for (let i = 0; i < CANDIDATES.length; i++) {
    const cand = CANDIDATES[i];
    console.log(`\n─────────────────────────────────────────────────────────────`);
    console.log(`▶ 評測候選 [${i + 1}/${CANDIDATES.length}]: ${cand.name}`);
    console.log(`─────────────────────────────────────────────────────────────`);

    let passedCount = 0;

    for (const testCase of TEST_CASES) {
      process.stdout.write(`  • 測試 [${testCase.title}]... `);
      const prompt = buildPrompt(cand.promptBlock, testCase.intent);

      try {
        const result = await evaluateSingle(prompt);
        const clarity = typeof result.clarity === 'number' ? result.clarity : 0;
        const sharpness = typeof result.sharpness === 'number' ? result.sharpness : 0;
        const isPass = testCase.validate(result);

        const clrStr = (clarity >= 0 ? '+' : '') + clarity.toFixed(2);
        const shpStr = (sharpness >= 0 ? '+' : '') + sharpness.toFixed(2);
        const statusStr = isPass ? '✅ PASS' : '❌ FAIL';

        if (isPass) passedCount++;

        console.log(`${statusStr} (Clarity: ${clrStr}, Sharpness: ${shpStr})`);
        console.log(`    ↳ 理由: "${result.style_insight || '無'}"`);
        if (!isPass) {
          console.log(`    ↳ 預期: ${testCase.expectedDesc}`);
        }
      } catch (err) {
        console.log(`❌ ERROR: ${err.message}`);
      }
      // 避免高頻打爆 API Rate Limit，每次請求間隔 800ms
      await new Promise((r) => setTimeout(r, 800));
    }

    const passRate = (passedCount / TEST_CASES.length) * 100;
    console.log(`  📊 候選得分: ${passedCount}/${TEST_CASES.length} (${passRate.toFixed(0)}%)`);
    leaderboard.push({
      name: cand.name,
      promptBlock: cand.promptBlock,
      passedCount,
      total: TEST_CASES.length,
      passRate
    });
  }

  // 排序並產出最終排行榜
  leaderboard.sort((a, b) => b.passRate - a.passRate);

  console.log(`\n═════════════════════════════════════════════════════════════════`);
  console.log(`🏆 中性化提示詞評測天梯排行榜 (Leaderboard)`);
  console.log(`═════════════════════════════════════════════════════════════════`);
  leaderboard.forEach((item, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '  ';
    console.log(`${medal} 第 ${idx + 1} 名: ${item.name} -> 得分 ${item.passedCount}/${item.total} (${item.passRate.toFixed(0)}%)`);
  });

  const best = leaderboard[0];
  console.log(`\n🎯 【推薦最佳純中性提示詞 (零 eg)】:`);
  console.log(`-------------------------------------------------------------`);
  console.log(best.promptBlock);
  console.log(`-------------------------------------------------------------\n`);
}

runEvaluation().catch((err) => {
  console.error('\n❌ 評測迴圈執行失敗:', err);
  process.exit(1);
});

