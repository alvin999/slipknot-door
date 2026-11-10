use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use crate::models::{CameraMountInfo, RawPhotoItem};
use crate::ingestion::raw_extractor::RawExtractor;

const RAW_EXTENSIONS: &[&str] = &["arw", "cr2", "cr3", "nef", "raf", "dng", "jpg", "jpeg"];
const RAW_ONLY_EXTENSIONS: &[&str] = &["arw", "cr2", "cr3", "nef", "raf", "dng"];
const JPEG_EXTENSIONS: &[&str] = &["jpg", "jpeg"];

pub struct StorageDetector;

impl StorageDetector {
    /// Detect external storage mounts and camera DCIM directories using OS mount tables
    /// Zero hardcoded vendor names, zero hardcoded path assumptions.
    pub fn detect_mounts() -> Vec<CameraMountInfo> {
        let mut results = Vec::new();
        let mount_points = Self::get_system_mount_points();

        for mount_path in mount_points {
            if !mount_path.exists() || !mount_path.is_dir() {
                continue;
            }

            let raw_dirname = mount_path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| mount_path.to_string_lossy().to_string());

            // Check for standard DCF (Design rule for Camera File system) directory
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

            // Dynamically resolve real camera model from image binary EXIF header
            let volume_name = if is_camera && file_count > 0 {
                if let Some(ref d) = dcim_path {
                    if let Some(first_photo) = Self::find_first_image(d) {
                        if let Ok(preview) = RawExtractor::extract_preview(&first_photo.to_string_lossy()) {
                            let model = preview.exif.camera_model.trim();
                            if !model.is_empty() {
                                format!("{} ({})", model, raw_dirname)
                            } else {
                                raw_dirname
                            }
                        } else {
                            raw_dirname
                        }
                    } else {
                        raw_dirname
                    }
                } else {
                    raw_dirname
                }
            } else {
                raw_dirname
            };

            // Include only external storage with camera DCIM or active volume
            if is_camera || file_count > 0 {
                results.push(CameraMountInfo {
                    mount_path: mount_path.to_string_lossy().to_string(),
                    volume_name,
                    dcim_path: dcim_path.map(|p| p.to_string_lossy().to_string()),
                    file_count,
                    is_camera,
                });
            }
        }

        results
    }

    /// Read dynamic mount points directly from standard OS system tables
    fn get_system_mount_points() -> Vec<PathBuf> {
        let mut mount_points = Vec::new();

        #[cfg(target_os = "linux")]
        {
            // Read active kernel mount table from /proc/mounts
            if let Ok(contents) = fs::read_to_string("/proc/mounts") {
                for line in contents.lines() {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        let dev = parts[0];
                        let target = parts[1];

                        // Filter for real block devices (e.g., /dev/sd*, /dev/nvme*, /dev/mmcblk*)
                        if dev.starts_with("/dev/") {
                            let path = PathBuf::from(target);
                            // Exclude system core root/boot/home directories
                            if target != "/"
                                && !target.starts_with("/boot")
                                && !target.starts_with("/sys")
                                && !target.starts_with("/proc")
                                && !target.starts_with("/dev")
                            {
                                if path.exists() && path.is_dir() {
                                    mount_points.push(path);
                                }
                            }
                        }
                    }
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            if let Ok(entries) = fs::read_dir("/Volumes") {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        mount_points.push(p);
                    }
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            for drive_letter in b'D'..=b'Z' {
                let drive_str = format!("{}:\\", drive_letter as char);
                let path = PathBuf::from(&drive_str);
                if path.exists() {
                    mount_points.push(path);
                }
            }
        }

        mount_points
    }

    /// Find the first image in directory recursively for binary EXIF extraction
    fn find_first_image(dir: &Path) -> Option<PathBuf> {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(found) = Self::find_first_image(&path) {
                        return Some(found);
                    }
                } else if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    if RAW_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                        return Some(path);
                    }
                }
            }
        }
        None
    }

    /// Count supported RAW & JPEG images in directory recursively.
    /// Deduplicates RAW+JPEG pairs sharing the same file stem to report authentic shutter exposures.
    fn count_raw_files(dir: &Path) -> usize {
        let mut count = 0;
        if let Ok(entries) = fs::read_dir(dir) {
            let mut stems = HashSet::new();
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    count += Self::count_raw_files(&path);
                } else if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    if RAW_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                            stems.insert(stem.to_uppercase());
                        } else {
                            count += 1;
                        }
                    }
                }
            }
            count += stems.len();
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
            // Group files in current directory by file stem to seamlessly pair RAW + JPEG
            let mut sub_dirs = Vec::new();
            let mut stem_groups: HashMap<String, (Option<(PathBuf, String, u64)>, Option<(PathBuf, String, u64)>)> = HashMap::new();

            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    sub_dirs.push(path);
                } else if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    let is_raw = RAW_ONLY_EXTENSIONS.contains(&ext_lower.as_str());
                    let is_jpeg = JPEG_EXTENSIONS.contains(&ext_lower.as_str());

                    if is_raw || is_jpeg {
                        let filename = entry.file_name().to_string_lossy().to_string();
                        let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        let stem = path.file_stem()
                            .map(|s| s.to_string_lossy().to_string().to_uppercase())
                            .unwrap_or_else(|| filename.to_uppercase());

                        let entry_slot = stem_groups.entry(stem).or_insert((None, None));
                        if is_raw {
                            entry_slot.0 = Some((path, ext_lower, file_size));
                        } else if is_jpeg {
                            entry_slot.1 = Some((path, ext_lower, file_size));
                        }
                    }
                }
            }

            // Convert pairs/singles into RawPhotoItem entries
            // Sort keys to maintain deterministic chronological / filename ordering
            let mut sorted_stems: Vec<String> = stem_groups.keys().cloned().collect();
            sorted_stems.sort();

            for stem in sorted_stems {
                if let Some((raw_opt, jpeg_opt)) = stem_groups.remove(&stem) {
                    let frame_no = format!("{:02}A", items.len() + 1);
                    match (raw_opt, jpeg_opt) {
                        (Some((raw_path, raw_ext, raw_size)), Some((jpg_path, _jpg_ext, _jpg_size))) => {
                            // RAW + JPEG Pair (Prioritize RAW as primary plate, attach JPEG as sidecar)
                            let filename = raw_path.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
                            items.push(RawPhotoItem {
                                file_path: raw_path.to_string_lossy().to_string(),
                                filename,
                                file_size: raw_size,
                                extension: raw_ext,
                                frame_no,
                                exif: None,
                                sidecar_path: Some(jpg_path.to_string_lossy().to_string()),
                                format_type: "pair".to_string(),
                            });
                        }
                        (Some((raw_path, raw_ext, raw_size)), None) => {
                            // Single RAW
                            let filename = raw_path.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
                            items.push(RawPhotoItem {
                                file_path: raw_path.to_string_lossy().to_string(),
                                filename,
                                file_size: raw_size,
                                extension: raw_ext,
                                frame_no,
                                exif: None,
                                sidecar_path: None,
                                format_type: "raw".to_string(),
                            });
                        }
                        (None, Some((jpg_path, jpg_ext, jpg_size))) => {
                            // Single JPEG
                            let filename = jpg_path.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
                            items.push(RawPhotoItem {
                                file_path: jpg_path.to_string_lossy().to_string(),
                                filename,
                                file_size: jpg_size,
                                extension: jpg_ext,
                                frame_no,
                                exif: None,
                                sidecar_path: None,
                                format_type: "jpeg".to_string(),
                            });
                        }
                        (None, None) => {}
                    }
                }
            }

            for sub_dir in sub_dirs {
                Self::collect_photos(&sub_dir, items, depth + 1);
            }
        }
    }
}
