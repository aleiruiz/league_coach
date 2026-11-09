//! Claude Code (`claude -p`) con la suscripción Claude del usuario.

use std::path::Path;

use serde_json::Value;

use super::{ChatEvent, process};

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
    let detail = if !logged_in {
        Some("No has iniciado sesión.".to_string())
    } else {
        match v["authMethod"].as_str() {
            Some("api_key") => Some("Conectado con API key (no con tu suscripción).".into()),
            _ => Some("Conectado con tu cuenta de Claude.".into()),
        }
    };
    (logged_in, detail)
}

/// `prompt_file` contiene las instrucciones del coach. Se pasa como archivo y no
/// como argumento porque en Windows los shims `.cmd` no aceptan saltos de línea.
pub fn args(prompt_file: &Path, session_id: Option<&str>) -> Vec<String> {
    let mut a: Vec<String> = [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        // Solo herramientas de lectura web: nada de shell ni archivos.
        "--tools",
        "WebSearch,WebFetch",
        "--allowedTools",
        "WebSearch,WebFetch",
        "--append-system-prompt-file",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    a.push(prompt_file.to_string_lossy().into_owned());
    if let Some(id) = session_id {
        a.push("--resume".into());
        a.push(id.into());
    }
    a
}

pub fn parse_line(line: &str) -> Vec<ChatEvent> {
    let Ok(v) = serde_json::from_str::<Value>(line) else {
        return vec![];
    };
    match v["type"].as_str() {
        Some("system") if v["subtype"] == "init" => v["session_id"]
            .as_str()
            .map(|id| vec![ChatEvent::Session { id: id.into() }])
            .unwrap_or_default(),
        Some("stream_event") => parse_stream_event(&v["event"]),
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

fn parse_stream_event(ev: &Value) -> Vec<ChatEvent> {
    match ev["type"].as_str() {
        Some("message_start") => vec![ChatEvent::Break],
        Some("content_block_start") => {
            let block = &ev["content_block"];
            match block["type"].as_str() {
                Some("server_tool_use") | Some("tool_use") => {
                    let name = block["name"].as_str().unwrap_or("una herramienta");
                    let text = match name {
                        "web_search" | "WebSearch" => "Buscando en la web…".to_string(),
                        "web_fetch" | "WebFetch" => "Leyendo una página…".to_string(),
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

    #[test]
    fn auth_status_subscription() {
        let (ok, detail) = parse_auth_status(r#"{"loggedIn":true,"authMethod":"oauth_token"}"#);
        assert!(ok);
        assert!(detail.unwrap().contains("cuenta de Claude"));
    }

    #[test]
    fn auth_status_logged_out_and_garbage() {
        assert!(!parse_auth_status(r#"{"loggedIn":false}"#).0);
        assert!(!parse_auth_status("not json").0);
    }

    #[test]
    fn args_resume_and_no_shell_tools() {
        let a = args(Path::new("coach.md"), Some("abc"));
        assert!(a.ends_with(&["--resume".to_string(), "abc".to_string()]));
        let tools = &a[a.iter().position(|x| x == "--tools").unwrap() + 1];
        assert_eq!(tools, "WebSearch,WebFetch");
        assert!(!args(Path::new("coach.md"), None).contains(&"--resume".to_string()));
        assert!(a.contains(&"coach.md".to_string()));
    }

    #[test]
    fn parses_stream() {
        let lines = [
            r#"{"type":"system","subtype":"init","session_id":"s-1"}"#,
            r#"{"type":"stream_event","event":{"type":"message_start","message":{}}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"server_tool_use","name":"web_search"}}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Compra "}}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{"}}}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Compra Mercurios"}]}}"#,
            r#"{"type":"result","subtype":"success","is_error":false,"result":"Compra Mercurios","session_id":"s-1"}"#,
        ];
        let events: Vec<ChatEvent> = lines.iter().flat_map(|l| parse_line(l)).collect();
        assert_eq!(
            events,
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
        let ev = parse_line(
            r#"{"type":"result","subtype":"success","is_error":true,"result":"Usage limit reached"}"#,
        );
        assert_eq!(
            ev,
            vec![ChatEvent::Error {
                message: "Usage limit reached".into()
            }]
        );
    }
}
