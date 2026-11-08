pub mod export;
pub mod ingestion;
pub mod models;

use export::{resolve_export_path, save_exported_file};
use ingestion::{RawExtractor, StorageDetector};
use models::{CameraMountInfo, EmbeddedPreviewResult, RawPhotoItem};

// Tauri Commands for Ingestion & Fast Preview (Executed on dedicated threadpool to keep Webview IPC non-blocking)

#[tauri::command]
async fn detect_camera_mounts() -> Result<Vec<CameraMountInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| StorageDetector::detect_mounts())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn scan_dcim_directory(path: String) -> Result<Vec<RawPhotoItem>, String> {
    tauri::async_runtime::spawn_blocking(move || StorageDetector::scan_directory(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn extract_embedded_jpeg(file_path: String) -> Result<EmbeddedPreviewResult, String> {
    tauri::async_runtime::spawn_blocking(move || RawExtractor::extract_preview(&file_path))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            detect_camera_mounts,
            scan_dcim_directory,
            extract_embedded_jpeg,
            save_exported_file,
            resolve_export_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running slipknot-door application");
}
