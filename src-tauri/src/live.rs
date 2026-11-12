//! "Refresh" on the Game screen: fills in the champions from the champ
//! select (read from the League client on this computer) or from the game
//! already loading or in progress (Riot's official Spectator-V5 API).
//!
//! Riot policy: read only when the player presses the button (never
//! polled), never from the game process, and it never gives advice on its
//! own: it only fills the slots, and the player still asks for the build.
//! In champ select it reads only champions, the assigned position and
//! whether a teammate carries Smite (to guess roles), never
//! other players' names.

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::ddragon::{self, Cache};
use crate::i18n::tr;
use crate::riot::{self, ActiveGame, Client, RiotError};

/// What the Game screen fills in. Champions are Data Dragon ids ("Kayn").
#[derive(Debug, Default, Serialize, PartialEq)]
pub struct LiveDraft {
    /// `champ_select` or `game`.
    pub source: &'static str,
    /// The player's assigned position (champ select only): top, jungle,
    /// mid, adc, support.
    pub role: Option<&'static str>,
    pub me: Option<String>,
    pub allies: Vec<String>,
    /// Champ select only: each ally's assigned role, in the order of
    /// `allies` (None in blind pick). Empty for a game in progress, which
    /// has no positions.
    pub ally_roles: Vec<Option<&'static str>>,
    /// Whether each ally carries Smite, in the order of `allies` (a hint
    /// for guessing roles the client doesn't give).
    pub ally_smite: Vec<bool>,
    pub enemies: Vec<String>,
    /// Whether each enemy carries Smite (game in progress only: champ
    /// select hides the enemy team's spells).
    pub enemy_smite: Vec<bool>,
}

/// Summoner spell key of Smite (Data Dragon `SummonerSmite`).
const SMITE: u32 = 11;

fn has_smite(a: u32, b: u32) -> bool {
    a == SMITE || b == SMITE
}

// ---------- League client (champ select) ----------

/// The League client's local API: port and password from its `lockfile`
/// (`LeagueClient:pid:port:password:https`).
#[derive(Debug, PartialEq)]
struct Lockfile {
    port: u16,
    password: String,
}

fn parse_lockfile(text: &str) -> Option<Lockfile> {
    let parts: Vec<&str> = text.trim().split(':').collect();
    if parts.len() < 5 || parts[3].is_empty() {
        return None;
    }
    Some(Lockfile {
        port: parts[2].parse().ok()?,
        password: parts[3].to_string(),
    })
}

/// League install folders listed in Riot's `RiotClientInstalls.json`
/// (`associated_client` maps each game folder to its Riot Client).
fn dirs_from_installs(json: &str) -> Vec<PathBuf> {
    let v: serde_json::Value = serde_json::from_str(json).unwrap_or_default();
    v["associated_client"]
        .as_object()
        .map(|m| {
            m.keys()
                .filter(|k| k.contains("League of Legends"))
                .map(PathBuf::from)
                .collect()
        })
        .unwrap_or_default()
}

/// Where the League client may be installed: what Riot's own installs file
/// says first, then the default folders.
fn league_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let installs = if cfg!(windows) {
        "C:\\ProgramData\\Riot Games\\RiotClientInstalls.json"
    } else {
        "/Users/Shared/Riot Games/RiotClientInstalls.json"
    };
    if let Ok(text) = std::fs::read_to_string(installs) {
        dirs.extend(dirs_from_installs(&text));
    }
    if cfg!(windows) {
        for drive in ['C', 'D', 'E', 'F', 'G'] {
            dirs.push(PathBuf::from(format!(
                "{drive}:\\Riot Games\\League of Legends"
            )));
        }
    } else {
        dirs.push(PathBuf::from(
            "/Applications/League of Legends.app/Contents/LoL",
        ));
    }
    dirs
}

/// The running client's lockfile (it only exists while the client is open).
fn find_lockfile(dirs: &[PathBuf]) -> Option<Lockfile> {
    dirs.iter()
        .map(|d| Path::new(d).join("lockfile"))
        .find_map(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| parse_lockfile(&t))
}

#[derive(Debug, Deserialize)]
struct ChampSelect {
    #[serde(rename = "localPlayerCellId")]
    local_cell: i64,
    #[serde(rename = "myTeam", default)]
    my_team: Vec<SelectPlayer>,
    #[serde(rename = "theirTeam", default)]
    their_team: Vec<SelectPlayer>,
}

#[derive(Debug, Deserialize)]
struct SelectPlayer {
    #[serde(rename = "cellId")]
    cell: i64,
    /// 0 until a champion is picked (or revealed, for the enemy team).
    #[serde(rename = "championId", default)]
    champion: u32,
    /// The champion the player is hovering before locking in.
    #[serde(rename = "championPickIntent", default)]
    intent: u32,
    /// top, jungle, middle, bottom, utility; empty in blind pick.
    #[serde(rename = "assignedPosition", default)]
    position: String,
    #[serde(rename = "spell1Id", default)]
    spell1: u32,
    #[serde(rename = "spell2Id", default)]
    spell2: u32,
}

fn role_of(position: &str) -> Option<&'static str> {
    match position {
        "top" => Some("top"),
        "jungle" => Some("jungle"),
        "middle" => Some("mid"),
        "bottom" => Some("adc"),
        "utility" => Some("support"),
        _ => None,
    }
}

fn from_champ_select(s: &ChampSelect, name: impl Fn(u32) -> Option<String>) -> LiveDraft {
    let me = s.my_team.iter().find(|p| p.cell == s.local_cell);
    let allies: Vec<(String, Option<&'static str>, bool)> = s
        .my_team
        .iter()
        .filter(|p| p.cell != s.local_cell && p.champion != 0)
        .filter_map(|p| {
            name(p.champion).map(|c| (c, role_of(&p.position), has_smite(p.spell1, p.spell2)))
        })
        .collect();
    LiveDraft {
        source: "champ_select",
        role: me.and_then(|p| role_of(&p.position)),
        // Your own hover counts: it's what you are about to play.
        me: me.and_then(|p| {
            [p.champion, p.intent]
                .into_iter()
                .find(|&k| k != 0)
                .and_then(&name)
        }),
        allies: allies.iter().map(|(c, _, _)| c.clone()).collect(),
        ally_roles: allies.iter().map(|&(_, r, _)| r).collect(),
        ally_smite: allies.iter().map(|&(_, _, smite)| smite).collect(),
        enemies: s
            .their_team
            .iter()
            .filter(|p| p.champion != 0)
            .filter_map(|p| name(p.champion))
            .collect(),
        enemy_smite: Vec::new(),
    }
}

/// The current champ select, or `None` when the client isn't in one.
async fn champ_select(lock: &Lockfile) -> Result<Option<ChampSelect>, String> {
    // The client serves its API on 127.0.0.1 with a certificate signed by
    // Riot's own local CA (no IP name in it), so it can't be verified the
    // usual way. Only this loopback request skips the check.
    let http = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .no_proxy()
        // The local API never redirects: refuse rather than follow with the password.
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    let res = http
        .get(format!(
            "https://127.0.0.1:{}/lol-champ-select/v1/session",
            lock.port
        ))
        .basic_auth("riot", Some(&lock.password))
        .send()
        .await
        .map_err(|e| e.without_url().to_string())?;
    match res.status().as_u16() {
        404 => Ok(None),
        s if (200..300).contains(&s) => res.json().await.map(Some).map_err(|e| e.to_string()),
        s => Err(format!("League client: HTTP {s}")),
    }
}

// ---------- Riot API (game in progress) ----------

fn from_game(
    g: &ActiveGame,
    puuid: &str,
    name: impl Fn(u32) -> Option<String>,
) -> Option<LiveDraft> {
    let me = g
        .participants
        .iter()
        .find(|p| p.puuid.as_deref() == Some(puuid))?;
    let team = |same: bool| -> Vec<(String, bool)> {
        g.participants
            .iter()
            .filter(|p| !std::ptr::eq(*p, me) && (p.team_id == me.team_id) == same)
            .filter_map(|p| name(p.champion_id).map(|c| (c, has_smite(p.spell1, p.spell2))))
            .collect()
    };
    let (allies, ally_smite) = team(true).into_iter().unzip();
    let (enemies, enemy_smite) = team(false).into_iter().unzip();
    Some(LiveDraft {
        source: "game",
        role: None,
        me: name(me.champion_id),
        allies,
        ally_roles: Vec::new(),
        ally_smite,
        enemies,
        enemy_smite,
    })
}

/// The saved account's game in progress, from Spectator-V5.
async fn game_in_progress(app: &AppHandle) -> Result<Option<(ActiveGame, String)>, RiotError> {
    let mut profile = riot::load_profile(app);
    if !profile.is_complete() {
        return Err(RiotError::Other(
            tr(
                "Add your Riot ID and region in Settings.",
                "Agrega tu Riot ID y tu región en Ajustes.",
            )
            .into(),
        ));
    }
    let region = riot::find_region(&profile.region).expect("checked by is_complete");
    let client = Client::new(region)?;
    let cached = profile.puuid.clone();
    let puuid = match &cached {
        Some(p) => p.clone(),
        None => client.puuid(&profile.game_name, &profile.tag_line).await?,
    };
    let game = match client.active_game(&puuid).await {
        // A PUUID saved with another API key isn't valid for this one.
        Err(RiotError::BadRequest) if cached.is_some() => {
            let fresh = client.puuid(&profile.game_name, &profile.tag_line).await?;
            let game = client.active_game(&fresh).await?;
            profile.puuid = Some(fresh.clone());
            let _ = riot::save_profile(app, &profile);
            return Ok(game.map(|g| (g, fresh)));
        }
        other => other?,
    };
    if cached.is_none() {
        profile.puuid = Some(puuid.clone());
        let _ = riot::save_profile(app, &profile);
    }
    Ok(game.map(|g| (g, puuid)))
}

/// Reads champ select from the League client if it's in one; otherwise
/// the game in progress from Riot. Only when the player asks (Refresh).
#[tauri::command]
pub async fn current_game(app: AppHandle, cache: State<'_, Cache>) -> Result<LiveDraft, String> {
    let data = ddragon::get(&app, &cache).await?;
    let name = |key: u32| {
        data.champions
            .iter()
            .find(|c| c.key == key)
            .map(|c| c.id.clone())
    };

    let mut client_open = false;
    if let Some(lock) = find_lockfile(&league_dirs()) {
        // A client that doesn't answer (closing, updating) just falls
        // through to the Riot API.
        if let Ok(select) = champ_select(&lock).await {
            client_open = true;
            if let Some(s) = select {
                return Ok(from_champ_select(&s, name));
            }
        }
    }

    let found = tokio::time::timeout(Duration::from_secs(10), game_in_progress(&app))
        .await
        .map_err(|_| {
            tr(
                "Riot took too long to answer.",
                "Riot tardó demasiado en responder.",
            )
            .to_string()
        })?;
    match found {
        Ok(Some((g, puuid))) => from_game(&g, &puuid, name).ok_or_else(|| {
            tr(
                "Riot didn't say which player you are in this game.",
                "Riot no indicó cuál jugador eres en esta partida.",
            )
            .into()
        }),
        Ok(None) => Err(if client_open {
            tr(
                "You're not in champ select or in a game right now.",
                "No estás en selección de campeones ni en una partida ahora mismo.",
            )
        } else {
            tr(
                "You're not in a game right now, and the League client isn't open on this computer (champ select is read from it).",
                "No estás en una partida ahora mismo, y el cliente de League no está abierto en esta computadora (la selección de campeones se lee de él).",
            )
        }
        .into()),
        Err(e) => Err(e.message()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::riot::ActiveParticipant;

    fn names(k: u32) -> Option<String> {
        match k {
            141 => Some("Kayn".into()),
            121 => Some("Khazix".into()),
            103 => Some("Ahri".into()),
            122 => Some("Darius".into()),
            16 => Some("Soraka".into()),
            _ => None,
        }
    }

    #[test]
    fn reads_the_lockfile() {
        // The fourth field is the client's per-session token; any text works here.
        let lock = parse_lockfile("LeagueClient:1234:54321:token-field:https\n").unwrap();
        assert_eq!(lock.port, 54321);
        assert_eq!(lock.password, "token-field");
        assert_eq!(parse_lockfile("LeagueClient:1234:x:pw:https"), None);
        assert_eq!(parse_lockfile("garbage"), None);
    }

    #[test]
    fn finds_league_in_riot_installs() {
        let json = r#"{"associated_client":{"D:/Games/Riot Games/League of Legends/":"D:/Games/Riot Games/Riot Client/RiotClientServices.exe","C:/Riot Games/VALORANT/live/":"x"}}"#;
        assert_eq!(
            dirs_from_installs(json),
            vec![PathBuf::from("D:/Games/Riot Games/League of Legends/")]
        );
        assert!(dirs_from_installs("not json").is_empty());
    }

    #[test]
    fn champ_select_fills_me_role_allies_and_revealed_enemies() {
        let s: ChampSelect = serde_json::from_str(
            r#"{"localPlayerCellId":2,
                "myTeam":[{"cellId":0,"championId":122,"assignedPosition":"top","spell1Id":4,"spell2Id":12},
                          {"cellId":1,"championId":0,"championPickIntent":103,"assignedPosition":"middle"},
                          {"cellId":2,"championId":0,"championPickIntent":141,"assignedPosition":"jungle"}],
                "theirTeam":[{"cellId":5,"championId":121},{"cellId":6,"championId":0}]}"#,
        )
        .unwrap();
        let d = from_champ_select(&s, names);
        assert_eq!(d.source, "champ_select");
        assert_eq!(d.role, Some("jungle"));
        // My own hover counts; an ally's hover doesn't (they may change it).
        assert_eq!(d.me.as_deref(), Some("Kayn"));
        assert_eq!(d.allies, vec!["Darius"]);
        // Each ally comes with the role the client assigned them.
        assert_eq!(d.ally_roles, vec![Some("top")]);
        assert_eq!(d.ally_smite, vec![false]);
        assert_eq!(d.enemies, vec!["Khazix"]);
        // The enemy team's spells aren't shown in champ select.
        assert!(d.enemy_smite.is_empty());
    }

    #[test]
    fn game_in_progress_splits_teams_around_me() {
        let p = |team, champ, puuid: &str| ActiveParticipant {
            team_id: team,
            champion_id: champ,
            puuid: Some(puuid.into()),
            spell1: 4,
            // The enemy Kha'Zix carries Smite.
            spell2: if champ == 121 { SMITE } else { 14 },
        };
        let g = ActiveGame {
            participants: vec![
                p(100, 122, "a"),
                p(200, 121, "b"),
                p(100, 141, "me"),
                p(200, 103, "c"),
                p(100, 16, "d"),
            ],
        };
        let d = from_game(&g, "me", names).unwrap();
        assert_eq!(d.source, "game");
        assert_eq!(d.me.as_deref(), Some("Kayn"));
        assert_eq!(d.allies, vec!["Darius", "Soraka"]);
        assert_eq!(d.enemies, vec!["Khazix", "Ahri"]);
        assert_eq!(d.enemy_smite, vec![true, false]);
        assert_eq!(d.ally_smite, vec![false, false]);
        assert!(from_game(&g, "someone else", names).is_none());
    }
}
