#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};
use url::Url;

const REPORTS: [(&str, &str); 4] = [
    ("games", "遊戲.md"),
    ("anime", "動畫.md"),
    ("movies", "電影.md"),
    ("liveAction", "真人劇年度.md"),
];
const SETTINGS_FILE: &str = "settings.json";
const BACKUP_DIR: &str = ".catchlist-backups";
const GAME_TAGS_FILENAME: &str = "遊戲標籤.json";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Report {
    media: String,
    filename: String,
    exists: bool,
    content: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarFile {
    filename: String,
    exists: bool,
    content: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    data_dir: Option<String>,
    can_undo: bool,
    reports: Vec<Report>,
    game_tags: SidecarFile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteOperation {
    media: String,
    entry_id: String,
    filepath: PathBuf,
    backup_path: PathBuf,
}

#[derive(Default)]
struct AppState {
    data_dir: Mutex<Option<PathBuf>>,
    last_delete: Mutex<Option<DeleteOperation>>,
}

fn report_filename(media: &str) -> Result<&'static str, String> {
    REPORTS
        .iter()
        .find(|(key, _)| *key == media)
        .map(|(_, file)| *file)
        .ok_or_else(|| "不支援的清單類型".to_string())
}

fn safe_directory(path: &Path) -> Result<PathBuf, String> {
    let metadata = fs::symlink_metadata(path).map_err(|_| "資料夾不存在或無法讀取")?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("資料夾不可為連結，且必須是實體資料夾".to_string());
    }
    fs::canonicalize(path).map_err(|_| "無法確認資料夾路徑".to_string())
}

fn report_path(directory: &Path, media: &str) -> Result<PathBuf, String> {
    let base = safe_directory(directory)?;
    let candidate = base.join(report_filename(media)?);
    let metadata = fs::symlink_metadata(&candidate).map_err(|_| "找不到報告檔")?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("報告檔不可為連結，且必須是一般檔案".to_string());
    }
    let canonical = fs::canonicalize(&candidate).map_err(|_| "無法確認報告檔路徑")?;
    if canonical.parent() != Some(base.as_path()) {
        return Err("報告檔路徑超出資料夾".to_string());
    }
    Ok(canonical)
}

fn has_report_files(directory: &Path) -> bool {
    let Ok(base) = safe_directory(directory) else {
        return false;
    };
    REPORTS.iter().any(|(_, filename)| {
        let candidate = base.join(filename);
        fs::symlink_metadata(candidate)
            .map(|m| m.is_file() && !m.file_type().is_symlink())
            .unwrap_or(false)
    })
}

fn optional_sidecar(directory: &Path) -> SidecarFile {
    let missing = || SidecarFile {
        filename: GAME_TAGS_FILENAME.to_string(),
        exists: false,
        content: None,
    };
    let Ok(base) = safe_directory(directory) else {
        return missing();
    };
    let candidate = base.join(GAME_TAGS_FILENAME);
    let Ok(metadata) = fs::symlink_metadata(&candidate) else {
        return missing();
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return missing();
    }
    let Ok(canonical) = fs::canonicalize(&candidate) else {
        return missing();
    };
    if canonical.parent() != Some(base.as_path()) {
        return missing();
    }
    SidecarFile {
        filename: GAME_TAGS_FILENAME.to_string(),
        exists: true,
        content: fs::read_to_string(canonical).ok(),
    }
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(SETTINGS_FILE))
        .map_err(|_| "無法取得設定資料夾".to_string())
}

fn read_saved_directory(app: &tauri::AppHandle) -> Option<PathBuf> {
    let path = settings_path(app).ok()?;
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str::<serde_json::Value>(&content)
        .ok()?
        .get("dataDir")?
        .as_str()
        .map(PathBuf::from)
        .filter(|path| has_report_files(path))
}

fn save_directory(app: &tauri::AppHandle, directory: &Path) -> Result<(), String> {
    let path = settings_path(app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "設定檔路徑不正確".to_string())?;
    fs::create_dir_all(parent).map_err(|_| "無法建立設定資料夾")?;
    atomic_write(
        &path,
        serde_json::to_string_pretty(&serde_json::json!({ "dataDir": directory }))
            .unwrap()
            .as_bytes(),
        false,
    )
}

fn atomic_write(path: &Path, content: &[u8], require_existing_file: bool) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "目標路徑不正確".to_string())?;
    match fs::symlink_metadata(path) {
        Ok(target_meta) if target_meta.file_type().is_symlink() || !target_meta.is_file() => {
            return Err("目標必須是一般檔案".to_string());
        }
        Ok(_) => {}
        Err(_) if require_existing_file => return Err("目標檔不存在或不可讀".to_string()),
        Err(_) => {}
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "系統時間不正確")?
        .as_nanos();
    let temp = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "檔名不正確".to_string())?,
        stamp
    ));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|_| "無法建立暫存檔")?;
        file.write_all(content).map_err(|_| "無法寫入暫存檔")?;
        file.sync_all().map_err(|_| "無法同步暫存檔")?;
        fs::rename(&temp, path).map_err(|_| "無法以原子方式取代報告檔")
    })();
    if temp.exists() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|error| error.to_string())
}

fn external_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "外部連結不正確")?;
    let allowed_host = matches!(
        url.host_str(),
        Some("www.google.com") | Some("store.steampowered.com") | Some("www.imdb.com")
    );
    if url.scheme() != "https"
        || !allowed_host
        || url.username() != ""
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err("外部連結不在允許範圍".to_string());
    }
    if url.host_str() == Some("www.google.com") && url.path() != "/search" {
        return Err("Google 連結必須是搜尋頁面".to_string());
    }
    if url.host_str() == Some("store.steampowered.com") && !url.path().starts_with("/app/") {
        return Err("Steam 連結必須是遊戲頁面".to_string());
    }
    if url.host_str() == Some("www.imdb.com") && !url.path().starts_with("/title/") {
        return Err("IMDb 連結必須是作品頁面".to_string());
    }
    Ok(url)
}

fn snapshot(state: &AppState) -> Result<Snapshot, String> {
    let data_dir = state
        .data_dir
        .lock()
        .map_err(|_| "程式狀態無法讀取")?
        .clone();
    let reports = data_dir
        .as_deref()
        .map(|directory| {
            REPORTS
                .iter()
                .map(|(media, filename)| {
                    let path = report_path(directory, media);
                    match path {
                        Ok(path) => Report {
                            media: media.to_string(),
                            filename: filename.to_string(),
                            exists: true,
                            content: fs::read_to_string(path).ok(),
                        },
                        Err(_) => Report {
                            media: media.to_string(),
                            filename: filename.to_string(),
                            exists: false,
                            content: None,
                        },
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    let game_tags = data_dir
        .as_deref()
        .map(optional_sidecar)
        .unwrap_or_else(|| SidecarFile {
            filename: GAME_TAGS_FILENAME.to_string(),
            exists: false,
            content: None,
        });
    Ok(Snapshot {
        data_dir: data_dir.map(|p| p.display().to_string()),
        can_undo: state
            .last_delete
            .lock()
            .map_err(|_| "程式狀態無法讀取")?
            .is_some(),
        reports,
        game_tags,
    })
}

#[tauri::command]
fn library_load(state: State<'_, AppState>) -> Result<Snapshot, String> {
    snapshot(&state)
}

#[tauri::command]
fn library_choose_directory(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Snapshot, String> {
    let selected = rfd::FileDialog::new()
        .set_title("選擇 CatchList 資料夾")
        .pick_folder();
    if let Some(selected) = selected {
        if !has_report_files(&selected) {
            return Err("這個資料夾找不到遊戲.md、動畫.md 或電影.md".to_string());
        }
        let directory = safe_directory(&selected)?;
        save_directory(&app, &directory)?;
        *state.data_dir.lock().map_err(|_| "程式狀態無法寫入")? = Some(directory);
        *state.last_delete.lock().map_err(|_| "程式狀態無法寫入")? = None;
    }
    snapshot(&state)
}

#[tauri::command]
fn library_delete_entry(
    state: State<'_, AppState>,
    media: String,
    entry_id: String,
    next_content: String,
) -> Result<Snapshot, String> {
    if entry_id.len() != 24 || !entry_id.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("作品識別碼不正確".to_string());
    }
    let directory = state
        .data_dir
        .lock()
        .map_err(|_| "程式狀態無法讀取")?
        .clone()
        .ok_or_else(|| "尚未選擇資料夾".to_string())?;
    let filepath = report_path(&directory, &media)?;
    let original = fs::read(&filepath).map_err(|_| "無法讀取報告檔")?;
    let backup_dir = directory.join(BACKUP_DIR);
    fs::create_dir_all(&backup_dir).map_err(|_| "無法建立備份資料夾")?;
    if fs::symlink_metadata(&backup_dir)
        .map_err(|_| "無法確認備份資料夾")?
        .file_type()
        .is_symlink()
    {
        return Err("備份資料夾不可為連結".to_string());
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "系統時間不正確")?
        .as_nanos();
    let backup_path = backup_dir.join(format!(
        "{}.{}.{}.bak",
        report_filename(&media)?,
        stamp,
        entry_id
    ));
    fs::write(&backup_path, original).map_err(|_| "無法寫入備份")?;
    atomic_write(&filepath, next_content.as_bytes(), true)?;
    *state.last_delete.lock().map_err(|_| "程式狀態無法寫入")? = Some(DeleteOperation {
        media,
        entry_id,
        filepath,
        backup_path,
    });
    snapshot(&state)
}

#[tauri::command]
fn library_undo_delete(state: State<'_, AppState>) -> Result<Snapshot, String> {
    let operation = state
        .last_delete
        .lock()
        .map_err(|_| "程式狀態無法讀取")?
        .clone()
        .ok_or_else(|| "沒有可復原的刪除操作".to_string())?;
    let directory = state
        .data_dir
        .lock()
        .map_err(|_| "程式狀態無法讀取")?
        .clone()
        .ok_or_else(|| "尚未選擇資料夾".to_string())?;
    if operation.filepath != report_path(&directory, &operation.media)?
        || operation.backup_path.parent() != Some(directory.join(BACKUP_DIR).as_path())
    {
        return Err("復原資料不正確".to_string());
    }
    let backup_meta =
        fs::symlink_metadata(&operation.backup_path).map_err(|_| "刪除備份已不存在")?;
    if backup_meta.file_type().is_symlink() || !backup_meta.is_file() {
        return Err("刪除備份不正確".to_string());
    }
    atomic_write(
        &operation.filepath,
        &fs::read(&operation.backup_path).map_err(|_| "無法讀取刪除備份")?,
        true,
    )?;
    *state.last_delete.lock().map_err(|_| "程式狀態無法寫入")? = None;
    snapshot(&state)
}

#[tauri::command]
fn external_open_urls(urls: Vec<String>) -> Result<bool, String> {
    if urls.len() > 250 {
        return Err("外部連結數量過多".to_string());
    }
    let mut unique = HashSet::new();
    for raw in urls {
        if unique.insert(raw.clone()) {
            open::that_detached(external_url(&raw)?.as_str()).map_err(|_| "無法開啟外部連結")?;
        }
    }
    Ok(true)
}

fn initial_directory(app: &tauri::AppHandle) -> Option<PathBuf> {
    std::env::args()
        .find_map(|arg| arg.strip_prefix("--data-dir=").map(PathBuf::from))
        .filter(|p| has_report_files(p))
        .or_else(|| {
            std::env::var_os("CATCHLIST_DATA_DIR")
                .map(PathBuf::from)
                .filter(|p| has_report_files(p))
        })
        .or_else(|| read_saved_directory(app))
        .or_else(|| {
            [
                PathBuf::from(r"G:\我的雲端硬碟\CatchList"),
                std::env::current_dir().ok()?,
            ]
            .into_iter()
            .find(|p| has_report_files(p))
        })
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            *app.state::<AppState>()
                .data_dir
                .lock()
                .map_err(|_| "程式狀態無法寫入")? = initial_directory(&app.handle());
            Ok(())
        })
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            library_load,
            library_choose_directory,
            library_delete_entry,
            library_undo_delete,
            external_open_urls
        ])
        .run(tauri::generate_context!())
        .expect("建立 Tauri 視窗失敗");
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn report_dir() -> tempfile::TempDir {
        let temp = tempdir().unwrap();
        fs::write(temp.path().join("遊戲.md"), "original").unwrap();
        temp
    }

    #[test]
    fn only_fixed_report_files_are_allowed() {
        let temp = report_dir();
        assert!(report_path(temp.path(), "games").is_ok());
        assert!(report_path(temp.path(), "../games").is_err());
        assert!(report_path(temp.path(), "anime").is_err());
    }

    #[test]
    fn links_have_exact_scheme_host_and_path_rules() {
        assert!(external_url("https://www.google.com/search?q=CatchList").is_ok());
        assert!(external_url("https://store.steampowered.com/app/123").is_ok());
        assert!(external_url("https://www.imdb.com/title/tt15146130/").is_ok());
        assert!(external_url("http://www.google.com/search?q=x").is_err());
        assert!(external_url("https://www.google.com.evil.test/search?q=x").is_err());
        assert!(external_url("https://store.steampowered.com/agecheck/app/123").is_err());
    }

    #[test]
    fn atomic_write_replaces_only_regular_file() {
        let temp = report_dir();
        let target = temp.path().join("遊戲.md");
        atomic_write(&target, b"changed", true).unwrap();
        assert_eq!(fs::read_to_string(target).unwrap(), "changed");
    }

    #[test]
    fn backup_content_can_restore_a_report() {
        let temp = report_dir();
        let target = report_path(temp.path(), "games").unwrap();
        let backups = temp.path().join(BACKUP_DIR);
        fs::create_dir(&backups).unwrap();
        let backup = backups.join("遊戲.md.test.bak");
        fs::copy(&target, &backup).unwrap();
        atomic_write(&target, b"removed entry", true).unwrap();
        atomic_write(&target, &fs::read(&backup).unwrap(), true).unwrap();
        assert_eq!(fs::read_to_string(target).unwrap(), "original");
    }

    #[test]
    fn snapshot_includes_optional_game_tags_without_blocking_reports() {
        let temp = report_dir();
        let sidecar = r#"{"version":1,"locale":"tchinese","games":{"123456":{"tags":["策略"],"fetchedAt":"2026-08-24T00:00:00.000Z"}}}"#;
        fs::write(temp.path().join("遊戲標籤.json"), sidecar).unwrap();
        let state = AppState {
            data_dir: Mutex::new(Some(fs::canonicalize(temp.path()).unwrap())),
            last_delete: Mutex::new(None),
        };

        let result = snapshot(&state).unwrap();

        assert!(result.game_tags.exists);
        assert_eq!(result.game_tags.filename, "遊戲標籤.json");
        assert_eq!(result.game_tags.content.as_deref(), Some(sidecar));
        assert_eq!(
            result.reports.iter().filter(|report| report.exists).count(),
            1
        );
        let serialized = serde_json::to_value(&result).unwrap();
        assert_eq!(serialized["gameTags"]["exists"], true);
        assert_eq!(serialized["gameTags"]["content"], sidecar);
    }

    #[test]
    fn snapshot_uses_missing_sidecar_shape_when_game_tags_do_not_exist() {
        let temp = report_dir();
        let state = AppState {
            data_dir: Mutex::new(Some(fs::canonicalize(temp.path()).unwrap())),
            last_delete: Mutex::new(None),
        };

        let result = snapshot(&state).unwrap();

        assert!(!result.game_tags.exists);
        assert_eq!(result.game_tags.filename, "遊戲標籤.json");
        assert_eq!(result.game_tags.content, None);
        assert_eq!(
            result.reports.iter().filter(|report| report.exists).count(),
            1
        );
    }
}
