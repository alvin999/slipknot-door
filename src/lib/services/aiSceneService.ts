/**
 * AI Scene Analysis & Heuristic Offline Fallback Service
 */

import type { ExifOpticalData } from '../types/photo';

export interface AiSceneDecision {
  scene_type: 'urban_geometry' | 'outdoor_street' | 'indoor_ambient' | 'portrait';
  recommended_profile: 'Profile_01_MatteShadow' | 'Profile_02_TealEmerald' | 'Profile_03_TungstenSoft' | 'Profile_04_HighContrastMono';
  confidence: number;
  exposure_compensation: number;
  lift_shadows: number;
  lut_intensity: number;
  isFallback: boolean;
}

export class AiSceneService {
  private static TIMEOUT_MS = 2500;

  /**
   * Run optical scene analysis with automatic 2500ms offline fallback.
   */
  public static async analyzeScene(
    _imagePayload512pxBase64: string,
    exif: ExifOpticalData
  ): Promise<AiSceneDecision> {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI Inference timeout')), this.TIMEOUT_MS)
      );

      // In actual deployment, this dispatches to Groq Llama-Vision / Gemini Flash
      const inferencePromise = this.mockOrCallVisionModel(exif);

      return await Promise.race([inferencePromise, timeoutPromise]);
    } catch {
      // Fallback cleanly to EXIF optical heuristics
      return this.heuristicFallback(exif);
    }
  }

  /**
   * Rule-based Optical Heuristics when offline or timeout occurs
   */
  public static heuristicFallback(exif: ExifOpticalData): AiSceneDecision {
    const focalMm = parseInt(exif.focalLength, 10) || 50;
    const aperture = parseFloat(exif.apertureValue.replace('f/', '')) || 2.8;
    const iso = exif.iso || 400;

    // Rule 1: Portrait condition (large aperture + focal length >= 50mm)
    if (aperture <= 2.0 && focalMm >= 50) {
      return {
        scene_type: 'portrait',
        recommended_profile: 'Profile_03_TungstenSoft',
        confidence: 0.88,
        exposure_compensation: 0.2,
        lift_shadows: 0.15,
        lut_intensity: 0.85,
        isFallback: true
      };
    }

    // Rule 2: Low-light or Night photography (ISO >= 3200)
    if (iso >= 3200) {
      return {
        scene_type: 'outdoor_street',
        recommended_profile: 'Profile_01_MatteShadow',
        confidence: 0.82,
        exposure_compensation: 0.1,
        lift_shadows: 0.25,
        lut_intensity: 0.80,
        isFallback: true
      };
    }

    // Rule 3: High contrast architecture (aperture >= f/5.6)
    if (aperture >= 5.6) {
      return {
        scene_type: 'urban_geometry',
        recommended_profile: 'Profile_04_HighContrastMono',
        confidence: 0.85,
        exposure_compensation: 0.0,
        lift_shadows: -0.05,
        lut_intensity: 1.0,
        isFallback: true
      };
    }

    // Default Fallback: Cool teal emerald
    return {
      scene_type: 'outdoor_street',
      recommended_profile: 'Profile_02_TealEmerald',
      confidence: 0.78,
      exposure_compensation: 0.0,
      lift_shadows: 0.1,
      lut_intensity: 0.9,
      isFallback: true
    };
  }

  private static async mockOrCallVisionModel(exif: ExifOpticalData): Promise<AiSceneDecision> {
    // Simulated fast inference return within 800ms
    await new Promise((resolve) => setTimeout(resolve, 600));

    return {
      scene_type: 'outdoor_street',
      recommended_profile: 'Profile_01_MatteShadow',
      confidence: 0.95,
      exposure_compensation: 0.15,
      lift_shadows: 0.20,
      lut_intensity: 0.85,
      isFallback: false
    };
  }
}
