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

const REPORTS: [(&str, &str); 3] = [
    ("games", "遊戲.md"),
    ("anime", "動畫.md"),
    ("movies", "電影.md"),
];
const SETTINGS_FILE: &str = "settings.json";
const HIDDEN_ENTRIES_FILE: &str = ".catchlist-hidden.json";

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
struct Snapshot {
    data_dir: Option<String>,
    can_undo: bool,
    reports: Vec<Report>,
    hidden_entries: Vec<HiddenEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct HiddenEntry {
    hide_key: String,
    media: String,
    title: String,
    hidden_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct HiddenRegistry {
    version: u8,
    entries: Vec<HiddenEntry>,
}

#[derive(Default)]
struct AppState {
    data_dir: Mutex<Option<PathBuf>>,
    last_hide: Mutex<Option<HiddenEntry>>,
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

fn hidden_entries_path(directory: &Path) -> Result<PathBuf, String> {
    Ok(safe_directory(directory)?.join(HIDDEN_ENTRIES_FILE))
}

fn read_hidden_entries(directory: &Path) -> Result<Vec<HiddenEntry>, String> {
    let path = hidden_entries_path(directory)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let metadata = fs::symlink_metadata(&path).map_err(|_| "無法讀取隱藏紀錄檔")?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("隱藏紀錄檔必須是一般檔案".to_string());
    }
    let registry: HiddenRegistry =
        serde_json::from_slice(&fs::read(path).map_err(|_| "無法讀取隱藏紀錄檔")?)
            .map_err(|_| "隱藏紀錄檔格式不正確")?;
    if registry.version != 1 {
        return Err("不支援的隱藏紀錄檔版本".to_string());
    }
    Ok(registry.entries)
}

fn write_hidden_entries(directory: &Path, entries: Vec<HiddenEntry>) -> Result<(), String> {
    let path = hidden_entries_path(directory)?;
    let content = serde_json::to_vec_pretty(&HiddenRegistry {
        version: 1,
        entries,
    })
    .map_err(|_| "無法建立隱藏紀錄")?;
    atomic_write(&path, &content, false)
}

fn external_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "外部連結不正確")?;
    let allowed_host = matches!(
        url.host_str(),
        Some("www.google.com") | Some("store.steampowered.com")
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
    let hidden_entries = data_dir
        .as_deref()
        .map(read_hidden_entries)
        .transpose()?
        .unwrap_or_default();
    Ok(Snapshot {
        data_dir: data_dir.map(|p| p.display().to_string()),
        can_undo: state
            .last_hide
            .lock()
            .map_err(|_| "程式狀態無法讀取")?
            .is_some(),
        reports,
        hidden_entries,
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
        *state.last_hide.lock().map_err(|_| "程式狀態無法寫入")? = None;
    }
    snapshot(&state)
}

#[tauri::command]
fn library_hide_entry(
    state: State<'_, AppState>,
    media: String,
    entry_id: String,
    hide_key: String,
    title: String,
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
    report_path(&directory, &media)?;
    if hide_key.len() > 2000 || title.len() > 500 {
        return Err("隱藏紀錄內容過長".to_string());
    }
    let expected_prefix = format!(r#"["{}","#, media);
    if !hide_key.starts_with(&expected_prefix) {
        return Err("作品隱藏識別碼不正確".to_string());
    }
    let mut entries = read_hidden_entries(&directory)?;
    if entries.iter().any(|entry| entry.hide_key == hide_key) {
        return Err("這部作品已隱藏".to_string());
    }
    let hidden_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "系統時間不正確")?
        .as_secs()
        .to_string();
    let record = HiddenEntry {
        hide_key,
        media,
        title,
        hidden_at,
    };
    entries.push(record.clone());
    write_hidden_entries(&directory, entries)?;
    *state.last_hide.lock().map_err(|_| "程式狀態無法寫入")? = Some(record);
    snapshot(&state)
}

#[tauri::command]
fn library_undo_hide(state: State<'_, AppState>) -> Result<Snapshot, String> {
    let operation = state
        .last_hide
        .lock()
        .map_err(|_| "程式狀態無法讀取")?
        .clone()
        .ok_or_else(|| "沒有可復原的隱藏操作".to_string())?;
    let directory = state
        .data_dir
        .lock()
        .map_err(|_| "程式狀態無法讀取")?
        .clone()
        .ok_or_else(|| "尚未選擇資料夾".to_string())?;
    let mut entries = read_hidden_entries(&directory)?;
    let original_len = entries.len();
    entries.retain(|entry| entry.hide_key != operation.hide_key);
    if entries.len() == original_len {
        return Err("隱藏紀錄已不存在".to_string());
    }
    write_hidden_entries(&directory, entries)?;
    *state.last_hide.lock().map_err(|_| "程式狀態無法寫入")? = None;
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
            library_hide_entry,
            library_undo_hide,
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
    fn hidden_entries_can_be_written_and_removed_without_changing_report() {
        let temp = report_dir();
        let target = report_path(temp.path(), "games").unwrap();
        let entry = HiddenEntry {
            hide_key: r#"["games","123","",0]"#.to_string(),
            media: "games".to_string(),
            title: "測試遊戲".to_string(),
            hidden_at: "1234567890".to_string(),
        };
        write_hidden_entries(temp.path(), vec![entry.clone()]).unwrap();
        assert_eq!(read_hidden_entries(temp.path()).unwrap(), vec![entry]);
        assert_eq!(fs::read_to_string(target).unwrap(), "original");
    }

    #[test]
    fn snapshot_contains_reports_without_separate_game_tags() {
        let temp = report_dir();
        let state = AppState {
            data_dir: Mutex::new(Some(fs::canonicalize(temp.path()).unwrap())),
            last_hide: Mutex::new(None),
        };

        let result = snapshot(&state).unwrap();

        assert_eq!(
            result.reports.iter().filter(|report| report.exists).count(),
            1
        );
        let serialized = serde_json::to_value(&result).unwrap();
        assert!(serialized.get("gameTags").is_none());
        assert_eq!(serialized["hiddenEntries"], serde_json::json!([]));
    }
}
