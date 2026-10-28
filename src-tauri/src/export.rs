use std::fs;
use std::path::PathBuf;

/// Resolve target directory path dynamically using platform-native PathBuf.
/// Automatically handles Windows backslashes (\), Unix forward slashes (/),
/// and optional subdirectories (e.g., date subfolders or raw backup folders).
#[tauri::command]
pub fn resolve_export_path(target_dir: String, sub_dir: Option<String>) -> Result<String, String> {
    let trimmed_dir = target_dir.trim();
    if trimmed_dir.is_empty() {
        return Ok("./Exports".to_string());
    }

    let mut path = PathBuf::from(trimmed_dir);
    if let Some(sub) = sub_dir {
        let sub_trimmed = sub.trim();
        if !sub_trimmed.is_empty() {
            path.push(sub_trimmed);
        }
    }

    Ok(path.to_string_lossy().to_string())
}

/// Save exported photo binary directly to the target directory on local disk.
/// Recursively creates parent directories if needed and uses native OS path separators.
#[tauri::command]
pub fn save_exported_file(
    target_dir: String,
    sub_dir: Option<String>,
    filename: String,
    data: Vec<u8>,
) -> Result<String, String> {
    let trimmed_dir = target_dir.trim();
    if trimmed_dir.is_empty() {
        return Err("目標目錄不能為空".to_string());
    }

    let mut dest_path = PathBuf::from(trimmed_dir);
    if let Some(sub) = sub_dir {
        let sub_trimmed = sub.trim();
        if !sub_trimmed.is_empty() {
            dest_path.push(sub_trimmed);
        }
    }

    // Ensure the entire directory tree exists
    if let Err(e) = fs::create_dir_all(&dest_path) {
        return Err(format!("建立目標目錄失敗 ({}): {}", dest_path.display(), e));
    }

    dest_path.push(filename.trim());

    // Write binary bytes directly to disk
    if let Err(e) = fs::write(&dest_path, &data) {
        return Err(format!("寫入檔案失敗 ({}): {}", dest_path.display(), e));
    }

    Ok(dest_path.to_string_lossy().to_string())
}
