//! Official ability text (Data Dragon `champion/<id>.json`) for the champions
//! that matter in a prompt: your champion and your lane opponent.
//!
//! Models misremember kits (what a W does, whether a skill roots, cooldowns),
//! so the prompt carries Riot's own text for this patch. Each file is
//! downloaded once per patch and language and kept next to the patch data.
//! A failed download never blocks a build: the block is simply left out.

use std::path::{Path, PathBuf};

use serde_json::Value;
use tauri::{AppHandle, State};

use crate::ddragon::{self, GameData, strip_tags};

#[derive(Debug, Clone, PartialEq)]
pub struct Ability {
    /// "Passive", "Q", "W", "E" or "R".
    pub key: &'static str,
    pub name: String,
    pub description: String,
    /// Per rank, as Data Dragon writes it ("9/8.5/8/7.5/7"); `None` when 0.
    pub cooldown: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Kit {
    pub name: String,
    pub abilities: Vec<Ability>,
}

const KEYS: [&str; 4] = ["Q", "W", "E", "R"];

/// Reads `champion/<id>.json`. Errors if it isn't that champion's file.
pub fn parse_kit(json: &str, id: &str) -> Result<Kit, String> {
    let v: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let c = &v["data"][id];
    let name = c["name"]
        .as_str()
        .ok_or_else(|| format!("{id}: no champion data"))?
        .to_string();
    let clean = |s: &Value| {
        strip_tags(s.as_str().unwrap_or_default())
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    };
    let mut abilities = vec![Ability {
        key: "Passive",
        name: clean(&c["passive"]["name"]),
        description: clean(&c["passive"]["description"]),
        cooldown: None,
    }];
    let spells = c["spells"]
        .as_array()
        .ok_or_else(|| format!("{id}: no spells"))?;
    if spells.len() != 4 {
        return Err(format!("{id}: expected 4 spells, got {}", spells.len()));
    }
    for (key, s) in KEYS.iter().zip(spells) {
        let cd = s["cooldownBurn"].as_str().unwrap_or_default().trim();
        abilities.push(Ability {
            key,
            name: clean(&s["name"]),
            description: clean(&s["description"]),
            cooldown: (!cd.is_empty() && cd != "0").then(|| cd.to_string()),
        });
    }
    Ok(Kit { name, abilities })
}

/// The prompt lines for one champion.
pub fn kit_text(k: &Kit) -> String {
    let mut out = format!("{}:", k.name);
    for a in &k.abilities {
        out.push_str(&format!("\n- {} · {}: {}", a.key, a.name, a.description));
        if let Some(cd) = &a.cooldown {
            out.push_str(&format!(" (cooldown {cd} s)"));
        }
    }
    out
}

/// The block for the prompt, or `None` if no kit could be read.
pub fn block(kits: &[Kit]) -> Option<String> {
    if kits.is_empty() {
        return None;
    }
    let body: Vec<String> = kits.iter().map(kit_text).collect();
    Some(format!(
        "ABILITIES (Riot's official text for this patch; trust it over memory for what each ability does, e.g. which one roots, slows or deals true damage):\n{}",
        body.join("\n")
    ))
}

fn kit_file(root: &Path, data: &GameData, id: &str) -> PathBuf {
    root.join(data.lang.locale())
        .join(&data.version)
        .join("champion")
        .join(format!("{id}.json"))
}

async fn kit(app: &AppHandle, data: &GameData, id: &str) -> Result<Kit, String> {
    // Only ids from this patch's champion list: never a path or a URL piece
    // that came from somewhere else.
    if data.champion(id).is_none() || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(format!("Unknown champion: {id}"));
    }
    let file = kit_file(&ddragon::cache_root(app)?, data, id);
    if let Ok(text) = tokio::fs::read_to_string(&file).await
        && let Ok(k) = parse_kit(&text, id)
    {
        return Ok(k);
    }
    let text = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?
        .get(format!(
            "{}/cdn/{}/data/{}/champion/{id}.json",
            ddragon::BASE,
            data.version,
            data.lang.locale()
        ))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let k = parse_kit(&text, id)?;
    // Best effort: a cache that can't be written only costs a download.
    if let Some(dir) = file.parent()
        && tokio::fs::create_dir_all(dir).await.is_ok()
    {
        let _ = tokio::fs::write(&file, &text).await;
    }
    Ok(k)
}

/// The ability block for these champions (duplicates and failures skipped).
pub async fn for_champions(app: &AppHandle, data: &GameData, ids: &[&str]) -> Option<String> {
    let mut kits = Vec::new();
    let mut done: Vec<&str> = Vec::new();
    for id in ids {
        if done.contains(id) {
            continue;
        }
        done.push(id);
        if let Ok(k) = kit(app, data, id).await {
            kits.push(k);
        }
    }
    block(&kits)
}

/// For the Ask panel's context: the same block the build prompt gets.
#[tauri::command]
pub async fn champion_abilities(
    app: AppHandle,
    cache: State<'_, ddragon::Cache>,
    ids: Vec<String>,
) -> Result<Option<String>, String> {
    let data = ddragon::get(&app, &cache).await?;
    let ids: Vec<&str> = ids.iter().map(String::as_str).take(4).collect();
    Ok(for_champions(&app, &data, &ids).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TALON: &str = r#"{"data":{"Talon":{"name":"Talon",
      "passive":{"name":"Blade's End","description":"Talon's spells <b>Wound</b> champions."},
      "spells":[
        {"name":"Noxian Diplomacy","description":"Talon stabs the target unit.","cooldownBurn":"8/7.5/7/6.5/6"},
        {"name":"Rake","description":"Daggers that  return and <status>slow</status>.","cooldownBurn":"9/8.5/8/7.5/7"},
        {"name":"Assassin's Path","description":"Talon vaults over terrain.","cooldownBurn":"0"},
        {"name":"Shadow Assault","description":"Talon becomes Invisible.","cooldownBurn":"100/80/60"}
      ]}}}"#;

    #[test]
    fn reads_passive_and_four_spells() {
        let k = parse_kit(TALON, "Talon").unwrap();
        assert_eq!(k.name, "Talon");
        let keys: Vec<_> = k.abilities.iter().map(|a| a.key).collect();
        assert_eq!(keys, ["Passive", "Q", "W", "E", "R"]);
        assert_eq!(
            k.abilities[0].description,
            "Talon's spells Wound champions."
        );
        // Tags gone, spaces collapsed.
        assert_eq!(k.abilities[2].description, "Daggers that return and slow.");
        assert_eq!(k.abilities[2].cooldown.as_deref(), Some("9/8.5/8/7.5/7"));
        // A 0 cooldown (terrain-limited E) isn't shown as "0 s".
        assert_eq!(k.abilities[3].cooldown, None);
    }

    #[test]
    fn wrong_champion_file_is_an_error() {
        assert!(parse_kit(TALON, "Vayne").is_err());
        assert!(parse_kit("not json", "Talon").is_err());
    }

    #[test]
    fn block_names_each_ability_with_its_key() {
        let k = parse_kit(TALON, "Talon").unwrap();
        let b = block(&[k]).unwrap();
        assert!(b.starts_with("ABILITIES"));
        assert!(b.contains("- W · Rake: Daggers that return and slow. (cooldown 9/8.5/8/7.5/7 s)"));
        assert!(b.contains("- E · Assassin's Path: Talon vaults over terrain.\n"));
        assert!(block(&[]).is_none());
    }
}
