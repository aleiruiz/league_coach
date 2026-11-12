//! Auto-update from GitHub Releases.
//!
//! Every push to `main` publishes a signed Windows installer and a
//! `latest.json` (see `.github/workflows/ci.yml`). On launch the app asks that
//! file whether a newer version exists; the user decides when to install.
//! The installer's signature is checked against the public key in
//! `tauri.conf.json` before anything runs.

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;

/// The update found by the last check, kept until the user installs it.
#[derive(Default)]
pub struct Pending(Mutex<Option<Update>>);

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    /// What changed, from the release notes (the commit title on `main`).
    pub notes: Option<String>,
}

/// Only builds from the release workflow check: a `tauri dev` build
/// would always look outdated.
fn checks_enabled() -> bool {
    !cfg!(debug_assertions)
}

/// First non-empty line of the release notes, trimmed and capped.
pub fn short_notes(body: Option<&str>) -> Option<String> {
    let line = body?.lines().map(str::trim).find(|l| !l.is_empty())?;
    const MAX: usize = 140;
    if line.chars().count() > MAX {
        let cut: String = line.chars().take(MAX - 1).collect();
        Some(format!("{}…", cut.trim_end()))
    } else {
        Some(line.to_string())
    }
}

/// Is there a newer version? `None` when up to date (or in a dev build).
#[tauri::command]
pub async fn check_update(
    app: AppHandle,
    pending: State<'_, Pending>,
) -> Result<Option<UpdateInfo>, String> {
    if !checks_enabled() {
        return Ok(None);
    }
    let updater = app.updater().map_err(|e| e.to_string())?;
    let found = updater.check().await.map_err(|e| e.to_string())?;
    let info = found.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        notes: short_notes(u.body.as_deref()),
    });
    *pending.0.lock().await = found;
    Ok(info)
}

/// Downloads the update, checks its signature and runs the installer.
/// On Windows the installer closes the app and opens the new version.
#[tauri::command]
pub async fn install_update(app: AppHandle, pending: State<'_, Pending>) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .await
        .clone()
        .ok_or("No update to install. Check again.")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    // Reached on macOS/Linux only; Windows exits inside the installer step.
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::short_notes;

    #[test]
    fn notes_keep_the_first_line() {
        assert_eq!(
            short_notes(Some("\n  Games: load older games (#32)  \n\nmore")),
            Some("Games: load older games (#32)".into())
        );
        assert_eq!(short_notes(Some("  \n ")), None);
        assert_eq!(short_notes(None), None);
    }

    #[test]
    fn long_notes_are_cut() {
        let long = "a".repeat(300);
        let s = short_notes(Some(&long)).unwrap();
        assert_eq!(s.chars().count(), 140);
        assert!(s.ends_with('…'));
    }
}
