//! Builds prepared ahead of time. The slowest part of Get build is the web
//! search for the champion's usual build (about half of the wait). That part
//! doesn't depend on the draft, so it can run before the player asks: when
//! they pick their champion in Next game, or for their mains when the app
//! opens. Get build then starts from these notes and skips the search.
//!
//! Notes are kept per AI, language, patch, role and champion, and for a few
//! days at most: a new patch or stale stats mean a new search.

use std::collections::HashMap;
use std::fmt::Write as _;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::ddragon::{self, GameData};
use crate::providers::{self, Collected, ProviderKind};

pub const ROLES: &[&str] = &["top", "jungle", "mid", "adc", "support"];

/// Stats sites update during a patch: notes older than this are searched again.
const MAX_AGE_MS: i64 = 3 * 24 * 60 * 60 * 1000;

/// Same margin as the build's own search step.
const TIMEOUT: Duration = Duration::from_secs(360);

/// Get build waits for a preparation already running only if it started at
/// least this long ago (so it is close to done). A younger one is left to
/// finish in the background and Get build searches by itself, which is
/// faster than waiting for a search that just started.
const WAIT_IF_STARTED: Duration = Duration::from_secs(20);

/// Base build notes for one champion in one role.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Prepared {
    /// What the search found: runes, items, skills, spikes (free text).
    pub notes: String,
    /// URLs the search returned: valid sources for the card's figures.
    pub sources: Vec<String>,
    /// Data Dragon version the notes were written for.
    pub version: String,
    /// When they were written (ms since the epoch).
    pub at: i64,
}

/// When a preparation started, and the lock it holds until it is saved.
type Running = (Instant, Arc<tokio::sync::Mutex<()>>);

/// Preparations running now, by key (to never run the same one twice, and
/// to let Get build wait for one that is almost done).
#[derive(Default)]
pub struct Prep {
    running: Mutex<HashMap<String, Running>>,
    /// Serializes writes to the notes file.
    file: Mutex<()>,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

pub fn key(kind: ProviderKind, data: &GameData, role: &str, champion: &str) -> String {
    format!(
        "{}|{}|{}|{}|{}",
        kind.binary(),
        data.lang.locale(),
        data.version,
        role,
        champion
    )
}

/// Notes are usable: same patch and recent enough.
pub fn fresh(p: &Prepared, data: &GameData, now: i64) -> bool {
    p.version == data.version && !p.notes.trim().is_empty() && now - p.at < MAX_AGE_MS
}

/// The search prompt: the usual build of `champion` in `role`, no draft.
pub fn prompt(data: &GameData, champion: &str, role: &str) -> Result<String, String> {
    let me = data
        .champion(champion)
        .ok_or_else(|| format!("Unknown champion: {champion}"))?;
    let mut p = String::new();
    let _ = writeln!(
        p,
        "CURRENT PATCH: {patch} (Data Dragon version {version}; some sites show it as {client}: it is the same patch).\n\n\
Look up the {name} {role} build for patch {patch} on the stats sites (u.gg, op.gg, Mobalytics, Lolalytics…). \
Write short notes that another coach will use later to prepare a build for a specific game:\n\
- The most played full rune page with shards, and a second page if it is common.\n\
- 2 summoner spells, starting items, the 3 core items in order, boots, skill order.\n\
- The usual situational items and when each one is bought.\n\
- {name}'s power spikes and the usual game plan, in 3 short lines.\n\
- If the results show win rate, pick rate or number of games for this patch, write each figure with the exact URL of the page it came from. Never figures from memory.\n\
Use only patch {patch} data; discard older patches. Use the in-game names of the {locale} client. No tables. {answer_lang}",
        patch = data.patch,
        version = data.version,
        client = data.version.rsplitn(2, '.').last().unwrap_or(&data.version),
        name = me.name,
        role = role,
        locale = data.lang.locale(),
        answer_lang = data.lang.answer_instruction(),
    );
    Ok(p)
}

// ---------- saved notes ----------

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("prepared-builds.json"))
}

fn load(app: &AppHandle) -> HashMap<String, Prepared> {
    path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn store(app: &AppHandle, prep: &Prep, key: String, p: Prepared) -> Result<(), String> {
    let _guard = prep.file.lock().unwrap_or_else(|e| e.into_inner());
    let mut all = load(app);
    // Older patches are never used again: drop them so the file stays small.
    all.retain(|_, old| old.version == p.version);
    all.insert(key, p);
    let path = path(app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string(&all).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(tmp, path).map_err(|e| e.to_string())
}

fn saved(app: &AppHandle, key: &str, data: &GameData) -> Option<Prepared> {
    load(app).remove(key).filter(|p| fresh(p, data, now_ms()))
}

// ---------- running a preparation ----------

/// Runs the search unless fresh notes exist or the same one is running.
/// Returns whether notes are ready.
async fn ensure(
    app: &AppHandle,
    prep: &Prep,
    kind: ProviderKind,
    data: &GameData,
    role: &str,
    champion: &str,
) -> Result<bool, String> {
    let key = key(kind, data, role, champion);
    if saved(app, &key, data).is_some() {
        return Ok(true);
    }
    let lock = {
        let mut running = prep.running.lock().unwrap();
        if running.contains_key(&key) {
            return Ok(false);
        }
        let lock = Arc::new(tokio::sync::Mutex::new(()));
        running.insert(key.clone(), (Instant::now(), lock.clone()));
        lock
    };
    let guard = lock.lock().await;
    let result = search(app, kind, data, role, champion).await;
    let stored = match result {
        Ok(p) => store(app, prep, key.clone(), p).map(|_| true),
        Err(e) => Err(e),
    };
    drop(guard);
    prep.running.lock().unwrap().remove(&key);
    stored
}

async fn search(
    app: &AppHandle,
    kind: ProviderKind,
    data: &GameData,
    role: &str,
    champion: &str,
) -> Result<Prepared, String> {
    let prompt = prompt(data, champion, role)?;
    let collected = Mutex::new(Collected::default());
    let send = |ev: providers::ChatEvent| collected.lock().unwrap().push(&ev);
    providers::run(app, kind, &prompt, None, TIMEOUT, None, &send).await?;
    let c = collected.into_inner().unwrap();
    if let Some(e) = c.error {
        return Err(e);
    }
    let notes = c.text.trim().to_string();
    if notes.is_empty() {
        return Err("The AI returned no notes.".into());
    }
    Ok(Prepared {
        notes,
        sources: c.sources,
        version: data.version.clone(),
        at: now_ms(),
    })
}

/// Notes for Get build: saved ones, or the ones a preparation that is almost
/// done is writing (waits for it, or until `cancel` fires). `None`: Get build
/// searches by itself.
pub async fn for_build(
    app: &AppHandle,
    prep: &Prep,
    kind: ProviderKind,
    data: &GameData,
    role: &str,
    champion: &str,
    cancel: &mut tokio::sync::oneshot::Receiver<()>,
) -> Result<Option<Prepared>, String> {
    let key = key(kind, data, role, champion);
    if let Some(p) = saved(app, &key, data) {
        return Ok(Some(p));
    }
    let running = prep.running.lock().unwrap().get(&key).cloned();
    let Some((started, lock)) = running else {
        return Ok(None);
    };
    if started.elapsed() < WAIT_IF_STARTED {
        return Ok(None);
    }
    tokio::select! {
        _ = lock.lock() => Ok(saved(app, &key, data)),
        _ = cancel => Err(providers::stopped_message().to_string()),
    }
}

/// Prepares the base build of `champion` in `role` in the background. The UI
/// calls it when the player picks their champion, and for their mains when
/// the app opens. `true`: notes are ready; `false`: one is already running.
#[tauri::command]
pub async fn prepare_build(
    app: AppHandle,
    cache: State<'_, ddragon::Cache>,
    prep: State<'_, Prep>,
    kind: ProviderKind,
    champion: String,
    role: String,
) -> Result<bool, String> {
    if !ROLES.contains(&role.as_str()) {
        return Err(format!("Unknown role: {role}"));
    }
    let data = ddragon::get(&app, &cache).await?;
    // Match history names differ from Data Dragon ids only in case
    // (FiddleSticks / Fiddlesticks): the key uses the Data Dragon id.
    let id = data
        .champions
        .iter()
        .find(|c| c.id.eq_ignore_ascii_case(&champion))
        .map(|c| c.id.clone())
        .ok_or_else(|| format!("Unknown champion: {champion}"))?;
    ensure(&app, &prep, kind, &data, &role, &id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ddragon::fixtures;

    fn notes(version: &str, at: i64) -> Prepared {
        Prepared {
            notes: "Conqueror…".into(),
            sources: vec![],
            version: version.into(),
            at,
        }
    }

    #[test]
    fn notes_expire_with_the_patch_and_after_a_few_days() {
        let data = fixtures::data();
        let now = 10 * MAX_AGE_MS;
        assert!(fresh(&notes(&data.version, now - 1000), &data, now));
        assert!(!fresh(&notes("0.0.1", now - 1000), &data, now));
        assert!(!fresh(&notes(&data.version, now - MAX_AGE_MS), &data, now));
        let mut empty = notes(&data.version, now);
        empty.notes = "  ".into();
        assert!(!fresh(&empty, &data, now));
    }

    #[test]
    fn key_separates_ai_language_patch_role_and_champion() {
        let data = fixtures::data();
        let a = key(ProviderKind::ClaudeCode, &data, "top", "Jax");
        assert_ne!(a, key(ProviderKind::Codex, &data, "top", "Jax"));
        assert_ne!(a, key(ProviderKind::ClaudeCode, &data, "jungle", "Jax"));
        assert!(a.contains(&data.version) && a.contains(data.lang.locale()));
    }

    #[test]
    fn prompt_names_champion_role_and_patch_and_refuses_unknown() {
        let data = fixtures::data();
        let id = &data.champions[0].id;
        let p = prompt(&data, id, "mid").unwrap();
        assert!(p.contains(&format!(
            "{} mid build for patch {}",
            data.champions[0].name, data.patch
        )));
        assert!(p.contains("Never figures from memory"));
        assert!(prompt(&data, "NotAChamp", "mid").is_err());
    }
}
