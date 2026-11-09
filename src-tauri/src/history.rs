//! Post-game review: reads the player's finished games from Riot's Match-V5
//! API, computes the same numbers for every game (deterministic, in Rust),
//! and asks the model for the three pain points worth working on.
//!
//! Riot allows analysis after the game ("play first, analyze later"); nothing
//! here reads a game in progress. Numbers are compared only with the player's
//! own trend and with their lane opponents in those games, never with
//! made-up averages per rank.

use std::collections::{HashMap, HashSet};
use std::fmt::Write as _;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::ddragon;
use crate::i18n::tr;
use crate::providers::{self, ChatEvent, ProviderKind, Running};
use crate::riot::{self, Profile, RiotError};

/// Summoner's Rift queues worth reviewing: normal draft, ranked solo/duo,
/// normal blind, ranked flex, Swiftplay and Quickplay.
const RIFT_QUEUES: &[u32] = &[400, 420, 430, 440, 480, 490];
/// How many recent game ids each sync asks Riot for.
const FETCH_COUNT: u32 = 20;
/// Games kept in the local cache and shown in "My progress".
const KEEP_GAMES: usize = 40;
/// Games the model reviews (most recent first).
const REVIEW_GAMES: usize = 20;
/// Fewer games than this aren't a pattern.
pub const MIN_GAMES: usize = 3;
const EARLY_GAME_MS: i64 = 14 * 60_000;
/// A team gold lead at 15 minutes this big that ends in a loss.
const THROWN_LEAD_GOLD: i32 = 1500;

// ---------- Riot payloads (only the fields used) ----------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchDto {
    metadata: MatchMeta,
    info: MatchInfo,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MatchMeta {
    match_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MatchInfo {
    /// Seconds (games after patch 11.20).
    game_duration: u64,
    #[serde(default)]
    game_end_timestamp: i64,
    #[serde(default)]
    queue_id: u32,
    #[serde(default)]
    map_id: u32,
    participants: Vec<ParticipantDto>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ParticipantDto {
    puuid: String,
    participant_id: u32,
    team_id: u32,
    champion_name: String,
    team_position: String,
    win: bool,
    kills: u32,
    deaths: u32,
    assists: u32,
    total_minions_killed: u32,
    neutral_minions_killed: u32,
    vision_score: f32,
    wards_placed: u32,
    wards_killed: u32,
    vision_wards_bought_in_game: u32,
    total_damage_dealt_to_champions: u64,
    game_ended_in_early_surrender: bool,
}

#[derive(Deserialize)]
pub struct TimelineDto {
    info: TimelineInfo,
}

#[derive(Deserialize)]
struct TimelineInfo {
    frames: Vec<Frame>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Frame {
    #[serde(default)]
    participant_frames: HashMap<String, ParticipantFrame>,
    #[serde(default)]
    events: Vec<Event>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ParticipantFrame {
    total_gold: i32,
    minions_killed: i32,
    jungle_minions_killed: i32,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Event {
    #[serde(rename = "type")]
    kind: String,
    timestamp: i64,
    killer_id: u32,
    victim_id: u32,
    assisting_participant_ids: Vec<u32>,
    participant_id: u32,
    item_id: u32,
}

// ---------- per-game numbers ----------

/// The numbers of one game, for the player. `None` when the data to compute
/// it isn't there (no timeline, game shorter than the minute, no lane opponent).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct GameStats {
    pub id: String,
    /// Unix time in ms.
    pub ended_at: i64,
    pub queue_id: u32,
    pub minutes: f32,
    pub champion: String,
    /// TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY (or empty).
    pub role: String,
    pub win: bool,
    pub kills: u32,
    pub deaths: u32,
    pub assists: u32,
    pub kill_participation: f32,
    pub cs_per_min: f32,
    pub cs_at_10: Option<i32>,
    pub opponent: Option<String>,
    pub cs_diff_10: Option<i32>,
    pub gold_diff_15: Option<i32>,
    pub team_gold_diff_15: Option<i32>,
    pub vision_per_min: f32,
    pub wards_placed: u32,
    pub wards_killed: u32,
    pub control_wards: u32,
    pub damage_share: f32,
    /// Deaths before 14:00.
    pub early_deaths: Option<u32>,
    /// Deaths with no enemy assist (caught alone by one champion).
    pub solo_deaths: Option<u32>,
    /// Minute of each death.
    pub death_minutes: Vec<f32>,
    /// Minute the first legendary item was bought.
    pub first_item_min: Option<f32>,
}

impl GameStats {
    /// The team was ahead at 15 minutes and lost.
    pub fn threw_lead(&self) -> bool {
        !self.win
            && self
                .team_gold_diff_15
                .is_some_and(|d| d >= THROWN_LEAD_GOLD)
    }
}

fn round1(x: f32) -> f32 {
    (x * 10.0).round() / 10.0
}

fn round2(x: f32) -> f32 {
    (x * 100.0).round() / 100.0
}

/// Whether a game is worth reviewing, and if so the player's numbers in it.
/// Remakes, other maps and modes are skipped.
pub fn compute(
    m: &MatchDto,
    timeline: Option<&TimelineDto>,
    puuid: &str,
    legendary: &HashSet<u32>,
) -> Option<GameStats> {
    let info = &m.info;
    if info.map_id != 11 || !RIFT_QUEUES.contains(&info.queue_id) {
        return None;
    }
    let me = info.participants.iter().find(|p| p.puuid == puuid)?;
    if me.game_ended_in_early_surrender || info.game_duration < 5 * 60 {
        return None;
    }
    let minutes = info.game_duration as f32 / 60.0;
    let team: Vec<&ParticipantDto> = info
        .participants
        .iter()
        .filter(|p| p.team_id == me.team_id)
        .collect();
    let team_kills: u32 = team.iter().map(|p| p.kills).sum();
    let team_damage: u64 = team.iter().map(|p| p.total_damage_dealt_to_champions).sum();
    let opponent = (!me.team_position.is_empty())
        .then(|| {
            info.participants
                .iter()
                .find(|p| p.team_id != me.team_id && p.team_position == me.team_position)
        })
        .flatten();

    let cs = me.total_minions_killed + me.neutral_minions_killed;
    let mut s = GameStats {
        id: m.metadata.match_id.clone(),
        ended_at: info.game_end_timestamp,
        queue_id: info.queue_id,
        minutes: round1(minutes),
        champion: me.champion_name.clone(),
        role: me.team_position.clone(),
        win: me.win,
        kills: me.kills,
        deaths: me.deaths,
        assists: me.assists,
        kill_participation: if team_kills == 0 {
            0.0
        } else {
            round2((me.kills + me.assists) as f32 / team_kills as f32)
        },
        cs_per_min: round1(cs as f32 / minutes),
        opponent: opponent.map(|o| o.champion_name.clone()),
        vision_per_min: round2(me.vision_score / minutes),
        wards_placed: me.wards_placed,
        wards_killed: me.wards_killed,
        control_wards: me.vision_wards_bought_in_game,
        damage_share: if team_damage == 0 {
            0.0
        } else {
            round2(me.total_damage_dealt_to_champions as f32 / team_damage as f32)
        },
        ..Default::default()
    };

    let Some(tl) = timeline else {
        return Some(s);
    };
    let frames = &tl.info.frames;
    // Frames are one per minute: frame N is minute N.
    let at = |minute: usize, pid: u32| {
        frames
            .get(minute)
            .and_then(|f| f.participant_frames.get(&pid.to_string()))
    };
    let cs_of = |f: &ParticipantFrame| f.minions_killed + f.jungle_minions_killed;
    let me_id = me.participant_id;
    s.cs_at_10 = at(10, me_id).map(cs_of);
    if let Some(o) = opponent {
        s.cs_diff_10 = at(10, me_id)
            .zip(at(10, o.participant_id))
            .map(|(a, b)| cs_of(a) - cs_of(b));
        s.gold_diff_15 = at(15, me_id)
            .zip(at(15, o.participant_id))
            .map(|(a, b)| a.total_gold - b.total_gold);
    }
    s.team_gold_diff_15 = frames.get(15).map(|f| {
        info.participants
            .iter()
            .map(|p| {
                let g = f
                    .participant_frames
                    .get(&p.participant_id.to_string())
                    .map_or(0, |pf| pf.total_gold);
                if p.team_id == me.team_id { g } else { -g }
            })
            .sum()
    });

    let events = frames.iter().flat_map(|f| f.events.iter());
    let mut early = 0;
    let mut solo = 0;
    for e in events.clone() {
        if e.kind == "CHAMPION_KILL" && e.victim_id == me_id {
            if e.timestamp < EARLY_GAME_MS {
                early += 1;
            }
            // killer 0 = tower or minions: not "caught by a champion".
            if e.killer_id != 0 && e.assisting_participant_ids.is_empty() {
                solo += 1;
            }
            s.death_minutes.push(round1(e.timestamp as f32 / 60_000.0));
        }
    }
    s.early_deaths = Some(early);
    s.solo_deaths = Some(solo);
    s.first_item_min = events
        .filter(|e| {
            e.kind == "ITEM_PURCHASED"
                && e.participant_id == me_id
                && legendary.contains(&e.item_id)
        })
        .map(|e| round1(e.timestamp as f32 / 60_000.0))
        .next();
    Some(s)
}

/// Legendary (finished, non-boots) item ids, to time the first item.
pub fn legendary_items(data: &ddragon::GameData) -> HashSet<u32> {
    data.items
        .iter()
        .filter(|i| {
            i.completed && !i.starter && i.gold >= 2000 && !i.tags.iter().any(|t| t == "Boots")
        })
        .filter_map(|i| i.id.parse().ok())
        .collect()
}

// ---------- summary ----------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Averages {
    pub games: usize,
    pub win_rate: Option<f32>,
    pub cs_per_min: Option<f32>,
    pub cs_at_10: Option<f32>,
    pub cs_diff_10: Option<f32>,
    pub gold_diff_15: Option<f32>,
    pub kill_participation: Option<f32>,
    pub deaths: Option<f32>,
    pub early_deaths: Option<f32>,
    pub solo_deaths: Option<f32>,
    pub vision_per_min: Option<f32>,
    pub control_wards: Option<f32>,
    pub damage_share: Option<f32>,
    pub first_item_min: Option<f32>,
}

fn mean(xs: impl Iterator<Item = Option<f32>>) -> Option<f32> {
    let (sum, n) = xs.flatten().fold((0.0, 0), |(s, n), x| (s + x, n + 1));
    (n > 0).then(|| round2(sum / n as f32))
}

pub fn averages(games: &[GameStats]) -> Averages {
    let m = |f: fn(&GameStats) -> Option<f32>| mean(games.iter().map(f));
    Averages {
        games: games.len(),
        win_rate: m(|g| Some(if g.win { 1.0 } else { 0.0 })),
        cs_per_min: m(|g| Some(g.cs_per_min)),
        cs_at_10: m(|g| g.cs_at_10.map(|x| x as f32)),
        cs_diff_10: m(|g| g.cs_diff_10.map(|x| x as f32)),
        gold_diff_15: m(|g| g.gold_diff_15.map(|x| x as f32)),
        kill_participation: m(|g| Some(g.kill_participation)),
        deaths: m(|g| Some(g.deaths as f32)),
        early_deaths: m(|g| g.early_deaths.map(|x| x as f32)),
        solo_deaths: m(|g| g.solo_deaths.map(|x| x as f32)),
        vision_per_min: m(|g| Some(g.vision_per_min)),
        control_wards: m(|g| Some(g.control_wards as f32)),
        damage_share: m(|g| Some(g.damage_share)),
        first_item_min: m(|g| g.first_item_min),
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Count {
    pub name: String,
    pub games: usize,
    pub wins: usize,
}

fn counts(games: &[GameStats], key: fn(&GameStats) -> &str) -> Vec<Count> {
    let mut out: Vec<Count> = Vec::new();
    for g in games {
        let k = key(g);
        if k.is_empty() {
            continue;
        }
        match out.iter_mut().find(|c| c.name == k) {
            Some(c) => {
                c.games += 1;
                c.wins += g.win as usize;
            }
            None => out.push(Count {
                name: k.to_string(),
                games: 1,
                wins: g.win as usize,
            }),
        }
    }
    out.sort_by_key(|c| std::cmp::Reverse(c.games));
    out
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Summary {
    pub all: Averages,
    /// Last 5 games vs. the ones before: is it getting better or worse?
    pub recent: Averages,
    pub earlier: Averages,
    pub roles: Vec<Count>,
    pub champions: Vec<Count>,
    /// Games behind the lane opponent in CS at 10, out of games with an opponent.
    pub behind_at_10: (usize, usize),
    /// Refs (G1 = most recent) of games lost after leading at 15.
    pub thrown_leads: Vec<String>,
}

/// "G1" is the most recent game.
pub fn game_ref(i: usize) -> String {
    format!("G{}", i + 1)
}

/// `games` is newest first.
pub fn summarize(games: &[GameStats]) -> Summary {
    let split = games.len().min(5);
    let with_opp: Vec<i32> = games.iter().filter_map(|g| g.cs_diff_10).collect();
    Summary {
        all: averages(games),
        recent: averages(&games[..split]),
        earlier: averages(&games[split..]),
        roles: counts(games, |g| &g.role),
        champions: counts(games, |g| &g.champion).into_iter().take(5).collect(),
        behind_at_10: (with_opp.iter().filter(|d| **d < 0).count(), with_opp.len()),
        thrown_leads: games
            .iter()
            .enumerate()
            .filter(|(_, g)| g.threw_lead())
            .map(|(i, _)| game_ref(i))
            .collect(),
    }
}

// ---------- prompt and report ----------

fn opt<T: std::fmt::Display>(x: Option<T>) -> String {
    x.map_or_else(|| "n/a".to_string(), |v| v.to_string())
}

fn signed(x: Option<i32>) -> String {
    x.map_or_else(|| "n/a".to_string(), |v| format!("{v:+}"))
}

fn queue_name(q: u32) -> &'static str {
    match q {
        420 => "Ranked Solo/Duo",
        440 => "Ranked Flex",
        400 => "Normal Draft",
        430 => "Normal Blind",
        480 => "Swiftplay",
        490 => "Quickplay",
        _ => "Other",
    }
}

fn averages_line(a: &Averages) -> String {
    format!(
        "games {}, win rate {}, CS/min {}, CS@10 {}, CS diff@10 vs lane opponent {}, gold diff@15 vs lane opponent {}, \
         kill participation {}, deaths {}, deaths before 14:00 {}, solo deaths {}, vision score/min {}, \
         control wards bought {}, team damage share {}, first legendary item at minute {}",
        a.games,
        opt(a.win_rate),
        opt(a.cs_per_min),
        opt(a.cs_at_10),
        opt(a.cs_diff_10),
        opt(a.gold_diff_15),
        opt(a.kill_participation),
        opt(a.deaths),
        opt(a.early_deaths),
        opt(a.solo_deaths),
        opt(a.vision_per_min),
        opt(a.control_wards),
        opt(a.damage_share),
        opt(a.first_item_min),
    )
}

/// The review request. Always in English; the coach system prompt sets the
/// language of the answer. `games` is newest first.
pub fn review_prompt(riot_id: &str, games: &[GameStats]) -> String {
    let s = summarize(games);
    let mut p = String::new();
    let _ = writeln!(
        p,
        "Post-game review. These are the last {} finished Summoner's Rift games of the player {riot_id}, \
         computed by the app from Riot's official match data (Match-V5). G1 is the most recent game.",
        games.len()
    );
    p.push_str(
        "\nFind the 3 pain points that would most improve this player's results, ordered by impact.\n\
         Rules:\n\
         - Use only the numbers below. Don't search the web.\n\
         - Don't compare with rank averages, pro players or benchmarks you don't have here. Compare only with \
           the player's own games (their trend, their best and worst games) and with their lane opponents in \
           these games (the \"diff\" numbers).\n\
         - Prefer patterns that repeat across several games over a single bad game.\n\
         - Each pain point must cite the exact numbers and the games (G refs) that show it.\n\
         - The drill is something concrete to practice in the next games (one focus, how to do it). \
           The target uses the same metric, is measurable, and is reachable from their current numbers.\n\
         - Consider the role and champions: a support isn't judged on CS, a jungler's CS diff is against the \
           enemy jungler.\n\
         - Also name one real strength, with its numbers.\n",
    );

    let _ = writeln!(p, "\nAverages over all games: {}", averages_line(&s.all));
    if s.earlier.games > 0 {
        let _ = writeln!(
            p,
            "Last {} games: {}",
            s.recent.games,
            averages_line(&s.recent)
        );
        let _ = writeln!(p, "Games before those: {}", averages_line(&s.earlier));
    }
    let list = |cs: &[Count]| {
        cs.iter()
            .map(|c| format!("{} ({} games, {} wins)", c.name, c.games, c.wins))
            .collect::<Vec<_>>()
            .join(", ")
    };
    let _ = writeln!(p, "Roles: {}", list(&s.roles));
    let _ = writeln!(p, "Most played champions: {}", list(&s.champions));
    let _ = writeln!(
        p,
        "Behind the lane opponent in CS at 10: {} of {} games",
        s.behind_at_10.0, s.behind_at_10.1
    );
    if !s.thrown_leads.is_empty() {
        let _ = writeln!(
            p,
            "Lost after the team led by {THROWN_LEAD_GOLD}+ gold at 15:00: {}",
            s.thrown_leads.join(", ")
        );
    }

    p.push_str("\nGames:\n");
    for (i, g) in games.iter().enumerate() {
        let deaths = g
            .death_minutes
            .iter()
            .map(|m| m.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        let _ = writeln!(
            p,
            "{} | {} | {} {} vs {} | {} | {} min | KDA {}/{}/{} | KP {} | CS/min {} | CS@10 {} (diff {}) | \
             gold diff@15 {} | team gold diff@15 {} | deaths at minute [{}], before 14:00 {}, solo {} | \
             vision/min {}, wards placed {}, wards killed {}, control wards {} | damage share {} | first legendary item {}",
            game_ref(i),
            queue_name(g.queue_id),
            g.champion,
            if g.role.is_empty() { "?" } else { &g.role },
            g.opponent.as_deref().unwrap_or("?"),
            if g.win { "Win" } else { "Loss" },
            g.minutes,
            g.kills,
            g.deaths,
            g.assists,
            g.kill_participation,
            g.cs_per_min,
            opt(g.cs_at_10),
            signed(g.cs_diff_10),
            signed(g.gold_diff_15),
            signed(g.team_gold_diff_15),
            deaths,
            opt(g.early_deaths),
            opt(g.solo_deaths),
            g.vision_per_min,
            g.wards_placed,
            g.wards_killed,
            g.control_wards,
            g.damage_share,
            opt(g.first_item_min.map(|m| format!("min {m}"))),
        );
    }

    p.push_str(
        "\nReply with ONLY a JSON object, no text before or after, in this shape:\n\
         {\"headline\": \"one sentence: the main thing to fix\",\n \
         \"strength\": \"one real strength, with its numbers\",\n \
         \"pain_points\": [{\"title\": \"short name\", \"metric\": \"the metric it's measured by\", \
         \"evidence\": \"the numbers and games that show it\", \"why\": \"why it costs games\", \
         \"drill\": \"what to practice in the next games\", \"target\": \"measurable goal\", \
         \"games\": [\"G1\", \"G4\"]}]}\n\
         Exactly 3 pain points. Keys in English; the text values in the answer language.",
    );
    p
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct RawReport {
    headline: String,
    strength: String,
    pain_points: Vec<RawPainPoint>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct RawPainPoint {
    title: String,
    metric: String,
    evidence: String,
    why: String,
    drill: String,
    target: String,
    games: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PainPoint {
    pub title: String,
    pub metric: String,
    pub evidence: String,
    pub why: String,
    pub drill: String,
    pub target: String,
    /// Match ids of the games it cites (resolved from the G refs).
    pub games: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Report {
    pub headline: String,
    pub strength: String,
    pub pain_points: Vec<PainPoint>,
}

/// Reads the model's answer. G refs that don't exist are dropped; points
/// without a title or a drill are dropped; at most 3 are kept.
pub fn parse_report(text: &str, games: &[GameStats]) -> Result<Report, String> {
    let json = crate::recommend::extract_json(text).ok_or("no JSON object in the answer")?;
    let raw: RawReport = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let pain_points: Vec<PainPoint> = raw
        .pain_points
        .into_iter()
        .filter(|p| !p.title.trim().is_empty() && !p.drill.trim().is_empty())
        .take(3)
        .map(|p| {
            let mut ids: Vec<String> = Vec::new();
            for r in &p.games {
                let id = r
                    .trim()
                    .strip_prefix(['G', 'g'])
                    .and_then(|n| n.parse::<usize>().ok())
                    .filter(|n| *n >= 1)
                    .and_then(|n| games.get(n - 1))
                    .map(|g| g.id.clone());
                if let Some(id) = id.filter(|id| !ids.contains(id)) {
                    ids.push(id);
                }
            }
            PainPoint {
                title: p.title.trim().into(),
                metric: p.metric.trim().into(),
                evidence: p.evidence.trim().into(),
                why: p.why.trim().into(),
                drill: p.drill.trim().into(),
                target: p.target.trim().into(),
                games: ids,
            }
        })
        .collect();
    if pain_points.is_empty() {
        return Err("the answer has no pain points".into());
    }
    Ok(Report {
        headline: raw.headline.trim().into(),
        strength: raw.strength.trim().into(),
        pain_points,
    })
}

// ---------- local storage ----------

#[derive(Debug, Default, Serialize, Deserialize)]
struct Store {
    /// Newest first.
    #[serde(default)]
    games: Vec<GameStats>,
    /// Ids already seen that aren't reviewed (ARAM, remakes…), not to fetch them again.
    #[serde(default)]
    skipped: Vec<String>,
    /// Newest first.
    #[serde(default)]
    reports: Vec<SavedReport>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SavedReport {
    pub created_at: i64,
    pub kind: ProviderKind,
    /// Newest game it covers: if a newer one exists, it's out of date.
    pub newest_game: String,
    pub averages: Averages,
    pub report: Report,
}

/// `id` is `Profile::store_id` (hex, so always a safe file name).
fn store_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let safe: String = id
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .take(200)
        .collect();
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("history")
        .join(format!("{safe}.json")))
}

fn load_store(app: &AppHandle, id: &str) -> Store {
    store_path(app, id)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn save_store(app: &AppHandle, id: &str, store: &Store) -> Result<(), String> {
    let path = store_path(app, id)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string(store).map_err(|e| e.to_string())?;
    // Write then rename: a crash mid-write doesn't lose the history.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(tmp, path).map_err(|e| e.to_string())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

/// One sync or review at a time (the background check and a click can overlap).
#[derive(Default)]
pub struct Lock(tokio::sync::Mutex<()>);

// ---------- commands ----------

#[derive(Debug, Serialize)]
pub struct AccountView {
    pub profile: Profile,
    pub regions: &'static [riot::Region],
}

#[tauri::command]
pub fn riot_account(app: AppHandle) -> AccountView {
    AccountView {
        profile: load_profile_public(&app),
        regions: riot::REGIONS,
    }
}

fn load_profile_public(app: &AppHandle) -> Profile {
    // The PUUID is an internal detail.
    Profile {
        puuid: None,
        ..riot::load_profile(app)
    }
}

#[tauri::command]
pub fn save_riot_account(
    app: AppHandle,
    riot_id: String,
    region: String,
    auto_analyze: bool,
) -> Result<Profile, String> {
    let (game_name, tag_line) = riot::parse_riot_id(&riot_id)?;
    riot::find_region(&region)
        .ok_or_else(|| tr("Pick your region.", "Elige tu región.").to_string())?;
    let old = riot::load_profile(&app);
    let same_account = old.game_name.to_lowercase() == game_name.to_lowercase()
        && old.tag_line.to_lowercase() == tag_line.to_lowercase()
        && old.region == region;
    let profile = Profile {
        game_name,
        tag_line,
        region,
        auto_analyze,
        puuid: if same_account { old.puuid } else { None },
    };
    riot::save_profile(&app, &profile)?;
    Ok(Profile {
        puuid: None,
        ..profile
    })
}

#[derive(Debug, Serialize)]
pub struct HistoryView {
    pub configured: bool,
    /// Newest first.
    pub games: Vec<GameStats>,
    pub summary: Option<Summary>,
    pub latest: Option<SavedReport>,
    pub previous: Option<SavedReport>,
    /// There are games newer than the last review.
    pub needs_review: bool,
}

fn needs_review(store: &Store) -> bool {
    store.games.len() >= MIN_GAMES
        && store
            .reports
            .first()
            .is_none_or(|r| store.games.first().is_some_and(|g| g.id != r.newest_game))
}

#[tauri::command]
pub fn match_history(app: AppHandle) -> HistoryView {
    let profile = riot::load_profile(&app);
    let store = if profile.is_complete() {
        load_store(&app, &profile.store_id())
    } else {
        Store::default()
    };
    let reviewed: Vec<GameStats> = store.games.iter().take(REVIEW_GAMES).cloned().collect();
    HistoryView {
        configured: profile.is_complete(),
        summary: (!reviewed.is_empty()).then(|| summarize(&reviewed)),
        needs_review: needs_review(&store),
        latest: store.reports.first().cloned(),
        previous: store.reports.get(1).cloned(),
        games: store.games,
    }
}

/// Why a sync failed. `setup`: the player must fix something in Settings
/// (no key, expired key, unknown Riot ID). `transient`: try again later.
#[derive(Debug, Serialize, PartialEq)]
pub struct SyncError {
    pub kind: &'static str,
    pub message: String,
}

impl From<RiotError> for SyncError {
    fn from(e: RiotError) -> Self {
        let kind = match e {
            RiotError::NoKey | RiotError::KeyRejected | RiotError::NotFound => "setup",
            RiotError::RateLimited | RiotError::BadRequest | RiotError::Other(_) => "transient",
        };
        SyncError {
            kind,
            message: e.message(),
        }
    }
}

impl From<String> for SyncError {
    fn from(message: String) -> Self {
        SyncError {
            kind: "transient",
            message,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct SyncResult {
    pub new_games: usize,
    pub needs_review: bool,
}

/// Fetches the player's new finished games from Riot and computes their numbers.
#[tauri::command]
pub async fn sync_matches(
    app: AppHandle,
    cache: State<'_, ddragon::Cache>,
    lock: State<'_, Lock>,
    on_event: Channel<ChatEvent>,
) -> Result<SyncResult, SyncError> {
    let _guard = lock.0.lock().await;
    let status = |t: String| {
        let _ = on_event.send(ChatEvent::Status { text: t });
    };
    let mut profile = riot::load_profile(&app);
    if !profile.is_complete() {
        return Err(SyncError {
            kind: "setup",
            message: tr(
                "Add your Riot ID and region in Settings.",
                "Agrega tu Riot ID y tu región en Ajustes.",
            )
            .into(),
        });
    }
    let region = riot::find_region(&profile.region).expect("checked by is_complete");
    let client = riot::Client::new(region)?;
    let (name, tag) = (profile.game_name.clone(), profile.tag_line.clone());
    let lookup = || {
        status(tr("Looking up your account…", "Buscando tu cuenta…").into());
        client.puuid(&name, &tag)
    };
    let cached = profile.puuid.is_some();
    let mut puuid = match profile.puuid.clone() {
        Some(p) => p,
        None => lookup().await?,
    };
    let ids = match client.match_ids(&puuid, FETCH_COUNT).await {
        // A PUUID cached with another API key isn't valid for this one
        // (Riot encrypts them per key): look it up again once.
        Err(RiotError::BadRequest | RiotError::NotFound) if cached => {
            puuid = lookup().await?;
            client.match_ids(&puuid, FETCH_COUNT).await?
        }
        other => other?,
    };
    if profile.puuid.as_deref() != Some(puuid.as_str()) {
        profile.puuid = Some(puuid.clone());
        riot::save_profile(&app, &profile)?;
    }
    let store_id = profile.store_id();
    let mut store = load_store(&app, &store_id);
    let known: HashSet<&str> = store
        .games
        .iter()
        .map(|g| g.id.as_str())
        .chain(store.skipped.iter().map(String::as_str))
        .collect();
    let new_ids: Vec<String> = ids
        .into_iter()
        .filter(|id| !known.contains(id.as_str()))
        .collect();
    if new_ids.is_empty() {
        return Ok(SyncResult {
            new_games: 0,
            needs_review: needs_review(&store),
        });
    }

    let legendary = ddragon::get(&app, &cache)
        .await
        .map(|d| legendary_items(&d))
        .unwrap_or_default();
    let mut new_games = 0;
    let total = new_ids.len();
    for (i, id) in new_ids.iter().enumerate() {
        status(format!(
            "{} {}/{total}…",
            tr("Reading game", "Leyendo partida"),
            i + 1
        ));
        let m: MatchDto = match client.match_detail(id).await {
            Ok(m) => m,
            // Gone from Riot (very old or removed): don't ask again.
            Err(RiotError::NotFound) => {
                store.skipped.push(id.clone());
                continue;
            }
            Err(e) => {
                // Keep what was already read.
                save_store(&app, &store_id, &store)?;
                return Err(e.into());
            }
        };
        if compute(&m, None, &puuid, &legendary).is_none() {
            store.skipped.push(id.clone());
            continue;
        }
        let timeline: Option<TimelineDto> = match client.timeline(id).await {
            Ok(t) => Some(t),
            Err(RiotError::NotFound) => None,
            Err(e) => {
                save_store(&app, &store_id, &store)?;
                return Err(e.into());
            }
        };
        if let Some(g) = compute(&m, timeline.as_ref(), &puuid, &legendary) {
            store.games.push(g);
            new_games += 1;
        }
    }
    store.games.sort_by_key(|g| std::cmp::Reverse(g.ended_at));
    store.games.truncate(KEEP_GAMES);
    let skip_from = store.skipped.len().saturating_sub(200);
    store.skipped.drain(..skip_from);
    save_store(&app, &store_id, &store)?;
    Ok(SyncResult {
        new_games,
        needs_review: needs_review(&store),
    })
}

/// Asks the model for the pain points of the latest games and saves the review.
#[tauri::command]
pub async fn review_matches(
    app: AppHandle,
    lock: State<'_, Lock>,
    running: State<'_, Running>,
    kind: ProviderKind,
    request_id: String,
    on_event: Channel<ChatEvent>,
) -> Result<SavedReport, String> {
    let _guard = lock.0.lock().await;
    let profile = riot::load_profile(&app);
    if !profile.is_complete() {
        return Err(tr(
            "Add your Riot ID and region in Settings first.",
            "Primero agrega tu Riot ID y tu región en Ajustes.",
        )
        .into());
    }
    let store_id = profile.store_id();
    let mut store = load_store(&app, &store_id);
    let games: Vec<GameStats> = store.games.iter().take(REVIEW_GAMES).cloned().collect();
    if games.len() < MIN_GAMES {
        return Err(format!(
            "{} {MIN_GAMES}.",
            tr(
                "Not enough Summoner's Rift games to find patterns yet. Minimum:",
                "Aún no hay suficientes partidas en la Grieta para ver patrones. Mínimo:",
            )
        ));
    }
    let _ = on_event.send(ChatEvent::Status {
        text: tr("Reviewing your games…", "Revisando tus partidas…").into(),
    });

    let prompt = review_prompt(&profile.riot_id(), &games);
    let rx = running.register(&request_id);
    let first = crate::recommend::ask(
        &app,
        kind,
        &prompt,
        None,
        providers::DEFAULT_TIMEOUT,
        rx,
        &on_event,
    )
    .await;
    let retry_cancel = running.register(&request_id);
    let first = match first {
        Ok(c) => c,
        Err(e) => {
            running.finish(&request_id);
            return Err(e);
        }
    };
    let report = match (parse_report(&first.text, &games), first.session_id) {
        (Ok(r), _) => {
            running.finish(&request_id);
            r
        }
        (Err(e), Some(sid)) => {
            let fix = format!(
                "Your answer couldn't be read ({e}). Reply again with ONLY the complete JSON object, in the same shape."
            );
            let second = crate::recommend::ask(
                &app,
                kind,
                &fix,
                Some(&sid),
                providers::DEFAULT_TIMEOUT,
                retry_cancel,
                &on_event,
            )
            .await;
            running.finish(&request_id);
            parse_report(&second?.text, &games)?
        }
        (Err(e), None) => {
            running.finish(&request_id);
            return Err(e);
        }
    };

    let saved = SavedReport {
        created_at: now_ms(),
        kind,
        newest_game: games[0].id.clone(),
        averages: averages(&games),
        report,
    };
    store.reports.insert(0, saved.clone());
    store.reports.truncate(20);
    save_store(&app, &store_id, &store)?;
    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn participant(pid: u32, team: u32, pos: &str, champ: &str, kills: u32) -> serde_json::Value {
        json!({
            "puuid": format!("p{pid}"), "participantId": pid, "teamId": team,
            "championName": champ, "teamPosition": pos, "win": team == 100,
            "kills": kills, "deaths": 2, "assists": 3,
            "totalMinionsKilled": 150, "neutralMinionsKilled": 10,
            "visionScore": 30.0, "wardsPlaced": 10, "wardsKilled": 2,
            "visionWardsBoughtInGame": 3, "totalDamageDealtToChampions": 10000 * kills as u64,
            "gameEndedInEarlySurrender": false
        })
    }

    fn sample_match(queue: u32) -> MatchDto {
        let mut ps = vec![participant(1, 100, "MIDDLE", "Ahri", 4)];
        for pid in 2..=5 {
            ps.push(participant(pid, 100, "TOP", "Garen", 1));
        }
        ps.push(participant(6, 200, "MIDDLE", "Syndra", 5));
        for pid in 7..=10 {
            ps.push(participant(pid, 200, "BOTTOM", "Jinx", 1));
        }
        serde_json::from_value(json!({
            "metadata": {"matchId": "LA1_1"},
            "info": {"gameDuration": 1600, "gameEndTimestamp": 1_700_000_000_000i64,
                     "queueId": queue, "mapId": 11, "participants": ps}
        }))
        .unwrap()
    }

    fn frame(
        minute: i64,
        me_cs: i32,
        opp_cs: i32,
        me_gold: i32,
        events: serde_json::Value,
    ) -> serde_json::Value {
        let mut pf = serde_json::Map::new();
        for pid in 1..=10 {
            let (cs, gold) = match pid {
                1 => (me_cs, me_gold),
                6 => (opp_cs, 5000),
                _ => (50, 5000),
            };
            pf.insert(
                pid.to_string(),
                json!({"totalGold": gold, "minionsKilled": cs, "jungleMinionsKilled": 0}),
            );
        }
        json!({"timestamp": minute * 60_000, "participantFrames": pf, "events": events})
    }

    fn sample_timeline() -> TimelineDto {
        let mut frames = Vec::new();
        for m in 0..=16 {
            let events = match m {
                5 => json!([
                    {"type": "CHAMPION_KILL", "timestamp": 300_500, "killerId": 6, "victimId": 1, "assistingParticipantIds": []},
                    {"type": "CHAMPION_KILL", "timestamp": 320_000, "killerId": 1, "victimId": 6}
                ]),
                12 => json!([
                    {"type": "ITEM_PURCHASED", "timestamp": 690_000, "participantId": 1, "itemId": 3001},
                    {"type": "ITEM_PURCHASED", "timestamp": 700_000, "participantId": 1, "itemId": 6655},
                    {"type": "ITEM_PURCHASED", "timestamp": 650_000, "participantId": 6, "itemId": 6655}
                ]),
                16 => json!([
                    {"type": "CHAMPION_KILL", "timestamp": 950_000, "killerId": 7, "victimId": 1, "assistingParticipantIds": [6]}
                ]),
                _ => json!([]),
            };
            frames.push(frame(
                m,
                (m * 7) as i32,
                (m * 8) as i32,
                500 + (m as i32) * 300,
                events,
            ));
        }
        serde_json::from_value(json!({"info": {"frames": frames}})).unwrap()
    }

    #[test]
    fn computes_lane_numbers_from_the_timeline() {
        let legendary: HashSet<u32> = [6655].into();
        let g = compute(
            &sample_match(420),
            Some(&sample_timeline()),
            "p1",
            &legendary,
        )
        .unwrap();
        assert_eq!(g.champion, "Ahri");
        assert_eq!(g.opponent.as_deref(), Some("Syndra"));
        assert!(g.win);
        assert_eq!(g.cs_at_10, Some(70));
        assert_eq!(g.cs_diff_10, Some(-10));
        // 500 + 15*300 = 5000 vs 5000.
        assert_eq!(g.gold_diff_15, Some(0));
        assert_eq!(g.early_deaths, Some(1));
        assert_eq!(g.solo_deaths, Some(1));
        assert_eq!(g.death_minutes, vec![5.0, 15.8]);
        assert_eq!(g.first_item_min, Some(11.7));
        // 4 kills + 3 assists out of 4 + 4*1 team kills.
        assert_eq!(g.kill_participation, 0.88);
        assert_eq!(g.cs_per_min, 6.0);
        assert_eq!(g.team_gold_diff_15, Some(0));
        assert!(!g.threw_lead());
    }

    #[test]
    fn skips_other_modes_remakes_and_missing_player() {
        let none = HashSet::new();
        assert!(compute(&sample_match(450), None, "p1", &none).is_none());
        assert!(compute(&sample_match(420), None, "someone-else", &none).is_none());
        let mut m = sample_match(420);
        m.info.participants[0].game_ended_in_early_surrender = true;
        assert!(compute(&m, None, "p1", &none).is_none());
        // Without a timeline the end-of-game numbers are still there.
        let g = compute(&sample_match(400), None, "p1", &none).unwrap();
        assert_eq!(g.cs_at_10, None);
        assert_eq!(g.early_deaths, None);
        assert_eq!(g.control_wards, 3);
    }

    fn game(id: &str, win: bool, cs_diff: Option<i32>, team_gd: Option<i32>) -> GameStats {
        GameStats {
            id: id.into(),
            champion: "Ahri".into(),
            role: "MIDDLE".into(),
            win,
            cs_diff_10: cs_diff,
            team_gold_diff_15: team_gd,
            cs_per_min: 6.0,
            ..Default::default()
        }
    }

    #[test]
    fn summary_splits_trend_and_flags_thrown_leads() {
        let games: Vec<GameStats> = (0..8)
            .map(|i| {
                game(
                    &format!("M{i}"),
                    i % 2 == 0,
                    Some(if i < 5 { -12 } else { 4 }),
                    Some(if i == 3 { 2500 } else { 0 }),
                )
            })
            .collect();
        let s = summarize(&games);
        assert_eq!(s.recent.games, 5);
        assert_eq!(s.earlier.games, 3);
        assert_eq!(s.recent.cs_diff_10, Some(-12.0));
        assert_eq!(s.earlier.cs_diff_10, Some(4.0));
        assert_eq!(s.behind_at_10, (5, 8));
        assert_eq!(s.thrown_leads, vec!["G4".to_string()]);
        assert_eq!(s.champions[0].games, 8);
        assert_eq!(s.all.win_rate, Some(0.5));
    }

    #[test]
    fn prompt_has_games_rules_and_no_benchmarks() {
        let games = vec![
            game("M0", true, Some(-3), None),
            game("M1", false, None, Some(2000)),
        ];
        let p = review_prompt("Name#TAG", &games);
        assert!(p.contains("G1 | "));
        assert!(p.contains("G2 | "));
        assert!(p.contains("Don't compare with rank averages"));
        assert!(p.contains("diff -3"));
        assert!(p.contains("Lost after the team led"));
        assert!(p.is_ascii(), "prompts are in English");
    }

    #[test]
    fn parses_report_and_resolves_refs() {
        let games = vec![game("M0", true, None, None), game("M1", false, None, None)];
        let text = r#"Here you go: {"headline": "Die less early", "strength": "KP 70%",
          "pain_points": [
            {"title": "Early deaths", "metric": "deaths before 14:00", "evidence": "2 per game",
             "why": "x", "drill": "Ward at 3:00", "target": "<1", "games": ["G2", "G9", "g1", "G2"]},
            {"title": "", "drill": "nothing"},
            {"title": "No drill"},
            {"title": "B", "drill": "b"}, {"title": "C", "drill": "c"}, {"title": "D", "drill": "d"}
          ]}"#;
        let r = parse_report(text, &games).unwrap();
        assert_eq!(r.pain_points.len(), 3);
        assert_eq!(
            r.pain_points[0].games,
            vec!["M1".to_string(), "M0".to_string()]
        );
        assert_eq!(r.pain_points[2].title, "C");
        assert!(parse_report(r#"{"pain_points": []}"#, &games).is_err());
        assert!(parse_report("no json", &games).is_err());
    }

    #[test]
    fn sync_errors_say_whether_settings_need_fixing() {
        assert_eq!(SyncError::from(RiotError::KeyRejected).kind, "setup");
        assert_eq!(SyncError::from(RiotError::NoKey).kind, "setup");
        assert_eq!(SyncError::from(RiotError::NotFound).kind, "setup");
        assert_eq!(SyncError::from(RiotError::RateLimited).kind, "transient");
        assert_eq!(SyncError::from(String::from("disk full")).kind, "transient");
    }

    #[test]
    fn review_needed_only_for_new_games() {
        let mut store = Store {
            games: (0..3)
                .map(|i| game(&format!("M{i}"), true, None, None))
                .collect(),
            ..Default::default()
        };
        assert!(needs_review(&store));
        store.reports.push(SavedReport {
            created_at: 0,
            kind: ProviderKind::ClaudeCode,
            newest_game: "M0".into(),
            averages: Averages::default(),
            report: Report {
                headline: String::new(),
                strength: String::new(),
                pain_points: vec![],
            },
        });
        assert!(!needs_review(&store));
        store.games.insert(0, game("M9", true, None, None));
        assert!(needs_review(&store));
        store.games.truncate(2);
        assert!(!needs_review(&store));
    }
}
