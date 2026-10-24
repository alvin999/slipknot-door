// @ts-nocheck
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
import fs from "node:fs";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

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
                                    const headerStr = headerBuf.toString("latin1");
                                    if (headerStr.includes("ZV-E10")) cameraModel = "ZV-E10";
                                    else if (headerStr.includes("ILCE-")) {
                                      const m = headerStr.match(/ILCE-[A-Za-z0-9]+/);
                                      if (m) cameraModel = m[0];
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
            if (!globalThis.__rawPreviewCache) {
              globalThis.__rawPreviewCache = new Map();
            }
            const cache = globalThis.__rawPreviewCache;
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
                // High-performance read: Read only first 3.5MB where embedded JPEG resides
                const fd = fs.openSync(filePath, "r");
                const stat = fs.fstatSync(fd);
                const readSize = Math.min(stat.size, 3500000);
                const fileBuf = Buffer.alloc(readSize);
                fs.readSync(fd, fileBuf, 0, readSize, 0);
                fs.closeSync(fd);

                for (let i = 0; i + 3 < readSize; i++) {
                  if (fileBuf[i] === 0xFF && fileBuf[i + 1] === 0xD8 && fileBuf[i + 2] === 0xFF) {
                    for (let j = i + 2; j < Math.min(readSize - 1, i + 3000000); j++) {
                      if (fileBuf[j] === 0xFF && fileBuf[j + 1] === 0xD9) {
                        const len = j + 2 - i;
                        if (len > 40000) {
                          jpegBuf = fileBuf.subarray(i, j + 2);
                          break;
                        }
                      }
                    }
                    if (jpegBuf && jpegBuf.length > 150000) break;
                  }
                }
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
