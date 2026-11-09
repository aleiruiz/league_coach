//! Recomendación estructurada a partir del draft: el modelo devuelve JSON con
//! un esquema fijo y Rust valida cada ítem y runa contra los datos del parche.

use std::fmt::Write as _;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tokio::sync::oneshot;

use crate::ddragon::{self, Champion, GameData, RuneTree};
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

/// `#[serde(default)]` solo cubre campos ausentes; los modelos a veces mandan
/// `null` (p. ej. `"boots": null` con Cassiopeia). Eso no debe tumbar la tarjeta.
fn null_default<'de, D, T>(d: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    Ok(Option::<T>::deserialize(d)?.unwrap_or_default())
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct RawCard {
    /// Respuesta directa a las notas del jugador (si las hay).
    #[serde(deserialize_with = "null_default")]
    pub answer: String,
    #[serde(deserialize_with = "null_default")]
    pub summary: String,
    #[serde(deserialize_with = "null_default")]
    pub starting_items: Vec<String>,
    #[serde(deserialize_with = "null_default")]
    pub core_items: Vec<String>,
    #[serde(deserialize_with = "null_default")]
    pub boots: String,
    #[serde(deserialize_with = "null_default")]
    pub situational: Vec<RawSituational>,
    #[serde(deserialize_with = "null_default")]
    pub runes: RawRunes,
    #[serde(deserialize_with = "null_default")]
    pub summoner_spells: Vec<String>,
    #[serde(deserialize_with = "null_default")]
    pub skill_order: RawSkills,
    #[serde(deserialize_with = "null_default")]
    pub game_plan: RawPlan,
    #[serde(deserialize_with = "null_default")]
    pub matchup_tips: Vec<String>,
    #[serde(deserialize_with = "null_default")]
    pub threats: Vec<RawThreat>,
    #[serde(deserialize_with = "null_default")]
    pub caveat: Option<String>,
    #[serde(deserialize_with = "null_default")]
    pub stats: Vec<RawStat>,
}

/// Cifra citada de un sitio de estadísticas (u.gg, op.gg…).
#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct RawStat {
    #[serde(deserialize_with = "null_default")]
    pub site: String,
    #[serde(deserialize_with = "null_default")]
    pub url: String,
    #[serde(deserialize_with = "null_default")]
    pub patch: String,
    #[serde(deserialize_with = "null_default")]
    pub about: String,
    pub win_rate: Option<f64>,
    pub pick_rate: Option<f64>,
    pub ban_rate: Option<f64>,
    pub games: Option<u64>,
    #[serde(deserialize_with = "null_default")]
    pub tier: String,
    #[serde(deserialize_with = "null_default")]
    pub rank: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct RawSituational {
    #[serde(deserialize_with = "null_default")]
    pub item: String,
    #[serde(deserialize_with = "null_default")]
    pub when: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct RawRunes {
    #[serde(deserialize_with = "null_default")]
    pub primary_tree: String,
    #[serde(deserialize_with = "null_default")]
    pub keystone: String,
    #[serde(deserialize_with = "null_default")]
    pub primary: Vec<String>,
    #[serde(deserialize_with = "null_default")]
    pub secondary_tree: String,
    #[serde(deserialize_with = "null_default")]
    pub secondary: Vec<String>,
    /// Fragmentos: ofensivo, flexible, defensivo.
    #[serde(deserialize_with = "null_default")]
    pub shards: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Default, Clone)]
#[serde(default)]
pub struct RawSkills {
    /// Orden de maximización, p. ej. ["Q", "E", "W"].
    #[serde(deserialize_with = "null_default")]
    pub max: Vec<String>,
    #[serde(deserialize_with = "null_default")]
    pub first_levels: String,
}

#[derive(Debug, Deserialize, Serialize, Default, Clone)]
#[serde(default)]
pub struct RawPlan {
    #[serde(deserialize_with = "null_default")]
    pub early: String,
    #[serde(deserialize_with = "null_default")]
    pub mid: String,
    #[serde(deserialize_with = "null_default")]
    pub late: String,
}

#[derive(Debug, Deserialize, Serialize, Default, Clone)]
#[serde(default)]
pub struct RawThreat {
    #[serde(deserialize_with = "null_default")]
    pub champion: String,
    #[serde(deserialize_with = "null_default")]
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
    pub shards: Vec<Ref>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct Stat {
    pub site: String,
    pub url: String,
    pub patch: String,
    pub about: String,
    pub win_rate: Option<f64>,
    pub pick_rate: Option<f64>,
    pub ban_rate: Option<f64>,
    pub games: Option<u64>,
    pub tier: Option<String>,
    pub rank: Option<String>,
    /// La cifra es del parche actual.
    pub current_patch: bool,
}

/// Sitios de estadísticas que aceptamos como fuente.
const STAT_SITES: &[(&str, &str)] = &[
    ("u.gg", "u.gg"),
    ("op.gg", "op.gg"),
    ("mobalytics.gg", "Mobalytics"),
    ("lolalytics.com", "Lolalytics"),
    ("leagueofgraphs.com", "League of Graphs"),
    ("metasrc.com", "METAsrc"),
];

/// Parsea la URL como lo haría el navegador (WHATWG) y la acepta solo si es
/// https, sin usuario ni puerto, y de un sitio conocido. Devuelve la URL ya
/// normalizada: lo que se abre es exactamente lo que se validó.
fn stat_url(raw: &str) -> Option<(url::Url, &'static str)> {
    let u = url::Url::parse(raw.trim()).ok()?;
    if u.scheme() != "https"
        || !u.username().is_empty()
        || u.password().is_some()
        || u.port().is_some()
    {
        return None;
    }
    let host = u.host_str()?.to_string();
    let site = STAT_SITES
        .iter()
        .find(|(domain, _)| host == *domain || host.ends_with(&format!(".{domain}")))
        .map(|(_, name)| *name)?;
    Some((u, site))
}

/// Clave para comparar una URL citada con las de los resultados de búsqueda:
/// host sin `www.` y ruta sin `/` final (sin query ni fragmento).
fn url_key(u: &url::Url) -> String {
    let host = u.host_str().unwrap_or_default();
    let host = host.strip_prefix("www.").unwrap_or(host);
    format!("{host}{}", u.path().trim_end_matches('/'))
}

/// Primer `N.N` de un texto («Parche 25.22», «25.22.1» → «25.22»).
fn patch_of(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let start = i;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            if i + 1 < bytes.len() && bytes[i] == b'.' && bytes[i + 1].is_ascii_digit() {
                let major = &text[start..i];
                i += 1;
                let ms = i;
                while i < bytes.len() && bytes[i].is_ascii_digit() {
                    i += 1;
                }
                return Some(format!("{major}.{}", &text[ms..i]));
            }
        } else {
            i += 1;
        }
    }
    None
}

fn short(t: &str) -> Option<String> {
    let t = t.trim();
    (!t.is_empty()).then(|| t.chars().take(60).collect())
}

/// Solo se muestran cifras cuya URL apareció en los resultados de búsqueda de
/// esta consulta (`seen`), de un sitio conocido y con valores con sentido.
/// Devuelve también cuántas se descartaron.
pub fn clean_stats(raw: &[RawStat], data: &GameData, seen: &[String]) -> (Vec<Stat>, usize) {
    let seen: std::collections::HashSet<String> = seen
        .iter()
        .filter_map(|u| url::Url::parse(u).ok())
        .map(|u| url_key(&u))
        .collect();
    let current = [Some(data.patch.clone()), patch_of(&data.version)];
    let pct = |v: Option<f64>| v.filter(|x| (0.0..=100.0).contains(x));
    let kept: Vec<Stat> = raw
        .iter()
        .filter_map(|s| {
            let (u, site) = stat_url(&s.url)?;
            if !seen.contains(&url_key(&u)) {
                return None;
            }
            let (win_rate, pick_rate, ban_rate) =
                (pct(s.win_rate), pct(s.pick_rate), pct(s.ban_rate));
            let tier = short(&s.tier).filter(|t| t.chars().count() <= 3);
            if win_rate.is_none() && pick_rate.is_none() && ban_rate.is_none() && tier.is_none() {
                return None;
            }
            let patch = patch_of(&s.patch);
            Some(Stat {
                site: site.to_string(),
                url: u.to_string(),
                current_patch: patch.is_some() && current.contains(&patch),
                patch: patch.unwrap_or_default(),
                about: short(&s.about).unwrap_or_default(),
                win_rate,
                pick_rate,
                ban_rate,
                games: s.games.filter(|g| (1..=1_000_000_000).contains(g)),
                tier,
                rank: short(&s.rank),
            })
        })
        .collect();
    // Descartadas = sin fuente o con valores sin sentido (no las que corta el tope).
    let dropped = raw.len() - kept.len();
    (kept.into_iter().take(6).collect(), dropped)
}

#[derive(Debug, Serialize, Clone)]
pub struct Card {
    pub answer: Option<String>,
    pub summary: String,
    pub starting_items: Vec<Ref>,
    pub core_items: Vec<Ref>,
    pub boots: Ref,
    pub situational: Vec<Situational>,
    pub runes: Runes,
    pub summoner_spells: Vec<Ref>,
    pub skill_order: RawSkills,
    pub game_plan: RawPlan,
    pub matchup_tips: Vec<String>,
    pub threats: Vec<RawThreat>,
    pub caveat: Option<String>,
    /// Cifras de sitios de estadísticas, cada una con su fuente.
    pub stats: Vec<Stat>,
    /// Cifras que el modelo dio pero no se pudieron atribuir a una búsqueda.
    pub stats_dropped: usize,
    /// El proveedor expone las URLs de su búsqueda (Claude sí; Codex no), así
    /// que sus cifras se pueden comprobar.
    pub stats_verifiable: bool,
}

#[derive(Debug, Serialize)]
pub struct Recommendation {
    pub card: Card,
    /// Nombres que no existen en el parche o no encajan (se muestran marcados).
    pub warnings: Vec<String>,
    /// Partes de la tarjeta que llegaron vacías (para el jugador, no para el modelo).
    pub incomplete: Vec<String>,
    /// Las notas con las que se pidió la build (se citan junto a `answer`).
    pub notes: Option<String>,
    /// El análisis en texto libre del paso 1, del que sale la tarjeta.
    pub analysis: String,
    /// La tarjeta no se pudo armar (p. ej. se agotó el tiempo): se muestra el
    /// análisis solo, con este motivo.
    pub card_error: Option<String>,
    pub session_id: Option<String>,
    pub patch: String,
    pub version: String,
    /// Hubo una ronda de corrección automática (los avisos que queden son
    /// los que el modelo no supo arreglar).
    pub retried: bool,
}

// ---------- prompt ----------

/// Estimación gruesa del tipo de daño a partir de las valoraciones de Riot.
/// MISMOS umbrales que `damageType` en src/draft.ts: si cambias uno, cambia el otro.
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
  "answer": "respuesta a las NOTAS DEL JUGADOR en 3-6 viñetas cortas en markdown (\"- ...\"), o \"\" si no hay notas",
  "summary": "UNA frase: la idea de la build para ESTA partida",
  "starting_items": ["ítem inicial", "..."],
  "core_items": ["ítem 1", "ítem 2", "ítem 3"],
  "boots": "botas",
  "situational": [{"item": "ítem", "when": "cuándo y contra quién comprarlo"}],
  "runes": {
    "primary_tree": "rama principal", "keystone": "piedra angular",
    "primary": ["runa", "runa", "runa"],
    "secondary_tree": "rama secundaria", "secondary": ["runa", "runa"],
    "shards": ["fragmento ofensivo", "fragmento flexible", "fragmento defensivo"]
  },
  "summoner_spells": ["Destello", "..."],
  "skill_order": {"max": ["Q", "E", "W"], "first_levels": "p. ej. Q-E-W"},
  "game_plan": {"early": "...", "mid": "...", "late": "..."},
  "matchup_tips": ["consejo concreto contra el rival de línea", "..."],
  "threats": [{"champion": "rival", "why": "por qué es peligroso y cómo jugarlo"}],
  "caveat": "una sola línea de duda si la hay, o null",
  "stats": [{"site": "u.gg", "url": "URL exacta de la página que leíste", "patch": "parche que muestra la página",
             "about": "qué mide: p. ej. Jax top, o Jax vs Darius", "win_rate": 51.2, "pick_rate": 6.3,
             "ban_rate": 4.1, "games": 12345, "tier": "A", "rank": "Esmeralda+"}]
}"#;

/// Paso 1: el análisis, igual que una pregunta al coach (texto libre y
/// búsqueda web), sin listas de ítems ni esquema que lo distraigan.
pub fn analysis_prompt(draft: &Draft, data: &GameData) -> Result<String, String> {
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
        "PARCHE ACTUAL: {} (versión de Data Dragon {}). Todo lo que recomiendes debe ser válido en este parche. Algunas webs muestran el parche con la versión del cliente ({}): es el mismo parche, no lo descartes.\n",
        data.patch,
        data.version,
        data.version.rsplitn(2, '.').last().unwrap_or(&data.version)
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
        "\nINSTRUCCIONES:\n\
- PRIMERO, si tienes búsqueda web, busca la build de {me} {role} en el parche {patch} (u.gg, op.gg, Mobalytics, Lolalytics…) y, si hay rival de línea, el matchup. Usa solo datos del parche {patch}; descarta los de parches anteriores, y no escribas cifras (win rate, pick rate, partidas): las cifras van aparte, en la tarjeta, donde se comprueban contra tu búsqueda.\n\
- Si hay NOTAS DEL JUGADOR, lo primero y lo principal es responder a fondo lo que preguntan o lo que cambia por esa situación (minuto, oro, marcador…), como lo haría un coach en el chat. Si pregunta qué comprar con cierto oro, di la compra exacta que alcanza con ese oro (un componente vale).\n\
- Después, más corta, la build para ESTA partida: página de runas entera con fragmentos, 2 hechizos, iniciales, 3 ítems principales en orden, botas y orden de habilidades. En situacionales, plan, claves del matchup y amenazas pon solo lo que cambia por ESTOS rivales (daño, curación, CC, tanques), no consejos genéricos. Nada de \"la que prefieras\" ni \"mira u.gg\".\n\
- No afirmes nada de lo que no estés seguro: mejor menos ítems situacionales y bien elegidos.\n\
- Usa los nombres en español del cliente (es_MX). Sé directo; nada de tablas largas.",
        me = me.name,
        role = draft.role,
        patch = data.patch
    );
    Ok(p)
}

/// Paso 2: pasar el análisis (de la misma sesión, o pegado si no hay sesión)
/// a la tarjeta, con los nombres exactos del parche.
pub fn card_prompt(data: &GameData, analysis: Option<&str>) -> String {
    let mut p = String::new();
    match analysis {
        Some(a) => {
            let _ = writeln!(p, "ANÁLISIS:\n{a}\n\nPasa este análisis a una tarjeta.");
        }
        None => {
            let _ = writeln!(p, "Pasa TU análisis anterior a una tarjeta.");
        }
    }
    let _ = writeln!(
        p,
        "No vuelvas a buscar ni cambies las decisiones del análisis: solo escríbelas con los nombres exactos de estas listas. Si un nombre no aparece, usa el equivalente de la lista que más se parezca."
    );
    let names = |f: &dyn Fn(&ddragon::Item) -> bool| {
        data.items
            .iter()
            .filter(|i| f(i))
            .map(|i| i.name.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    };
    // Los componentes no se listan: nunca son la recomendación.
    let _ = writeln!(
        p,
        "\nÍTEMS DEL PARCHE {} (no uses componentes):\n\
- INICIALES (solo para starting_items): {}\n\
- INICIAL DE SOPORTE (obligatorio en starting_items si juegas de soporte, y solo entonces): {}\n\
- BOTAS (solo para boots): {}\n\
- COMPLETOS (para core_items y situational): {}",
        data.patch,
        names(&|i| i.starter && !i.support),
        names(&|i| i.support),
        names(&|i| i.completed && is_boots(i)),
        names(&|i| i.completed && !is_boots(i)),
    );
    let _ = writeln!(
        p,
        "\nHECHIZOS DE INVOCADOR: {}",
        data.spells
            .iter()
            .map(|s| s.name.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    );
    let _ = writeln!(
        p,
        "\nRUNAS VÁLIDAS (rama: piedras angulares | fila 1 | fila 2 | fila 3). La piedra angular sale de la primera fila de la rama principal; las 3 runas principales, una por cada fila de esa rama; las 2 secundarias, de filas distintas de otra rama:"
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
    let _ = writeln!(p, "\nFRAGMENTOS (uno por fila, en orden):");
    for (i, row) in ddragon::SHARDS.iter().enumerate() {
        let names: Vec<&str> = row.iter().map(|(n, _)| *n).collect();
        let _ = writeln!(p, "- Fila {}: {}", i + 1, names.join(", "));
    }
    let _ = writeln!(
        p,
        "\nREGLAS:\n\
- \"answer\" es la respuesta a las notas del jugador (\"\" si no hay notas): 3-6 viñetas cortas con lo que tiene que hacer, sin repetir runas ni la build (ya van en la tarjeta); \"summary\", UNA frase. Ningún campo lleva dudas ni correcciones (\"no, mejor…\", \"ver abajo\"): la duda, si la hay, va solo en \"caveat\".\n\
- En \"stats\" pon SOLO cifras que salieron en los resultados de tu búsqueda web en esta conversación (u.gg, op.gg, Mobalytics, Lolalytics, League of Graphs o METAsrc), con la URL exacta de ese resultado y el parche que indique; null en lo que no diga. Si no buscaste, \"stats\": []. Nunca cifras de memoria: se descartan las que no correspondan a un resultado de búsqueda.\n\
- Responde SOLO con un bloque ```json con esta forma:\n{SCHEMA}"
    );
    p
}

// ---------- parseo y validación ----------

/// Saca el objeto JSON aunque venga envuelto en ```json o con texto alrededor.
pub fn extract_json(text: &str) -> Option<&str> {
    // El modelo razona antes del JSON: si hay un bloque ```json, manda el último.
    if let Some(i) = text.rfind("```json") {
        let body = &text[i + "```json".len()..];
        let body = body.find("```").map_or(body, |end| &body[..end]);
        if let (Some(a), Some(b)) = (body.find('{'), body.rfind('}'))
            && b > a
        {
            return Some(&body[a..=b]);
        }
    }
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    (end > start).then(|| &text[start..=end])
}

pub fn parse_card(text: &str) -> Result<RawCard, String> {
    let json = extract_json(text).ok_or("La respuesta no contiene un objeto JSON.")?;
    serde_json::from_str(json).map_err(|e| format!("JSON inválido: {e}"))
}

fn is_boots(i: &ddragon::Item) -> bool {
    i.tags.iter().any(|t| t == "Boots")
}

/// Fila de `tree` donde está la runa (0 = piedras angulares).
fn row_in<'a>(tree: &'a RuneTree, name: &str) -> Option<(usize, &'a ddragon::Rune)> {
    let n = ddragon::normalize(name);
    tree.slots.iter().enumerate().find_map(|(row, runes)| {
        runes
            .iter()
            .find(|r| ddragon::normalize(&r.name) == n)
            .map(|r| (row, r))
    })
}

/// Campos que la tarjeta necesita y llegaron vacíos (JSON cortado, o el
/// modelo se quedó a medias). Disparan la ronda de corrección.
/// Cada uno va como (instrucción para el modelo, nombre para el jugador).
pub fn missing(raw: &RawCard, draft: &Draft) -> Vec<(String, &'static str)> {
    let mut out = Vec::new();
    let mut need = |empty: bool, fix: &str, label: &'static str| {
        if empty {
            out.push((format!("Falta {fix}"), label));
        }
    };
    let blank = |t: &str| t.trim().is_empty();
    let has_notes = draft.notes.as_deref().is_some_and(|n| !blank(n));
    need(
        has_notes && blank(&raw.answer),
        "\"answer\": responde a las notas del jugador",
        "la respuesta a tu pregunta",
    );
    need(blank(&raw.summary), "\"summary\"", "el resumen");
    need(
        raw.starting_items.is_empty(),
        "\"starting_items\"",
        "los ítems iniciales",
    );
    need(
        raw.core_items.len() < 3,
        "\"core_items\": van 3 ítems completos",
        "los 3 ítems principales",
    );
    // Cassiopeia no puede comprar botas.
    need(
        blank(&raw.boots) && draft.champion != "Cassiopeia",
        "\"boots\"",
        "las botas",
    );
    let r = &raw.runes;
    need(
        blank(&r.primary_tree) || blank(&r.keystone) || r.primary.is_empty(),
        "la rama principal de runas con su piedra angular y 3 runas",
        "la rama principal de runas",
    );
    need(
        blank(&r.secondary_tree) || r.secondary.is_empty(),
        "la rama secundaria con 2 runas",
        "la rama secundaria de runas",
    );
    need(r.shards.is_empty(), "los 3 fragmentos", "los fragmentos");
    need(
        raw.summoner_spells.len() != 2,
        "\"summoner_spells\": van 2 hechizos",
        "los hechizos de invocador",
    );
    need(
        raw.skill_order.max.is_empty(),
        "\"skill_order.max\"",
        "el orden de habilidades",
    );
    let p = &raw.game_plan;
    need(
        blank(&p.early) || blank(&p.mid) || blank(&p.late),
        "\"game_plan\" (early, mid y late)",
        "el plan de partida",
    );
    out
}

pub fn validate(raw: &RawCard, data: &GameData, draft: &Draft) -> (Card, Vec<String>) {
    let mut warnings = Vec::new();
    let patch = &data.patch;

    // ítems: existen y, para core/situacionales/botas, son del tipo correcto
    #[derive(Clone, Copy, PartialEq)]
    enum Slot {
        Start,
        Core,
        Boots,
    }
    let mut item = |name: &str, slot: Slot| {
        let found = data.item_by_name(name);
        let mut valid = found.is_some();
        match found {
            None if !name.trim().is_empty() => {
                warnings.push(format!("Ítem \"{name}\" no existe en el parche {patch}"))
            }
            Some(i) if slot == Slot::Core && (!i.completed || is_boots(i)) => {
                valid = false;
                warnings.push(format!(
                    "\"{}\" no es un ítem completo; usa uno de la lista de COMPLETOS",
                    i.name
                ));
            }
            Some(i) if slot == Slot::Start && !i.starter && !i.completed => {
                valid = false;
                warnings.push(format!(
                    "\"{}\" es un componente, no un ítem inicial; usa uno de la lista de INICIALES",
                    i.name
                ));
            }
            Some(i) if slot == Slot::Start && i.completed => {
                valid = false;
                warnings.push(format!(
                    "\"{}\" no es un ítem inicial; usa uno de la lista de INICIALES",
                    i.name
                ));
            }
            Some(i) if slot == Slot::Start && i.support && draft.role != "support" => {
                valid = false;
                warnings.push(format!(
                    "\"{}\" es el inicial de soporte y tu rol es {}",
                    i.name, draft.role
                ));
            }
            Some(i) if slot == Slot::Boots && !is_boots(i) => {
                valid = false;
                warnings.push(format!("\"{}\" no son botas", i.name));
            }
            _ => {}
        }
        Ref {
            name: found.map_or(name.to_string(), |i| i.name.clone()),
            image: found.map(|i| i.image.clone()),
            valid,
        }
    };
    let starting_items: Vec<Ref> = raw
        .starting_items
        .iter()
        .map(|n| item(n, Slot::Start))
        .collect();
    let core_items = raw.core_items.iter().map(|n| item(n, Slot::Core)).collect();
    let boots = item(&raw.boots, Slot::Boots);
    let situational = raw
        .situational
        .iter()
        .map(|s| Situational {
            item: item(&s.item, Slot::Core),
            when: s.when.clone(),
        })
        .collect();

    let support_start = raw
        .starting_items
        .iter()
        .filter_map(|n| data.item_by_name(n))
        .any(|i| i.support);
    if draft.role == "support" && !raw.starting_items.is_empty() && !support_start {
        let atlas: Vec<&str> = data
            .items
            .iter()
            .filter(|i| i.support)
            .map(|i| i.name.as_str())
            .collect();
        warnings.push(format!(
            "Como soporte, los iniciales deben incluir {}",
            atlas.join(" o ")
        ));
    }

    // runas: además de existir, tienen que formar una página posible
    let r = &raw.runes;
    let primary_tree = data.tree_by_name(&r.primary_tree);
    let secondary_tree = data.tree_by_name(&r.secondary_tree);
    let tree_ref = |name: &str, t: Option<&RuneTree>, warnings: &mut Vec<String>| {
        if t.is_none() && !name.trim().is_empty() {
            warnings.push(format!("Rama de runas \"{name}\" no existe"));
        }
        Ref {
            name: t.map_or(name.to_string(), |t| t.name.clone()),
            image: t.map(|t| t.icon.clone()),
            valid: t.is_some(),
        }
    };
    let primary_tree_ref = tree_ref(&r.primary_tree, primary_tree, &mut warnings);
    let mut secondary_tree_ref = tree_ref(&r.secondary_tree, secondary_tree, &mut warnings);
    if primary_tree
        .zip(secondary_tree)
        .is_some_and(|(a, b)| a.id == b.id)
    {
        secondary_tree_ref.valid = false;
        warnings.push("La rama secundaria no puede ser la misma que la principal".into());
    }

    // `rows`: filas permitidas; `used`: filas ya ocupadas (no se repiten).
    let mut rune = |name: &str,
                    tree: Option<&RuneTree>,
                    rows: std::ops::RangeInclusive<usize>,
                    what: &str,
                    used: &mut Vec<usize>| {
        let global = data.rune_by_name(name);
        let in_tree = tree.and_then(|t| row_in(t, name));
        let mut valid = global.is_some();
        if global.is_none() {
            if !name.trim().is_empty() {
                warnings.push(format!("Runa \"{name}\" no existe en el parche {patch}"));
            }
        } else if let Some(t) = tree {
            match in_tree {
                None => {
                    valid = false;
                    warnings.push(format!("\"{name}\" no es de la rama {}", t.name));
                }
                Some((row, _)) if !rows.contains(&row) => {
                    valid = false;
                    warnings.push(format!("\"{name}\" no puede ir como {what}"));
                }
                Some((row, _)) if used.contains(&row) => {
                    valid = false;
                    warnings.push(format!("\"{name}\" repite fila de {}", t.name));
                }
                Some((row, _)) => used.push(row),
            }
        }
        let found = in_tree.map(|(_, r)| r).or(global);
        Ref {
            name: found.map_or(name.to_string(), |r| r.name.clone()),
            image: found.map(|r| r.icon.clone()),
            valid,
        }
    };
    let mut used = Vec::new();
    let keystone = rune(
        &r.keystone,
        primary_tree,
        0..=0,
        "piedra angular",
        &mut used,
    );
    let primary: Vec<Ref> = r
        .primary
        .iter()
        .map(|n| rune(n, primary_tree, 1..=3, "runa principal", &mut used))
        .collect();
    let mut used = Vec::new();
    let secondary: Vec<Ref> = r
        .secondary
        .iter()
        .map(|n| rune(n, secondary_tree, 1..=3, "runa secundaria", &mut used))
        .collect();
    if !r.primary.is_empty() && primary.len() != 3 {
        warnings.push(format!(
            "Faltan runas principales: van 3 (llegaron {})",
            primary.len()
        ));
    }
    if !r.secondary.is_empty() && secondary.len() != 2 {
        warnings.push(format!(
            "Van 2 runas secundarias (llegaron {})",
            secondary.len()
        ));
    }
    let shards: Vec<Ref> = r
        .shards
        .iter()
        .enumerate()
        .map(|(i, name)| {
            let found = ddragon::SHARDS.get(i).and_then(|row| {
                row.iter()
                    .find(|(n, _)| ddragon::normalize(n) == ddragon::normalize(name))
            });
            if found.is_none() && !name.trim().is_empty() {
                warnings.push(format!("Fragmento \"{name}\" no va en la fila {}", i + 1));
            }
            Ref {
                name: found.map_or(name.to_string(), |(n, _)| n.to_string()),
                image: found.map(|(_, f)| ddragon::shard_icon(f)),
                valid: found.is_some(),
            }
        })
        .collect();
    if !shards.is_empty() && shards.len() != 3 {
        warnings.push(format!(
            "Van 3 fragmentos de estadística (llegaron {})",
            shards.len()
        ));
    }
    let runes = Runes {
        primary_tree: primary_tree_ref,
        keystone,
        primary,
        secondary_tree: secondary_tree_ref,
        secondary,
        shards,
    };

    let summoner_spells = raw
        .summoner_spells
        .iter()
        .map(|name| {
            let found = data.spell_by_name(name);
            if found.is_none() && !name.trim().is_empty() {
                warnings.push(format!("Hechizo \"{name}\" no existe en la Grieta"));
            }
            Ref {
                name: found.map_or(name.to_string(), |s| s.name.clone()),
                image: found.map(|s| s.image.clone()),
                valid: found.is_some(),
            }
        })
        .collect();

    let card = Card {
        answer: Some(raw.answer.trim().to_string()).filter(|a| !a.is_empty()),
        summary: raw.summary.clone(),
        starting_items,
        core_items,
        boots,
        situational,
        runes,
        summoner_spells,
        skill_order: raw.skill_order.clone(),
        game_plan: raw.game_plan.clone(),
        matchup_tips: raw.matchup_tips.clone(),
        threats: raw.threats.clone(),
        caveat: raw.caveat.clone().filter(|c| !c.trim().is_empty()),
        // Se completan en `recommend_build`, que sabe qué devolvió la búsqueda.
        stats: Vec::new(),
        stats_dropped: 0,
        stats_verifiable: true,
    };
    (card, warnings)
}

// ---------- comando ----------

/// El análisis busca en la web y razona: se le da más margen que a los pasos
/// de formato, que solo convierten texto ya escrito.
const ANALYSIS_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(360);

async fn ask(
    app: &AppHandle,
    kind: ProviderKind,
    prompt: &str,
    session_id: Option<&str>,
    timeout: std::time::Duration,
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
    providers::run(app, kind, prompt, session_id, timeout, Some(cancel), &send).await?;
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
    let prompt = analysis_prompt(&draft, &data)?;

    let status = |t: &str| {
        let _ = on_event.send(ChatEvent::Status { text: t.into() });
    };
    status("1/2 · Analizando el draft (busca en la web, puede tardar)…");

    // Paso 1: análisis libre con búsqueda, como en el chat del coach.
    let rx = running.register(&request_id);
    let analysis = ask(&app, kind, &prompt, None, ANALYSIS_TIMEOUT, rx, &on_event).await;
    // Cada paso registra el siguiente en cuanto termina el anterior, para que
    // un «Detener» pulsado entre medias no se pierda.
    let card_cancel = running.register(&request_id);
    let analysis = match analysis {
        Ok(c) => c,
        Err(e) => {
            running.finish(&request_id);
            return Err(e);
        }
    };
    // URLs que devolvió la búsqueda en todos los pasos (fuentes válidas para `stats`).
    let mut seen = analysis.sources.clone();
    let analysis_text = analysis.text.trim().to_string();

    // Paso 2: pasar ese análisis a la tarjeta, en la misma sesión si la hay.
    status("2/2 · Armando la tarjeta…");
    let card_req = match &analysis.session_id {
        Some(_) => card_prompt(&data, None),
        None => card_prompt(&data, Some(&analysis_text)),
    };
    let first = ask(
        &app,
        kind,
        &card_req,
        analysis.session_id.as_deref(),
        providers::DEFAULT_TIMEOUT,
        card_cancel,
        &on_event,
    )
    .await;
    let retry_cancel = running.register(&request_id);
    let mut session_id = analysis.session_id.clone();
    // Si la tarjeta falla pero el análisis existe, se devuelve el análisis en
    // vez de perder minutos de trabajo; solo un «Detener» corta del todo.
    let fallback = |e: String, session_id: Option<String>, seen: &[String], retried: bool| {
        if e.starts_with("Consulta detenida") || analysis_text.is_empty() {
            return Err(e);
        }
        let mut rec = assemble(&RawCard::default(), &data, &draft, seen, kind, retried);
        rec.card_error = Some(e);
        rec.warnings.clear();
        rec.incomplete.clear();
        rec.analysis = analysis_text.clone();
        rec.session_id = session_id;
        Ok(rec)
    };
    let first = match first {
        Ok(c) => c,
        Err(e) => {
            running.finish(&request_id);
            return fallback(e, session_id, &seen, false);
        }
    };
    if first.session_id.is_some() {
        session_id = first.session_id.clone();
    }
    seen.extend(first.sources.iter().cloned());

    // Una ronda de corrección: JSON roto o nombres que no existen en el parche.
    let first_card = parse_card(&first.text);
    let retry_reason = match &first_card {
        Ok(raw) => {
            let (_, mut warnings) = validate(raw, &data, &draft);
            warnings.extend(missing(raw, &draft).into_iter().map(|(fix, _)| fix));
            (!warnings.is_empty()).then(|| {
                format!(
                    "Hay problemas con el parche {}: {}. Corrígelos usando solo las listas válidas.",
                    data.patch,
                    warnings.join("; ")
                )
            })
        }
        Err(e) => Some(format!("Tu respuesta no se pudo leer ({e}).")),
    };

    let mut retried = false;
    let raw = match (retry_reason, session_id.clone()) {
        (Some(reason), Some(sid)) => {
            status("2/2 · Corrigiendo la tarjeta…");
            retried = true;
            let fix_prompt = format!(
                "{reason} Sin volver a buscar, responde de nuevo SOLO con el objeto JSON completo, con la misma forma."
            );
            let second = ask(
                &app,
                kind,
                &fix_prompt,
                Some(&sid),
                providers::DEFAULT_TIMEOUT,
                retry_cancel,
                &on_event,
            )
            .await;
            running.finish(&request_id);
            // Si el usuario detuvo la corrección, se respeta en vez de mostrar
            // la primera tarjeta como si nada.
            if let Some(e) = second
                .as_ref()
                .err()
                .filter(|e| e.starts_with("Consulta detenida"))
            {
                return Err(e.clone());
            }
            let fixed = second.and_then(|c| {
                if c.session_id.is_some() {
                    session_id = c.session_id.clone();
                }
                seen.extend(c.sources.iter().cloned());
                parse_card(&c.text)
            });
            // Si la corrección falla, nos quedamos con la primera tarjeta (marcada).
            match (fixed, first_card) {
                (Ok(f), _) => f,
                (Err(_), Ok(f)) => f,
                (Err(e), Err(_)) => return fallback(e, session_id, &seen, true),
            }
        }
        _ => {
            running.finish(&request_id);
            match first_card {
                Ok(c) => c,
                Err(e) => return fallback(e, session_id, &seen, false),
            }
        }
    };

    let mut rec = assemble(&raw, &data, &draft, &seen, kind, retried);
    rec.analysis = analysis_text.clone();
    rec.session_id = session_id;
    Ok(rec)
}

/// Arma la respuesta final a partir de la tarjeta (validada y con las cifras
/// filtradas por las fuentes que de verdad salieron en la búsqueda).
fn assemble(
    raw: &RawCard,
    data: &GameData,
    draft: &Draft,
    seen: &[String],
    kind: ProviderKind,
    retried: bool,
) -> Recommendation {
    let (mut card, warnings) = validate(raw, data, draft);
    let incomplete = missing(raw, draft)
        .into_iter()
        .map(|(_, label)| label.to_string())
        .collect();
    (card.stats, card.stats_dropped) = clean_stats(&raw.stats, data, seen);
    card.stats_verifiable = kind == ProviderKind::ClaudeCode;
    Recommendation {
        card,
        warnings,
        incomplete,
        notes: draft
            .notes
            .as_deref()
            .map(str::trim)
            .filter(|n| !n.is_empty())
            .map(String::from),
        analysis: String::new(),
        card_error: None,
        session_id: None,
        patch: data.patch.clone(),
        version: data.version.clone(),
        retried,
    }
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
        let p = analysis_prompt(&draft(), &data).unwrap();
        assert!(p.contains("PARCHE ACTUAL: 25.22"));
        let allies = p.find("ALIADOS").unwrap();
        let enemies = p.find("RIVALES (equipo enemigo)").unwrap();
        let soraka = p.find("- Soraka").unwrap();
        let ahri = p.find("- Ahri").unwrap();
        assert!(allies < ahri && ahri < enemies && enemies < soraka);
        assert!(p.contains("RIVAL DE LÍNEA: Darius"));
        assert!(p.contains("voy 0/2"));
        // El análisis no lleva listas ni esquema: eso va en el paso 2.
        assert!(!p.contains("Fuerza de Trinidad"));
        assert!(!p.contains("```json"));
        let c = card_prompt(&data, None);
        assert!(c.contains("Fuerza de Trinidad"));
        assert!(c.contains("Conquistador"));
    }

    #[test]
    fn unknown_champion_is_an_error() {
        let mut d = draft();
        d.enemies.push("Inventado".into());
        assert!(analysis_prompt(&d, &fixtures::data()).is_err());
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
    fn prompt_groups_items_and_asks_to_search_first() {
        let a = analysis_prompt(&draft(), &fixtures::data()).unwrap();
        assert!(a.contains("busca la build de Jax top en el parche 25.22"));
        let p = card_prompt(&fixtures::data(), None);
        assert!(p.contains("- INICIALES (solo para starting_items): Escudo de Doran"));
        assert!(p.contains(
            "obligatorio en starting_items si juegas de soporte, y solo entonces): Mapamundi\n"
        ));
        assert!(p.contains("- BOTAS (solo para boots): Botas de Mercurio\n"));
        // Los componentes no se ofrecen.
        assert!(!p.contains("Llamado del Verdugo"));
        assert!(p.contains("Pasa TU análisis anterior"));
        assert!(p.contains("\"answer\""));
        // Sin sesión que retomar, el análisis va pegado en el pedido.
        let pasted = card_prompt(&fixtures::data(), Some("Conquistador y Trinidad"));
        assert!(pasted.starts_with("ANÁLISIS:\nConquistador y Trinidad"));
    }

    #[test]
    fn last_json_block_wins_over_reasoning() {
        let t = "Busqué {u.gg}. Dudo entre {A} y {B}.\n```json\n{\"summary\": \"x\"}\n```\nlisto";
        assert_eq!(extract_json(t), Some("{\"summary\": \"x\"}"));
    }

    #[test]
    fn empty_required_fields_are_reported() {
        let raw = parse_card(GOOD).unwrap();
        let m = missing(&raw, &draft());
        // Las notas piden respuesta y GOOD trae un solo ítem principal.
        assert_eq!(m.len(), 2, "{m:?}");
        assert!(m[0].0.contains("answer"));
        assert_eq!(m[0].1, "la respuesta a tu pregunta");
        assert!(m[1].0.contains("core_items"));

        let mut d = draft();
        d.notes = None;
        let empty = parse_card(r#"{"summary":"x","runes":null}"#).unwrap();
        let m = missing(&empty, &d);
        assert!(m.iter().any(|w| w.0.contains("rama principal")), "{m:?}");
        assert!(m.iter().any(|w| w.0.contains("summoner_spells")));
        assert!(!m.iter().any(|w| w.0.contains("answer")));

        d.champion = "Cassiopeia".into();
        assert!(!missing(&empty, &d).iter().any(|w| w.0.contains("boots")));
    }

    #[test]
    fn starting_items_match_the_role() {
        let data = fixtures::data();
        let card = |start: &str| parse_card(&GOOD.replace(r#"["Poción de Vida"]"#, start)).unwrap();
        let mut support = draft();
        support.role = "support".into();

        let (_, w) = validate(
            &card(r#"["Escudo de Doran","Poción de Vida"]"#),
            &data,
            &support,
        );
        assert!(w.iter().any(|w| w.contains("Mapamundi")), "{w:?}");
        let (_, w) = validate(&card(r#"["Mapamundi","Poción de Vida"]"#), &data, &support);
        assert!(w.is_empty(), "{w:?}");

        let (c, w) = validate(&card(r#"["Mapamundi"]"#), &data, &draft());
        assert!(!c.starting_items[0].valid, "{w:?}");
        let (c, _) = validate(&card(r#"["Fuerza de Trinidad"]"#), &data, &draft());
        assert!(!c.starting_items[0].valid);
        let (c, w) = validate(&card(r#"["Llamado del Verdugo"]"#), &data, &draft());
        assert!(!c.starting_items[0].valid);
        assert!(w[0].contains("componente"), "{w:?}");
    }

    #[test]
    fn extracts_json_from_fenced_text() {
        let t = "Aquí va:\n```json\n{\"summary\": \"x\"}\n```\n";
        assert_eq!(extract_json(t), Some("{\"summary\": \"x\"}"));
        assert!(extract_json("sin json").is_none());
    }

    const GOOD: &str = r#"{"summary":"Duelo y split","starting_items":["Poción de Vida"],
        "core_items":["fuerza de trinidad"],"boots":"Botas de Mercurio",
        "situational":[],
        "runes":{"primary_tree":"Precisión","keystone":"Conquistador",
                 "primary":["Triunfo","Leyenda: Presteza","Último Esfuerzo"],
                 "secondary_tree":"Valor","secondary":["Segundo Aliento","Demoler"],
                 "shards":["Velocidad de ataque","fuerza adaptable","Vida"]},
        "summoner_spells":["Destello","Teleportar"],
        "skill_order":{"max":["Q","W","E"],"first_levels":"E-Q-W"},
        "game_plan":{"early":"a","mid":"b","late":"c"},
        "matchup_tips":["no pelees con 5 stacks"],
        "threats":[{"champion":"Darius","why":"pasiva"}],
        "caveat":""}"#;

    fn check(json: &str) -> (Card, Vec<String>) {
        validate(&parse_card(json).unwrap(), &fixtures::data(), &draft())
    }

    #[test]
    fn valid_card_has_no_warnings() {
        let (card, warnings) = check(GOOD);
        assert!(warnings.is_empty(), "{warnings:?}");
        assert_eq!(card.core_items[0].name, "Fuerza de Trinidad");
        assert!(card.core_items[0].image.is_some());
        assert!(
            card.summoner_spells
                .iter()
                .all(|s| s.valid && s.image.is_some())
        );
        assert_eq!(card.caveat, None);
    }

    #[test]
    fn unknown_names_are_flagged() {
        let (card, warnings) = check(
            &GOOD
                .replace(
                    r#"["fuerza de trinidad"]"#,
                    r#"["fuerza de trinidad","Filo Pirata"]"#,
                )
                .replace(r#""Demoler""#, r#""Runa Falsa""#)
                .replace("Teleportar", "Marcar"),
        );
        assert!(!card.core_items[1].valid);
        assert!(!card.runes.secondary[1].valid);
        assert!(!card.summoner_spells[1].valid);
        assert_eq!(warnings.len(), 3, "{warnings:?}");
    }

    #[test]
    fn components_and_wrong_boots_are_flagged() {
        let (card, warnings) = check(
            &GOOD
                .replace(r#"["fuerza de trinidad"]"#, r#"["Llamado del Verdugo"]"#)
                .replace(
                    r#""boots":"Botas de Mercurio""#,
                    r#""boots":"Fuerza de Trinidad""#,
                ),
        );
        assert!(!card.core_items[0].valid);
        assert!(!card.boots.valid);
        assert_eq!(warnings.len(), 2, "{warnings:?}");
    }

    #[test]
    fn rune_page_structure_is_checked() {
        // Triunfo no es piedra angular; Garras es de otra rama; secundaria repetida de fila.
        let (card, warnings) = check(
            &GOOD
                .replace(r#""keystone":"Conquistador""#, r#""keystone":"Triunfo""#)
                .replace(
                    r#""primary":["Triunfo","#,
                    r#""primary":["Claridad Mental","#,
                )
                .replace(r#""Último Esfuerzo""#, r#""Garras del Inmortal""#),
        );
        assert!(!card.runes.keystone.valid);
        assert!(card.runes.primary[0].valid);
        assert!(!card.runes.primary[2].valid);
        assert_eq!(warnings.len(), 2, "{warnings:?}");

        let (card, warnings) = check(&GOOD.replace(
            r#""secondary_tree":"Valor""#,
            r#""secondary_tree":"Precisión""#,
        ));
        assert!(!card.runes.secondary_tree.valid);
        assert!(warnings.iter().any(|w| w.contains("misma")));

        let (_, warnings) =
            check(&GOOD.replace(r#""Segundo Aliento","Demoler""#, r#""Segundo Aliento""#));
        assert!(warnings.iter().any(|w| w.contains("Van 2")));
    }

    #[test]
    fn shards_are_checked_by_row() {
        let (card, _) = check(GOOD);
        assert!(
            card.runes
                .shards
                .iter()
                .all(|s| s.valid && s.image.is_some())
        );
        let (card, warnings) = check(&GOOD.replace(r#""Vida"]"#, r#""Velocidad de ataque"]"#));
        assert!(!card.runes.shards[2].valid);
        assert_eq!(warnings.len(), 1, "{warnings:?}");
    }

    #[test]
    fn stats_need_a_known_https_source_seen_in_search() {
        let raw: Vec<RawStat> = serde_json::from_str(
            r#"[
              {"url":"https://U.GG/lol/champions/jax/build/top/","patch":"Parche 25.22","about":"Jax top","win_rate":51.2,"games":12000,"tier":"A"},
              {"url":"https://op.gg/champions/jax/top/build","patch":"25.21","win_rate":50.1,"games":0},
              {"url":"https://u.gg/lol/champions/jax/build/mid","patch":"25.22","win_rate":52.7},
              {"url":"https://misstats.example/jax","win_rate":60},
              {"url":"http://u.gg/lol/champions/jax/build/top","win_rate":51},
              {"url":"https://evil.com\\.u.gg/lol/champions/jax/build/top","win_rate":51},
              {"url":"https://u.gg%2eevil.com/lol/champions/jax/build/top","win_rate":51},
              {"url":"https://u.gg.evil.com/lol/champions/jax/build/top","win_rate":51},
              {"url":"https://user@u.gg/lol/champions/jax/build/top","win_rate":51},
              {"url":"https://u.gg/lol/champions/jax/build/top","win_rate":140},
              {"url":"","win_rate":51}
            ]"#,
        )
        .unwrap();
        // Lo que devolvió la búsqueda (la ruta /mid no estaba).
        let seen = vec![
            "https://u.gg/lol/champions/jax/build/top".to_string(),
            "https://www.op.gg/champions/jax/top/build?region=global".to_string(),
            "https://evil.com/".to_string(),
        ];
        let (s, dropped) = clean_stats(&raw, &fixtures::data(), &seen);
        assert_eq!(s.len(), 2, "{s:?}");
        assert_eq!(dropped, 9);
        assert_eq!(s[0].site, "u.gg");
        assert_eq!(s[0].url, "https://u.gg/lol/champions/jax/build/top/");
        assert_eq!(s[0].patch, "25.22");
        assert!(s[0].current_patch);
        assert_eq!(s[1].site, "op.gg");
        assert!(!s[1].current_patch);
        assert_eq!(s[1].games, None);
    }

    #[test]
    fn stats_without_search_are_dropped() {
        let raw: Vec<RawStat> = serde_json::from_str(
            r#"[{"url":"https://u.gg/lol/champions/jax/build","win_rate":52.7}]"#,
        )
        .unwrap();
        let (s, dropped) = clean_stats(&raw, &fixtures::data(), &[]);
        assert!(s.is_empty());
        assert_eq!(dropped, 1);
    }

    #[test]
    fn patch_numbers_are_extracted() {
        assert_eq!(patch_of("Parche 25.22"), Some("25.22".into()));
        assert_eq!(patch_of("15.22.1"), Some("15.22".into()));
        assert_eq!(patch_of("sin parche"), None);
    }

    #[test]
    fn nulls_do_not_break_the_card() {
        let (card, warnings) = check(
            r#"{"summary":"Cassiopeia","boots":null,"core_items":null,"situational":[{"item":"Fuerza de Trinidad","when":null}],
                "runes":{"keystone":null},"skill_order":null,"caveat":null}"#,
        );
        assert_eq!(card.summary, "Cassiopeia");
        assert_eq!(card.boots.name, "");
        assert!(card.core_items.is_empty());
        assert_eq!(card.situational[0].when, "");
        assert!(warnings.is_empty(), "{warnings:?}");
    }

    #[test]
    fn missing_fields_default_instead_of_failing() {
        let raw = parse_card(r#"{"summary":"solo esto"}"#).unwrap();
        let (card, warnings) = validate(&raw, &fixtures::data(), &draft());
        assert_eq!(card.summary, "solo esto");
        assert!(card.core_items.is_empty());
        assert!(warnings.is_empty());
    }
}
