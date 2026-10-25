/**
 * WebGL 2.0 Pure 3D LUT Hardware Engine
 * Strictly De-identified, Zero Brand Trademarks.
 * Pure Volumetric 33x33x33 Trilinear Color Transform without artifact-inducing HSL stacking.
 */

export interface TuningParameters {
  exposure: number;     // -2.0 ~ +2.0 EV
  contrast: number;     // -1.0 ~ +1.0
  colorTemp: number;    // 2800 ~ 8500 Kelvin
  tint?: number;        // -100 ~ +100 Green <-> Magenta
  lutIntensity: number; // 0.0 ~ 1.0
  bypassLut: boolean;   // true for pure natural straight-out-of-camera
  clarity?: number;     // -1.0 ~ +1.0, mid-tone local contrast (large radius)
  sharpness?: number;   // 0.0 ~ 1.0, fine detail unsharp mask (small radius)
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
uniform float u_contrast;
uniform float u_colorTemp;
uniform float u_tint;
uniform float u_intensity;
uniform bool u_bypassLut;
uniform float u_lutSize;   // Per-LUT size so .cube files of 17/33/65 sample correctly
uniform float u_clarity;
uniform float u_sharpness;

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

// White balance temperature shift (Baseline 5500K) + Green-Magenta Tint (-100 ~ +100)
vec3 applyWhiteBalance(vec3 c, float kelvin, float tintVal) {
    vec3 res = c;
    if (abs(kelvin - 5500.0) > 10.0) {
        float delta = (kelvin - 5500.0) / 3000.0;
        vec3 kFactor = delta < 0.0
            ? vec3(1.0 - delta * 0.10, 1.0 - delta * 0.02, 1.0 + delta * 0.12)
            : vec3(1.0 - delta * 0.08, 1.0 + delta * 0.01, 1.0 + delta * 0.14);
        res *= kFactor;
    }
    if (abs(tintVal) > 0.5) {
        float t = tintVal / 100.0;
        vec3 tFactor = vec3(1.0 + t * 0.08, 1.0 - t * 0.12, 1.0 + t * 0.08);
        res *= tFactor;
    }
    return clamp(res, 0.0, 1.0);
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

    // 4. User Optional Contrast Tuning
    if (abs(u_contrast) > 0.001) {
        float factor = 1.0 + u_contrast * 0.5;
        color = clamp((color - 0.4) * factor + 0.4, 0.0, 1.0);
    }

    // 5. Clarity (large radius, mid-tone weighted) + Sharpness (small radius)
    //    Neighborhood based, so it cannot live inside a 3D LUT.
    if (abs(u_clarity) > 0.001 || u_sharpness > 0.001) {
        vec2 texel = 1.0 / vec2(textureSize(u_image, 0));
        float l = lumaOf(src.rgb);
        float detailFine = l - lumaOf(blurAt(v_uv, texel, 1.0));
        float detailCoarse = l - lumaOf(blurAt(v_uv, texel, 6.0));
        float x = lumaOf(color) * 2.0 - 1.0;
        float midMask = 1.0 - x * x; // protect deep shadows / highlights
        color += vec3(detailFine * u_sharpness * 1.5 + detailCoarse * u_clarity * midMask);
    }

    fragColor = vec4(clamp(color, 0.0, 1.0), src.a);
}
`;

export class WebglLutRenderer {
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
    this.uBypassLutLoc = gl.getUniformLocation(program, 'u_bypassLut');
    this.uImageLoc = gl.getUniformLocation(program, 'u_image');
    this.uLutLoc = gl.getUniformLocation(program, 'u_lut');
    this.uLutSizeLoc = gl.getUniformLocation(program, 'u_lutSize');
    this.uClarityLoc = gl.getUniformLocation(program, 'u_clarity');
    this.uSharpnessLoc = gl.getUniformLocation(program, 'u_sharpness');

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
    gl.uniform1f(this.uExposureLoc, params.exposure);
    gl.uniform1f(this.uContrastLoc, params.contrast);
    gl.uniform1f(this.uColorTempLoc, params.colorTemp);
    gl.uniform1f(this.uTintLoc, params.tint ?? 0);
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
   * Parse standard .cube 3D LUT (Adobe / DaVinci Resolve)
   */
  public parseAndRegisterCube(profileId: string, cubeContent: string): boolean {
    if (!this.gl) return false;
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
        return false;
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

      this.registerLut(profileId, rgbaData, size);
      return true;
    } catch (e) {
      console.error('Failed to parse .cube:', e);
      return false;
    }
  }

  private preloadBuiltinLuts() {
    if (!this.gl) return;

    // 1. Profile_02_TealEmerald (Pure, Smooth 1:1 Teal Emerald 3D LUT)
    this.registerLut('Profile_02_TealEmerald', this.generateTealEmeraldLut(), 33);

    // 2. Profile_01_MatteShadow (Matte Black Pedestal Cine Look)
    this.registerLut('Profile_01_MatteShadow', this.generateMatteShadowLut(), 33);

    // 3. Profile_03_TungstenSoft (Warm Tungsten Portrait Look)
    this.registerLut('Profile_03_TungstenSoft', this.generateTungstenSoftLut(), 33);

    // 4. Profile_04_HighContrastMono (Classic Silver Gelatin Monochrome)
    this.registerLut('Profile_04_HighContrastMono', this.generateMonoSilverLut(), 33);
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

  private static smoothstep(e0: number, e1: number, x: number): number {
    const t = Math.min(1.0, Math.max(0.0, (x - e0) / (e1 - e0)));
    return t * t * (3.0 - 2.0 * t);
  }

  /**
   * Perfect, Smooth, Non-Artifacting Teal Emerald 3D LUT (33x33x33)
   * Clean Film Simulation:
   * - Gentle S-curve (Lifted blacks, gentle highlight roll-off)
   * - Smooth Cyan Sky: subtle blue-to-cyan transfer (NO fluorescent neon explosion)
   * - Deep Emerald Foliage: slight yellow dampening, peaceful rich greens
   * - Protected skin luminance
   */
  private generateTealEmeraldLut(): Float32Array {
    const size = 33;
    const data = new Float32Array(size * size * size * 4);
    const ss = WebglLutRenderer.smoothstep;
    let index = 0;

    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          let red = r / (size - 1);
          let green = g / (size - 1);
          let blue = b / (size - 1);

          const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

          // 1. Very gentle S-Curve (low-contrast cinematic look)
          const sCurve = (v: number) => {
            return v < 0.5
              ? Math.pow(v * 2.0, 1.02) * 0.5
              : 1.0 - Math.pow((1.0 - v) * 2.0, 1.02) * 0.5;
          };
          red = sCurve(red);
          green = sCurve(green);
          blue = sCurve(blue);

          // 2. Fade: lifted, teal-tinted blacks (+0.03) & soft highlight roll-off
          const darkMask = Math.pow(Math.max(0.0, 1.0 - luma), 1.8);
          const hlMask = Math.pow(Math.max(0.0, luma), 1.8);
          red = red * 0.99 + 0.024 * darkMask - 0.015 * hlMask;
          green = green * 0.99 + 0.032 * darkMask - 0.010 * hlMask;
          blue = blue * 0.99 + 0.040 * darkMask - 0.015 * hlMask;

          // 3. Cyan Sky Shift (smoothstep mask instead of hard if => no banding)
          const skyMask = ss(0.0, 0.15, blue - red) * ss(0.15, 0.35, blue);
          const blueDelta = Math.min(0.4, Math.max(0.0, blue - red));
          green += skyMask * blueDelta * 0.16;
          red -= skyMask * blueDelta * 0.06;

          // 4. Foliage Emerald: tame yellow glare in grasses & trees
          const foliageMask =
            ss(0.0, 0.03, green - red) * ss(0.0, 0.03, green - blue) * ss(0.03, 0.10, green - blue);
          const foliageDelta = Math.max(0.0, green - blue);
          blue += foliageMask * foliageDelta * 0.12;
          green -= foliageMask * foliageDelta * 0.04;
          red -= foliageMask * foliageDelta * 0.04;

          // 5. Protected warm skin tones (smooth mask)
          const skinMask =
            ss(0.0, 0.03, red - green) * ss(0.0, 0.03, green - blue) * ss(0.08, 0.20, red - blue);
          red += skinMask * 0.015;
          blue -= skinMask * 0.020;

          // 6. Global desaturation (~-15%), reduced on skin so portraits stay healthy
          const sat = 0.85 + 0.10 * skinMask;
          const l2 = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
          red = l2 + (red - l2) * sat;
          green = l2 + (green - l2) * sat;
          blue = l2 + (blue - l2) * sat;

          data[index++] = Math.min(1.0, Math.max(0.0, red));
          data[index++] = Math.min(1.0, Math.max(0.0, green));
          data[index++] = Math.min(1.0, Math.max(0.0, blue));
          data[index++] = 1.0;
        }
      }
    }
    return data;
  }

  private generateMatteShadowLut(): Float32Array {
    const size = 33;
    const data = new Float32Array(size * size * size * 4);
    let index = 0;

    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          let red = r / (size - 1);
          let green = g / (size - 1);
          let blue = b / (size - 1);

          const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
          const sh = Math.pow(Math.max(0.0, 1.0 - luma), 1.5);

          red = red * 1.02 + 0.025 * sh;
          green = green * 1.01 + 0.025 * sh;
          blue = blue * 0.98 + 0.030 * sh;

          data[index++] = Math.min(1.0, Math.max(0.0, red));
          data[index++] = Math.min(1.0, Math.max(0.0, green));
          data[index++] = Math.min(1.0, Math.max(0.0, blue));
          data[index++] = 1.0;
        }
      }
    }
    return data;
  }

  private generateTungstenSoftLut(): Float32Array {
    const size = 33;
    const data = new Float32Array(size * size * size * 4);
    let index = 0;

    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          let red = r / (size - 1);
          let green = g / (size - 1);
          let blue = b / (size - 1);

          const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
          const hl = Math.pow(Math.max(0.0, luma), 1.2);

          red = red * 1.04 + 0.02 * hl;
          green = green * 1.01;
          blue = blue * 0.90 - 0.01 * hl;

          data[index++] = Math.min(1.0, Math.max(0.0, red));
          data[index++] = Math.min(1.0, Math.max(0.0, green));
          data[index++] = Math.min(1.0, Math.max(0.0, blue));
          data[index++] = 1.0;
        }
      }
    }
    return data;
  }

  private generateMonoSilverLut(): Float32Array {
    const size = 33;
    const data = new Float32Array(size * size * size * 4);
    let index = 0;

    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const red = r / (size - 1);
          const green = g / (size - 1);
          const blue = b / (size - 1);

          let mono = red * 0.48 + green * 0.42 + blue * 0.10;
          mono = Math.pow(Math.max(0.0, mono), 1.15);

          const val = Math.min(1.0, Math.max(0.0, mono));
          data[index++] = val;
          data[index++] = val;
          data[index++] = val;
          data[index++] = 1.0;
        }
      }
    }
    return data;
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
