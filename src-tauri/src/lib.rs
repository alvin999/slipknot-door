pub mod models;
pub mod ingestion;

use models::{CameraMountInfo, EmbeddedPreviewResult, RawPhotoItem};
use ingestion::{RawExtractor, StorageDetector};

// Tauri Commands for Phase 2: Ingestion & Fast Preview

#[tauri::command]
fn detect_camera_mounts() -> Result<Vec<CameraMountInfo>, String> {
    Ok(StorageDetector::detect_mounts())
}

#[tauri::command]
fn scan_dcim_directory(path: String) -> Result<Vec<RawPhotoItem>, String> {
    StorageDetector::scan_directory(&path)
}

#[tauri::command]
fn extract_embedded_jpeg(file_path: String) -> Result<EmbeddedPreviewResult, String> {
    RawExtractor::extract_preview(&file_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            detect_camera_mounts,
            scan_dcim_directory,
            extract_embedded_jpeg
        ])
        .run(tauri::generate_context!())
        .expect("error while running slipknot-door application");
}
