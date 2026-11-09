//! App language. English by default; Spanish only when the user picks it in
//! Settings. It drives UI-facing messages from the backend, the language the
//! coach answers in, and the Data Dragon locale.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU8, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    #[default]
    En,
    Es,
}

impl Lang {
    /// Data Dragon locale for champion, item, rune and spell names.
    pub fn locale(self) -> &'static str {
        match self {
            Lang::En => "en_US",
            Lang::Es => "es_MX",
        }
    }

    /// Instruction appended to every prompt: which language the coach answers in.
    pub fn answer_instruction(self) -> &'static str {
        match self {
            Lang::En => "Always answer in English.",
            Lang::Es => {
                "Always answer in Spanish (Latin American, as in the es_MX game client), \
                 using the Spanish in-game names."
            }
        }
    }

    /// Picks the text for this language.
    pub fn pick<T>(self, en: T, es: T) -> T {
        match self {
            Lang::En => en,
            Lang::Es => es,
        }
    }
}

static CURRENT: AtomicU8 = AtomicU8::new(0);

/// Current app language.
pub fn lang() -> Lang {
    match CURRENT.load(Ordering::Relaxed) {
        1 => Lang::Es,
        _ => Lang::En,
    }
}

/// Text for the current language: `tr("Stopped", "Detenida")`.
pub fn tr<T>(en: T, es: T) -> T {
    lang().pick(en, es)
}

fn set_current(l: Lang) {
    CURRENT.store(
        match l {
            Lang::En => 0,
            Lang::Es => 1,
        },
        Ordering::Relaxed,
    );
}

#[derive(Default, Serialize, Deserialize)]
struct SettingsFile {
    #[serde(default)]
    language: Lang,
}

fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("settings.json"))
}

/// Reads the saved language at startup (English if there is none or it can't be read).
pub fn load(app: &AppHandle) {
    let saved = settings_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str::<SettingsFile>(&t).ok())
        .unwrap_or_default();
    set_current(saved.language);
}

#[tauri::command]
pub fn get_language() -> Lang {
    lang()
}

#[tauri::command]
pub async fn set_language(
    app: AppHandle,
    cache: tauri::State<'_, crate::ddragon::Cache>,
    language: Lang,
) -> Result<(), String> {
    set_current(language);
    // Names come from Data Dragon in the chosen locale: reload on next use.
    cache.clear().await;
    let path = settings_path(&app).ok_or("No settings folder")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text =
        serde_json::to_string_pretty(&SettingsFile { language }).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn english_is_the_default() {
        assert_eq!(Lang::default(), Lang::En);
        let f: SettingsFile = serde_json::from_str("{}").unwrap();
        assert_eq!(f.language, Lang::En);
        let f: SettingsFile = serde_json::from_str(r#"{"language":"es"}"#).unwrap();
        assert_eq!(f.language, Lang::Es);
        assert_eq!(Lang::Es.locale(), "es_MX");
        assert_eq!(Lang::En.pick("a", "b"), "a");
    }
}
