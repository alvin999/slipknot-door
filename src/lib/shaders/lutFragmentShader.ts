/**
 * Alexandria Darkroom WebGL 2.0 / Fragment Shader Core
 * Real-time 3D LUT color grading + Exposure compensation + Non-linear shadow lift
 */

export const LUT_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

export const LUT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform highp sampler3D u_lutTexture;
uniform float u_exposureEV;      // Range: -2.0 to +2.0
uniform float u_shadowLift;      // Range: 0.0 to 1.0
uniform float u_lutIntensity;    // Range: 0.0 to 1.0
uniform float u_lutSize;         // Usually 33.0

// Convert EV to linear multiplier
float evToMultiplier(float ev) {
  return pow(2.0, ev);
}

// Non-linear shadow lift curve (Toe lift)
vec3 applyShadowLift(vec3 color, float lift) {
  if (lift <= 0.0) return color;
  // Parabolic toe lift affecting predominantly the lower 35% luminance
  vec3 liftAmount = (1.0 - color) * (1.0 - color) * (lift * 0.35);
  return clamp(color + liftAmount, 0.0, 1.0);
}

void main() {
  vec4 rawSample = texture(u_image, v_texCoord);
  vec3 rgb = rawSample.rgb;

  // Step 1: Exposure Gain Compensation
  float exposureFactor = evToMultiplier(u_exposureEV);
  rgb = clamp(rgb * exposureFactor, 0.0, 1.0);

  // Step 2: Non-linear Shadow Lift
  rgb = applyShadowLift(rgb, u_shadowLift);

  // Step 3: 3D LUT Trilinear Texture Lookup
  // Scale & offset coordinate to fit within half-texel margins of 3D volume
  float scale = (u_lutSize - 1.0) / u_lutSize;
  float offset = 1.0 / (2.0 * u_lutSize);
  vec3 lutCoords = rgb * scale + offset;
  vec3 gradedRgb = texture(u_lutTexture, lutCoords).rgb;

  // Step 4: Blend based on LUT Intensity
  vec3 finalRgb = mix(rgb, gradedRgb, u_lutIntensity);

  fragColor = vec4(finalRgb, rawSample.a);
}
`;
