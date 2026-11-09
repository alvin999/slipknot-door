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

/// Delete photo file from physical disk with cross-platform Recycle Bin / Trash support.
/// - On Windows: attempts to move to Recycle Bin via PowerShell / VisualBasic FileSystem.
/// - On macOS: attempts to move to Trash via native AppleScript (osascript).
/// - On Linux: attempts to move to Trash via FreeDesktop gio trash.
/// - Falls back to permanent removal (fs::remove_file) if trash is unavailable (e.g. FAT32 memory cards).
#[tauri::command]
pub fn delete_photo_file(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(file_path.trim());
    if !path.exists() {
        return Err("檔案不存在或已被移動".to_string());
    }

    // 1. Windows: 優先移入資源回收筒
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

    // 2. macOS: 優先透過 AppleScript 移入廢紙簍 (Trash)
    #[cfg(target_os = "macos")]
    {
        let clean_path = path.to_string_lossy().replace('\"', "\\\"");
        let script = format!(
            "tell application \"Finder\" to delete POSIX file \"{}\"",
            clean_path
        );
        let status = std::process::Command::new("osascript")
            .args(&["-e", &script])
            .status();

        if let Ok(s) = status {
            if s.success() && !path.exists() {
                return Ok(());
            }
        }
    }

    // 3. Linux: 優先透過 FreeDesktop 的 gio trash 移入回收筒
    #[cfg(target_os = "linux")]
    {
        let status = std::process::Command::new("gio")
            .args(&["trash", &path.to_string_lossy()])
            .status();

        if let Ok(s) = status {
            if s.success() && !path.exists() {
                return Ok(());
            }
        }
    }

    // 4. 降級：若不支援回收筒（例如外接 FAT32 記憶卡）或上述指令失敗，以標準 remove_file 永久刪除
    fs::remove_file(&path).map_err(|e| format!("刪除磁碟檔案失敗 ({}): {}", path.display(), e))
}
