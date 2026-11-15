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

/// What a preparation is about: a champion's usual build in a role, or,
/// with `opponent`, that champion's lane matchup against it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Subject<'a> {
    pub champion: &'a str,
    pub role: &'a str,
    pub opponent: Option<&'a str>,
}

pub fn key(kind: ProviderKind, data: &GameData, s: Subject) -> String {
    let mut k = format!(
        "{}|{}|{}|{}|{}",
        kind.binary(),
        data.lang.locale(),
        data.version,
        s.role,
        s.champion
    );
    if let Some(o) = s.opponent {
        k.push_str("|vs|");
        k.push_str(o);
    }
    k
}

/// Notes are usable: same patch and recent enough.
pub fn fresh(p: &Prepared, data: &GameData, now: i64) -> bool {
    p.version == data.version && !p.notes.trim().is_empty() && now - p.at < MAX_AGE_MS
}

/// The search prompt: the usual build, or the matchup, no draft.
pub fn prompt(data: &GameData, s: Subject) -> Result<String, String> {
    let get = |id: &str| {
        data.champion(id)
            .ok_or_else(|| format!("Unknown champion: {id}"))
    };
    let me = get(s.champion)?;
    if let Some(o) = s.opponent {
        return Ok(matchup_prompt(data, &me.name, &get(o)?.name, s.role));
    }
    let role = s.role;
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

fn matchup_prompt(data: &GameData, me: &str, them: &str, role: &str) -> String {
    let jungle = if role == "jungle" {
        "\n- Jungle: whose early clear and invades are stronger, and how to contest scuttle, drakes and grubs against them."
    } else {
        ""
    };
    format!(
        "CURRENT PATCH: {patch} (Data Dragon version {version}; some sites show it as {client}: it is the same patch).\n\n\
Look up the {me} vs {them} matchup ({role}) for patch {patch} on the stats sites and guides (u.gg, op.gg, Mobalytics, Lolalytics, League of Graphs…). \
Write matchup notes for a player about to play {me} against {them}:\n\
- Who is favored, and when each side spikes (levels 1-3, level 6, first item).\n\
- How to trade: which of {them}'s abilities to dodge or bait, when to all-in and when to back off.\n\
- Runes, summoner spells, starting items or items that this matchup usually changes, if any.{jungle}\n\
- Write no win rates, pick rates or game counts in the notes above. Only at the end, in a last section that starts with the line FIGURES:, list this matchup's win rate or number of games for this patch if the results show them, each with the exact URL of the page it came from. Never figures from memory.\n\
Use only patch {patch} data; discard older patches. Be concrete: ability names, levels, timers. Use the in-game names of the {locale} client. No tables. {answer_lang}",
        patch = data.patch,
        version = data.version,
        client = data.version.rsplitn(2, '.').last().unwrap_or(&data.version),
        locale = data.lang.locale(),
        answer_lang = data.lang.answer_instruction(),
    )
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
/// With `wait`, a running one is waited for. Returns the notes when ready.
async fn ensure(
    app: &AppHandle,
    prep: &Prep,
    kind: ProviderKind,
    data: &GameData,
    subject: Subject<'_>,
    wait: bool,
) -> Result<Option<Prepared>, String> {
    let key = key(kind, data, subject);
    if let Some(p) = saved(app, &key, data) {
        return Ok(Some(p));
    }
    // Either the preparation already running, or ours, locked before anyone
    // else can see it so a waiter never slips in ahead of the search.
    let started = {
        let mut running = prep.running.lock().unwrap();
        match running.get(&key) {
            Some((_, lock)) => Err(lock.clone()),
            None => {
                let lock = Arc::new(tokio::sync::Mutex::new(()));
                let guard = lock.clone().try_lock_owned().expect("new lock");
                running.insert(key.clone(), (Instant::now(), lock));
                Ok(guard)
            }
        }
    };
    let guard = match started {
        Ok(guard) => guard,
        Err(_) if !wait => return Ok(None),
        Err(lock) => {
            let _done = lock.lock().await;
            return Ok(saved(app, &key, data));
        }
    };
    let result = search(app, kind, data, subject).await;
    let stored = match result {
        Ok(p) => store(app, prep, key.clone(), p.clone()).map(|_| Some(p)),
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
    subject: Subject<'_>,
) -> Result<Prepared, String> {
    let prompt = prompt(data, subject)?;
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
    subject: Subject<'_>,
    cancel: &mut tokio::sync::oneshot::Receiver<()>,
) -> Result<Option<Prepared>, String> {
    let key = key(kind, data, subject);
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

/// Matchup notes for the player to read: figures (win rate, pick rate,
/// games) are only shown on the build card, where they are checked against
/// the search's URLs. Drops the FIGURES section the prompt asks for, and any
/// other line that still names a rate.
pub fn without_figures(notes: &str) -> String {
    const RATES: [&str; 8] = [
        "win rate",
        "winrate",
        "pick rate",
        "ban rate",
        "tasa de victoria",
        "% de victorias",
        "porcentaje de victoria",
        "partidas analizadas",
    ];
    notes
        .lines()
        .take_while(|l| {
            let t = l.trim_start_matches(['#', '*', ' ']).to_lowercase();
            !(t.starts_with("figures") || t.starts_with("cifras"))
        })
        .filter(|l| {
            let l = l.to_lowercase();
            !RATES.iter().any(|r| l.contains(r))
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

/// The Data Dragon id for a champion name or id, ignoring case: match
/// history names differ from Data Dragon ids only in case (FiddleSticks /
/// Fiddlesticks), and the key uses the Data Dragon id.
fn champion_id(data: &GameData, name: &str) -> Result<String, String> {
    data.champions
        .iter()
        .find(|c| c.id.eq_ignore_ascii_case(name))
        .map(|c| c.id.clone())
        .ok_or_else(|| format!("Unknown champion: {name}"))
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
    let id = champion_id(&data, &champion)?;
    let subject = Subject {
        champion: &id,
        role: &role,
        opponent: None,
    };
    Ok(ensure(&app, &prep, kind, &data, subject, false)
        .await?
        .is_some())
}

/// Matchup notes for `champion` against `opponent` in `role`: saved ones, or
/// a new search (or the one already running), waited for. Next game calls it
/// as soon as both laners are known, and again to show the notes under the
/// build when they are ready.
#[tauri::command]
pub async fn matchup_notes(
    app: AppHandle,
    cache: State<'_, ddragon::Cache>,
    prep: State<'_, Prep>,
    kind: ProviderKind,
    champion: String,
    role: String,
    opponent: String,
) -> Result<Option<String>, String> {
    if !ROLES.contains(&role.as_str()) {
        return Err(format!("Unknown role: {role}"));
    }
    let data = ddragon::get(&app, &cache).await?;
    let (id, them) = (
        champion_id(&data, &champion)?,
        champion_id(&data, &opponent)?,
    );
    if id == them {
        return Ok(None);
    }
    let subject = Subject {
        champion: &id,
        role: &role,
        opponent: Some(&them),
    };
    Ok(ensure(&app, &prep, kind, &data, subject, true)
        .await?
        .map(|p| without_figures(&p.notes)))
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
    fn matchup_notes_shown_to_the_player_carry_no_figures() {
        let notes = "## Who's favored\n- Warwick wins levels 1-3.\n- Kayn has a 48.2% win rate here.\n- His W slows 30%.\n\n**FIGURES:**\n- Win rate 48.2% (https://u.gg/x)";
        let shown = without_figures(notes);
        assert!(shown.contains("Warwick wins levels 1-3"));
        assert!(shown.contains("slows 30%"));
        assert!(!shown.contains("48.2"));
        assert!(!shown.contains("u.gg"));
        assert_eq!(
            without_figures("Tasa de victoria: 51%\nJuega seguro."),
            "Juega seguro."
        );
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
        let jax = |role| Subject {
            champion: "Jax",
            role,
            opponent: None,
        };
        let a = key(ProviderKind::ClaudeCode, &data, jax("top"));
        assert_ne!(a, key(ProviderKind::Codex, &data, jax("top")));
        assert_ne!(a, key(ProviderKind::ClaudeCode, &data, jax("jungle")));
        let vs = Subject {
            opponent: Some("Darius"),
            ..jax("top")
        };
        assert_ne!(a, key(ProviderKind::ClaudeCode, &data, vs));
        assert!(a.contains(&data.version) && a.contains(data.lang.locale()));
    }

    #[test]
    fn prompt_names_champion_role_and_patch_and_refuses_unknown() {
        let data = fixtures::data();
        let (a, b) = (&data.champions[0], &data.champions[1]);
        let base = Subject {
            champion: &a.id,
            role: "mid",
            opponent: None,
        };
        let p = prompt(&data, base).unwrap();
        assert!(p.contains(&format!("{} mid build for patch {}", a.name, data.patch)));
        assert!(p.contains("Never figures from memory"));
        let vs = Subject {
            opponent: Some(&b.id),
            ..base
        };
        let m = prompt(&data, vs).unwrap();
        assert!(m.contains(&format!(
            "{} vs {} matchup (mid) for patch {}",
            a.name, b.name, data.patch
        )));
        assert!(m.contains("Never figures from memory"));
        assert!(!m.contains("Jungle:"));
        assert!(
            prompt(
                &data,
                Subject {
                    role: "jungle",
                    ..vs
                }
            )
            .unwrap()
            .contains("Jungle:")
        );
        let unknown = Subject {
            champion: "NotAChamp",
            ..base
        };
        assert!(prompt(&data, unknown).is_err());
        assert!(
            prompt(
                &data,
                Subject {
                    opponent: Some("NotAChamp"),
                    ..base
                }
            )
            .is_err()
        );
    }
}
