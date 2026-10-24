use std::fs;
use std::path::{Path, PathBuf};
use crate::models::{CameraMountInfo, RawPhotoItem};

const RAW_EXTENSIONS: &[&str] = &["arw", "cr2", "cr3", "nef", "raf", "dng", "jpg", "jpeg"];

pub struct StorageDetector;

impl StorageDetector {
    /// Detect external storage mounts and camera DCIM directories
    pub fn detect_mounts() -> Vec<CameraMountInfo> {
        let mut results = Vec::new();
        let mut potential_mount_roots = Vec::new();

        #[cfg(target_os = "linux")]
        {
            if let Ok(run_media) = fs::read_dir("/run/media") {
                for u in run_media.flatten() {
                    let u_path = u.path();
                    if u_path.is_dir() {
                        potential_mount_roots.push(u_path);
                    }
                }
            }
            if let Ok(media) = fs::read_dir("/media") {
                for u in media.flatten() {
                    let u_path = u.path();
                    if u_path.is_dir() {
                        potential_mount_roots.push(u_path);
                    }
                }
            }
            if let Ok(user) = std::env::var("USER") {
                potential_mount_roots.push(PathBuf::from(format!("/media/{}", user)));
                potential_mount_roots.push(PathBuf::from(format!("/run/media/{}", user)));
            }
            potential_mount_roots.push(PathBuf::from("/media"));
            potential_mount_roots.push(PathBuf::from("/mnt"));
        }

        #[cfg(target_os = "macos")]
        {
            potential_mount_roots.push(PathBuf::from("/Volumes"));
        }

        #[cfg(target_os = "windows")]
        {
            for drive_letter in b'D'..=b'Z' {
                let drive_str = format!("{}:\\", drive_letter as char);
                let path = PathBuf::from(&drive_str);
                if path.exists() {
                    potential_mount_roots.push(path);
                }
            }
        }

        for root in potential_mount_roots {
            if !root.exists() || !root.is_dir() {
                continue;
            }

            if let Ok(entries) = fs::read_dir(&root) {
                for entry in entries.flatten() {
                    let mount_path = entry.path();
                    if mount_path.is_dir() {
                        let raw_name = entry.file_name().to_string_lossy().to_string();
                        // Ignore known vendor utility partitions like Sony PMHOME
                        if raw_name == "PMHOME" {
                            continue;
                        }

                        let dcim_candidate = mount_path.join("DCIM");
                        let dcim_lower = mount_path.join("dcim");

                        let dcim_path = if dcim_candidate.exists() && dcim_candidate.is_dir() {
                            Some(dcim_candidate)
                        } else if dcim_lower.exists() && dcim_lower.is_dir() {
                            Some(dcim_lower)
                        } else {
                            None
                        };

                        let is_camera = dcim_path.is_some();
                        let file_count = if let Some(ref d) = dcim_path {
                            Self::count_raw_files(d)
                        } else {
                            0
                        };

                        // Smart vendor detection based on camera filesystem signatures
                        let vol_name = if mount_path.join("AVF_INFO").exists() 
                            || mount_path.join("PRIVATE").exists()
                            || root.join("PMHOME").exists() {
                            format!("Sony 相機 ({})", raw_name)
                        } else if mount_path.join("CANONMSC").exists() {
                            format!("Canon 相機 ({})", raw_name)
                        } else if mount_path.join("NIKON").exists() {
                            format!("Nikon 相機 ({})", raw_name)
                        } else if mount_path.join("FFUSER").exists() {
                            format!("Fujifilm 相機 ({})", raw_name)
                        } else {
                            raw_name
                        };

                        results.push(CameraMountInfo {
                            mount_path: mount_path.to_string_lossy().to_string(),
                            volume_name: vol_name,
                            dcim_path: dcim_path.map(|p| p.to_string_lossy().to_string()),
                            file_count,
                            is_camera,
                        });
                    }
                }
            }
        }

        results
    }

    /// Count supported RAW & JPEG images in directory recursively
    fn count_raw_files(dir: &Path) -> usize {
        let mut count = 0;
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    count += Self::count_raw_files(&path);
                } else if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    if RAW_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                        count += 1;
                    }
                }
            }
        }
        count
    }

    /// Scan directory and list raw photos
    pub fn scan_directory(dir_path: &str) -> Result<Vec<RawPhotoItem>, String> {
        let path = Path::new(dir_path);
        if !path.exists() || !path.is_dir() {
            return Err(format!("Directory does not exist: {}", dir_path));
        }

        let mut items = Vec::new();
        Self::collect_photos(path, &mut items, 0);

        Ok(items)
    }

    fn collect_photos(dir: &Path, items: &mut Vec<RawPhotoItem>, depth: usize) {
        if depth > 4 {
            return; // prevent excessive depth recursion
        }

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    Self::collect_photos(&path, items, depth + 1);
                } else if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if RAW_EXTENSIONS.contains(&ext_lower.as_str()) {
                        let filename = entry.file_name().to_string_lossy().to_string();
                        let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        let frame_no = format!("{:02}A", items.len() + 1);

                        items.push(RawPhotoItem {
                            file_path: path.to_string_lossy().to_string(),
                            filename,
                            file_size,
                            extension: ext_lower,
                            frame_no,
                            exif: None, // extracted on demand
                        });
                    }
                }
            }
        }
    }
}
