use std::fs;
use std::path::{Component, Path, PathBuf};

/// 驗證並附加相對子目錄，阻擋 `..`、絕對路徑或磁碟機前綴等路徑遍歷攻擊
fn push_safe_sub_dir(base: &mut PathBuf, sub_dir: Option<String>) -> Result<(), String> {
    if let Some(sub) = sub_dir {
        let sub_trimmed = sub.trim();
        if !sub_trimmed.is_empty() {
            let sub_path = Path::new(sub_trimmed);
            for component in sub_path.components() {
                match component {
                    Component::Normal(part) => base.push(part),
                    Component::CurDir => {}
                    Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                        return Err("不合法的子目錄路徑（禁止包含 .. 或絕對路徑）".to_string());
                    }
                }
            }
        }
    }
    Ok(())
}

/// 驗證單一檔名，禁止空字串、路徑分隔符或特殊目錄名稱
fn validate_safe_filename(filename: &str) -> Result<&str, String> {
    let trimmed = filename.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return Err("檔案名稱不能為空或為保留字".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
        return Err("檔案名稱不可包含路徑分隔符或空字元".to_string());
    }
    let mut components = Path::new(trimmed).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => Ok(trimmed),
        _ => Err("不合法的檔案名稱".to_string()),
    }
}

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
    push_safe_sub_dir(&mut path, sub_dir)?;

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

    let safe_filename = validate_safe_filename(&filename)?;

    let mut dest_path = PathBuf::from(trimmed_dir);
    push_safe_sub_dir(&mut dest_path, sub_dir)?;

    // Ensure the entire directory tree exists
    if let Err(e) = fs::create_dir_all(&dest_path) {
        return Err(format!("建立目標目錄失敗 ({}): {}", dest_path.display(), e));
    }

    dest_path.push(safe_filename);

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
    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Err("檔案路徑不能為空".to_string());
    }

    let path = PathBuf::from(trimmed);
    let metadata = fs::symlink_metadata(&path)
        .map_err(|_| "檔案不存在或無法存取".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("僅允許刪除一般檔案，禁止操作目錄或符號連結".to_string());
    }

    // 1. Windows: 優先移入資源回收筒（透過環境變數傳遞路徑，避免指令注入）
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let ps_cmd = "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:SLIPKNOT_DELETE_TARGET, 'OnlyErrorDialogs', 'SendToRecycleBin')";
        let status = std::process::Command::new("powershell")
            .creation_flags(CREATE_NO_WINDOW)
            .env("SLIPKNOT_DELETE_TARGET", path.as_os_str())
            .args(["-NoProfile", "-NonInteractive", "-Command", ps_cmd])
            .status();

        if let Ok(s) = status {
            if s.success() && !path.exists() {
                return Ok(());
            }
        }
    }

    // 2. macOS: 優先透過 AppleScript 移入廢紙簍 (Trash)（透過 argv 傳遞路徑，避免指令注入）
    #[cfg(target_os = "macos")]
    {
        let script = "on run argv\ntell application \"Finder\" to delete POSIX file (item 1 of argv)\nend run";
        let status = std::process::Command::new("osascript")
            .args(["-e", script, "--"])
            .arg(path.as_os_str())
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
            .arg("trash")
            .arg(path.as_os_str())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_traversal_in_sub_dir() {
        let mut base = PathBuf::from("exports");
        assert!(push_safe_sub_dir(&mut base, Some("../secret".to_string())).is_err());
        assert!(push_safe_sub_dir(&mut base, Some("/etc".to_string())).is_err());
    }

    #[test]
    fn allows_valid_nested_sub_dir() {
        let mut base = PathBuf::from("exports");
        assert!(push_safe_sub_dir(&mut base, Some("2026/film".to_string())).is_ok());
        assert_eq!(base, PathBuf::from("exports").join("2026").join("film"));
    }

    #[test]
    fn rejects_unsafe_filenames() {
        assert!(validate_safe_filename("").is_err());
        assert!(validate_safe_filename("..").is_err());
        assert!(validate_safe_filename("../a.jpg").is_err());
        assert!(validate_safe_filename("sub\\a.jpg").is_err());
        assert!(validate_safe_filename("photo.jpg").is_ok());
    }
}
