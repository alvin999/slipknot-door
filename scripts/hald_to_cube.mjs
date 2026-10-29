import fs from 'fs';
import { PNG } from 'pngjs';

/**
 * Convert a HaldCLUT PNG Buffer to an Adobe .cube 3D LUT string.
 * @param {Buffer} pngBuffer - Buffer of the HaldCLUT PNG
 * @param {number} targetSize - Desired 3D LUT cube size (default 32)
 * @param {string} title - Optional title in the cube file header
 * @returns {string} - Contents of the .cube file
 */
export function haldClutToCube(pngBuffer, targetSize = 32, title = 'HaldCLUT') {
  const png = PNG.sync.read(pngBuffer);
  const width = png.width;
  const height = png.height;

  // HaldCLUT is a square image where width == height
  // and width == L^3, where L is the Hald Level (typically 8 for 512x512, 12 for 1728x1728)
  const haldLevel = Math.round(Math.pow(width, 1 / 3));
  const lutSize = haldLevel * haldLevel; // e.g. 8*8 = 64, or 12*12 = 144

  if (lutSize * lutSize * lutSize !== width * height) {
    throw new Error(`Invalid HaldCLUT dimensions: ${width}x${height}`);
  }

  /**
   * Sample HaldCLUT at continuous 3D coordinate (r, g, b) in [0, 1]
   */
  function sampleHald(r, g, b) {
    const rx = r * (lutSize - 1);
    const gy = g * (lutSize - 1);
    const bz = b * (lutSize - 1);

    const r0 = Math.floor(rx);
    const r1 = Math.min(lutSize - 1, r0 + 1);
    const rf = rx - r0;

    const g0 = Math.floor(gy);
    const g1 = Math.min(lutSize - 1, g0 + 1);
    const gf = gy - g0;

    const b0 = Math.floor(bz);
    const b1 = Math.min(lutSize - 1, b0 + 1);
    const bf = bz - b0;

    function getPixel(ri, gi, bi) {
      // Index in standard HaldCLUT:
      // index = ri + gi * lutSize + bi * lutSize * lutSize
      const idx = ri + gi * lutSize + bi * lutSize * lutSize;
      const x = idx % width;
      const y = Math.floor(idx / width);
      const byteIdx = (y * width + x) * 4;

      return [
        png.data[byteIdx] / 255.0,
        png.data[byteIdx + 1] / 255.0,
        png.data[byteIdx + 2] / 255.0
      ];
    }

    // Trilinear interpolation
    const c000 = getPixel(r0, g0, b0);
    const c100 = getPixel(r1, g0, b0);
    const c010 = getPixel(r0, g1, b0);
    const c110 = getPixel(r1, g1, b0);
    const c001 = getPixel(r0, g0, b1);
    const c101 = getPixel(r1, g0, b1);
    const c011 = getPixel(r0, g1, b1);
    const c111 = getPixel(r1, g1, b1);

    const res = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const c00 = c000[c] * (1 - rf) + c100[c] * rf;
      const c10 = c010[c] * (1 - rf) + c110[c] * rf;
      const c01 = c001[c] * (1 - rf) + c101[c] * rf;
      const c11 = c011[c] * (1 - rf) + c111[c] * rf;

      const c0 = c00 * (1 - gf) + c10 * gf;
      const c1 = c01 * (1 - gf) + c11 * gf;

      res[c] = c0 * (1 - bf) + c1 * bf;
    }
    return res;
  }

  // Generate .cube lines: Red advances fastest, then Green, then Blue
  const lines = [
    `# Converted from HaldCLUT PNG`,
    `# TITLE "${title}"`,
    ``,
    `LUT_3D_SIZE ${targetSize}`
  ];

  for (let b = 0; b < targetSize; b++) {
    const bNorm = b / (targetSize - 1);
    for (let g = 0; g < targetSize; g++) {
      const gNorm = g / (targetSize - 1);
      for (let r = 0; r < targetSize; r++) {
        const rNorm = r / (targetSize - 1);
        const [rout, gout, bout] = sampleHald(rNorm, gNorm, bNorm);
        lines.push(
          `${rout.toFixed(5)} ${gout.toFixed(5)} ${bout.toFixed(5)}`
        );
      }
    }
  }

  return lines.join('\n');
}

