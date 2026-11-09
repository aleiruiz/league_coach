//! Codex CLI (`codex exec --json`) con la cuenta de ChatGPT del usuario.

use std::path::Path;

use serde_json::Value;

use super::ChatEvent;
use super::process::{self, Parsed};
#[cfg(test)]
use super::prompts;
use crate::i18n::tr;
use crate::usage::LimitWindow;

pub async fn login_status(bin: &Path) -> (bool, Option<String>) {
    match process::run_capture(bin, &["login", "status"]).await {
        Ok(out) => parse_login_status(out.status_ok, &out.stdout, &out.stderr),
        Err(e) => (
            false,
            Some(tr(
                format!("Couldn't check the session: {e}"),
                format!("No pude consultar la sesión: {e}"),
            )),
        ),
    }
}

pub fn parse_login_status(ok: bool, stdout: &str, stderr: &str) -> (bool, Option<String>) {
    // `codex login status` escribe el resultado en stdout o stderr según la versión.
    let text = format!("{stdout}\n{stderr}");
    let lower = text.to_lowercase();
    if lower.contains("not logged in") {
        return (
            false,
            Some(tr("You are not signed in.", "No has iniciado sesión.").into()),
        );
    }
    if !ok {
        // Otro fallo (versión vieja, config rota): mostrar el error real en vez
        // de mandar al usuario a reintentar el login.
        let t = process::tail(&text, 2);
        return (
            false,
            Some(if t.is_empty() {
                tr(
                    "`codex login status` failed.",
                    "`codex login status` falló.",
                )
                .into()
            } else {
                tr(
                    format!("`codex login status` failed: {t}"),
                    format!("`codex login status` falló: {t}"),
                )
            }),
        );
    }
    if lower.contains("api key") {
        return (
            true,
            Some(
                tr(
                    "Connected with an API key (not your subscription).",
                    "Conectado con API key (no con tu suscripción).",
                )
                .into(),
            ),
        );
    }
    (
        true,
        Some(
            tr(
                "Connected with your ChatGPT account.",
                "Conectado con tu cuenta de ChatGPT.",
            )
            .into(),
        ),
    )
}

/// Herramientas de Codex que el coach no debe tener: sin shell, sin plugins,
/// sin navegador ni control del equipo. Solo queda la búsqueda web.
const DISABLED_FEATURES: &[&str] = &[
    "shell_tool",
    "unified_exec",
    "plugins",
    "apps",
    "browser_use",
    "in_app_browser",
    "computer_use",
];

// Sin comillas en los valores: si no es TOML válido, Codex lo toma como texto
// literal, y así evitamos problemas de escape con los shims `.cmd` de Windows.
fn common() -> Vec<String> {
    let mut a: Vec<String> = [
        "--json",
        "--skip-git-repo-check",
        // No cargar ~/.codex/config.toml: ahí el usuario podría tener MCP,
        // perfiles o permisos que no queremos en el coach. El login se mantiene.
        "--ignore-user-config",
        "-c",
        "sandbox_mode=read-only",
        "-c",
        "mcp_servers={}",
        "-c",
        "web_search=live",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    for f in DISABLED_FEATURES {
        a.push("--disable".into());
        a.push(f.to_string());
    }
    a
}

pub fn args(session_id: Option<&str>, model: Option<&str>) -> Vec<String> {
    let mut a = vec!["exec".to_string()];
    // Joined form: the id was validated (`models::valid_id`).
    let model = model.map(|m| format!("--model={m}"));
    match session_id {
        Some(id) => {
            a.push("resume".into());
            a.extend(common());
            a.extend(model);
            // El id ya se validó (no empieza con '-'), así que no se lee como flag.
            a.push(id.into());
        }
        None => {
            a.push("--sandbox".into());
            a.push("read-only".into());
            a.extend(common());
            a.extend(model);
        }
    }
    // El prompt llega por stdin.
    a.push("-".into());
    a
}

/// Codex no tiene un flag de system prompt para `exec`, así que en el primer
/// mensaje de la conversación anteponemos las instrucciones del coach.
pub fn stdin_prompt(prompt: &str, system: Option<&str>) -> String {
    if let Some(system) = system {
        format!("{system}\n\n---\n\n{prompt}")
    } else {
        prompt.to_string()
    }
}

pub fn parse_line(line: &str) -> Vec<Parsed> {
    let Ok(v) = serde_json::from_str::<Value>(line) else {
        return vec![];
    };
    let item_type = v["item"]["type"].as_str().unwrap_or_default();
    let ev = |e: ChatEvent| vec![Parsed::Event(e)];
    match v["type"].as_str() {
        // Red de seguridad: aunque desactivamos el shell, si Codex intenta
        // ejecutar algo, tocar archivos o usar un MCP, cortamos la consulta.
        Some("item.started") | Some("item.completed")
            if matches!(
                item_type,
                "command_execution" | "file_change" | "mcp_tool_call"
            ) =>
        {
            let what = match item_type {
                "command_execution" => {
                    let cmd = v["item"]["command"].as_str().unwrap_or("?");
                    tr(
                        format!("run a command ({cmd})"),
                        format!("ejecutar un comando ({cmd})"),
                    )
                }
                "file_change" => tr("change files", "modificar archivos").to_string(),
                _ => tr("use an external tool", "usar una herramienta externa").to_string(),
            };
            vec![Parsed::Abort(tr(
                format!("Codex tried to {what}; I stopped the request for safety."),
                format!("Codex intentó {what}; detuve la consulta por seguridad."),
            ))]
        }
        Some("thread.started") => v["thread_id"]
            .as_str()
            .map(|id| ev(ChatEvent::Session { id: id.into() }))
            .unwrap_or_default(),
        Some("item.started") if item_type == "web_search" => ev(ChatEvent::Status {
            text: tr("Searching the web…", "Buscando en la web…").into(),
        }),
        Some("item.completed") if item_type == "agent_message" => v["item"]["text"]
            .as_str()
            .map(|t| ev(ChatEvent::Message { text: t.into() }))
            .unwrap_or_default(),
        // `input_tokens` already includes the cached ones: split them out.
        Some("turn.completed") => {
            let n = |k: &str| v["usage"][k].as_u64().unwrap_or(0);
            let cached = n("cached_input_tokens").min(n("input_tokens"));
            let (input, output) = (n("input_tokens") - cached, n("output_tokens"));
            if input + cached + output > 0 {
                ev(ChatEvent::Usage {
                    input_tokens: input,
                    cached_tokens: cached,
                    output_tokens: output,
                })
            } else {
                vec![]
            }
        }
        Some("turn.failed") => ev(ChatEvent::Error {
            message: v["error"]["message"]
                .as_str()
                .unwrap_or(tr(
                    "Codex couldn't finish the answer.",
                    "Codex no pudo completar la respuesta.",
                ))
                .into(),
        }),
        Some("error") => ev(ChatEvent::Error {
            message: v["message"]
                .as_str()
                .unwrap_or(tr("Codex error.", "Error de Codex."))
                .into(),
        }),
        _ => vec![],
    }
}

/// `app-server` has no `--ignore-user-config`: override what matters so the
/// user's MCP servers, plugins and tools never start (same as `exec`).
fn app_server_args() -> Vec<String> {
    let mut a: Vec<String> = [
        "app-server",
        "-c",
        "mcp_servers={}",
        "-c",
        "sandbox_mode=read-only",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    for f in DISABLED_FEATURES {
        a.push("--disable".into());
        a.push(f.to_string());
    }
    a
}

/// One request to `codex app-server` (JSON-RPC over stdio): plan limits and
/// the model list come from there, without spending a model query.
async fn app_server(bin: &Path, method: &str, params: Value) -> Result<Value, String> {
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

    let mut child = process::command(bin)
        .args(app_server_args())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let mut stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let messages = [
        serde_json::json!({"jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"clientInfo": {"name": "league-coach", "version": env!("CARGO_PKG_VERSION")}}}),
        serde_json::json!({"jsonrpc": "2.0", "method": "initialized"}),
        serde_json::json!({"jsonrpc": "2.0", "id": 2, "method": method, "params": params}),
    ];
    let mut text = String::new();
    for m in messages {
        text.push_str(&m.to_string());
        text.push('\n');
    }
    let read = async {
        stdin
            .write_all(text.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(v) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            if v["id"] == 2 {
                return match v.get("error") {
                    Some(e) => Err(e["message"].as_str().unwrap_or("error").to_string()),
                    None => Ok(v["result"].clone()),
                };
            }
        }
        Err(tr(
            "Codex closed without answering.",
            "Codex se cerró sin responder.",
        )
        .to_string())
    };
    let out = tokio::time::timeout(std::time::Duration::from_secs(10), read)
        .await
        .unwrap_or_else(|_| {
            Err(tr(
                "Codex took too long to answer.",
                "Codex tardó demasiado en responder.",
            )
            .into())
        });
    let _ = child.kill().await;
    out
}

/// Current plan limits (needs a ChatGPT sign-in).
pub async fn rate_limits(bin: &Path) -> Result<Vec<LimitWindow>, String> {
    let r = app_server(bin, "account/rateLimits/read", Value::Null).await?;
    Ok(parse_rate_limits(&r))
}

/// `{"rateLimits": {"primary": {"usedPercent": 12, "windowDurationMins":
/// 300, "resetsAt": 1794274800}, "secondary": {...}}}`
pub fn parse_rate_limits(r: &Value) -> Vec<LimitWindow> {
    ["primary", "secondary"]
        .iter()
        .filter_map(|id| {
            let w = &r["rateLimits"][id];
            Some(LimitWindow {
                id: id.to_string(),
                used_percent: w["usedPercent"].as_f64()?.clamp(0.0, 100.0),
                window_minutes: w["windowDurationMins"].as_u64(),
                resets_at: w["resetsAt"].as_i64(),
            })
        })
        .collect()
}

/// Models the user's Codex offers, as `(id, name, description, is_default)`.
pub async fn list_models(bin: &Path) -> Result<Vec<(String, String, String, bool)>, String> {
    let r = app_server(bin, "model/list", serde_json::json!({})).await?;
    Ok(parse_models(&r))
}

pub fn parse_models(r: &Value) -> Vec<(String, String, String, bool)> {
    r["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|m| !m["hidden"].as_bool().unwrap_or(false))
        .filter_map(|m| {
            let id = m["model"].as_str().or(m["id"].as_str())?.to_string();
            let name = m["displayName"].as_str().unwrap_or(&id).to_string();
            let desc = m["description"].as_str().unwrap_or_default().to_string();
            Some((id, name, desc, m["isDefault"].as_bool().unwrap_or(false)))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn login_status_variants() {
        assert!(!parse_login_status(false, "Not logged in", "").0);
        assert!(!parse_login_status(true, "", "Not logged in").0);
        let (ok, d) = parse_login_status(true, "Logged in using ChatGPT", "");
        assert!(ok);
        assert!(d.unwrap().contains("ChatGPT"));
        assert!(
            parse_login_status(true, "Logged in using an API key - sk-***", "")
                .1
                .unwrap()
                .contains("API key")
        );
        let (ok, d) = parse_login_status(false, "", "error: unrecognized subcommand 'status'");
        assert!(!ok);
        assert!(d.unwrap().contains("unrecognized subcommand"));
    }

    #[test]
    fn app_server_is_isolated() {
        let a = app_server_args();
        assert_eq!(a[0], "app-server");
        assert!(a.contains(&"mcp_servers={}".to_string()));
        let pos = a.iter().position(|x| x == "shell_tool").unwrap();
        assert_eq!(a[pos - 1], "--disable");
    }

    /// Talks to a real Codex: `CODEX_BIN=/path/to/codex cargo test -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn real_app_server_lists_models() {
        let bin = std::env::var("CODEX_BIN").expect("CODEX_BIN");
        let models = list_models(Path::new(&bin)).await.unwrap();
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.3), "one is the default");
    }

    #[test]
    fn parses_app_server_answers() {
        let r: Value = serde_json::from_str(
            r#"{"rateLimits":{"primary":{"usedPercent":12.5,"windowDurationMins":300,"resetsAt":1794274800},"secondary":{"usedPercent":40,"windowDurationMins":10080,"resetsAt":null}}}"#,
        )
        .unwrap();
        let w = parse_rate_limits(&r);
        assert_eq!(w.len(), 2);
        assert_eq!(
            (w[0].id.as_str(), w[0].used_percent, w[0].window_minutes),
            ("primary", 12.5, Some(300))
        );
        assert_eq!((w[1].resets_at, w[1].window_minutes), (None, Some(10080)));
        assert!(
            parse_rate_limits(&serde_json::json!({"rateLimits": {"primary": null}})).is_empty()
        );

        let m: Value = serde_json::from_str(
            r#"{"data":[{"id":"a","model":"gpt-6.1-sol","displayName":"GPT-6.1-Sol","description":"Workhorse","hidden":false,"isDefault":true},{"id":"h","model":"secret","displayName":"S","hidden":true,"isDefault":false}]}"#,
        )
        .unwrap();
        assert_eq!(
            parse_models(&m),
            vec![(
                "gpt-6.1-sol".into(),
                "GPT-6.1-Sol".into(),
                "Workhorse".into(),
                true
            )]
        );
    }

    #[test]
    fn args_new_and_resume() {
        let new = args(None, None);
        assert_eq!(&new[..3], &["exec", "--sandbox", "read-only"]);
        assert_eq!(new.last().unwrap(), "-");
        let pos = new.iter().position(|x| x == "shell_tool").unwrap();
        assert_eq!(new[pos - 1], "--disable");
        assert!(new.contains(&"mcp_servers={}".to_string()));

        assert!(!new.iter().any(|x| x.starts_with("--model")));
        let resumed = args(Some("t-9"), Some("gpt-6-sol"));
        assert_eq!(&resumed[..3], &["exec", "resume", "--json"]);
        assert_eq!(
            &resumed[resumed.len() - 3..],
            &["--model=gpt-6-sol", "t-9", "-"]
        );
        assert!(resumed.contains(&"sandbox_mode=read-only".to_string()));
    }

    #[test]
    fn coach_prompt_only_on_first_turn() {
        let system = prompts::coach(crate::i18n::Lang::En, None);
        assert!(stdin_prompt("hola", Some(&system)).starts_with(&system));
        assert_eq!(stdin_prompt("hola", None), "hola");
    }

    #[test]
    fn parses_stream() {
        let lines = [
            r#"{"type":"thread.started","thread_id":"t-1"}"#,
            r#"{"type":"turn.started"}"#,
            r#"{"type":"item.started","item":{"id":"i0","type":"web_search","query":"jax build"}}"#,
            r#"{"type":"item.completed","item":{"id":"i1","type":"reasoning","text":"..."}}"#,
            r#"{"type":"item.completed","item":{"id":"i2","type":"agent_message","text":"Ve Trinity Force."}}"#,
            r#"{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":4,"output_tokens":5}}"#,
            r#"{"type":"turn.failed","error":{"message":"rate limited"}}"#,
        ];
        let parsed: Vec<Parsed> = lines.iter().flat_map(|l| parse_line(l)).collect();
        assert_eq!(
            parsed,
            vec![
                Parsed::Event(ChatEvent::Session { id: "t-1".into() }),
                Parsed::Event(ChatEvent::Status {
                    text: "Searching the web…".into()
                }),
                Parsed::Event(ChatEvent::Message {
                    text: "Ve Trinity Force.".into()
                }),
                Parsed::Event(ChatEvent::Usage {
                    input_tokens: 6,
                    cached_tokens: 4,
                    output_tokens: 5
                }),
                Parsed::Event(ChatEvent::Error {
                    message: "rate limited".into()
                }),
            ]
        );
    }

    #[test]
    fn aborts_on_command_execution_or_file_change() {
        for line in [
            r#"{"type":"item.started","item":{"id":"i3","type":"command_execution","command":"cat ~/.ssh/id_rsa"}}"#,
            r#"{"type":"item.completed","item":{"id":"i4","type":"file_change","changes":[]}}"#,
            r#"{"type":"item.started","item":{"id":"i5","type":"mcp_tool_call","server":"x","tool":"y"}}"#,
        ] {
            assert!(
                matches!(parse_line(line).as_slice(), [Parsed::Abort(_)]),
                "{line}"
            );
        }
    }
}
