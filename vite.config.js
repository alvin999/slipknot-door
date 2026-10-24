// @ts-nocheck
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
import fs from "node:fs";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

/**
 * Generic TIFF/Exif Parser for standard RAW camera binary headers.
 * Zero vendor hardcodes. Standard TIFF CP-3461 implementation.
 */
function parseTiffMetadata(buffer) {
  if (buffer.length < 16) return { make: "", model: "" };
  const isLe = buffer[0] === 0x49 && buffer[1] === 0x49; // 'II'
  const isBe = buffer[0] === 0x4D && buffer[1] === 0x4D; // 'MM'
  if (!isLe && !isBe) return { make: "", model: "" };

  const readU16 = (o) => isLe ? buffer.readUInt16LE(o) : buffer.readUInt16BE(o);
  const readU32 = (o) => isLe ? buffer.readUInt32LE(o) : buffer.readUInt32BE(o);

  let ifdOffset = readU32(4);
  let make = "";
  let model = "";

  if (ifdOffset > 0 && ifdOffset < buffer.length - 2) {
    const numEntries = readU16(ifdOffset);
    let entryOffset = ifdOffset + 2;

    for (let i = 0; i < numEntries && entryOffset + 12 <= buffer.length; i++) {
      const tag = readU16(entryOffset);
      const type = readU16(entryOffset + 2);
      const count = readU32(entryOffset + 4);
      const valOffset = entryOffset + 8;

      if (type === 2) { // ASCII
        const actualOffset = count > 4 ? readU32(valOffset) : valOffset;
        if (actualOffset + count <= buffer.length) {
          const str = buffer.toString("utf8", actualOffset, actualOffset + count).replace(/\0/g, "").trim();
          if (tag === 0x010F) make = str;
          if (tag === 0x0110) model = str;
        }
      }
      entryOffset += 12;
    }
  }

  return { make, model };
}

/**
 * Vite Dev Middleware for Camera Mount Detection in Web Browser Mode
 * Enables authentic /proc/mounts reading without mocks during web dev.
 */
function cameraDevMiddlewarePlugin() {
  return {
    name: "camera-dev-mounts",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || "", `http://${req.headers.host}`);

        if (url.pathname === "/api/detect-mounts") {
          const results = [];
          try {
            if (fs.existsSync("/proc/mounts")) {
              const mountsData = fs.readFileSync("/proc/mounts", "utf8");
              const lines = mountsData.split("\n");

              for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 2) {
                  const dev = parts[0];
                  const mountPoint = parts[1];

                  if (
                    dev.startsWith("/dev/") &&
                    mountPoint !== "/" &&
                    !mountPoint.startsWith("/boot") &&
                    !mountPoint.startsWith("/sys") &&
                    !mountPoint.startsWith("/proc") &&
                    !mountPoint.startsWith("/dev")
                  ) {
                    const dcimUpper = path.join(mountPoint, "DCIM");
                    const dcimLower = path.join(mountPoint, "dcim");
                    let dcimPath = null;

                    if (fs.existsSync(dcimUpper) && fs.statSync(dcimUpper).isDirectory()) {
                      dcimPath = dcimUpper;
                    } else if (fs.existsSync(dcimLower) && fs.statSync(dcimLower).isDirectory()) {
                      dcimPath = dcimLower;
                    }

                    if (dcimPath) {
                      let fileCount = 0;
                      let cameraModel = "";

                      const countPhotos = (dir) => {
                        try {
                          const entries = fs.readdirSync(dir, { withFileTypes: true });
                          for (const entry of entries) {
                            const full = path.join(dir, entry.name);
                            if (entry.isDirectory()) {
                              countPhotos(full);
                            } else {
                              const ext = entry.name.split(".").pop()?.toLowerCase();
                              if (["arw", "cr2", "cr3", "nef", "raf", "dng", "jpg", "jpeg"].includes(ext)) {
                                fileCount++;
                                if (!cameraModel) {
                                  try {
                                    const headerBuf = Buffer.alloc(65536);
                                    const fd = fs.openSync(full, "r");
                                    fs.readSync(fd, headerBuf, 0, 65536, 0);
                                    fs.closeSync(fd);
                                    const { make, model } = parseTiffMetadata(headerBuf);
                                    if (model) {
                                      cameraModel = make && !model.toLowerCase().includes(make.toLowerCase())
                                        ? `${make} ${model}`
                                        : model;
                                    }
                                  } catch {}
                                }
                              }
                            }
                          }
                        } catch {}
                      };

                      countPhotos(dcimPath);
                      const rawName = path.basename(mountPoint);
                      const volumeName = cameraModel ? `${cameraModel} (${rawName})` : rawName;

                      results.push({
                        mount_path: mountPoint,
                        volume_name: volumeName,
                        dcim_path: dcimPath,
                        file_count: fileCount,
                        is_camera: true
                      });
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.error("detect-mounts middleware error:", e);
          }

          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(results));
          return;
        }

        if (url.pathname === "/api/scan-dcim") {
          const dirPath = url.searchParams.get("path");
          const items = [];
          if (dirPath && fs.existsSync(dirPath)) {
            let index = 1;
            const collect = (dir) => {
              try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                  const full = path.join(dir, entry.name);
                  if (entry.isDirectory()) {
                    collect(full);
                  } else {
                    const ext = entry.name.split(".").pop()?.toLowerCase() || "";
                    if (["arw", "cr2", "cr3", "nef", "raf", "dng", "jpg", "jpeg"].includes(ext)) {
                      const stat = fs.statSync(full);
                      items.push({
                        file_path: full,
                        filename: entry.name,
                        file_size: stat.size,
                        extension: ext,
                        frame_no: `${String(index).padStart(2, "0")}A`
                      });
                      index++;
                    }
                  }
                }
              } catch {}
            };
            collect(dirPath);
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(items));
          return;
        }

        if (url.pathname === "/api/extract-preview") {
          const filePath = url.searchParams.get("path");
          if (filePath && fs.existsSync(filePath)) {
            // Check memory cache
            if (!globalThis.__rawPreviewCache_v2) {
              globalThis.__rawPreviewCache_v2 = new Map();
            }
            const cache = globalThis.__rawPreviewCache_v2;
            if (cache.has(filePath)) {
              res.setHeader("Content-Type", "image/jpeg");
              res.setHeader("Cache-Control", "public, max-age=86400");
              res.end(cache.get(filePath));
              return;
            }

            try {
              const ext = path.extname(filePath).toLowerCase();
              let jpegBuf = null;

              if (ext === ".jpg" || ext === ".jpeg") {
                jpegBuf = fs.readFileSync(filePath);
              } else {
                // 2-Stage Adaptive Fast Buffer Read (Sony, Canon, Nikon, Fuji, Leica, DNG)
                const fd = fs.openSync(filePath, "r");
                const stat = fs.fstatSync(fd);
                const stage1Size = Math.min(stat.size, 4000000);
                let fileBuf = Buffer.alloc(stage1Size);
                fs.readSync(fd, fileBuf, 0, stage1Size, 0);

                const findLargestJpeg = (buf, limit) => {
                  let bestJpeg = null;
                  let maxPixels = 0;
                  let maxBytes = 0;

                  for (let i = 0; i + 3 < limit; i++) {
                    if (buf[i] === 0xFF && buf[i + 1] === 0xD8 && buf[i + 2] === 0xFF) {
                      const soi = i;
                      // Seek its matching EOI (0xFF 0xD9)
                      for (let j = soi + 2; j + 1 < limit; j++) {
                        if (buf[j] === 0xFF && buf[j + 1] === 0xD9) {
                          const eoi = j + 2;
                          const len = eoi - soi;

                          if (len > 30000) { // Exclude tiny thumbnails (< 30KB)
                            // Read dimensions from SOF0/SOF2 marker
                            let w = 0, h = 0;
                            for (let k = soi; k < Math.min(eoi, soi + 1024); k++) {
                              if (buf[k] === 0xFF && (buf[k + 1] === 0xC0 || buf[k + 1] === 0xC2)) {
                                h = buf.readUInt16BE(k + 5);
                                w = buf.readUInt16BE(k + 7);
                                break;
                              }
                            }
                            const pixels = w * h;
                            if (pixels > maxPixels || (pixels === 0 && len > maxBytes)) {
                              maxPixels = pixels;
                              maxBytes = len;
                              bestJpeg = buf.subarray(soi, eoi);
                            }
                          }
                          i = eoi - 1; // Advance outer loop past this image
                          break;
                        }
                      }
                    }
                  }
                  return bestJpeg;
                };

                jpegBuf = findLargestJpeg(fileBuf, stage1Size);

                // Stage 2 Fallback: If not found in first 4MB, read up to 12MB for deep-offset RAWs
                if (!jpegBuf && stat.size > stage1Size) {
                  const stage2Size = Math.min(stat.size, 12000000);
                  fileBuf = Buffer.alloc(stage2Size);
                  fs.readSync(fd, fileBuf, 0, stage2Size, 0);
                  jpegBuf = findLargestJpeg(fileBuf, stage2Size);
                }
                fs.closeSync(fd);
              }

              if (jpegBuf) {
                if (cache.size > 400) {
                  const firstKey = cache.keys().next().value;
                  cache.delete(firstKey);
                }
                cache.set(filePath, jpegBuf);

                res.setHeader("Content-Type", "image/jpeg");
                res.setHeader("Cache-Control", "public, max-age=86400");
                res.end(jpegBuf);
                return;
              }
            } catch (err) {
              console.error("extract-preview middleware error:", err);
            }
          }
          res.statusCode = 404;
          res.end("Not found");
          return;
        }

        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [sveltekit(), cameraDevMiddlewarePlugin()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
