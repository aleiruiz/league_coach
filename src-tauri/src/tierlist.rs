//! This patch's tier list for one role, read by the AI from one stats site.
//!
//! League Coach never computes or scrapes win rates. The AI searches the web,
//! picks one tier list page from a known stats site and copies what it shows.
//! The list is kept only if that page's URL came up in the AI's own search
//! results this run (same rule as the build card's figures), and every
//! champion is checked against the patch's Data Dragon list.

use std::collections::HashMap;
use std::fmt::Write as _;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::ddragon::{self, GameData, normalize};
use crate::providers::{ChatEvent, ProviderKind, Running};
use crate::recommend::{self, null_default};

pub const ROLES: &[&str] = &["top", "jungle", "mid", "adc", "support"];
/// Enough for every tier that matters in one role; the rest is noise.
const MAX_ENTRIES: usize = 40;
/// Fewer rows than this is a few search snippets, not a full tier list: it
/// is still shown, labelled as partial, instead of refused.
pub const MIN_ENTRIES: usize = 8;
/// The only hosts this call may open pages on (Alei, 2026-11-12: let Claude
/// read the tier list page itself; search snippets alone gave thin lists).
pub const FETCH_HOSTS: &[&str] = &[
    "u.gg",
    "www.u.gg",
    "op.gg",
    "www.op.gg",
    "mobalytics.gg",
    "www.mobalytics.gg",
    "lolalytics.com",
    "www.lolalytics.com",
    "leagueofgraphs.com",
    "www.leagueofgraphs.com",
    "metasrc.com",
    "www.metasrc.com",
];
const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(360);

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct RawList {
    #[serde(deserialize_with = "null_default")]
    pub url: String,
    #[serde(deserialize_with = "null_default")]
    pub patch: String,
    #[serde(deserialize_with = "null_default")]
    pub rank: String,
    #[serde(deserialize_with = "null_default")]
    pub champions: Vec<RawEntry>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct RawEntry {
    #[serde(deserialize_with = "null_default")]
    pub champion: String,
    #[serde(deserialize_with = "null_default")]
    pub tier: String,
    pub win_rate: Option<f64>,
    pub pick_rate: Option<f64>,
    pub ban_rate: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct Entry {
    /// Data Dragon id (e.g. "MonkeyKing").
    pub champion: String,
    pub tier: String,
    pub win_rate: Option<f64>,
    pub pick_rate: Option<f64>,
    pub ban_rate: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct TierList {
    pub role: String,
    /// Site name ("u.gg", "Lolalytics"…) and the exact page it came from.
    pub site: String,
    pub url: String,
    /// Patch the page says it shows ("" if it didn't say).
    pub patch: String,
    /// Patch the app was on when the list was read.
    pub app_patch: String,
    /// Rank filter the page shows ("Emerald+"), if any.
    pub rank: Option<String>,
    /// Best first, as the site orders them.
    pub entries: Vec<Entry>,
    /// Rows dropped: unknown champion, no tier, or numbers that make no sense.
    pub dropped: usize,
    /// Unix time in ms.
    pub fetched_at: i64,
    /// The AI opened the page itself (else it only saw search snippets).
    #[serde(default)]
    pub opened: bool,
    /// Fewer than `MIN_ENTRIES` champions: shown with a "partial list" label.
    #[serde(default)]
    pub partial: bool,
}

/// Champion by id or by name in the app's language, ignoring case and signs.
fn champion_id(data: &GameData, name: &str) -> Option<String> {
    let n = normalize(name);
    if n.is_empty() {
        return None;
    }
    data.champions
        .iter()
        .find(|c| normalize(&c.id) == n || normalize(&c.name) == n)
        .map(|c| c.id.clone())
}

/// Tier as sites write it: "S+", "S", "A", "B-", "1"… (sites rank with letters or numbers).
fn clean_tier(t: &str) -> Option<String> {
    let lower = t.trim().to_lowercase();
    let lower = lower.strip_suffix("tier").unwrap_or(&lower).trim();
    let lower = lower.strip_prefix("tier").unwrap_or(lower).trim();
    let t = lower.to_uppercase();
    let mut chars = t.chars();
    let first = chars.next()?;
    let ok = (matches!(first, 'S' | 'A' | 'B' | 'C' | 'D' | 'F') || first.is_ascii_digit())
        && t.chars().count() <= 3
        && chars.all(|c| c == '+' || c == '-' || c.is_ascii_digit());
    ok.then_some(t)
}

#[cfg(test)]
fn clean_list(
    raw: &RawList,
    role: &str,
    data: &GameData,
    seen: &[String],
    now: i64,
    min_entries: usize,
) -> Result<TierList, String> {
    clean_list_with(raw, role, data, seen, &[], now, min_entries)
}

/// Keeps the list only if its page is a known stats site that came up in this
/// run's search (`seen`) or that the AI opened (`opened`). `Err` says why it
/// was thrown away.
pub fn clean_list_with(
    raw: &RawList,
    role: &str,
    data: &GameData,
    seen: &[String],
    opened: &[String],
    now: i64,
    min_entries: usize,
) -> Result<TierList, String> {
    let lang = data.lang;
    let (url, site) = recommend::stat_url(&raw.url).ok_or_else(|| {
        lang.pick(
            "The AI didn't name a page from a known stats site (u.gg, op.gg, Mobalytics, Lolalytics, League of Graphs or METAsrc).".to_string(),
            "La IA no nombró una página de un sitio de estadísticas conocido (u.gg, op.gg, Mobalytics, Lolalytics, League of Graphs o METAsrc).".to_string(),
        )
    })?;
    let key = recommend::url_key(&url);
    let has = |list: &[String]| {
        list.iter()
            .filter_map(|u| url::Url::parse(u).ok())
            .any(|u| recommend::url_key(&u) == key)
    };
    let was_opened = has(opened);
    if !was_opened && !has(seen) {
        return Err(lang.pick(
            "The page the AI named didn't come up in its web search, so its numbers can't be trusted. Try again.".to_string(),
            "La página que nombró la IA no salió en su búsqueda web, así que sus números no son confiables. Inténtalo de nuevo.".to_string(),
        ));
    }
    let pct = |v: Option<f64>| v.filter(|x| (0.0..=100.0).contains(x));
    let mut taken = std::collections::HashSet::new();
    let mut entries = Vec::new();
    for e in &raw.champions {
        let (Some(champion), Some(tier)) = (champion_id(data, &e.champion), clean_tier(&e.tier))
        else {
            continue;
        };
        // A champion listed twice keeps its first (best) row.
        if !taken.insert(champion.clone()) {
            continue;
        }
        entries.push(Entry {
            champion,
            tier,
            win_rate: pct(e.win_rate),
            pick_rate: pct(e.pick_rate),
            ban_rate: pct(e.ban_rate),
        });
    }
    let dropped = raw.champions.len() - entries.len();
    entries.truncate(MAX_ENTRIES);
    // A short list is still worth showing (labelled partial); an empty one isn't.
    if entries.is_empty() {
        return Err(lang.pick(
            "The AI found no champions of this patch on that page. Try again.".to_string(),
            "La IA no encontró campeones de este parche en esa página. Inténtalo de nuevo."
                .to_string(),
        ));
    }
    let partial = entries.len() < min_entries;
    let rank = raw.rank.trim();
    Ok(TierList {
        role: role.to_string(),
        site: site.to_string(),
        url: url.to_string(),
        // Sites may show the client version ("16.22"): same patch as "26.22".
        patch: recommend::patch_of(&raw.patch)
            .map(|p| ddragon::patch_name(&p))
            .unwrap_or_default(),
        app_patch: data.patch.clone(),
        rank: (!rank.is_empty()).then(|| rank.chars().take(24).collect()),
        entries,
        dropped,
        fetched_at: now,
        opened: was_opened,
        partial,
    })
}

fn role_words(role: &str) -> &'static str {
    match role {
        "top" => "top lane",
        "jungle" => "jungle",
        "mid" => "mid lane",
        "adc" => "ADC (bot lane)",
        _ => "support",
    }
}

pub fn prompt(role: &str, data: &GameData) -> String {
    let mut p = String::new();
    let _ = writeln!(
        p,
        "CURRENT PATCH: {} (Data Dragon version {}). Some sites show the patch as the client version ({}): it is the same patch.\n",
        data.patch,
        data.version,
        data.version.rsplitn(2, '.').last().unwrap_or(&data.version)
    );
    let _ = writeln!(
        p,
        "TASK: find this patch's {role} tier list (ranked solo queue) on ONE of these sites: u.gg, op.gg, Mobalytics, Lolalytics, League of Graphs, METAsrc. Search the web for it, then open that tier list page with WebFetch and copy what it shows for up to {max} champions, best first. Opening pages works only on those sites. If the page you open doesn't show the list (some sites only render it in a browser), try the same list on another of these sites; METAsrc and Lolalytics usually work.\n\n\
RULES:\n\
- \"url\" is the exact URL of the page you opened (or, if no page opened, the one from your search results). Any other page is thrown away.\n\
- Copy only what the page shows: its tier for each champion and, if it shows them, win rate, pick rate and ban rate as numbers (52.3, not \"52.3%\"). null for whatever it doesn't show. Never numbers from memory or from another page.\n\
- \"patch\" is the patch the page says it shows; \"rank\" is its rank filter (e.g. \"Emerald+\"), \"\" if it doesn't say.\n\
- Write each champion's name exactly as in this list: {names}\n\
- Reply ONLY with a ```json block of this shape:\n\
{{\"url\": \"https://…\", \"patch\": \"{patch}\", \"rank\": \"Emerald+\", \"champions\": [{{\"champion\": \"Ahri\", \"tier\": \"S\", \"win_rate\": 52.3, \"pick_rate\": 8.1, \"ban_rate\": 4.0}}]}}",
        role = role_words(role),
        patch = data.patch,
        max = MAX_ENTRIES,
        names = data
            .champions
            .iter()
            .map(|c| c.name.as_str())
            .collect::<Vec<_>>()
            .join(", "),
    );
    p
}

pub fn parse(text: &str) -> Result<RawList, String> {
    let json = recommend::extract_json(text).ok_or("no JSON in the answer")?;
    serde_json::from_str(json).map_err(|e| e.to_string())
}

// ---------- saved lists ----------

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("tierlists.json"))
}

fn load(app: &AppHandle) -> HashMap<String, TierList> {
    path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle, lists: &HashMap<String, TierList>) -> Result<(), String> {
    let path = path(app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string(lists).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(tmp, path).map_err(|e| e.to_string())
}

/// The lists read so far, by role.
#[tauri::command]
pub fn saved_tier_lists(app: AppHandle) -> HashMap<String, TierList> {
    load(&app)
}

/// Serializes writes to `tierlists.json` so two runs can't drop each other's role.
#[derive(Default)]
pub struct Lock(std::sync::Mutex<()>);

/// Asks the AI for this patch's tier list in `role` and saves it.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn fetch_tier_list(
    app: AppHandle,
    cache: State<'_, ddragon::Cache>,
    running: State<'_, Running>,
    lock: State<'_, Lock>,
    kind: ProviderKind,
    role: String,
    request_id: String,
    on_event: Channel<ChatEvent>,
) -> Result<TierList, String> {
    if !ROLES.contains(&role.as_str()) {
        return Err(format!("Unknown role: {role}"));
    }
    let data = ddragon::get(&app, &cache).await?;
    let lang = data.lang;
    if kind != ProviderKind::ClaudeCode {
        // Only Claude Code shows its search results, which is how a page is checked.
        return Err(lang.pick(
            "The tier list needs Claude Code: it's the AI that shows where its numbers come from. Connect it in Settings › Your AI.".to_string(),
            "La tier list necesita Claude Code: es la IA que muestra de dónde salen sus números. Conéctalo en Ajustes › Tu IA.".to_string(),
        ));
    }
    let _ = on_event.send(ChatEvent::Status {
        text: lang
            .pick(
                "Looking up this patch's tier list (searches the web, may take a minute)…",
                "Buscando la tier list de este parche (busca en la web, puede tardar un minuto)…",
            )
            .into(),
    });
    let rx = running.register(&request_id);
    let answer = recommend::ask_with(
        &app,
        kind,
        &prompt(&role, &data),
        None,
        TIMEOUT,
        rx,
        &on_event,
        FETCH_HOSTS,
    )
    .await;
    running.finish(&request_id);
    let answer = answer?;
    let raw = parse(&answer.text).map_err(|e| {
        lang.pick(
            format!("The AI's answer couldn't be read ({e}). Try again."),
            format!("No se pudo leer la respuesta de la IA ({e}). Inténtalo de nuevo."),
        )
    })?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64);
    let list = clean_list_with(
        &raw,
        &role,
        &data,
        &answer.sources,
        &answer.fetched,
        now,
        MIN_ENTRIES,
    )?;
    let _guard = lock.0.lock().unwrap_or_else(|e| e.into_inner());
    let mut lists = load(&app);
    // A partial result is shown, but never replaces a full list of this patch on disk.
    if should_replace(lists.get(&role), &list) {
        lists.insert(role, list.clone());
        save(&app, &lists)?;
    }
    Ok(list)
}

/// Whether `new` should be saved over the list already saved for its role.
fn should_replace(old: Option<&TierList>, new: &TierList) -> bool {
    match old {
        Some(old) => !(new.partial && !old.partial && old.app_patch == new.app_patch),
        None => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ddragon::fixtures;

    const URL: &str = "https://u.gg/lol/mid-lane-tier-list";

    fn raw(json: &str) -> RawList {
        parse(json).unwrap()
    }

    #[test]
    fn keeps_a_list_from_a_searched_page() {
        let r = raw(&format!(
            r#"```json
{{"url": "{URL}", "patch": "15.22", "rank": "Emerald+", "champions": [
  {{"champion": "Ahri", "tier": "S+", "win_rate": 52.3, "pick_rate": 8.1, "ban_rate": 4.0}},
  {{"champion": "darius", "tier": "a tier", "win_rate": 140, "pick_rate": null}},
  {{"champion": "Yasuo", "tier": "S"}},
  {{"champion": "Ahri", "tier": "B"}},
  {{"champion": "Jax", "tier": ""}}
]}}
```"#
        ));
        let l = clean_list(&r, "mid", &fixtures::data(), &[format!("{URL}/")], 7, 1).unwrap();
        assert_eq!(l.site, "u.gg");
        assert_eq!(l.patch, "25.22");
        assert_eq!(l.rank.as_deref(), Some("Emerald+"));
        assert_eq!(l.entries.len(), 2);
        assert_eq!(l.entries[0].champion, "Ahri");
        assert_eq!(l.entries[0].tier, "S+");
        assert_eq!(l.entries[0].win_rate, Some(52.3));
        // A win rate over 100 is dropped, the row stays.
        assert_eq!(l.entries[1].champion, "Darius");
        assert_eq!(l.entries[1].tier, "A");
        assert_eq!(l.entries[1].win_rate, None);
        // Unknown champion, a repeat and a row with no tier.
        assert_eq!(l.dropped, 3);
        assert_eq!(l.fetched_at, 7);
    }

    #[test]
    fn a_partial_list_never_replaces_a_full_one_of_the_same_patch() {
        let r = raw(&format!(
            r#"{{"url": "{URL}", "champions": [{{"champion": "Ahri", "tier": "S"}}, {{"champion": "Jax", "tier": "A"}}]}}"#
        ));
        let data = fixtures::data();
        let full = clean_list(&r, "mid", &data, &[URL.into()], 0, 2).unwrap();
        let partial = clean_list(&r, "mid", &data, &[URL.into()], 0, 3).unwrap();
        assert!(should_replace(None, &partial));
        assert!(!should_replace(Some(&full), &partial));
        assert!(should_replace(Some(&partial), &partial));
        assert!(should_replace(Some(&partial), &full));
        assert!(should_replace(Some(&full), &full));
        // A full list from an older patch is stale: a partial one replaces it.
        let old = TierList {
            app_patch: "25.21".into(),
            ..full
        };
        assert!(should_replace(Some(&old), &partial));
    }

    #[test]
    fn a_list_shorter_than_the_minimum_is_kept_as_partial() {
        let r = raw(&format!(
            r#"{{"url": "{URL}", "champions": [{{"champion": "Ahri", "tier": "S"}}, {{"champion": "Jax", "tier": "A"}}]}}"#
        ));
        let short = clean_list(&r, "mid", &fixtures::data(), &[URL.into()], 0, 3).unwrap();
        assert!(short.partial);
        assert_eq!(short.entries.len(), 2);
        assert!(
            !clean_list(&r, "mid", &fixtures::data(), &[URL.into()], 0, 2)
                .unwrap()
                .partial
        );
        // Nothing usable is still refused.
        let none = raw(&format!(
            r#"{{"url": "{URL}", "champions": [{{"champion": "Nobody", "tier": "S"}}]}}"#
        ));
        assert!(clean_list(&none, "mid", &fixtures::data(), &[URL.into()], 0, 3).is_err());
    }

    #[test]
    fn a_page_the_ai_opened_counts_even_if_not_in_the_search() {
        let r = raw(&format!(
            r#"{{"url": "{URL}", "champions": [{{"champion": "Ahri", "tier": "S"}}]}}"#
        ));
        let l = clean_list_with(
            &r,
            "mid",
            &fixtures::data(),
            &[],
            &[format!("{URL}/")],
            0,
            1,
        )
        .unwrap();
        assert!(l.opened);
        let l = clean_list_with(&r, "mid", &fixtures::data(), &[URL.into()], &[], 0, 1).unwrap();
        assert!(!l.opened);
    }

    #[test]
    fn fetch_hosts_are_only_the_stat_sites() {
        for h in FETCH_HOSTS {
            assert!(
                recommend::stat_url(&format!("https://{h}/x")).is_some(),
                "{h}"
            );
        }
    }

    #[test]
    fn a_page_not_in_the_search_is_refused() {
        let r = raw(&format!(
            r#"{{"url": "{URL}", "champions": [{{"champion": "Ahri", "tier": "S"}}]}}"#
        ));
        assert!(clean_list(&r, "mid", &fixtures::data(), &[], 0, 1).is_err());
        assert!(
            clean_list(
                &r,
                "mid",
                &fixtures::data(),
                &["https://u.gg/lol/top-lane-tier-list".into()],
                0,
                1
            )
            .is_err()
        );
    }

    #[test]
    fn unknown_sites_and_plain_http_are_refused() {
        for url in [
            "https://example.com/tier-list",
            "http://u.gg/lol/mid-lane-tier-list",
            "https://u.gg.evil.com/x",
        ] {
            let r = raw(&format!(
                r#"{{"url": "{url}", "champions": [{{"champion": "Ahri", "tier": "S"}}]}}"#
            ));
            assert!(
                clean_list(&r, "mid", &fixtures::data(), &[url.to_string()], 0, 1).is_err(),
                "{url}"
            );
        }
    }

    #[test]
    fn a_list_with_no_known_champion_is_refused() {
        let r = raw(&format!(
            r#"{{"url": "{URL}", "champions": [{{"champion": "Yasuo", "tier": "S"}}]}}"#
        ));
        assert!(clean_list(&r, "mid", &fixtures::data(), &[URL.into()], 0, 1).is_err());
    }

    #[test]
    fn tiers_are_short_labels() {
        assert_eq!(clean_tier("S+").as_deref(), Some("S+"));
        assert_eq!(clean_tier("Tier 1").as_deref(), Some("1"));
        assert_eq!(clean_tier("a tier").as_deref(), Some("A"));
        assert_eq!(clean_tier("god tier"), None);
        assert_eq!(clean_tier("OP"), None);
        assert_eq!(clean_tier(""), None);
    }

    #[test]
    fn prompt_names_the_role_patch_and_valid_names() {
        let p = prompt("adc", &fixtures::data());
        assert!(p.contains("ADC"));
        assert!(p.contains("25.22"));
        assert!(p.contains("Ahri, "));
        assert!(p.contains("WebFetch"));
        assert!(
            p.contains("url of the page you opened") || p.contains("URL of the page you opened")
        );
    }
}
