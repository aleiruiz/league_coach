//! Riot Games API client for post-game match history (Account-V1 and
//! Match-V5). Only finished games are read: nothing here touches a game in
//! progress. The API key is the one the user pasted in Settings (stored in
//! the OS keychain); it is sent only to `*.api.riotgames.com`.

use std::path::PathBuf;
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use zeroize::Zeroizing;

use crate::i18n::tr;
use crate::secrets;

/// A League server ("platform") the user can pick, and the regional
/// clusters its Account-V1 and Match-V5 calls go to.
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
pub struct Region {
    pub id: &'static str,
    pub label: &'static str,
    #[serde(skip)]
    pub account_cluster: &'static str,
    #[serde(skip)]
    pub match_cluster: &'static str,
}

const fn region(
    id: &'static str,
    label: &'static str,
    account_cluster: &'static str,
    match_cluster: &'static str,
) -> Region {
    Region {
        id,
        label,
        account_cluster,
        match_cluster,
    }
}

/// Every public League server. Account-V1 has no SEA cluster: those
/// accounts are looked up on `asia`.
pub const REGIONS: &[Region] = &[
    region("na1", "North America (NA)", "americas", "americas"),
    region("la1", "Latin America North (LAN)", "americas", "americas"),
    region("la2", "Latin America South (LAS)", "americas", "americas"),
    region("br1", "Brazil (BR)", "americas", "americas"),
    region("euw1", "Europe West (EUW)", "europe", "europe"),
    region("eun1", "Europe Nordic & East (EUNE)", "europe", "europe"),
    region("tr1", "Türkiye (TR)", "europe", "europe"),
    region("ru", "Russia (RU)", "europe", "europe"),
    region("me1", "Middle East (ME)", "europe", "europe"),
    region("kr", "Korea (KR)", "asia", "asia"),
    region("jp1", "Japan (JP)", "asia", "asia"),
    region("oc1", "Oceania (OCE)", "asia", "sea"),
    region("sg2", "Southeast Asia (SEA)", "asia", "sea"),
    region("tw2", "Taiwan (TW)", "asia", "sea"),
    region("vn2", "Vietnam (VN)", "asia", "sea"),
];

pub fn find_region(id: &str) -> Option<&'static Region> {
    REGIONS.iter().find(|r| r.id == id)
}

/// The player's Riot account, saved next to the app settings. The PUUID is
/// cached once looked up, and dropped when the Riot ID or region changes.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Profile {
    #[serde(default)]
    pub game_name: String,
    #[serde(default)]
    pub tag_line: String,
    #[serde(default)]
    pub region: String,
    /// Analyze new games with the model as soon as they show up.
    #[serde(default = "yes")]
    pub auto_analyze: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub puuid: Option<String>,
}

fn yes() -> bool {
    true
}

impl Profile {
    pub fn is_complete(&self) -> bool {
        !self.game_name.is_empty()
            && !self.tag_line.is_empty()
            && find_region(&self.region).is_some()
    }

    pub fn riot_id(&self) -> String {
        format!("{}#{}", self.game_name, self.tag_line)
    }
}

/// Splits "Name#TAG" (spaces around it are ignored; the name may contain
/// spaces). Riot: name 3-16 characters, tag 3-5.
pub fn parse_riot_id(raw: &str) -> Result<(String, String), String> {
    let invalid = || {
        tr(
            "Write your Riot ID as Name#TAG (you can see it in your League client profile).",
            "Escribe tu Riot ID como Nombre#TAG (lo ves en tu perfil del cliente de League).",
        )
        .to_string()
    };
    let (name, tag) = raw.trim().rsplit_once('#').ok_or_else(invalid)?;
    let (name, tag) = (name.trim(), tag.trim());
    let name_len = name.chars().count();
    let tag_len = tag.chars().count();
    if !(3..=16).contains(&name_len)
        || !(3..=5).contains(&tag_len)
        || name.contains('#')
        || tag.chars().any(|c| !c.is_alphanumeric())
        || name.chars().any(|c| c.is_control())
    {
        return Err(invalid());
    }
    Ok((name.to_string(), tag.to_string()))
}

fn profile_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("riot-account.json"))
}

pub fn load_profile(app: &AppHandle) -> Profile {
    profile_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or(Profile {
            auto_analyze: true,
            ..Default::default()
        })
}

pub fn save_profile(app: &AppHandle, profile: &Profile) -> Result<(), String> {
    let path = profile_path(app).ok_or("No settings folder")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(profile).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum RiotError {
    #[error("no key")]
    NoKey,
    #[error("key rejected")]
    KeyRejected,
    #[error("not found")]
    NotFound,
    #[error("rate limited")]
    RateLimited,
    #[error("{0}")]
    Other(String),
}

impl RiotError {
    /// Message for the player, with what to do about it.
    pub fn message(&self) -> String {
        match self {
            RiotError::NoKey => tr(
                "Paste your Riot API key in Settings to read your games.",
                "Pega tu API key de Riot en Ajustes para leer tus partidas.",
            )
            .into(),
            RiotError::KeyRejected => tr(
                "Riot rejected the API key. Development keys expire every 24 hours: get a new one at developer.riotgames.com and paste it in Settings.",
                "Riot rechazó la API key. Las development keys caducan cada 24 horas: genera una nueva en developer.riotgames.com y pégala en Ajustes.",
            )
            .into(),
            RiotError::NotFound => tr(
                "Riot doesn't know that Riot ID on that region. Check the name, the #TAG and the region in Settings.",
                "Riot no encuentra ese Riot ID en esa región. Revisa el nombre, el #TAG y la región en Ajustes.",
            )
            .into(),
            RiotError::RateLimited => tr(
                "Riot's request limit was reached. Try again in a couple of minutes.",
                "Se alcanzó el límite de consultas de Riot. Vuelve a intentarlo en un par de minutos.",
            )
            .into(),
            RiotError::Other(e) => format!(
                "{} {e}",
                tr("Couldn't reach Riot:", "No pude conectar con Riot:")
            ),
        }
    }
}

/// Longest wait honored from a `Retry-After` header. A development key
/// allows 100 requests every 2 minutes.
const MAX_RETRY_WAIT: Duration = Duration::from_secs(125);

pub struct Client {
    http: reqwest::Client,
    key: Zeroizing<String>,
    region: &'static Region,
}

impl Client {
    pub fn new(region: &'static Region) -> Result<Self, RiotError> {
        let key = secrets::get_key(&secrets::Keyring, "riot")
            .map_err(|e| RiotError::Other(e.to_string()))?
            .ok_or(RiotError::NoKey)?;
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|e| RiotError::Other(e.to_string()))?;
        Ok(Client { http, key, region })
    }

    fn url(cluster: &str, segments: &[&str]) -> url::Url {
        let mut u = url::Url::parse(&format!("https://{cluster}.api.riotgames.com/"))
            .expect("static base URL");
        u.path_segments_mut()
            .expect("https URL has segments")
            .pop_if_empty()
            .extend(segments);
        u
    }

    async fn get<T: DeserializeOwned>(&self, url: url::Url) -> Result<T, RiotError> {
        let mut attempt = 0;
        loop {
            attempt += 1;
            let resp = self
                .http
                .get(url.clone())
                .header("X-Riot-Token", self.key.as_str())
                .send()
                .await
                .map_err(|e| RiotError::Other(e.without_url().to_string()))?;
            let status = resp.status().as_u16();
            match status {
                200 => {
                    return resp
                        .json::<T>()
                        .await
                        .map_err(|e| RiotError::Other(e.without_url().to_string()));
                }
                401 | 403 => return Err(RiotError::KeyRejected),
                404 => return Err(RiotError::NotFound),
                429 if attempt <= 2 => {
                    let wait = resp
                        .headers()
                        .get("retry-after")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.parse::<u64>().ok())
                        .map(Duration::from_secs)
                        .unwrap_or(Duration::from_secs(10));
                    if wait > MAX_RETRY_WAIT {
                        return Err(RiotError::RateLimited);
                    }
                    tokio::time::sleep(wait).await;
                }
                429 => return Err(RiotError::RateLimited),
                500..=599 if attempt <= 2 => tokio::time::sleep(Duration::from_secs(2)).await,
                _ => return Err(RiotError::Other(format!("HTTP {status}"))),
            }
        }
    }

    /// Account-V1: Riot ID → PUUID.
    pub async fn puuid(&self, game_name: &str, tag_line: &str) -> Result<String, RiotError> {
        #[derive(Deserialize)]
        struct Account {
            puuid: String,
        }
        let url = Self::url(
            self.region.account_cluster,
            &[
                "riot",
                "account",
                "v1",
                "accounts",
                "by-riot-id",
                game_name,
                tag_line,
            ],
        );
        Ok(self.get::<Account>(url).await?.puuid)
    }

    /// Match-V5: ids of the most recent games, newest first.
    pub async fn match_ids(&self, puuid: &str, count: u32) -> Result<Vec<String>, RiotError> {
        let mut url = Self::url(
            self.region.match_cluster,
            &["lol", "match", "v5", "matches", "by-puuid", puuid, "ids"],
        );
        url.query_pairs_mut()
            .append_pair("start", "0")
            .append_pair("count", &count.to_string());
        self.get(url).await
    }

    pub async fn match_detail<T: DeserializeOwned>(&self, id: &str) -> Result<T, RiotError> {
        let url = Self::url(
            self.region.match_cluster,
            &["lol", "match", "v5", "matches", id],
        );
        self.get(url).await
    }

    pub async fn timeline<T: DeserializeOwned>(&self, id: &str) -> Result<T, RiotError> {
        let url = Self::url(
            self.region.match_cluster,
            &["lol", "match", "v5", "matches", id, "timeline"],
        );
        self.get(url).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_riot_ids() {
        assert_eq!(
            parse_riot_id("  Faker Fan #LAN1 ").unwrap(),
            ("Faker Fan".to_string(), "LAN1".to_string())
        );
        assert_eq!(
            parse_riot_id("Señor#ñ12").unwrap(),
            ("Señor".to_string(), "ñ12".to_string())
        );
        for bad in [
            "NoTag",
            "ab#LAN",
            "Name#",
            "Name#TOOLONG",
            "Name#a b",
            "#LAN",
        ] {
            assert!(parse_riot_id(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn regions_route_to_known_clusters() {
        for r in REGIONS {
            assert!(["americas", "europe", "asia"].contains(&r.account_cluster));
            assert!(["americas", "europe", "asia", "sea"].contains(&r.match_cluster));
        }
        assert_eq!(find_region("la1").unwrap().match_cluster, "americas");
        assert!(find_region("xx").is_none());
    }

    #[test]
    fn url_segments_are_escaped() {
        let u = Client::url(
            "americas",
            &[
                "riot",
                "account",
                "v1",
                "accounts",
                "by-riot-id",
                "a b/c?",
                "TAG",
            ],
        );
        assert_eq!(
            u.as_str(),
            "https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/a%20b%2Fc%3F/TAG"
        );
    }

    #[test]
    fn profile_defaults_to_auto_analyze() {
        let p: Profile = serde_json::from_str("{}").unwrap();
        assert!(p.auto_analyze);
        assert!(!p.is_complete());
    }
}
