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

/// Delete photo file from physical disk.
/// On Windows, attempts to move to Recycle Bin first; falls back to permanent removal.
#[tauri::command]
pub fn delete_photo_file(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(file_path.trim());
    if !path.exists() {
        return Err("檔案不存在或已被移動".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let clean_path = path.to_string_lossy().replace('\'', "''");
        let ps_cmd = format!(
            "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('{}', 'OnlyErrorDialogs', 'SendToRecycleBin')",
            clean_path
        );
        let status = std::process::Command::new("powershell")
            .creation_flags(CREATE_NO_WINDOW)
            .args(&["-NoProfile", "-NonInteractive", "-Command", &ps_cmd])
            .status();

        if let Ok(s) = status {
            if s.success() && !path.exists() {
                return Ok(());
            }
        }
    }

    fs::remove_file(&path).map_err(|e| format!("刪除磁碟檔案失敗 ({}): {}", path.display(), e))
}
