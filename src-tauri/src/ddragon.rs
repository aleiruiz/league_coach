//! Datos oficiales del parche (Data Dragon de Riot): campeones, ítems y runas.
//!
//! Se descargan una vez por parche y se guardan en la carpeta de datos de la
//! app. Al abrir, solo se consulta la lista de versiones (un archivo pequeño);
//! si no hay internet se usa el último parche descargado.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

const BASE: &str = "https://ddragon.leagueoflegends.com";
const LOCALE: &str = "es_MX";
const FILES: [&str; 4] = [
    "champion.json",
    "item.json",
    "runesReforged.json",
    "summoner.json",
];
/// Mapa de la Grieta del Invocador en Data Dragon.
const SUMMONERS_RIFT: &str = "11";

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Champion {
    pub id: String,
    pub name: String,
    pub title: String,
    pub tags: Vec<String>,
    /// Valoraciones 0-10 de Riot (`info`): sirven para estimar el tipo de daño.
    pub attack: u8,
    pub magic: u8,
    pub defense: u8,
    pub image: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Item {
    pub id: String,
    pub name: String,
    pub plaintext: String,
    pub gold: u32,
    pub tags: Vec<String>,
    /// Ítem final (no se combina en otro) o botas: lo que tiene sentido recomendar.
    pub completed: bool,
    pub image: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Rune {
    pub id: u32,
    pub name: String,
    pub short_desc: String,
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct RuneTree {
    pub id: u32,
    pub name: String,
    pub icon: String,
    /// `slots[0]` son las piedras angulares.
    pub slots: Vec<Vec<Rune>>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Spell {
    pub id: String,
    pub name: String,
    pub image: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GameData {
    pub version: String,
    /// Parche como lo llama la comunidad (p. ej. "25.22" para la versión "15.22.1").
    pub patch: String,
    pub champions: Vec<Champion>,
    pub items: Vec<Item>,
    pub rune_trees: Vec<RuneTree>,
    /// Hechizos de invocador de la Grieta (modo CLASSIC).
    pub spells: Vec<Spell>,
    /// Aviso para la UI cuando se usa una copia local más vieja.
    pub notice: Option<String>,
}

impl GameData {
    pub fn champion(&self, id: &str) -> Option<&Champion> {
        self.champions.iter().find(|c| c.id == id)
    }

    pub fn item_by_name(&self, name: &str) -> Option<&Item> {
        let n = normalize(name);
        self.items.iter().find(|i| normalize(&i.name) == n)
    }

    pub fn rune_by_name(&self, name: &str) -> Option<&Rune> {
        let n = normalize(name);
        self.rune_trees
            .iter()
            .flat_map(|t| t.slots.iter().flatten())
            .find(|r| normalize(&r.name) == n)
    }

    pub fn spell_by_name(&self, name: &str) -> Option<&Spell> {
        let n = normalize(name);
        self.spells.iter().find(|s| normalize(&s.name) == n)
    }

    pub fn tree_by_name(&self, name: &str) -> Option<&RuneTree> {
        let n = normalize(name);
        self.rune_trees.iter().find(|t| normalize(&t.name) == n)
    }
}

/// Compara nombres sin importar mayúsculas, acentos ni signos.
pub fn normalize(s: &str) -> String {
    s.chars()
        .flat_map(char::to_lowercase)
        .filter_map(|c| {
            let c = match c {
                'á' | 'à' | 'ä' | 'â' => 'a',
                'é' | 'è' | 'ë' | 'ê' => 'e',
                'í' | 'ì' | 'ï' | 'î' => 'i',
                'ó' | 'ò' | 'ö' | 'ô' => 'o',
                'ú' | 'ù' | 'ü' | 'û' => 'u',
                'ñ' => 'n',
                c => c,
            };
            c.is_alphanumeric().then_some(c)
        })
        .collect()
}

/// Versión de Data Dragon (15.22.1) al nombre de parche que usa la comunidad
/// desde 2025 (25.22): la temporada sigue al año.
pub fn patch_name(version: &str) -> String {
    let mut parts = version.split('.');
    match (
        parts.next().and_then(|m| m.parse::<u32>().ok()),
        parts.next(),
    ) {
        (Some(major), Some(minor)) if major >= 15 => format!("{}.{minor}", major + 10),
        (Some(major), Some(minor)) => format!("{major}.{minor}"),
        _ => version.to_string(),
    }
}

fn str_vec(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

pub fn parse_champions(json: &str, version: &str) -> Result<Vec<Champion>, String> {
    let v: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let data = v["data"].as_object().ok_or("champion.json sin data")?;
    let mut out: Vec<Champion> = data
        .values()
        .map(|c| Champion {
            id: c["id"].as_str().unwrap_or_default().into(),
            name: c["name"].as_str().unwrap_or_default().into(),
            title: c["title"].as_str().unwrap_or_default().into(),
            tags: str_vec(&c["tags"]),
            attack: c["info"]["attack"].as_u64().unwrap_or(0) as u8,
            magic: c["info"]["magic"].as_u64().unwrap_or(0) as u8,
            defense: c["info"]["defense"].as_u64().unwrap_or(0) as u8,
            image: format!(
                "{BASE}/cdn/{version}/img/champion/{}",
                c["image"]["full"].as_str().unwrap_or_default()
            ),
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn parse_items(json: &str, version: &str) -> Result<Vec<Item>, String> {
    let v: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let data = v["data"].as_object().ok_or("item.json sin data")?;
    let in_store: Vec<(&String, &Value)> = data
        .iter()
        .filter(|(_, i)| {
            i["maps"][SUMMONERS_RIFT].as_bool().unwrap_or(false)
                && i["gold"]["purchasable"].as_bool().unwrap_or(false)
                && i["inStore"].as_bool() != Some(false)
                && i["requiredChampion"].is_null()
                && i["requiredAlly"].is_null()
        })
        .collect();
    let buyable: std::collections::HashSet<&str> =
        in_store.iter().map(|(id, _)| id.as_str()).collect();
    let mut out: Vec<Item> = in_store
        .iter()
        .map(|(id, i)| {
            let tags = str_vec(&i["tags"]);
            let gold = i["gold"]["total"].as_u64().unwrap_or(0) as u32;
            // Solo cuenta si se combina en algo que se compra en la tienda: así
            // Manamune (que se transforma en Muramana, fuera de tienda) es final.
            let builds_into = i["into"].as_array().is_some_and(|a| {
                a.iter()
                    .filter_map(Value::as_str)
                    .any(|t| buyable.contains(t))
            });
            let is_boots = tags.iter().any(|t| t == "Boots");
            let consumable = tags.iter().any(|t| t == "Consumable" || t == "Trinket");
            Item {
                id: (*id).clone(),
                name: i["name"].as_str().unwrap_or_default().into(),
                plaintext: i["plaintext"].as_str().unwrap_or_default().into(),
                gold,
                completed: !consumable
                    && ((!builds_into && gold >= 900) || (is_boots && gold > 300)),
                tags,
                image: format!(
                    "{BASE}/cdn/{version}/img/item/{}",
                    i["image"]["full"].as_str().unwrap_or_default()
                ),
            }
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name).then(a.id.cmp(&b.id)));
    // Algunos ítems aparecen duplicados con otro id (variantes de modo): uno por nombre.
    out.dedup_by(|a, b| a.name == b.name);
    Ok(out)
}

pub fn parse_runes(json: &str) -> Result<Vec<RuneTree>, String> {
    let v: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let trees = v.as_array().ok_or("runesReforged.json no es una lista")?;
    let icon = |p: &Value| format!("{BASE}/cdn/img/{}", p.as_str().unwrap_or_default());
    Ok(trees
        .iter()
        .map(|t| RuneTree {
            id: t["id"].as_u64().unwrap_or(0) as u32,
            name: t["name"].as_str().unwrap_or_default().into(),
            icon: icon(&t["icon"]),
            slots: t["slots"]
                .as_array()
                .map(|slots| {
                    slots
                        .iter()
                        .map(|s| {
                            s["runes"]
                                .as_array()
                                .map(|rs| {
                                    rs.iter()
                                        .map(|r| Rune {
                                            id: r["id"].as_u64().unwrap_or(0) as u32,
                                            name: r["name"].as_str().unwrap_or_default().into(),
                                            short_desc: strip_tags(
                                                r["shortDesc"].as_str().unwrap_or_default(),
                                            ),
                                            icon: icon(&r["icon"]),
                                        })
                                        .collect()
                                })
                                .unwrap_or_default()
                        })
                        .collect()
                })
                .unwrap_or_default(),
        })
        .collect())
}

pub fn parse_spells(json: &str, version: &str) -> Result<Vec<Spell>, String> {
    let v: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let data = v["data"].as_object().ok_or("summoner.json sin data")?;
    let mut out: Vec<Spell> = data
        .values()
        .filter(|s| str_vec(&s["modes"]).iter().any(|m| m == "CLASSIC"))
        .map(|s| Spell {
            id: s["id"].as_str().unwrap_or_default().into(),
            name: s["name"].as_str().unwrap_or_default().into(),
            image: format!(
                "{BASE}/cdn/{version}/img/spell/{}",
                s["image"]["full"].as_str().unwrap_or_default()
            ),
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Data Dragon trae HTML en las descripciones.
pub fn strip_tags(s: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    out
}

pub fn build(version: &str, files: &HashMap<&str, String>) -> Result<GameData, String> {
    Ok(GameData {
        version: version.to_string(),
        patch: patch_name(version),
        champions: parse_champions(&files["champion.json"], version)?,
        items: parse_items(&files["item.json"], version)?,
        rune_trees: parse_runes(&files["runesReforged.json"])?,
        spells: parse_spells(&files["summoner.json"], version)?,
        notice: None,
    })
}

// ---------- descarga y caché ----------

fn cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("ddragon"))
}

/// Versión de Data Dragon válida como nombre de carpeta: 2 a 4 números
/// separados por puntos. Rechaza `.`, `..` y similares, que apuntarían fuera
/// de la caché.
fn valid_version(v: &str) -> bool {
    let parts: Vec<&str> = v.split('.').collect();
    v.len() < 20
        && (2..=4).contains(&parts.len())
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))
}

fn version_key(v: &str) -> Vec<u32> {
    v.split('.').filter_map(|p| p.parse().ok()).collect()
}

async fn latest_version(client: &reqwest::Client) -> Result<String, String> {
    let versions: Vec<String> = client
        .get(format!("{BASE}/api/versions.json"))
        // Corto: si la red va mal, mejor usar pronto la copia local.
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    versions
        .into_iter()
        .next()
        .filter(|v| valid_version(v))
        .ok_or_else(|| "versions.json vacío".into())
}

async fn read_cached(dir: &Path) -> Option<HashMap<&'static str, String>> {
    let mut files = HashMap::new();
    for f in FILES {
        files.insert(f, tokio::fs::read_to_string(dir.join(f)).await.ok()?);
    }
    Some(files)
}

/// Descarga un parche, comprueba que se puede leer y solo entonces lo guarda.
async fn download(
    client: &reqwest::Client,
    version: &str,
    root: &Path,
) -> Result<GameData, String> {
    let mut files = HashMap::new();
    for f in FILES {
        let text = client
            .get(format!("{BASE}/cdn/{version}/data/{LOCALE}/{f}"))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;
        files.insert(f, text);
    }
    // Si Riot (o un portal cautivo) devuelve algo que no se puede leer, no se cachea.
    let data = build(version, &files)?;
    // Se escribe a una carpeta temporal y se renombra: nunca queda una caché a medias.
    let dir = root.join(version);
    let tmp = root.join(format!(".tmp-{version}"));
    let _ = tokio::fs::remove_dir_all(&tmp).await;
    tokio::fs::create_dir_all(&tmp)
        .await
        .map_err(|e| e.to_string())?;
    for (f, text) in &files {
        tokio::fs::write(tmp.join(f), text)
            .await
            .map_err(|e| e.to_string())?;
    }
    let _ = tokio::fs::remove_dir_all(&dir).await;
    tokio::fs::rename(&tmp, &dir)
        .await
        .map_err(|e| e.to_string())?;
    Ok(data)
}

/// Usa la copia local del parche si se puede leer; si está dañada la borra y
/// la vuelve a descargar.
async fn load_version(
    client: &reqwest::Client,
    root: &Path,
    version: &str,
) -> Result<GameData, String> {
    let dir = root.join(version);
    if let Some(files) = read_cached(&dir).await {
        if let Ok(data) = build(version, &files) {
            return Ok(data);
        }
        let _ = tokio::fs::remove_dir_all(&dir).await;
    }
    download(client, version, root).await
}

/// Borra parches viejos: se quedan los `keep` más recientes.
async fn prune(root: &Path, keep: usize) {
    let mut versions = cached_versions(root).await;
    versions.sort_by_key(|v| std::cmp::Reverse(version_key(v)));
    for v in versions.into_iter().skip(keep) {
        let _ = tokio::fs::remove_dir_all(root.join(v)).await;
    }
}

async fn cached_versions(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(mut rd) = tokio::fs::read_dir(root).await {
        while let Ok(Some(e)) = rd.next_entry().await {
            let name = e.file_name().to_string_lossy().to_string();
            if valid_version(&name) {
                out.push(name);
            }
        }
    }
    out
}

/// Último parche ya descargado (para trabajar sin internet).
async fn newest_cached(root: &Path) -> Option<String> {
    cached_versions(root)
        .await
        .into_iter()
        .max_by_key(|v| version_key(v))
}

async fn load(app: &AppHandle) -> Result<GameData, String> {
    let root = cache_root(app)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let net_err = match latest_version(&client).await {
        Ok(version) => match load_version(&client, &root, &version).await {
            Ok(data) => {
                prune(&root, 2).await;
                return Ok(data);
            }
            Err(e) => e,
        },
        Err(e) => e,
    };

    // Sin internet, o falló la descarga del parche nuevo: último parche guardado.
    let version = newest_cached(&root).await.ok_or_else(|| {
        format!("No pude descargar los datos del parche y no hay copia local: {net_err}")
    })?;
    let files = read_cached(&root.join(&version))
        .await
        .ok_or("La copia local del parche está incompleta.")?;
    let mut data = build(&version, &files)?;
    data.notice = Some(format!(
        "No pude actualizar los datos del parche; uso la copia guardada del {}.",
        data.patch
    ));
    Ok(data)
}

#[derive(Default)]
pub struct Cache(Mutex<Option<Arc<GameData>>>);

/// Datos del parche, cargados una vez por ejecución de la app.
pub async fn get(app: &AppHandle, cache: &Cache) -> Result<Arc<GameData>, String> {
    let mut guard = cache.0.lock().await;
    if let Some(d) = guard.as_ref() {
        return Ok(d.clone());
    }
    let data = Arc::new(load(app).await?);
    *guard = Some(data.clone());
    Ok(data)
}

#[tauri::command]
pub async fn game_data(app: AppHandle, cache: State<'_, Cache>) -> Result<Arc<GameData>, String> {
    get(&app, &cache).await
}

#[cfg(test)]
pub mod fixtures {
    //! Fragmentos reales del formato de Data Dragon (recortados).
    use super::*;

    pub const CHAMPIONS: &str = r#"{"type":"champion","version":"15.22.1","data":{
      "Darius":{"id":"Darius","key":"122","name":"Darius","title":"la Mano de Noxus","info":{"attack":9,"defense":5,"magic":1,"difficulty":2},"image":{"full":"Darius.png"},"tags":["Fighter","Tank"]},
      "Ahri":{"id":"Ahri","key":"103","name":"Ahri","title":"la Zorra de Nueve Colas","info":{"attack":3,"defense":4,"magic":8,"difficulty":5},"image":{"full":"Ahri.png"},"tags":["Mage","Assassin"]},
      "Soraka":{"id":"Soraka","key":"16","name":"Soraka","title":"la Hija de las Estrellas","info":{"attack":2,"defense":5,"magic":7,"difficulty":3},"image":{"full":"Soraka.png"},"tags":["Support","Mage"]},
      "Jax":{"id":"Jax","key":"24","name":"Jax","title":"el Gran Maestro de Armas","info":{"attack":7,"defense":5,"magic":7,"difficulty":5},"image":{"full":"Jax.png"},"tags":["Fighter"]}
    }}"#;

    pub const ITEMS: &str = r#"{"type":"item","version":"15.22.1","data":{
      "1001":{"name":"Botas","plaintext":"Aumenta un poco la velocidad de movimiento","into":["3006","3111"],"image":{"full":"1001.png"},"gold":{"base":300,"purchasable":true,"total":300,"sell":210},"tags":["Boots"],"maps":{"11":true,"12":true}},
      "3111":{"name":"Botas de Mercurio","plaintext":"","from":["1001"],"image":{"full":"3111.png"},"gold":{"base":800,"purchasable":true,"total":1100,"sell":770},"tags":["Boots","SpellBlock","Tenacity"],"maps":{"11":true}},
      "3078":{"name":"Fuerza de Trinidad","plaintext":"","from":["3057","3044"],"image":{"full":"3078.png"},"gold":{"base":333,"purchasable":true,"total":3333,"sell":2333},"tags":["Damage","AttackSpeed"],"maps":{"11":true}},
      "3123":{"name":"Llamado del Verdugo","plaintext":"Hiere gravemente","into":["6609"],"image":{"full":"3123.png"},"gold":{"base":400,"purchasable":true,"total":800,"sell":560},"tags":["Damage"],"maps":{"11":true}},
      "2003":{"name":"Poción de Vida","plaintext":"","image":{"full":"2003.png"},"gold":{"base":50,"purchasable":true,"total":50,"sell":20},"tags":["Consumable"],"maps":{"11":true}},
      "3599":{"name":"Lanza Negra de Kalista","plaintext":"","image":{"full":"3599.png"},"gold":{"base":0,"purchasable":true,"total":0,"sell":0},"tags":[],"maps":{"11":true},"requiredChampion":"Kalista"},
      "4403":{"name":"Espátula Dorada","plaintext":"","image":{"full":"4403.png"},"gold":{"base":0,"purchasable":false,"total":0,"sell":0},"tags":[],"maps":{"11":true}},
      "3078B":{"name":"Fuerza de Trinidad","plaintext":"","image":{"full":"3078.png"},"gold":{"base":333,"purchasable":true,"total":3333,"sell":2333},"tags":["Damage"],"maps":{"11":true}},
      "3330":{"name":"Espantapájaros","plaintext":"","image":{"full":"3330.png"},"gold":{"base":0,"purchasable":true,"total":0,"sell":0},"tags":["Trinket"],"maps":{"11":true}}
    }}"#;

    pub const RUNES: &str = r#"[
      {"id":8000,"key":"Precision","icon":"perk-images/Styles/7201_Precision.png","name":"Precisión","slots":[
        {"runes":[{"id":8010,"key":"Conqueror","icon":"perk-images/Styles/Precision/Conqueror/Conqueror.png","name":"Conquistador","shortDesc":"Gana <b>fuerza adaptable</b>.","longDesc":""}]},
        {"runes":[{"id":9111,"key":"Triumph","icon":"perk-images/Styles/Precision/Triumph.png","name":"Triunfo","shortDesc":"Cura al participar en asesinatos.","longDesc":""},{"id":8009,"key":"PresenceOfMind","icon":"p.png","name":"Claridad Mental","shortDesc":"","longDesc":""}]},
        {"runes":[{"id":9104,"key":"LegendAlacrity","icon":"p.png","name":"Leyenda: Presteza","shortDesc":"","longDesc":""}]},
        {"runes":[{"id":8299,"key":"LastStand","icon":"p.png","name":"Último Esfuerzo","shortDesc":"","longDesc":""}]}
      ]},
      {"id":8400,"key":"Resolve","icon":"perk-images/Styles/7204_Resolve.png","name":"Valor","slots":[
        {"runes":[{"id":8437,"key":"GraspOfTheUndying","icon":"perk-images/Styles/Resolve/GraspOfTheUndying/GraspOfTheUndying.png","name":"Garras del Inmortal","shortDesc":"","longDesc":""}]},
        {"runes":[{"id":8446,"key":"Demolish","icon":"p.png","name":"Demoler","shortDesc":"","longDesc":""}]},
        {"runes":[{"id":8444,"key":"SecondWind","icon":"perk-images/Styles/Resolve/SecondWind/SecondWind.png","name":"Segundo Aliento","shortDesc":"","longDesc":""}]},
        {"runes":[{"id":8451,"key":"Overgrowth","icon":"p.png","name":"Crecimiento Excesivo","shortDesc":"","longDesc":""}]}
      ]}
    ]"#;

    pub const SPELLS: &str = r#"{"type":"summoner","version":"15.22.1","data":{
      "SummonerFlash":{"id":"SummonerFlash","name":"Destello","image":{"full":"SummonerFlash.png"},"modes":["CLASSIC","ARAM"]},
      "SummonerTeleport":{"id":"SummonerTeleport","name":"Teleportar","image":{"full":"SummonerTeleport.png"},"modes":["CLASSIC"]},
      "SummonerSnowball":{"id":"SummonerSnowball","name":"Marcar","image":{"full":"SummonerSnowball.png"},"modes":["ARAM"]}
    }}"#;

    pub fn data() -> GameData {
        let files: HashMap<&str, String> = [
            ("champion.json", CHAMPIONS.to_string()),
            ("item.json", ITEMS.to_string()),
            ("runesReforged.json", RUNES.to_string()),
            ("summoner.json", SPELLS.to_string()),
        ]
        .into_iter()
        .collect();
        build("15.22.1", &files).unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::data;
    use super::*;

    #[test]
    fn patch_names() {
        assert_eq!(patch_name("15.22.1"), "25.22");
        assert_eq!(patch_name("14.24.1"), "14.24");
        assert_eq!(patch_name("raro"), "raro");
    }

    #[test]
    fn champions_sorted_with_images() {
        let d = data();
        let names: Vec<&str> = d.champions.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, ["Ahri", "Darius", "Jax", "Soraka"]);
        assert_eq!(
            d.champion("Ahri").unwrap().image,
            "https://ddragon.leagueoflegends.com/cdn/15.22.1/img/champion/Ahri.png"
        );
        assert_eq!(d.champion("Darius").unwrap().attack, 9);
    }

    #[test]
    fn items_filtered_for_summoners_rift() {
        let d = data();
        let names: Vec<&str> = d.items.iter().map(|i| i.name.as_str()).collect();
        // Sin ítems de campeón, no comprables ni duplicados.
        assert!(!names.contains(&"Lanza Negra de Kalista"));
        assert!(!names.contains(&"Espátula Dorada"));
        assert_eq!(
            names.iter().filter(|n| **n == "Fuerza de Trinidad").count(),
            1
        );

        let completed = |n: &str| d.item_by_name(n).unwrap().completed;
        assert!(completed("Fuerza de Trinidad"));
        assert!(completed("Botas de Mercurio"));
        assert!(!completed("Botas"));
        assert!(!completed("Llamado del Verdugo"));
        assert!(!completed("Poción de Vida"));
        assert!(!completed("Espantapájaros"));
    }

    #[test]
    fn lookup_ignores_case_and_accents() {
        let d = data();
        assert!(d.item_by_name("fuerza de trinidad").is_some());
        assert!(d.item_by_name("Botas de mercúrio").is_some());
        assert!(d.item_by_name("Filo Infinito Pirata").is_none());
        assert_eq!(d.rune_by_name("conquistador").unwrap().id, 8010);
        assert_eq!(d.tree_by_name("precision").unwrap().id, 8000);
    }

    #[test]
    fn runes_parsed_without_html() {
        let d = data();
        let conq = d.rune_by_name("Conquistador").unwrap();
        assert_eq!(conq.short_desc, "Gana fuerza adaptable.");
        assert!(conq.icon.ends_with("Conqueror/Conqueror.png"));
        assert_eq!(d.rune_trees[0].slots[0][0].name, "Conquistador");
    }

    #[test]
    fn version_folder_validation() {
        assert!(valid_version("15.22.1"));
        assert!(!valid_version("../x"));
        assert!(!valid_version(""));
        assert!(!valid_version("."));
        assert!(!valid_version(".."));
        assert!(!valid_version("15..1"));
        assert!(!valid_version("15"));
        assert!(valid_version(
            "lolpatch_7.20".replace("lolpatch_", "").as_str()
        ));
    }

    #[test]
    fn spells_only_for_classic() {
        let d = data();
        let names: Vec<&str> = d.spells.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["Destello", "Teleportar"]);
        assert!(d.spell_by_name("destello").is_some());
    }

    #[test]
    fn items_that_transform_out_of_store_are_completed() {
        let json = r#"{"data":{
          "3004":{"name":"Manamune","into":["3042"],"image":{"full":"3004.png"},"gold":{"purchasable":true,"total":2900},"tags":["Damage"],"maps":{"11":true}},
          "3042":{"name":"Muramana","from":["3004"],"inStore":false,"image":{"full":"3042.png"},"gold":{"purchasable":false,"total":2900},"tags":["Damage"],"maps":{"11":true}}
        }}"#;
        let items = parse_items(json, "15.22.1").unwrap();
        assert_eq!(items.len(), 1);
        assert!(items[0].completed);
    }

    #[test]
    fn normalize_handles_non_ascii_uppercase() {
        assert_eq!(normalize("ÜBER Ñandú"), normalize("uber nandu"));
    }
}
