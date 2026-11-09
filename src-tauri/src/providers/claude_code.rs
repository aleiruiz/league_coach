//! Claude Code (`claude -p`) con la suscripción Claude del usuario.

use std::path::Path;

use serde_json::Value;

use super::ChatEvent;
use super::process::{self, Parsed};

pub async fn login_status(bin: &Path) -> (bool, Option<String>) {
    match process::run_capture(bin, &["auth", "status", "--json"]).await {
        Ok(out) => parse_auth_status(&out.stdout),
        Err(e) => (false, Some(format!("No pude consultar la sesión: {e}"))),
    }
}

pub fn parse_auth_status(stdout: &str) -> (bool, Option<String>) {
    let Ok(v) = serde_json::from_str::<Value>(stdout) else {
        return (
            false,
            Some("Respuesta inesperada de `claude auth status`.".into()),
        );
    };
    let logged_in = v["loggedIn"].as_bool().unwrap_or(false);
    if !logged_in {
        return (false, Some("No has iniciado sesión.".into()));
    }
    let detail = match (v["apiProvider"].as_str(), v["authMethod"].as_str()) {
        (Some(p), _) if p != "firstParty" => format!("Conectado vía {p} (no con tu suscripción)."),
        (_, Some("api_key")) => "Conectado con API key (no con tu suscripción).".into(),
        _ => "Conectado con tu cuenta de Claude.".into(),
    };
    (true, Some(detail))
}

/// `prompt_file` contiene las instrucciones del coach. Se pasa como archivo y no
/// como argumento porque en Windows los shims `.cmd` no aceptan saltos de línea.
///
/// Aislamos la sesión de la configuración del usuario: sin sus MCP, hooks,
/// plugins, skills ni settings, y con todo lo que no sea búsqueda web denegado.
/// No usamos `--bare` porque desactiva el login con suscripción.
pub fn args(prompt_file: &Path, session_id: Option<&str>) -> Vec<String> {
    let mut a: Vec<String> = [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        // Solo búsqueda web: sin shell, archivos ni descarga libre de páginas.
        "--tools",
        "WebSearch",
        "--allowedTools",
        "WebSearch",
        "--disallowedTools",
        "Bash,Edit,Write,NotebookEdit,WebFetch",
        "--permission-mode",
        "dontAsk",
        "--strict-mcp-config",
        "--setting-sources=",
        "--disable-slash-commands",
        "--append-system-prompt-file",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    a.push(prompt_file.to_string_lossy().into_owned());
    if let Some(id) = session_id {
        // Forma pegada: `--resume` tiene valor opcional y no debe poder leerse
        // un flag como valor (el id ya se validó antes).
        a.push(format!("--resume={id}"));
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
        Some("user") => sources(tool_results(&v)),
        Some("assistant") => sources(
            v["message"]["content"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|b| b["type"] == "web_search_tool_result")
                .flat_map(|b| urls_in(&b["content"]))
                .collect(),
        ),
        Some("result") => {
            let text = v["result"].as_str().unwrap_or_default().to_string();
            if v["is_error"].as_bool().unwrap_or(false) || v["subtype"] != "success" {
                let message = if text.is_empty() {
                    format!("Claude Code devolvió un error ({}).", v["subtype"])
                } else {
                    text
                };
                vec![ChatEvent::Error { message }]
            } else {
                vec![ChatEvent::Final { text }]
            }
        }
        _ => vec![],
    }
}

fn sources(urls: Vec<String>) -> Vec<ChatEvent> {
    if urls.is_empty() {
        vec![]
    } else {
        vec![ChatEvent::Sources { urls }]
    }
}

/// URLs dentro de los `tool_result` de un mensaje "user" (y del campo
/// `tool_use_result` que agregan las versiones nuevas de Claude Code).
fn tool_results(v: &Value) -> Vec<String> {
    let mut out: Vec<String> = v["message"]["content"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|b| b["type"] == "tool_result")
        .flat_map(|b| urls_in(&b["content"]))
        .collect();
    out.extend(urls_in(&v["tool_use_result"]));
    out
}

/// Todas las URLs https en un valor JSON: campos `url` y enlaces dentro de texto.
pub fn urls_in(v: &Value) -> Vec<String> {
    let mut out = Vec::new();
    collect_urls(v, &mut out);
    out
}

fn collect_urls(v: &Value, out: &mut Vec<String>) {
    match v {
        Value::String(s) => {
            let mut rest = s.as_str();
            while let Some(i) = rest.find("https://") {
                let tail = &rest[i..];
                let end = tail
                    .find(|c: char| c.is_whitespace() || "\"'<>()[]{}`".contains(c))
                    .unwrap_or(tail.len());
                let url = tail[..end].trim_end_matches(['.', ',', ';', ':']);
                if url.len() > "https://".len() {
                    out.push(url.to_string());
                }
                rest = &tail[end..];
            }
        }
        Value::Array(a) => a.iter().for_each(|x| collect_urls(x, out)),
        Value::Object(o) => o.values().for_each(|x| collect_urls(x, out)),
        _ => {}
    }
}

fn parse_stream_event(ev: &Value) -> Vec<ChatEvent> {
    match ev["type"].as_str() {
        Some("message_start") => vec![ChatEvent::Break],
        Some("content_block_start") => {
            let block = &ev["content_block"];
            match block["type"].as_str() {
                Some("web_search_tool_result") => sources(urls_in(&block["content"])),
                Some("server_tool_use") | Some("tool_use") => {
                    let name = block["name"].as_str().unwrap_or("una herramienta");
                    let text = match name {
                        "web_search" | "WebSearch" => "Buscando en la web…".to_string(),
                        other => format!("Usando {other}…"),
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
            r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"Web search results for query: \"jax build\"\n\nLinks: [{\"title\":\"Jax Build\",\"url\":\"https://u.gg/lol/champions/jax/build\"}]"}]},"tool_use_result":{"results":[{"content":[{"title":"x","url":"https://www.op.gg/champions/jax/build"}]}]}}"#,
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
        assert!(!urls.iter().any(|u| u.contains("inventado")));
    }

    #[test]
    fn auth_status_variants() {
        let (ok, d) = parse_auth_status(
            r#"{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty"}"#,
        );
        assert!(ok);
        assert!(d.unwrap().contains("cuenta de Claude"));
        let (_, d) = parse_auth_status(r#"{"loggedIn":true,"apiProvider":"bedrock"}"#);
        assert!(d.unwrap().contains("bedrock"));
        let (_, d) = parse_auth_status(r#"{"loggedIn":true,"authMethod":"api_key"}"#);
        assert!(d.unwrap().contains("API key"));
        assert!(!parse_auth_status(r#"{"loggedIn":false}"#).0);
        assert!(!parse_auth_status("not json").0);
    }

    #[test]
    fn args_isolate_user_config() {
        let a = args(Path::new("coach.md"), None);
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
    }

    #[test]
    fn resume_uses_attached_form() {
        let a = args(Path::new("coach.md"), Some("abc-123"));
        assert_eq!(a.last().unwrap(), "--resume=abc-123");
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
                    text: "Buscando en la web…".into()
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
