//! Claude Code (`claude -p`) con la suscripción Claude del usuario.

use std::path::Path;

use serde_json::Value;

use super::ChatEvent;
use super::process::{self, Parsed};
use crate::i18n::tr;
use crate::usage::LimitWindow;

pub async fn login_status(bin: &Path) -> (bool, Option<String>) {
    match process::run_capture(bin, &["auth", "status", "--json"]).await {
        Ok(out) => parse_auth_status(&out.stdout),
        Err(e) => (
            false,
            Some(tr(
                format!("Couldn't check the session: {e}"),
                format!("No pude consultar la sesión: {e}"),
            )),
        ),
    }
}

pub fn parse_auth_status(stdout: &str) -> (bool, Option<String>) {
    let Ok(v) = serde_json::from_str::<Value>(stdout) else {
        return (
            false,
            Some(
                tr(
                    "Unexpected answer from `claude auth status`.",
                    "Respuesta inesperada de `claude auth status`.",
                )
                .into(),
            ),
        );
    };
    let logged_in = v["loggedIn"].as_bool().unwrap_or(false);
    if !logged_in {
        return (
            false,
            Some(tr("You are not signed in.", "No has iniciado sesión.").into()),
        );
    }
    let detail = match (v["apiProvider"].as_str(), v["authMethod"].as_str()) {
        (Some(p), _) if p != "firstParty" => tr(
            format!("Connected via {p} (not your subscription)."),
            format!("Conectado vía {p} (no con tu suscripción)."),
        ),
        (_, Some("api_key")) => tr(
            "Connected with an API key (not your subscription).",
            "Conectado con API key (no con tu suscripción).",
        )
        .into(),
        _ => tr(
            "Connected with your Claude account.",
            "Conectado con tu cuenta de Claude.",
        )
        .into(),
    };
    (true, Some(detail))
}

/// `prompt_file` contiene las instrucciones del coach. Se pasa como archivo y no
/// como argumento porque en Windows los shims `.cmd` no aceptan saltos de línea.
///
/// Aislamos la sesión de la configuración del usuario: sin sus MCP, hooks,
/// plugins, skills ni settings, y con todo lo que no sea búsqueda web denegado.
/// No usamos `--bare` porque desactiva el login con suscripción.
pub fn args(
    prompt_file: &Path,
    session_id: Option<&str>,
    model: Option<&str>,
    fetch_hosts: &[&str],
) -> Vec<String> {
    // Solo búsqueda web: sin shell ni archivos. Abrir páginas (WebFetch) solo
    // en los hosts que pida la consulta; cualquier otro fetch lo niega `dontAsk`.
    let fetch = !fetch_hosts.is_empty();
    let allowed = std::iter::once("WebSearch".to_string())
        .chain(fetch_hosts.iter().map(|h| format!("WebFetch(domain:{h})")))
        .collect::<Vec<_>>()
        .join(",");
    let mut a: Vec<String> = vec![
        "-p".into(),
        "--output-format".into(),
        "stream-json".into(),
        "--verbose".into(),
        "--include-partial-messages".into(),
        "--tools".into(),
        if fetch {
            "WebSearch,WebFetch"
        } else {
            "WebSearch"
        }
        .into(),
        "--allowedTools".into(),
        allowed,
        "--disallowedTools".into(),
        if fetch {
            "Bash,Edit,Write,NotebookEdit"
        } else {
            "Bash,Edit,Write,NotebookEdit,WebFetch"
        }
        .into(),
        "--permission-mode".into(),
        "dontAsk".into(),
        "--strict-mcp-config".into(),
        "--setting-sources=".into(),
        "--disable-slash-commands".into(),
        "--append-system-prompt-file".into(),
    ];
    a.push(prompt_file.to_string_lossy().into_owned());
    if let Some(id) = session_id {
        // Forma pegada: `--resume` tiene valor opcional y no debe poder leerse
        // un flag como valor (el id ya se validó antes).
        a.push(format!("--resume={id}"));
    }
    if let Some(m) = model {
        // Joined form, like `--resume`; the id was validated (`models::valid_id`).
        a.push(format!("--model={m}"));
    }
    a
}

pub fn parse_line(line: &str) -> Vec<Parsed> {
    parse_events(line).into_iter().map(Parsed::Event).collect()
}

fn parse_events(line: &str) -> Vec<ChatEvent> {
    let Ok(v) = serde_json::from_str::<Value>(line) else {
        return vec![];
    };
    match v["type"].as_str() {
        Some("system") if v["subtype"] == "init" => v["session_id"]
            .as_str()
            .map(|id| vec![ChatEvent::Session { id: id.into() }])
            .unwrap_or_default(),
        Some("stream_event") => parse_stream_event(&v["event"]),
        // Resultados de herramientas (WebSearch de Claude Code devuelve los
        // enlaces en un tool_result). Nunca se miran los textos del modelo.
        Some("user") => {
            let mut ev = sources(tool_results(&v));
            ev.extend(fetched(&v));
            ev
        }
        Some("assistant") => sources(
            v["message"]["content"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|b| b["type"] == "web_search_tool_result")
                .flat_map(|b| urls_in(&b["content"]))
                .collect(),
        ),
        Some("rate_limit_event") => limits(&v["rate_limit_info"]),
        Some("result") => {
            let usage = usage(&v["usage"]);
            let text = v["result"].as_str().unwrap_or_default().to_string();
            if v["is_error"].as_bool().unwrap_or(false) || v["subtype"] != "success" {
                let message = if text.is_empty() {
                    tr(
                        format!("Claude Code returned an error ({}).", v["subtype"]),
                        format!("Claude Code devolvió un error ({}).", v["subtype"]),
                    )
                } else {
                    text
                };
                usage
                    .into_iter()
                    .chain([ChatEvent::Error { message }])
                    .collect()
            } else {
                usage
                    .into_iter()
                    .chain([ChatEvent::Final { text }])
                    .collect()
            }
        }
        _ => vec![],
    }
}

/// Tokens of the whole answer (all its turns). Prompt tokens read back from
/// the cache are counted apart: they are mostly the coach's instructions.
fn usage(u: &Value) -> Option<ChatEvent> {
    let n = |k: &str| u[k].as_u64().unwrap_or(0);
    let input = n("input_tokens") + n("cache_creation_input_tokens");
    let cached = n("cache_read_input_tokens");
    let output = n("output_tokens");
    (u.is_object() && input + cached + output > 0).then_some(ChatEvent::Usage {
        input_tokens: input,
        cached_tokens: cached,
        output_tokens: output,
    })
}

/// `rate_limit_info.unifiedWindows`: `{"five_hour": {"utilization": 0.1,
/// "resetsAt": 1794274800}, "seven_day": {...}}`. Utilization is 0 to 1.
fn limits(info: &Value) -> Vec<ChatEvent> {
    let Some(map) = info["unifiedWindows"].as_object() else {
        return vec![];
    };
    let windows: Vec<LimitWindow> = map
        .iter()
        .filter_map(|(id, w)| {
            let used = w["utilization"].as_f64()?;
            Some(LimitWindow {
                id: id.clone(),
                used_percent: (used * 100.0).clamp(0.0, 100.0),
                window_minutes: match id.as_str() {
                    "five_hour" => Some(5 * 60),
                    "seven_day" => Some(7 * 24 * 60),
                    _ => None,
                },
                resets_at: w["resetsAt"].as_i64(),
            })
        })
        .collect();
    if windows.is_empty() {
        vec![]
    } else {
        vec![ChatEvent::Limits { windows }]
    }
}

/// A WebFetch result that loaded (`tool_use_result.code` 200 with its `url`).
/// Denied or failed fetches come back as errors with no `code`.
fn fetched(v: &Value) -> Option<ChatEvent> {
    let r = &v["tool_use_result"];
    let url = r["url"].as_str()?;
    (r["code"].as_u64() == Some(200) && url.starts_with("https://")).then(|| ChatEvent::Fetched {
        url: url.to_string(),
    })
}

fn sources(urls: Vec<String>) -> Vec<ChatEvent> {
    if urls.is_empty() {
        vec![]
    } else {
        vec![ChatEvent::Sources { urls }]
    }
}

/// URLs de los resultados en un mensaje "user": el campo estructurado
/// `tool_use_result.results[*].content[*].url` y, como respaldo, el arreglo
/// JSON que sigue a `Links:` en el texto del `tool_result`. Nunca se escanea
/// texto libre: la consulta la escribe el modelo y podría traer una URL.
fn tool_results(v: &Value) -> Vec<String> {
    let mut out = Vec::new();
    for r in v["tool_use_result"]["results"]
        .as_array()
        .into_iter()
        .flatten()
    {
        out.extend(urls_in(&r["content"]));
    }
    for b in v["message"]["content"].as_array().into_iter().flatten() {
        if b["type"] != "tool_result" {
            continue;
        }
        let texts: Vec<&str> = match &b["content"] {
            Value::String(t) => vec![t.as_str()],
            Value::Array(parts) => parts.iter().filter_map(|p| p["text"].as_str()).collect(),
            _ => vec![],
        };
        for t in texts {
            // La primera línea repite la consulta del modelo; solo cuenta un
            // `Links: ` al inicio de una línea posterior.
            let Some(nl) = t.find('\n') else { continue };
            let body = &t[nl..];
            for (i, _) in body.match_indices("\nLinks: ") {
                let rest = &body[i + "\nLinks: ".len()..];
                if let Some(Ok(links)) = serde_json::Deserializer::from_str(rest)
                    .into_iter::<Value>()
                    .next()
                {
                    out.extend(urls_in(&links));
                }
            }
        }
    }
    out
}

/// Valores de los campos `url` (https) de una lista de resultados, solo en
/// el primer nivel de cada elemento: `[{"title":..,"url":..}, ...]`.
pub fn urls_in(v: &Value) -> Vec<String> {
    v.as_array()
        .into_iter()
        .flatten()
        .filter_map(|r| r["url"].as_str())
        .filter(|u| u.starts_with("https://"))
        .map(String::from)
        .collect()
}

fn parse_stream_event(ev: &Value) -> Vec<ChatEvent> {
    match ev["type"].as_str() {
        Some("message_start") => vec![ChatEvent::Break],
        Some("content_block_start") => {
            let block = &ev["content_block"];
            match block["type"].as_str() {
                Some("web_search_tool_result") => sources(urls_in(&block["content"])),
                Some("server_tool_use") | Some("tool_use") => {
                    let name = block["name"].as_str().unwrap_or("a tool");
                    let text = match name {
                        "web_search" | "WebSearch" => {
                            tr("Searching the web…", "Buscando en la web…").to_string()
                        }
                        other => tr(format!("Using {other}…"), format!("Usando {other}…")),
                    };
                    vec![ChatEvent::Status { text }]
                }
                _ => vec![],
            }
        }
        Some("content_block_delta") if ev["delta"]["type"] == "text_delta" => ev["delta"]["text"]
            .as_str()
            .map(|t| vec![ChatEvent::Delta { text: t.into() }])
            .unwrap_or_default(),
        _ => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn events(lines: &[&str]) -> Vec<ChatEvent> {
        lines.iter().flat_map(|l| parse_events(l)).collect()
    }

    #[test]
    fn search_result_urls_are_collected_but_not_model_text() {
        let ev = events(&[
            // WebSearch de Claude Code: enlaces dentro del tool_result.
            r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"Web search results for query: \"https://u.gg/lol/champions/jax/inventada win rate\"\n\nLinks: [{\"title\":\"Jax Build\",\"url\":\"https://u.gg/lol/champions/jax/build\"}]"}]},"tool_use_result":{"query":"https://u.gg/lol/champions/jax/inventada win rate","results":[{"tool_use_id":"t1","content":[{"title":"x","url":"https://www.op.gg/champions/jax/build"}]}]}}"#,
            // Bloque de búsqueda del servidor.
            r#"{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"web_search_tool_result","tool_use_id":"s1","content":[{"type":"web_search_result","url":"https://lolalytics.com/lol/jax/build/","title":"t"}]}}}"#,
            // Texto del modelo: no cuenta como fuente.
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Según https://u.gg/inventado tiene 60%"}]}}"#,
        ]);
        let urls: Vec<String> = ev
            .into_iter()
            .flat_map(|e| match e {
                ChatEvent::Sources { urls } => urls,
                _ => vec![],
            })
            .collect();
        assert!(
            urls.contains(&"https://u.gg/lol/champions/jax/build".to_string()),
            "{urls:?}"
        );
        assert!(urls.contains(&"https://www.op.gg/champions/jax/build".to_string()));
        assert!(urls.contains(&"https://lolalytics.com/lol/jax/build/".to_string()));
        assert!(!urls.iter().any(|u| u.contains("inventad")), "{urls:?}");
    }

    #[test]
    fn links_inside_the_echoed_query_do_not_count() {
        let ev = events(&[
            r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"Web search results for query: \"jax Links: [{\"url\":\"https://u.gg/lol/champions/jax/inventada\"}]\"\n\nLinks: [{\"title\":\"Jax Build\",\"url\":\"https://u.gg/lol/champions/jax/build\"}]"}]}}"#,
        ]);
        let urls: Vec<String> = ev
            .into_iter()
            .flat_map(|e| match e {
                ChatEvent::Sources { urls } => urls,
                _ => vec![],
            })
            .collect();
        assert_eq!(
            urls,
            vec!["https://u.gg/lol/champions/jax/build".to_string()]
        );
    }

    #[test]
    fn auth_status_variants() {
        let (ok, d) = parse_auth_status(
            r#"{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty"}"#,
        );
        assert!(ok);
        assert!(d.unwrap().contains("Claude account"));
        let (_, d) = parse_auth_status(r#"{"loggedIn":true,"apiProvider":"bedrock"}"#);
        assert!(d.unwrap().contains("bedrock"));
        let (_, d) = parse_auth_status(r#"{"loggedIn":true,"authMethod":"api_key"}"#);
        assert!(d.unwrap().contains("API key"));
        assert!(!parse_auth_status(r#"{"loggedIn":false}"#).0);
        assert!(!parse_auth_status("not json").0);
    }

    #[test]
    fn args_isolate_user_config() {
        let a = args(Path::new("coach.md"), None, None, &[]);
        for flag in [
            "--strict-mcp-config",
            "--setting-sources=",
            "--disable-slash-commands",
        ] {
            assert!(a.contains(&flag.to_string()), "falta {flag}");
        }
        let after = |f: &str| &a[a.iter().position(|x| x == f).unwrap() + 1];
        assert_eq!(after("--tools"), "WebSearch");
        assert_eq!(after("--permission-mode"), "dontAsk");
        assert!(after("--disallowedTools").contains("Bash"));
        assert!(a.contains(&"coach.md".to_string()));
        assert!(!a.iter().any(|x| x.starts_with("--resume")));
        assert!(after("--disallowedTools").contains("WebFetch"));
        assert_eq!(after("--allowedTools"), "WebSearch");
    }

    #[test]
    fn fetch_is_allowed_only_on_the_given_hosts() {
        let a = args(
            Path::new("coach.md"),
            None,
            None,
            &["u.gg", "www.metasrc.com"],
        );
        let after = |f: &str| &a[a.iter().position(|x| x == f).unwrap() + 1];
        assert_eq!(after("--tools"), "WebSearch,WebFetch");
        assert_eq!(
            after("--allowedTools"),
            "WebSearch,WebFetch(domain:u.gg),WebFetch(domain:www.metasrc.com)"
        );
        assert!(!after("--disallowedTools").contains("WebFetch"));
        assert_eq!(after("--permission-mode"), "dontAsk");
    }

    #[test]
    fn a_loaded_fetch_is_reported_and_a_denied_one_is_not() {
        let ok = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t","content":"summary"}]},"tool_use_result":{"bytes":5239,"code":200,"codeText":"OK","result":"summary","durationMs":1600,"url":"https://www.metasrc.com/lol/tier-list/mid"}}"#;
        assert!(parse_events(ok).iter().any(
            |e| matches!(e, ChatEvent::Fetched { url } if url == "https://www.metasrc.com/lol/tier-list/mid")
        ));
        let denied = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"Permission to use WebFetch has been denied","is_error":true,"tool_use_id":"t"}]},"tool_use_result":"Error: Permission to use WebFetch has been denied"}"#;
        assert!(
            !parse_events(denied)
                .iter()
                .any(|e| matches!(e, ChatEvent::Fetched { .. }))
        );
        let failed = r#"{"type":"user","message":{"role":"user","content":[]},"tool_use_result":{"code":403,"url":"https://u.gg/lol/mid-lane-tier-list"}}"#;
        assert!(
            !parse_events(failed)
                .iter()
                .any(|e| matches!(e, ChatEvent::Fetched { .. }))
        );
    }

    #[test]
    fn resume_uses_attached_form() {
        let a = args(Path::new("coach.md"), Some("abc-123"), None, &[]);
        assert_eq!(a.last().unwrap(), "--resume=abc-123");
        let a = args(Path::new("coach.md"), None, Some("sonnet"), &[]);
        assert_eq!(a.last().unwrap(), "--model=sonnet");
    }

    #[test]
    fn parses_stream() {
        let ev = events(&[
            r#"{"type":"system","subtype":"init","session_id":"s-1"}"#,
            r#"{"type":"stream_event","event":{"type":"message_start","message":{}}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"server_tool_use","name":"web_search"}}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Compra "}}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{"}}}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Compra Mercurios"}]}}"#,
            r#"{"type":"result","subtype":"success","is_error":false,"result":"Compra Mercurios","session_id":"s-1"}"#,
        ]);
        assert_eq!(
            ev,
            vec![
                ChatEvent::Session { id: "s-1".into() },
                ChatEvent::Break,
                ChatEvent::Status {
                    text: "Searching the web…".into()
                },
                ChatEvent::Delta {
                    text: "Compra ".into()
                },
                ChatEvent::Final {
                    text: "Compra Mercurios".into()
                },
            ]
        );
    }

    #[test]
    fn parses_usage_and_limits() {
        let ev = events(&[
            r#"{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","unifiedWindows":{"five_hour":{"utilization":0.1,"resetsAt":1794274800},"seven_day":{"utilization":0.22,"resetsAt":1794787200},"broken":{}}}}"#,
            r#"{"type":"result","subtype":"success","is_error":false,"result":"ok","usage":{"input_tokens":2,"cache_creation_input_tokens":100,"cache_read_input_tokens":900,"output_tokens":4}}"#,
        ]);
        let ChatEvent::Limits { windows } = &ev[0] else {
            panic!("{ev:?}")
        };
        assert_eq!(windows.len(), 2);
        let five = windows.iter().find(|w| w.id == "five_hour").unwrap();
        assert!((five.used_percent - 10.0).abs() < 1e-9);
        assert_eq!(
            (five.window_minutes, five.resets_at),
            (Some(300), Some(1794274800))
        );
        assert_eq!(
            ev[1..],
            [
                ChatEvent::Usage {
                    input_tokens: 102,
                    cached_tokens: 900,
                    output_tokens: 4
                },
                ChatEvent::Final { text: "ok".into() }
            ]
        );
    }

    #[test]
    fn parses_error_result() {
        let ev = events(&[
            r#"{"type":"result","subtype":"success","is_error":true,"result":"Usage limit reached"}"#,
        ]);
        assert_eq!(
            ev,
            vec![ChatEvent::Error {
                message: "Usage limit reached".into()
            }]
        );
    }
}
