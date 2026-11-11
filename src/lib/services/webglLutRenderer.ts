/**
 * WebGL 2.0 Pure 3D LUT Hardware Engine
 * Strictly De-identified, Zero Brand Trademarks.
 * Pure Volumetric 33x33x33 Trilinear Color Transform without artifact-inducing HSL stacking.
 */

import type { CustomLutRecord } from './customLutService';
import { HSL_BAND_KEYS, type HslAdjustments } from '../types/photo';

export interface TuningParameters {
  exposure: number;     // -2.0 ~ +2.0 EV
  highlights?: number;  // -1.0 ~ +1.0 Highlight recovery / boost
  contrast: number;     // -1.0 ~ +1.0
  blacks?: number;      // -0.5 ~ +0.5 Black point anchor / matte fade
  colorTemp: number;    // 2800 ~ 8500 Kelvin
  tint?: number;        // -100 ~ +100 Green <-> Magenta
  lutIntensity: number; // 0.0 ~ 1.0
  shadowLift?: number;  // -0.5 ~ +0.5 Non-linear shadow lift (Toe lift)
  vibrance?: number;    // -1.0 ~ +1.0 Skin-aware natural saturation
  bypassLut: boolean;   // true for pure natural straight-out-of-camera
  clarity?: number;     // -1.0 ~ +1.0, mid-tone local contrast (large radius)
  sharpness?: number;   // -1.0 ~ +1.0, fine detail unsharp mask (negative softens, positive sharpens)
  colorDensity?: number;        // -1.0 ~ +1.0, subtractive film dye density
  shadowHue?: number;           // 0 ~ 360 deg, split-tone shadow hue
  shadowTintAmount?: number;    // 0.0 ~ 1.0, split-tone shadow intensity
  highlightHue?: number;        // 0 ~ 360 deg, split-tone highlight hue
  highlightTintAmount?: number; // 0.0 ~ 1.0, split-tone highlight intensity
  halation?: number;            // 0.0 ~ 1.0, red-orange emulsion highlight scatter
  grainAmount?: number;         // 0.0 ~ 1.0, organic silver-halide grain (0.15 = 0.012 baseline)
  vignette?: number;            // -1.0 ~ +1.0, optical peripheral falloff
  hsl?: HslAdjustments;         // 6-band targeted hue/saturation/luminance mixer
}

const VS_SOURCE = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = (a_position + 1.0) * 0.5;
    v_uv.y = 1.0 - v_uv.y;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FS_SOURCE = `#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform sampler3D u_lut;

uniform float u_exposure;
uniform float u_highlights;
uniform float u_contrast;
uniform float u_blacks;
uniform float u_colorTemp;
uniform float u_tint;
uniform float u_intensity;
uniform float u_shadowLift;
uniform float u_vibrance;
uniform bool u_bypassLut;
uniform float u_lutSize;   // Per-LUT size so .cube files of 17/33/65 sample correctly
uniform float u_clarity;
uniform float u_sharpness;
uniform float u_colorDensity;
uniform float u_shadowHue;
uniform float u_shadowTintAmount;
uniform float u_highlightHue;
uniform float u_highlightTintAmount;
uniform float u_halation;
uniform float u_grainAmount;
uniform float u_vignette;
uniform vec3 u_hsl[6];
uniform int u_hasHsl;

// Non-linear shadow lift (Toe lift, predominantly affects lower 40% luminance)
vec3 applyShadowLift(vec3 color, float lift) {
    if (abs(lift) < 0.001) return color;
    vec3 liftAmount = (1.0 - color) * (1.0 - color) * (lift * 0.45);
    return clamp(color + liftAmount, 0.0, 1.0);
}

float lumaOf(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// 9-tap box-ish blur used as the low-pass for unsharp masking
vec3 blurAt(vec2 uv, vec2 texel, float radius) {
    vec2 o = texel * radius;
    vec3 sum = texture(u_image, uv).rgb * 4.0;
    sum += texture(u_image, uv + vec2( o.x, 0.0)).rgb * 2.0;
    sum += texture(u_image, uv + vec2(-o.x, 0.0)).rgb * 2.0;
    sum += texture(u_image, uv + vec2(0.0,  o.y)).rgb * 2.0;
    sum += texture(u_image, uv + vec2(0.0, -o.y)).rgb * 2.0;
    sum += texture(u_image, uv + vec2( o.x,  o.y)).rgb;
    sum += texture(u_image, uv + vec2(-o.x,  o.y)).rgb;
    sum += texture(u_image, uv + vec2( o.x, -o.y)).rgb;
    sum += texture(u_image, uv + vec2(-o.x, -o.y)).rgb;
    return sum / 16.0;
}

// White balance temperature shift (Baseline 5500K: >5500K warms +R/-B, <5500K cools -R/+B) + Green-Magenta Tint (-100 ~ +100)
vec3 applyWhiteBalance(vec3 c, float kelvin, float tintVal) {
    vec3 res = c;
    if (abs(kelvin - 5500.0) > 10.0) {
        float delta = (kelvin - 5500.0) / 3000.0;
        vec3 kFactor = delta < 0.0
            ? vec3(1.0 + delta * 0.10, 1.0 + delta * 0.02, 1.0 - delta * 0.12)
            : vec3(1.0 + delta * 0.10, 1.0 + delta * 0.01, 1.0 - delta * 0.14);
        res *= kFactor;
    }
    if (abs(tintVal) > 0.5) {
        float t = tintVal / 100.0;
        vec3 tFactor = vec3(1.0 + t * 0.08, 1.0 - t * 0.12, 1.0 + t * 0.08);
        res *= tFactor;
    }
    return clamp(res, 0.0, 1.0);
}

// Filmic Soft Highlight Shoulder Roll-off (高光漸進軟滾降，避免數位死白硬截斷)
vec3 applyFilmicRollOff(vec3 c) {
    vec3 linearPart = min(c, vec3(0.70));
    vec3 highPart = max(c - 0.70, vec3(0.0));
    vec3 compressed = linearPart + 0.30 * (highPart / (highPart + 0.30));
    return compressed;
}

// Subtractive Color Density (模擬底片減色染料吸光：高彩度區域飽和同時壓實明度，低數值呈柔淡粉彩)
vec3 applySubtractiveColorDensity(vec3 c, float density) {
    if (abs(density) < 0.001) return c;
    float l = lumaOf(c);
    float maxC = max(c.r, max(c.g, c.b));
    float minC = min(c.r, min(c.g, c.b));
    float chroma = maxC - minC;
    if (density >= 0.0) {
        vec3 enriched = clamp(mix(vec3(l), c, 1.0 + density * 0.48), 0.0, 1.0);
        float absorb = 1.0 - density * chroma * 0.34;
        return clamp(enriched * absorb, 0.0, 1.0);
    } else {
        float d = -density;
        vec3 faded = mix(c, vec3(l), d * 0.45);
        return clamp(faded + vec3(d * chroma * 0.08), 0.0, 1.0);
    }
}

vec3 hueToRgb(float hueDeg) {
    float h = mod(hueDeg, 360.0) / 60.0;
    float x = 1.0 - abs(mod(h, 2.0) - 1.0);
    if (h < 1.0) return vec3(1.0, x, 0.0);
    if (h < 2.0) return vec3(x, 1.0, 0.0);
    if (h < 3.0) return vec3(0.0, 1.0, x);
    if (h < 4.0) return vec3(0.0, x, 1.0);
    if (h < 5.0) return vec3(x, 0.0, 1.0);
    return vec3(1.0, 0.0, x);
}

// Split Toning (亮暗部分區色偏：以純黑與純白為錨點，維持中間階調過渡與亮度平衡)
vec3 applySplitToning(vec3 c, float shHue, float shAmt, float hiHue, float hiAmt) {
    if (shAmt <= 0.001 && hiAmt <= 0.001) return c;
    float l = lumaOf(c);
    vec3 res = c;

    if (shAmt > 0.001) {
        // 集中於中暗調，L < 0.06 漸弱以保護純黑不浮髒
        float wShadow = pow(1.0 - smoothstep(0.0, 0.62, l), 1.45) * smoothstep(0.0, 0.06, l);
        vec3 shRgb = hueToRgb(shHue);
        vec3 shBias = shRgb - vec3(lumaOf(shRgb));
        res = clamp(res + shBias * (shAmt * 0.36 * wShadow), 0.0, 1.0);
    }

    if (hiAmt > 0.001) {
        // 集中於中亮調，L > 0.92 漸弱以保護純白高光不偏色溢出
        float wHighlight = pow(smoothstep(0.35, 0.96, l), 1.45) * (1.0 - smoothstep(0.92, 1.0, l));
        vec3 hiRgb = hueToRgb(hiHue);
        vec3 hiBias = hiRgb - vec3(lumaOf(hiRgb));
        res = clamp(res + hiBias * (hiAmt * 0.32 * wHighlight), 0.0, 1.0);
    }

    return res;
}

// Film Halation (單通道 12-tap 同心雙環取樣：模擬強高光穿透乳劑自片基反射的暖紅橘暈染)
vec3 applyFilmHalation(vec3 c, vec2 uv, vec2 texSize, float strength) {
    if (strength <= 0.001) return c;
    vec2 texel = 1.0 / texSize;
    float resScale = max(1.0, max(texSize.x, texSize.y) / 1000.0);
    float rInner = 3.5 * resScale;
    float rOuter = 9.5 * resScale;

    float energySum = 0.0;
    float weightSum = 0.0;

    // 內環 4 點 (對角取樣)
    vec2 innerOffsets[4] = vec2[4](
        vec2( 0.7071,  0.7071),
        vec2(-0.7071,  0.7071),
        vec2(-0.7071, -0.7071),
        vec2( 0.7071, -0.7071)
    );
    for (int i = 0; i < 4; i++) {
        vec3 s = texture(u_image, uv + innerOffsets[i] * rInner * texel).rgb;
        float hl = smoothstep(0.72, 0.98, lumaOf(s));
        energySum += hl * 1.0;
        weightSum += 1.0;
    }

    // 外環 8 點 (旋轉 22.5° 錯開方向以消除同心環狀條紋)
    vec2 outerOffsets[8] = vec2[8](
        vec2( 0.9239,  0.3827),
        vec2( 0.3827,  0.9239),
        vec2(-0.3827,  0.9239),
        vec2(-0.9239,  0.3827),
        vec2(-0.9239, -0.3827),
        vec2(-0.3827, -0.9239),
        vec2( 0.3827, -0.9239),
        vec2( 0.9239, -0.3827)
    );
    for (int i = 0; i < 8; i++) {
        vec3 s = texture(u_image, uv + outerOffsets[i] * rOuter * texel).rgb;
        float hl = smoothstep(0.72, 0.98, lumaOf(s));
        energySum += hl * 0.65;
        weightSum += 0.65;
    }

    float haloEnergy = energySum / weightSum;
    vec3 scatter = vec3(1.0, 0.30, 0.06) * (haloEnergy * strength * 0.55);
    // Screen 軟疊加防止純白處過度溢位
    return clamp(c + scatter * (1.0 - c), 0.0, 1.0);
}

// Organic Film Grain (亮度加權雙尺度銀鹽微粒，在中間調與暗部自然浮現，高光純淨乾淨)
float hashGrain(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec3 applyOrganicFilmGrain(vec3 c, vec2 uv, vec2 texSize, float grainAmount) {
    if (grainAmount <= 0.001) return c;
    float l = lumaOf(c);
    float weight = clamp(4.0 * l * (1.0 - l), 0.0, 1.0);
    float fineNoise = (hashGrain(uv * texSize * 0.7) - 0.5) * 2.0;
    float coarseNoise = (hashGrain(floor(uv * texSize * 0.45)) - 0.5) * 2.0;
    float noise = mix(fineNoise, coarseNoise, 0.35);
    float amplitude = clamp(grainAmount, 0.0, 1.0) * 0.08; // 0.15 -> 0.012 基準
    return clamp(c + vec3(noise * amplitude * weight), 0.0, 1.0);
}

// Highlight recovery / boost (predominantly affects top luminance range)
vec3 applyHighlights(vec3 c, float hi) {
    if (abs(hi) < 0.001) return c;
    float l = lumaOf(c);
    float mask = smoothstep(0.42, 0.98, l);
    if (hi < 0.0) {
        return clamp(c * (1.0 + hi * 0.38 * mask), 0.0, 1.0);
    }
    return clamp(c + (1.0 - c) * (hi * 0.40 * mask), 0.0, 1.0);
}

// Black point anchor (negative crushes deep blacks, positive fades blacks)
vec3 applyBlacks(vec3 c, float blk) {
    if (abs(blk) < 0.001) return c;
    float l = lumaOf(c);
    float mask = pow(1.0 - smoothstep(0.0, 0.28, l), 1.5);
    if (blk < 0.0) {
        return clamp(c * (1.0 + blk * 0.65 * mask), 0.0, 1.0);
    }
    return clamp(c + (1.0 - c) * (blk * 0.18 * mask), 0.0, 1.0);
}

// Skin-aware natural vibrance (protects warm skin tones & already saturated colors)
vec3 applyVibrance(vec3 c, float vib) {
    if (abs(vib) < 0.001) return c;
    float l = lumaOf(c);
    float maxC = max(c.r, max(c.g, c.b));
    float minC = min(c.r, min(c.g, c.b));
    float sat = maxC - minC;
    float skinMask = smoothstep(0.0, 0.5, max(0.0, c.r - c.g))
                   * smoothstep(0.0, 0.5, max(0.0, c.g - c.b));
    float skinProtect = 1.0 - 0.45 * skinMask;
    if (vib >= 0.0) {
        return clamp(mix(vec3(l), c, 1.0 + vib * (1.0 - sat) * skinProtect * 0.85), 0.0, 1.0);
    }
    return clamp(mix(vec3(l), c, 1.0 + vib * 0.65), 0.0, 1.0);
}

vec3 rgbToHsl(vec3 c) {
    float maxC = max(c.r, max(c.g, c.b));
    float minC = min(c.r, min(c.g, c.b));
    float l = 0.5 * (maxC + minC);
    float d = maxC - minC;
    if (d < 0.0001) {
        return vec3(0.0, 0.0, l);
    }
    float s = l > 0.5
        ? d / max(0.0001, 2.0 - maxC - minC)
        : d / max(0.0001, maxC + minC);
    float h = 0.0;
    if (maxC == c.r) {
        h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    } else if (maxC == c.g) {
        h = (c.b - c.r) / d + 2.0;
    } else {
        h = (c.r - c.g) / d + 4.0;
    }
    return vec3(h / 6.0, clamp(s, 0.0, 1.0), clamp(l, 0.0, 1.0));
}

float hueToRgb(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
    if (t < 0.5) return q;
    if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    return p;
}

vec3 hslToRgb(vec3 hsl) {
    if (hsl.y < 0.0001) return vec3(hsl.z);
    float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
    float p = 2.0 * hsl.z - q;
    return vec3(
        hueToRgb(p, q, hsl.x + 1.0 / 3.0),
        hueToRgb(p, q, hsl.x),
        hueToRgb(p, q, hsl.x - 1.0 / 3.0)
    );
}

// 6-Band targeted HSL Mixer: red(0), orange(30), yellow(60), green(120), cyan(185), blue(240)
vec3 applyHslMixer(vec3 c) {
    if (u_hasHsl == 0) return c;
    vec3 hsl = rgbToHsl(clamp(c, 0.0, 1.0));
    float chromaGate = smoothstep(0.01, 0.12, hsl.y);
    if (chromaGate < 0.0001) return c;

    float deg = hsl.x * 360.0;
    vec3 adj;
    if (deg < 30.0) {
        adj = mix(u_hsl[0], u_hsl[1], smoothstep(0.0, 30.0, deg));
    } else if (deg < 60.0) {
        adj = mix(u_hsl[1], u_hsl[2], smoothstep(30.0, 60.0, deg));
    } else if (deg < 120.0) {
        adj = mix(u_hsl[2], u_hsl[3], smoothstep(60.0, 120.0, deg));
    } else if (deg < 185.0) {
        adj = mix(u_hsl[3], u_hsl[4], smoothstep(120.0, 185.0, deg));
    } else if (deg < 240.0) {
        adj = mix(u_hsl[4], u_hsl[5], smoothstep(185.0, 240.0, deg));
    } else {
        adj = mix(u_hsl[5], u_hsl[0], smoothstep(240.0, 360.0, deg));
    }

    if (abs(adj.x) < 0.0005 && abs(adj.y) < 0.0005 && abs(adj.z) < 0.0005) {
        return c;
    }

    float h = fract(hsl.x + (adj.x * 30.0 / 360.0) * chromaGate);
    float s = clamp(hsl.y * (1.0 + adj.y * chromaGate), 0.0, 1.0);
    float lWeight = clamp(min(hsl.z, 1.0 - hsl.z) * 2.5, 0.0, 1.0);
    float l = clamp(hsl.z + adj.z * 0.25 * chromaGate * lWeight, 0.0, 1.0);
    return clamp(hslToRgb(vec3(h, s, l)), 0.0, 1.0);
}

// Optical radial vignette with aspect-ratio correction
vec3 applyOpticalVignette(vec3 c, vec2 uv, vec2 texSize, float vig) {
    if (abs(vig) < 0.001) return c;
    float aspect = texSize.x / max(1.0, texSize.y);
    vec2 centered = uv - vec2(0.5);
    centered.x *= aspect;
    float normScale = max(1.0, aspect);
    float dist = length(centered) * 2.0 / normScale;
    float falloff = smoothstep(0.38, 1.15, dist);
    if (vig < 0.0) {
        return clamp(c * (1.0 + vig * 0.65 * falloff), 0.0, 1.0);
    }
    return clamp(mix(c, vec3(1.0), vig * 0.35 * falloff), 0.0, 1.0);
}

void main() {
    vec4 src = texture(u_image, v_uv);
    if (src.a < 0.001) {
        fragColor = vec4(0.0);
        return;
    }

    vec3 color = src.rgb;

    // 1. Exposure Compensation (EV)
    if (abs(u_exposure) > 0.001) {
        color *= pow(2.0, u_exposure);
    }
    color = clamp(color, 0.0, 1.0);

    // 1.5 Non-linear Shadow Lift (暗部黑階抬升，Sony FL 啞光膠卷之魂)
    if (abs(u_shadowLift) > 0.001) {
        color = applyShadowLift(color, u_shadowLift);
    }

    // 2. White Balance BEFORE the LUT (camera order: WB -> Creative Look),
    //    so changing color temperature and tint does not shift the LUT's look.
    if (abs(u_colorTemp - 5500.0) > 10.0 || abs(u_tint) > 0.5) {
        color = applyWhiteBalance(color, u_colorTemp, u_tint);
    }

    // 3. Pure 3D LUT Volumetric Transformation (Unified Color Science)
    if (!u_bypassLut && u_intensity > 0.001) {
        vec3 lutCoord = color * ((u_lutSize - 1.0) / u_lutSize) + (0.5 / u_lutSize);
        vec3 graded = texture(u_lut, lutCoord).rgb;
        // Linear Interpolation between native and graded look
        color = mix(color, graded, u_intensity);
    }

    // 3.5 Subtractive Color Density (高彩度區域同步加深吸光密度)
    color = applySubtractiveColorDensity(color, u_colorDensity);

    // 4. User Optional Contrast, Highlights, Blacks, Vibrance & 6-Band HSL
    if (abs(u_contrast) > 0.001) {
        float factor = 1.0 + u_contrast * 0.5;
        color = clamp((color - 0.4) * factor + 0.4, 0.0, 1.0);
    }
    color = applyHighlights(color, u_highlights);
    color = applyBlacks(color, u_blacks);
    color = applyVibrance(color, u_vibrance);
    color = applyHslMixer(color);

    // 4.5 Split Toning (分區色調分離：不干擾 Pre-LUT 白平衡與 3D LUT 灰軸校準)
    color = applySplitToning(
        color,
        u_shadowHue,
        u_shadowTintAmount,
        u_highlightHue,
        u_highlightTintAmount
    );

    // 5. Clarity (large radius, mid-tone weighted) + Sharpness (small radius)
    //    Neighborhood based, so it cannot live inside a 3D LUT.
    if (abs(u_clarity) > 0.001 || abs(u_sharpness) > 0.001) {
        vec2 texSize = vec2(textureSize(u_image, 0));
        vec2 texel = 1.0 / texSize;
        float resScale = max(1.0, max(texSize.x, texSize.y) / 1000.0);
        vec3 blurredFine = blurAt(v_uv, texel, 1.5 * resScale);
        float l = lumaOf(src.rgb);
        float detailFine = l - lumaOf(blurredFine);
        float detailCoarse = l - lumaOf(blurAt(v_uv, texel, 8.0 * resScale));
        float x = lumaOf(color) * 2.0 - 1.0;
        float midMask = 1.0 - x * x; // protect deep shadows / highlights
        if (u_sharpness >= 0.0) {
            color += vec3(detailFine * u_sharpness * 2.4);
        } else {
            vec3 softColor = color + (blurredFine - src.rgb);
            color = mix(color, softColor, clamp(-u_sharpness, 0.0, 1.0));
        }
        color += vec3(detailCoarse * u_clarity * 1.25 * midMask);
    }

    // 5.5 Film Halation (高光紅橘漫射，置於 Filmic Roll-off 前讓光暈自然融進高光肩部)
    vec2 renderTexSize = vec2(textureSize(u_image, 0));
    color = applyFilmHalation(color, v_uv, renderTexSize, u_halation);

    // 6. Filmic Soft Highlight Shoulder Roll-off, Optical Vignette & Organic Grain
    color = applyFilmicRollOff(color);
    color = applyOpticalVignette(color, v_uv, renderTexSize, u_vignette);
    color = applyOrganicFilmGrain(color, v_uv, renderTexSize, u_grainAmount);

    fragColor = vec4(clamp(color, 0.0, 1.0), src.a);
}
`;

export class WebglLutRenderer {
  // 全域靜態 3D LUT 解析快取與單一 Flight 請求映射，避免多個 Renderer 實例重複下載與 CPU 解析
  private static parsedLutCache = new Map<string, { data: Float32Array; size: number }>();
  private static cubeFetchPromiseMap = new Map<string, Promise<{ data: Float32Array; size: number } | null>>();

  private static readonly BUILTIN_LUTS: { profileId: string; url: string }[] = [
    { profileId: 'Profile_01_Fieldnote', url: '/luts/Fieldnote.cube' },
    { profileId: 'Profile_02_Heartland', url: '/luts/Heartland.cube' },
    { profileId: 'Profile_03_Meridian', url: '/luts/Meridian.cube' },
    { profileId: 'Profile_04_Matinee', url: '/luts/Matinee.cube' },
    { profileId: 'Profile_05_Postcard', url: '/luts/Postcard.cube' },
    { profileId: 'Profile_06_Skylight', url: '/luts/Skylight.cube' },
    { profileId: 'Profile_07_NightMarket', url: '/luts/NightMarket.cube' },
    { profileId: 'Profile_08_DuskTide', url: '/luts/DuskTide.cube' },
    { profileId: 'Profile_09_Canopy', url: '/luts/Canopy.cube' },
    { profileId: 'Profile_10_Lowsun', url: '/luts/Lowsun.cube' },
  ];

  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private imageTexture: WebGLTexture | null = null;
  private lutTextures = new Map<string, WebGLTexture>();
  private lutSizes = new Map<string, number>();
  private activeLutId: string = '';

  // Uniform locations
  private uIntensityLoc: WebGLUniformLocation | null = null;
  private uExposureLoc: WebGLUniformLocation | null = null;
  private uContrastLoc: WebGLUniformLocation | null = null;
  private uColorTempLoc: WebGLUniformLocation | null = null;
  private uTintLoc: WebGLUniformLocation | null = null;
  private uBypassLutLoc: WebGLUniformLocation | null = null;
  private uImageLoc: WebGLUniformLocation | null = null;
  private uLutLoc: WebGLUniformLocation | null = null;
  private uLutSizeLoc: WebGLUniformLocation | null = null;
  private uClarityLoc: WebGLUniformLocation | null = null;
  private uSharpnessLoc: WebGLUniformLocation | null = null;
  private uShadowLiftLoc: WebGLUniformLocation | null = null;
  private uColorDensityLoc: WebGLUniformLocation | null = null;
  private uShadowHueLoc: WebGLUniformLocation | null = null;
  private uShadowTintAmountLoc: WebGLUniformLocation | null = null;
  private uHighlightHueLoc: WebGLUniformLocation | null = null;
  private uHighlightTintAmountLoc: WebGLUniformLocation | null = null;
  private uHalationLoc: WebGLUniformLocation | null = null;
  private uGrainAmountLoc: WebGLUniformLocation | null = null;
  private uHighlightsLoc: WebGLUniformLocation | null = null;
  private uBlacksLoc: WebGLUniformLocation | null = null;
  private uVibranceLoc: WebGLUniformLocation | null = null;
  private uVignetteLoc: WebGLUniformLocation | null = null;
  private uHslLoc: WebGLUniformLocation | null = null;
  private uHasHslLoc: WebGLUniformLocation | null = null;

  public initialize(canvas: HTMLCanvasElement): boolean {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true
    });

    if (!gl) {
      console.warn('WebGL 2.0 not supported in this environment');
      return false;
    }

    this.gl = gl;
    const program = this.createProgram(gl, VS_SOURCE, FS_SOURCE);
    if (!program) return false;
    this.program = program;

    // Cache Uniform Locations
    this.uIntensityLoc = gl.getUniformLocation(program, 'u_intensity');
    this.uExposureLoc = gl.getUniformLocation(program, 'u_exposure');
    this.uContrastLoc = gl.getUniformLocation(program, 'u_contrast');
    this.uColorTempLoc = gl.getUniformLocation(program, 'u_colorTemp');
    this.uTintLoc = gl.getUniformLocation(program, 'u_tint');
    this.uShadowLiftLoc = gl.getUniformLocation(program, 'u_shadowLift');
    this.uBypassLutLoc = gl.getUniformLocation(program, 'u_bypassLut');
    this.uImageLoc = gl.getUniformLocation(program, 'u_image');
    this.uLutLoc = gl.getUniformLocation(program, 'u_lut');
    this.uLutSizeLoc = gl.getUniformLocation(program, 'u_lutSize');
    this.uClarityLoc = gl.getUniformLocation(program, 'u_clarity');
    this.uSharpnessLoc = gl.getUniformLocation(program, 'u_sharpness');
    this.uColorDensityLoc = gl.getUniformLocation(program, 'u_colorDensity');
    this.uShadowHueLoc = gl.getUniformLocation(program, 'u_shadowHue');
    this.uShadowTintAmountLoc = gl.getUniformLocation(program, 'u_shadowTintAmount');
    this.uHighlightHueLoc = gl.getUniformLocation(program, 'u_highlightHue');
    this.uHighlightTintAmountLoc = gl.getUniformLocation(program, 'u_highlightTintAmount');
    this.uHalationLoc = gl.getUniformLocation(program, 'u_halation');
    this.uGrainAmountLoc = gl.getUniformLocation(program, 'u_grainAmount');
    this.uHighlightsLoc = gl.getUniformLocation(program, 'u_highlights');
    this.uBlacksLoc = gl.getUniformLocation(program, 'u_blacks');
    this.uVibranceLoc = gl.getUniformLocation(program, 'u_vibrance');
    this.uVignetteLoc = gl.getUniformLocation(program, 'u_vignette');
    this.uHslLoc = gl.getUniformLocation(program, 'u_hsl');
    this.uHasHslLoc = gl.getUniformLocation(program, 'u_hasHsl');

    gl.useProgram(program);
    gl.uniform1i(this.uImageLoc, 0); // Texture unit 0
    gl.uniform1i(this.uLutLoc, 1);   // Texture unit 1

    // Setup Quad Geometry
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]);

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const aPosLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.vao = vao;
    this.preloadBuiltinLuts();
    return true;
  }

  public setImageSource(image: HTMLImageElement | HTMLCanvasElement | ImageBitmap) {
    if (!this.gl) return;
    const gl = this.gl;

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    if (!this.imageTexture) {
      this.imageTexture = gl.createTexture();
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      image
    );
  }

  public render(params: TuningParameters, width: number, height: number) {
    if (!this.gl || !this.program || !this.vao) return;
    const gl = this.gl;

    if (gl.canvas.width !== width || gl.canvas.height !== height) {
      gl.canvas.width = width;
      gl.canvas.height = height;
    }

    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.uniform1i(this.uImageLoc, 0);

    const targetLutTex = (!params.bypassLut && this.activeLutId)
      ? this.lutTextures.get(this.activeLutId)
      : null;

    if (targetLutTex) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, targetLutTex);
      gl.uniform1i(this.uLutLoc, 1);
    }

    gl.uniform1f(this.uLutSizeLoc, this.lutSizes.get(this.activeLutId) ?? 33);
    gl.uniform1f(this.uClarityLoc, params.clarity ?? 0);
    gl.uniform1f(this.uSharpnessLoc, params.sharpness ?? 0);
    gl.uniform1f(this.uColorDensityLoc, params.colorDensity ?? 0);
    gl.uniform1f(this.uShadowHueLoc, params.shadowHue ?? 200);
    gl.uniform1f(this.uShadowTintAmountLoc, params.shadowTintAmount ?? 0);
    gl.uniform1f(this.uHighlightHueLoc, params.highlightHue ?? 40);
    gl.uniform1f(this.uHighlightTintAmountLoc, params.highlightTintAmount ?? 0);
    gl.uniform1f(this.uHalationLoc, params.halation ?? 0);
    gl.uniform1f(this.uGrainAmountLoc, params.grainAmount ?? 0.15);
    gl.uniform1f(this.uHighlightsLoc, params.highlights ?? 0);
    gl.uniform1f(this.uBlacksLoc, params.blacks ?? 0);
    gl.uniform1f(this.uVibranceLoc, params.vibrance ?? 0);
    gl.uniform1f(this.uVignetteLoc, params.vignette ?? 0);

    const hslData = new Float32Array(HSL_BAND_KEYS.length * 3);
    let hasHsl = false;
    if (params.hsl) {
      for (let i = 0; i < HSL_BAND_KEYS.length; i++) {
        const band = params.hsl[HSL_BAND_KEYS[i]];
        if (band) {
          hslData[i * 3] = band.hue ?? 0;
          hslData[i * 3 + 1] = band.sat ?? 0;
          hslData[i * 3 + 2] = band.lum ?? 0;
          if (
            Math.abs(hslData[i * 3]) > 0.0005
            || Math.abs(hslData[i * 3 + 1]) > 0.0005
            || Math.abs(hslData[i * 3 + 2]) > 0.0005
          ) {
            hasHsl = true;
          }
        }
      }
    }
    gl.uniform1i(this.uHasHslLoc, hasHsl ? 1 : 0);
    if (this.uHslLoc) {
      gl.uniform3fv(this.uHslLoc, hslData);
    }

    gl.uniform1f(this.uExposureLoc, params.exposure);
    gl.uniform1f(this.uContrastLoc, params.contrast);
    gl.uniform1f(this.uColorTempLoc, params.colorTemp);
    gl.uniform1f(this.uTintLoc, params.tint ?? 0);
    gl.uniform1f(this.uShadowLiftLoc, params.shadowLift ?? 0);
    gl.uniform1f(this.uIntensityLoc, params.lutIntensity);
    gl.uniform1i(this.uBypassLutLoc, (params.bypassLut || !targetLutTex) ? 1 : 0);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  public exportBlob(type: string = 'image/jpeg', quality: number = 0.95): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.gl || !this.gl.canvas) {
        resolve(null);
        return;
      }
      (this.gl.canvas as HTMLCanvasElement).toBlob((blob) => {
        resolve(blob);
      }, type, quality);
    });
  }

  public exportDataUrl(type: string = 'image/jpeg', quality: number = 0.85): string | null {
    if (!this.gl || !this.gl.canvas) return null;
    try {
      return (this.gl.canvas as HTMLCanvasElement).toDataURL(type, quality);
    } catch {
      return null;
    }
  }

  public setProfile(profileId: string) {
    this.activeLutId = profileId;
  }
  /**
   * Parse standard .cube 3D LUT (Adobe / DaVinci Resolve) into Float32Array
   */
  public static parseCubeData(cubeContent: string): { data: Float32Array; size: number } | null {
    try {
      const lines = cubeContent.split(/\r?\n/);
      let size = 33;
      const rgbValues: number[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('TITLE')) continue;

        if (trimmed.startsWith('LUT_3D_SIZE')) {
          const parts = trimmed.split(/\s+/);
          size = parseInt(parts[1], 10) || 33;
          continue;
        }

        const nums = trimmed.split(/\s+/).map(Number);
        if (nums.length >= 3 && !isNaN(nums[0]) && !isNaN(nums[1]) && !isNaN(nums[2])) {
          rgbValues.push(nums[0], nums[1], nums[2]);
        }
      }

      if (rgbValues.length < size * size * size * 3) {
        console.warn('Incomplete .cube data');
        return null;
      }

      // Float data: no 8-bit quantization (uploaded as RGBA16F)
      const rgbaData = new Float32Array(size * size * size * 4);
      let srcIdx = 0;
      let dstIdx = 0;
      for (let i = 0; i < size * size * size; i++) {
        rgbaData[dstIdx++] = Math.min(1.0, Math.max(0.0, rgbValues[srcIdx++]));
        rgbaData[dstIdx++] = Math.min(1.0, Math.max(0.0, rgbValues[srcIdx++]));
        rgbaData[dstIdx++] = Math.min(1.0, Math.max(0.0, rgbValues[srcIdx++]));
        rgbaData[dstIdx++] = 1.0;
      }

      return { data: rgbaData, size };
    } catch (e) {
      console.error('Failed to parse .cube:', e);
      return null;
    }
  }

  /**
   * Parse standard .cube 3D LUT (Adobe / DaVinci Resolve) and register
   */
  public parseAndRegisterCube(profileId: string, cubeContent: string): boolean {
    if (!this.gl) return false;
    const parsed = WebglLutRenderer.parseCubeData(cubeContent);
    if (!parsed) return false;
    this.registerLut(profileId, parsed.data, parsed.size);
    return true;
  }

  /**
   * 批次載入並註冊使用者自訂 3D LUT (Custom Cube Profiles)
   */
  public registerCustomLuts(customLuts: CustomLutRecord[]) {
    if (!this.gl || !Array.isArray(customLuts)) return;
    for (const lut of customLuts) {
      if (lut.id && lut.cubeContent) {
        this.parseAndRegisterCube(lut.id, lut.cubeContent);
      }
    }
  }

  private preloadBuiltinLuts() {
    if (!this.gl) return;

    // 非同步載入真實 3D .cube 紋理 (全域靜態快取，同一 .cube 僅載入與解析一次)
    for (const item of WebglLutRenderer.BUILTIN_LUTS) {
      this.loadCubeFileWithCache(item.profileId, item.url);
    }
  }

  private async loadCubeFileWithCache(profileId: string, url: string) {
    // 優先命中全域記憶體快取 (0ms 瞬時載入)
    const cached = WebglLutRenderer.parsedLutCache.get(url);
    if (cached) {
      this.registerLut(profileId, cached.data, cached.size);
      return;
    }

    if (typeof fetch === 'undefined') return;

    // 確保同一 URL 同時間僅發起一次單一網路請求 (Single-flight Promise deduplication)
    let fetchPromise = WebglLutRenderer.cubeFetchPromiseMap.get(url);
    if (!fetchPromise) {
      fetchPromise = (async () => {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const text = await res.text();
            const parsed = WebglLutRenderer.parseCubeData(text);
            if (parsed) {
              WebglLutRenderer.parsedLutCache.set(url, parsed);
              return parsed;
            }
          }
        } catch {
          // 離線或檔案未找到時靜默略過
        }
        return null;
      })();
      WebglLutRenderer.cubeFetchPromiseMap.set(url, fetchPromise);
    }

    const parsed = await fetchPromise;
    if (parsed && this.gl) {
      this.registerLut(profileId, parsed.data, parsed.size);
    }
  }

  private registerLut(profileId: string, data: Float32Array, size: number = 33) {
    if (!this.gl) return;
    const gl = this.gl;

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, texture);

    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAX_LEVEL, 0);

    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGBA16F, // half-float LUT avoids banding in shadows / smooth gradients
      size,
      size,
      size,
      0,
      gl.RGBA,
      gl.FLOAT,
      data
    );

    this.lutTextures.set(profileId, texture!);
    this.lutSizes.set(profileId, size);
  }

  private createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
    const vShader = this.compileShader(gl, gl.VERTEX_SHADER, vs);
    const fShader = this.compileShader(gl, gl.FRAGMENT_SHADER, fs);
    if (!vShader || !fShader) return null;

    const prog = gl.createProgram();
    if (!prog) return null;

    gl.attachShader(prog, vShader);
    gl.attachShader(prog, fShader);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('WebGL Program link error:', gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('WebGL Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  public destroy() {
    if (!this.gl) return;
    this.lutTextures.forEach(tex => this.gl?.deleteTexture(tex));
    this.lutTextures.clear();
    if (this.imageTexture) this.gl.deleteTexture(this.imageTexture);
    if (this.program) this.gl.deleteProgram(this.program);
    this.gl = null;
  }
}
