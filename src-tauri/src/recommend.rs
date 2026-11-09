//! Recomendación estructurada a partir del draft: el modelo devuelve JSON con
//! un esquema fijo y Rust valida cada ítem y runa contra los datos del parche.

use std::fmt::Write as _;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tokio::sync::oneshot;

use crate::ddragon::{self, Champion, GameData};
use crate::providers::{self, ChatEvent, Collected, ProviderKind, Running};

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct Draft {
    /// top, jungle, mid, adc, support
    pub role: String,
    /// Id de Data Dragon (p. ej. "Jax").
    pub champion: String,
    #[serde(default)]
    pub allies: Vec<String>,
    #[serde(default)]
    pub enemies: Vec<String>,
    /// Rival directo de línea, si se conoce.
    #[serde(default)]
    pub lane_opponent: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

// ---------- lo que devuelve el modelo ----------

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct RawCard {
    pub summary: String,
    pub starting_items: Vec<String>,
    pub core_items: Vec<String>,
    pub boots: String,
    pub situational: Vec<RawSituational>,
    pub runes: RawRunes,
    pub summoner_spells: Vec<String>,
    pub skill_order: RawSkills,
    pub game_plan: RawPlan,
    pub matchup_tips: Vec<String>,
    pub threats: Vec<RawThreat>,
    pub caveat: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct RawSituational {
    pub item: String,
    pub when: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct RawRunes {
    pub primary_tree: String,
    pub keystone: String,
    pub primary: Vec<String>,
    pub secondary_tree: String,
    pub secondary: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Default, Clone)]
#[serde(default)]
pub struct RawSkills {
    /// Orden de maximización, p. ej. ["Q", "E", "W"].
    pub max: Vec<String>,
    pub first_levels: String,
}

#[derive(Debug, Deserialize, Serialize, Default, Clone)]
#[serde(default)]
pub struct RawPlan {
    pub early: String,
    pub mid: String,
    pub late: String,
}

#[derive(Debug, Deserialize, Serialize, Default, Clone)]
#[serde(default)]
pub struct RawThreat {
    pub champion: String,
    pub why: String,
}

// ---------- tarjeta validada para la UI ----------

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct Ref {
    pub name: String,
    pub image: Option<String>,
    pub valid: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct Situational {
    pub item: Ref,
    pub when: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct Runes {
    pub primary_tree: Ref,
    pub keystone: Ref,
    pub primary: Vec<Ref>,
    pub secondary_tree: Ref,
    pub secondary: Vec<Ref>,
}

#[derive(Debug, Serialize, Clone)]
pub struct Card {
    pub summary: String,
    pub starting_items: Vec<Ref>,
    pub core_items: Vec<Ref>,
    pub boots: Ref,
    pub situational: Vec<Situational>,
    pub runes: Runes,
    pub summoner_spells: Vec<String>,
    pub skill_order: RawSkills,
    pub game_plan: RawPlan,
    pub matchup_tips: Vec<String>,
    pub threats: Vec<RawThreat>,
    pub caveat: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Recommendation {
    pub card: Card,
    /// Nombres que no existen en el parche (se muestran marcados).
    pub warnings: Vec<String>,
    pub session_id: Option<String>,
    pub patch: String,
    pub version: String,
}

// ---------- prompt ----------

/// Estimación gruesa del tipo de daño a partir de las valoraciones de Riot.
fn damage(c: &Champion) -> &'static str {
    match (c.attack, c.magic) {
        (a, m) if m >= a + 3 => "daño mágico (AP)",
        (a, m) if a >= m + 3 => "daño físico (AD)",
        _ => "daño mixto",
    }
}

fn describe(c: &Champion) -> String {
    let tank = if c.defense >= 7 || c.tags.iter().any(|t| t == "Tank") {
        ", resistente"
    } else {
        ""
    };
    format!("{} [{}; {}{tank}]", c.name, c.tags.join("/"), damage(c))
}

pub fn team_profile(enemies: &[&Champion]) -> String {
    let ap = enemies.iter().filter(|c| damage(c).contains("AP")).count();
    let ad = enemies.iter().filter(|c| damage(c).contains("AD")).count();
    let tanks = enemies
        .iter()
        .filter(|c| c.defense >= 7 || c.tags.iter().any(|t| t == "Tank"))
        .count();
    format!(
        "{} rivales: {ap} con daño mágico, {ad} con daño físico, {} mixtos, {tanks} resistentes.",
        enemies.len(),
        enemies.len() - ap - ad
    )
}

const SCHEMA: &str = r#"{
  "summary": "1-2 frases: la idea de la build para ESTA partida",
  "starting_items": ["ítem inicial", "..."],
  "core_items": ["ítem 1", "ítem 2", "ítem 3"],
  "boots": "botas",
  "situational": [{"item": "ítem", "when": "cuándo y contra quién comprarlo"}],
  "runes": {
    "primary_tree": "rama principal", "keystone": "piedra angular",
    "primary": ["runa", "runa", "runa"],
    "secondary_tree": "rama secundaria", "secondary": ["runa", "runa"]
  },
  "summoner_spells": ["Destello", "..."],
  "skill_order": {"max": ["Q", "E", "W"], "first_levels": "p. ej. Q-E-W"},
  "game_plan": {"early": "...", "mid": "...", "late": "..."},
  "matchup_tips": ["consejo concreto contra el rival de línea", "..."],
  "threats": [{"champion": "rival", "why": "por qué es peligroso y cómo jugarlo"}],
  "caveat": "una sola línea de duda si la hay, o null"
}"#;

pub fn build_prompt(draft: &Draft, data: &GameData) -> Result<String, String> {
    let get = |id: &str| {
        data.champion(id)
            .ok_or_else(|| format!("Campeón desconocido: {id}"))
    };
    let me = get(&draft.champion)?;
    let allies: Vec<&Champion> = draft
        .allies
        .iter()
        .map(|a| get(a))
        .collect::<Result<_, _>>()?;
    let enemies: Vec<&Champion> = draft
        .enemies
        .iter()
        .map(|e| get(e))
        .collect::<Result<_, _>>()?;
    let lane = draft.lane_opponent.as_deref().map(get).transpose()?;

    let mut p = String::new();
    let _ = writeln!(
        p,
        "PARCHE ACTUAL: {} (versión de Data Dragon {}). Todo lo que recomiendes debe ser válido en este parche.\n",
        data.patch, data.version
    );
    let _ = writeln!(p, "TU CAMPEÓN: {} — rol {}", describe(me), draft.role);
    if let Some(l) = lane {
        let _ = writeln!(p, "RIVAL DE LÍNEA: {}", describe(l));
    }
    let _ = writeln!(p, "\nALIADOS (tu equipo, NO son rivales):");
    for a in &allies {
        let _ = writeln!(p, "- {}", describe(a));
    }
    if allies.is_empty() {
        let _ = writeln!(p, "- (sin definir)");
    }
    let _ = writeln!(p, "\nRIVALES (equipo enemigo):");
    for e in &enemies {
        let _ = writeln!(p, "- {}", describe(e));
    }
    if enemies.is_empty() {
        let _ = writeln!(p, "- (sin definir)");
    } else {
        let _ = writeln!(p, "Perfil rival: {}", team_profile(&enemies));
    }
    if let Some(n) = draft.notes.as_deref().filter(|n| !n.trim().is_empty()) {
        let _ = writeln!(p, "\nNOTAS DEL JUGADOR: {}", n.trim());
    }

    let _ = writeln!(
        p,
        "\nÍTEMS VÁLIDOS EN ESTE PARCHE (usa estos nombres exactos):\n{}",
        data.items
            .iter()
            .map(|i| i.name.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    );
    let _ = writeln!(
        p,
        "\nRUNAS VÁLIDAS (rama: fila de piedras angulares | resto):"
    );
    for t in &data.rune_trees {
        let rows: Vec<String> = t
            .slots
            .iter()
            .map(|s| {
                s.iter()
                    .map(|r| r.name.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .collect();
        let _ = writeln!(p, "- {}: {}", t.name, rows.join(" | "));
    }

    let _ = writeln!(
        p,
        "\nINSTRUCCIONES:\n\
- Da UNA recomendación concreta y completa: página de runas entera, 3 ítems principales en orden, botas, iniciales, hechizos y orden de habilidades. Nada de \"la que prefieras\" ni \"mira u.gg\".\n\
- Adáptala a ESTOS rivales (daño, curación, CC, tanques) y explica en \"situational\" y \"threats\" qué cambia contra cada amenaza.\n\
- Si usas búsqueda web, usa solo datos del parche {} y descarta los de parches anteriores.\n\
- Si dudas de algo, ponlo en \"caveat\" en una sola línea; no lo repartas por toda la respuesta.\n\
- Responde SOLO con un objeto JSON válido, sin texto antes ni después, con esta forma:\n{SCHEMA}",
        data.patch
    );
    Ok(p)
}

// ---------- parseo y validación ----------

/// Saca el objeto JSON aunque venga envuelto en ```json o con texto alrededor.
pub fn extract_json(text: &str) -> Option<&str> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    (end > start).then(|| &text[start..=end])
}

pub fn parse_card(text: &str) -> Result<RawCard, String> {
    let json = extract_json(text).ok_or("La respuesta no contiene un objeto JSON.")?;
    serde_json::from_str(json).map_err(|e| format!("JSON inválido: {e}"))
}

pub fn validate(raw: &RawCard, data: &GameData) -> (Card, Vec<String>) {
    let mut warnings = Vec::new();
    let mut item = |name: &str| {
        let found = data.item_by_name(name);
        if found.is_none() && !name.trim().is_empty() {
            warnings.push(format!(
                "Ítem \"{name}\" no existe en el parche {}",
                data.patch
            ));
        }
        Ref {
            name: found.map_or(name.to_string(), |i| i.name.clone()),
            image: found.map(|i| i.image.clone()),
            valid: found.is_some(),
        }
    };
    let starting_items = raw.starting_items.iter().map(|n| item(n)).collect();
    let core_items = raw.core_items.iter().map(|n| item(n)).collect();
    let boots = item(&raw.boots);
    let situational = raw
        .situational
        .iter()
        .map(|s| Situational {
            item: item(&s.item),
            when: s.when.clone(),
        })
        .collect();

    let mut rune = |name: &str| {
        let found = data.rune_by_name(name);
        if found.is_none() && !name.trim().is_empty() {
            warnings.push(format!(
                "Runa \"{name}\" no existe en el parche {}",
                data.patch
            ));
        }
        Ref {
            name: found.map_or(name.to_string(), |r| r.name.clone()),
            image: found.map(|r| r.icon.clone()),
            valid: found.is_some(),
        }
    };
    let keystone = rune(&raw.runes.keystone);
    let primary = raw.runes.primary.iter().map(|n| rune(n)).collect();
    let secondary = raw.runes.secondary.iter().map(|n| rune(n)).collect();

    let mut tree = |name: &str| {
        let found = data.tree_by_name(name);
        if found.is_none() && !name.trim().is_empty() {
            warnings.push(format!("Rama de runas \"{name}\" no existe"));
        }
        Ref {
            name: found.map_or(name.to_string(), |t| t.name.clone()),
            image: found.map(|t| t.icon.clone()),
            valid: found.is_some(),
        }
    };
    let runes = Runes {
        primary_tree: tree(&raw.runes.primary_tree),
        keystone,
        primary,
        secondary_tree: tree(&raw.runes.secondary_tree),
        secondary,
    };

    let card = Card {
        summary: raw.summary.clone(),
        starting_items,
        core_items,
        boots,
        situational,
        runes,
        summoner_spells: raw.summoner_spells.clone(),
        skill_order: raw.skill_order.clone(),
        game_plan: raw.game_plan.clone(),
        matchup_tips: raw.matchup_tips.clone(),
        threats: raw.threats.clone(),
        caveat: raw.caveat.clone().filter(|c| !c.trim().is_empty()),
    };
    (card, warnings)
}

// ---------- comando ----------

async fn ask(
    app: &AppHandle,
    kind: ProviderKind,
    prompt: &str,
    session_id: Option<&str>,
    cancel: oneshot::Receiver<()>,
    on_event: &Channel<ChatEvent>,
) -> Result<Collected, String> {
    let collected = Mutex::new(Collected::default());
    let send = |ev: ChatEvent| {
        collected.lock().unwrap().push(&ev);
        // A la UI solo le interesa el progreso, no el JSON a medio llegar.
        if matches!(ev, ChatEvent::Status { .. }) {
            let _ = on_event.send(ev);
        }
    };
    providers::run(
        app,
        kind,
        prompt,
        session_id,
        providers::DEFAULT_TIMEOUT,
        Some(cancel),
        &send,
    )
    .await?;
    let c = collected.into_inner().unwrap();
    match c.error {
        Some(e) => Err(e),
        None => Ok(c),
    }
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn recommend_build(
    app: AppHandle,
    cache: State<'_, ddragon::Cache>,
    running: State<'_, Running>,
    kind: ProviderKind,
    draft: Draft,
    request_id: String,
    on_event: Channel<ChatEvent>,
) -> Result<Recommendation, String> {
    let data = ddragon::get(&app, &cache).await?;
    let prompt = build_prompt(&draft, &data)?;

    let status = |t: &str| {
        let _ = on_event.send(ChatEvent::Status { text: t.into() });
    };
    status("Analizando el draft…");

    let rx = running.register(&request_id);
    let first = ask(&app, kind, &prompt, None, rx, &on_event).await;
    running.finish(&request_id);
    let first = first?;
    let mut session_id = first.session_id.clone();

    // Una ronda de corrección: JSON roto o nombres que no existen en el parche.
    let first_card = parse_card(&first.text);
    let retry_reason = match &first_card {
        Ok(raw) => {
            let (_, warnings) = validate(raw, &data);
            (!warnings.is_empty()).then(|| {
                format!(
                    "Estos nombres no existen en el parche {}: {}. Reemplázalos por ítems o runas de la lista válida.",
                    data.patch,
                    warnings.join("; ")
                )
            })
        }
        Err(e) => Some(format!("Tu respuesta no se pudo leer ({e}).")),
    };

    let raw = match (retry_reason, session_id.clone()) {
        (Some(reason), Some(sid)) => {
            status("Corrigiendo la build…");
            let rx = running.register(&request_id);
            let fix_prompt = format!(
                "{reason} Responde de nuevo SOLO con el objeto JSON completo, con la misma forma."
            );
            let second = ask(&app, kind, &fix_prompt, Some(&sid), rx, &on_event).await;
            running.finish(&request_id);
            let fixed = second.and_then(|c| {
                if c.session_id.is_some() {
                    session_id = c.session_id.clone();
                }
                parse_card(&c.text)
            });
            // Si la corrección falla, nos quedamos con la primera tarjeta (marcada).
            match (fixed, first_card) {
                (Ok(f), _) => f,
                (Err(_), Ok(f)) => f,
                (Err(e), Err(_)) => return Err(e),
            }
        }
        _ => first_card?,
    };

    let (card, warnings) = validate(&raw, &data);
    Ok(Recommendation {
        card,
        warnings,
        session_id,
        patch: data.patch.clone(),
        version: data.version.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ddragon::fixtures;

    fn draft() -> Draft {
        Draft {
            role: "top".into(),
            champion: "Jax".into(),
            allies: vec!["Ahri".into()],
            enemies: vec!["Darius".into(), "Soraka".into()],
            lane_opponent: Some("Darius".into()),
            notes: Some("voy 0/2".into()),
        }
    }

    #[test]
    fn prompt_separates_allies_and_enemies_and_names_patch() {
        let data = fixtures::data();
        let p = build_prompt(&draft(), &data).unwrap();
        assert!(p.contains("PARCHE ACTUAL: 25.22"));
        let allies = p.find("ALIADOS").unwrap();
        let enemies = p.find("RIVALES (equipo enemigo)").unwrap();
        let soraka = p.find("- Soraka").unwrap();
        let ahri = p.find("- Ahri").unwrap();
        assert!(allies < ahri && ahri < enemies && enemies < soraka);
        assert!(p.contains("RIVAL DE LÍNEA: Darius"));
        assert!(p.contains("Fuerza de Trinidad"));
        assert!(p.contains("Conquistador"));
        assert!(p.contains("voy 0/2"));
    }

    #[test]
    fn unknown_champion_is_an_error() {
        let mut d = draft();
        d.enemies.push("Inventado".into());
        assert!(build_prompt(&d, &fixtures::data()).is_err());
    }

    #[test]
    fn team_profile_counts_damage() {
        let data = fixtures::data();
        let e: Vec<&Champion> = ["Darius", "Ahri", "Soraka"]
            .iter()
            .map(|id| data.champion(id).unwrap())
            .collect();
        assert_eq!(
            team_profile(&e),
            "3 rivales: 2 con daño mágico, 1 con daño físico, 0 mixtos, 1 resistentes."
        );
    }

    #[test]
    fn extracts_json_from_fenced_text() {
        let t = "Aquí va:\n```json\n{\"summary\": \"x\"}\n```\n";
        assert_eq!(extract_json(t), Some("{\"summary\": \"x\"}"));
        assert!(extract_json("sin json").is_none());
    }

    #[test]
    fn validates_against_patch() {
        let data = fixtures::data();
        let raw = parse_card(
            r#"{"summary":"Duelo y split","starting_items":["Poción de Vida"],
                "core_items":["fuerza de trinidad","Filo Pirata"],"boots":"Botas de Mercurio",
                "situational":[{"item":"Llamado del Verdugo","when":"contra Soraka"}],
                "runes":{"primary_tree":"Precisión","keystone":"Conquistador","primary":["Triunfo"],
                         "secondary_tree":"Valor","secondary":["Segundo Aliento","Runa Falsa"]},
                "summoner_spells":["Destello","Teleportar"],
                "skill_order":{"max":["Q","W","E"],"first_levels":"E-Q-W"},
                "game_plan":{"early":"a","mid":"b","late":"c"},
                "matchup_tips":["no pelees con 5 stacks"],
                "threats":[{"champion":"Darius","why":"pasiva"}],
                "caveat":""}"#,
        )
        .unwrap();
        let (card, warnings) = validate(&raw, &data);
        assert_eq!(card.core_items[0].name, "Fuerza de Trinidad");
        assert!(card.core_items[0].valid && card.core_items[0].image.is_some());
        assert!(!card.core_items[1].valid);
        assert!(card.runes.keystone.valid);
        assert!(card.runes.secondary_tree.valid);
        assert!(!card.runes.secondary[1].valid);
        assert_eq!(card.caveat, None);
        assert_eq!(warnings.len(), 2);
        assert!(warnings[0].contains("Filo Pirata"));
    }

    #[test]
    fn missing_fields_default_instead_of_failing() {
        let raw = parse_card(r#"{"summary":"solo esto"}"#).unwrap();
        let (card, warnings) = validate(&raw, &fixtures::data());
        assert_eq!(card.summary, "solo esto");
        assert!(card.core_items.is_empty());
        assert!(warnings.is_empty());
    }
}
