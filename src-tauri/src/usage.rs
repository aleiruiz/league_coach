//! Token usage and plan limits, as the CLIs report them. Nothing here is
//! estimated: tokens come from each answer's own usage report, and limits
//! only from what the provider sent (Claude Code with each answer, Codex
//! from its app server when asked).

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::providers::ProviderKind;

/// One plan limit window (for example Claude's 5-hour or weekly window).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct LimitWindow {
    /// Provider's own name for the window: `five_hour`, `seven_day`,
    /// `primary`, `secondary`…
    pub id: String,
    /// 0 to 100.
    pub used_percent: f64,
    /// Length of the window, when the provider says it.
    pub window_minutes: Option<u64>,
    /// Unix seconds.
    pub resets_at: Option<i64>,
}

/// Tokens of one answer.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Tokens {
    pub input: u64,
    pub output: u64,
}

/// Totals for one hour (unix hour). The UI groups them by local day.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct Bucket {
    pub hour: i64,
    pub input: u64,
    pub output: u64,
    pub queries: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct SeenLimits {
    pub windows: Vec<LimitWindow>,
    /// Unix seconds when the provider reported them.
    pub seen_at: i64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct ProviderData {
    #[serde(default)]
    buckets: Vec<Bucket>,
    #[serde(default)]
    limits: Option<SeenLimits>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct UsageFile {
    #[serde(default)]
    claude_code: ProviderData,
    #[serde(default)]
    codex: ProviderData,
}

impl UsageFile {
    fn get(&mut self, kind: ProviderKind) -> &mut ProviderData {
        match kind {
            ProviderKind::ClaudeCode => &mut self.claude_code,
            ProviderKind::Codex => &mut self.codex,
        }
    }
}

/// Kept for 8 days: enough for "today" and the last 7 local days.
const KEEP_HOURS: i64 = 8 * 24;

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

fn add_tokens(buckets: &mut Vec<Bucket>, at: i64, t: Tokens) {
    let hour = at.div_euclid(3600);
    match buckets.iter_mut().find(|b| b.hour == hour) {
        Some(b) => {
            b.input += t.input;
            b.output += t.output;
            b.queries += 1;
        }
        None => buckets.push(Bucket {
            hour,
            input: t.input,
            output: t.output,
            queries: 1,
        }),
    }
    buckets.retain(|b| b.hour > hour - KEEP_HOURS);
    buckets.sort_by_key(|b| b.hour);
}

/// Usage saved in the app's data folder. Loaded on first use.
#[derive(Default)]
pub struct Store(Mutex<Option<UsageFile>>);

fn path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("usage.json"))
}

impl Store {
    fn with<R>(&self, app: &AppHandle, f: impl FnOnce(&mut UsageFile) -> R, save: bool) -> R {
        let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let file = guard.get_or_insert_with(|| {
            path(app)
                .and_then(|p| std::fs::read_to_string(p).ok())
                .and_then(|t| serde_json::from_str(&t).ok())
                .unwrap_or_default()
        });
        let out = f(file);
        if save {
            // Best effort: losing a usage count never breaks an answer.
            if let (Some(p), Ok(text)) = (path(app), serde_json::to_string(file)) {
                if let Some(dir) = p.parent() {
                    let _ = std::fs::create_dir_all(dir);
                }
                let _ = std::fs::write(p, text);
            }
        }
        out
    }

    pub fn record_tokens(&self, app: &AppHandle, kind: ProviderKind, t: Tokens) {
        self.with(
            app,
            |f| add_tokens(&mut f.get(kind).buckets, now(), t),
            true,
        );
    }

    pub fn record_limits(&self, app: &AppHandle, kind: ProviderKind, windows: Vec<LimitWindow>) {
        if windows.is_empty() {
            return;
        }
        let seen = SeenLimits {
            windows,
            seen_at: now(),
        };
        self.with(app, |f| f.get(kind).limits = Some(seen), true);
    }

    fn snapshot(&self, app: &AppHandle, kind: ProviderKind) -> ProviderData {
        self.with(app, |f| f.get(kind).clone(), false)
    }
}

#[derive(Debug, Serialize)]
pub struct ProviderUsage {
    kind: ProviderKind,
    /// Hourly totals of the last 8 days.
    buckets: Vec<Bucket>,
    limits: Option<SeenLimits>,
    /// `answer`: reported with the last answer (Claude Code). `live`: read
    /// from the provider just now (Codex).
    limits_source: Option<&'static str>,
    /// Why the live read failed, if it did.
    limits_error: Option<String>,
}

/// Usage of each provider. For Codex it also asks its app server for the
/// current plan limits (a few seconds at most; no model query is spent).
#[tauri::command]
pub async fn usage_overview(app: AppHandle) -> Vec<ProviderUsage> {
    let store = app.state::<Store>();
    let mut out = Vec::new();
    for kind in ProviderKind::ALL {
        let mut limits_error = None;
        let mut live = false;
        if let Some(bin) = (kind == ProviderKind::Codex)
            .then(|| crate::providers::resolve(kind))
            .flatten()
        {
            {
                match crate::providers::codex::rate_limits(&bin).await {
                    Ok(w) if !w.is_empty() => {
                        store.record_limits(&app, kind, w);
                        live = true;
                    }
                    Ok(_) => {}
                    Err(e) => limits_error = Some(e),
                }
            }
        }
        let data = store.snapshot(&app, kind);
        let limits_source = data
            .limits
            .as_ref()
            .map(|_| if live { "live" } else { "answer" });
        out.push(ProviderUsage {
            kind,
            buckets: data.buckets,
            limits: data.limits,
            limits_source,
            limits_error,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_tokens_by_hour_and_drops_old_hours() {
        let mut b = Vec::new();
        let t = Tokens {
            input: 10,
            output: 2,
        };
        add_tokens(&mut b, 3600 * 1000 + 5, t);
        add_tokens(&mut b, 3600 * 1000 + 3000, t);
        assert_eq!(b.len(), 1);
        assert_eq!((b[0].input, b[0].output, b[0].queries), (20, 4, 2));

        add_tokens(&mut b, 3600 * (1000 + KEEP_HOURS), t);
        assert_eq!(b.len(), 1, "the 8-day-old hour is dropped");
        assert_eq!(b[0].hour, 1000 + KEEP_HOURS);
    }
}
