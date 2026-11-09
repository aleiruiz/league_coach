//! Codex CLI (`codex exec --json`) con la cuenta de ChatGPT del usuario.

use std::path::Path;

use serde_json::Value;

use super::{ChatEvent, process, prompts};

pub async fn login_status(bin: &Path) -> (bool, Option<String>) {
    match process::run_capture(bin, &["login", "status"]).await {
        Ok(out) => parse_login_status(out.status_ok, &out.stdout, &out.stderr),
        Err(e) => (false, Some(format!("No pude consultar la sesión: {e}"))),
    }
}

pub fn parse_login_status(ok: bool, stdout: &str, stderr: &str) -> (bool, Option<String>) {
    // `codex login status` escribe el resultado en stdout o stderr según la versión.
    let text = format!("{stdout}\n{stderr}");
    let text = text.trim();
    if !ok || text.to_lowercase().contains("not logged in") {
        return (false, Some("No has iniciado sesión.".into()));
    }
    if text.to_lowercase().contains("api key") {
        return (
            true,
            Some("Conectado con API key (no con tu suscripción).".into()),
        );
    }
    (true, Some("Conectado con tu cuenta de ChatGPT.".into()))
}

// Sin comillas en los valores: si no es TOML válido, Codex lo toma como texto
// literal, y así evitamos problemas de escape con los shims `.cmd` de Windows.
const COMMON: &[&str] = &[
    "--json",
    "--skip-git-repo-check",
    "-c",
    "sandbox_mode=read-only",
    "-c",
    "web_search=live",
];

pub fn args(session_id: Option<&str>) -> Vec<String> {
    let mut a = vec!["exec".to_string()];
    if let Some(id) = session_id {
        a.push("resume".into());
        a.extend(COMMON.iter().map(|s| s.to_string()));
        a.push(id.into());
    } else {
        a.extend(COMMON.iter().map(|s| s.to_string()));
    }
    // El prompt llega por stdin.
    a.push("-".into());
    a
}

/// Codex no tiene un flag de system prompt para `exec`, así que en el primer
/// mensaje de la conversación anteponemos las instrucciones del coach.
pub fn stdin_prompt(prompt: &str, first_turn: bool) -> String {
    if first_turn {
        format!("{}\n\n---\n\n{prompt}", prompts::COACH)
    } else {
        prompt.to_string()
    }
}

pub fn parse_line(line: &str) -> Vec<ChatEvent> {
    let Ok(v) = serde_json::from_str::<Value>(line) else {
        return vec![];
    };
    match v["type"].as_str() {
        Some("thread.started") => v["thread_id"]
            .as_str()
            .map(|id| vec![ChatEvent::Session { id: id.into() }])
            .unwrap_or_default(),
        Some("item.started") if v["item"]["type"] == "web_search" => vec![ChatEvent::Status {
            text: "Buscando en la web…".into(),
        }],
        Some("item.completed") if v["item"]["type"] == "agent_message" => v["item"]["text"]
            .as_str()
            .map(|t| vec![ChatEvent::Message { text: t.into() }])
            .unwrap_or_default(),
        Some("turn.failed") => vec![ChatEvent::Error {
            message: v["error"]["message"]
                .as_str()
                .unwrap_or("Codex no pudo completar la respuesta.")
                .into(),
        }],
        Some("error") => vec![ChatEvent::Error {
            message: v["message"].as_str().unwrap_or("Error de Codex.").into(),
        }],
        _ => vec![],
    }
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
    }

    #[test]
    fn args_new_and_resume() {
        let new = args(None);
        assert_eq!(new[0], "exec");
        assert_eq!(new[1], "--json");
        assert_eq!(new.last().unwrap(), "-");

        let resumed = args(Some("t-9"));
        assert_eq!(&resumed[..3], &["exec", "resume", "--json"]);
        assert_eq!(&resumed[resumed.len() - 2..], &["t-9", "-"]);
    }

    #[test]
    fn coach_prompt_only_on_first_turn() {
        assert!(stdin_prompt("hola", true).starts_with(prompts::COACH));
        assert_eq!(stdin_prompt("hola", false), "hola");
    }

    #[test]
    fn parses_stream() {
        let lines = [
            r#"{"type":"thread.started","thread_id":"t-1"}"#,
            r#"{"type":"turn.started"}"#,
            r#"{"type":"item.started","item":{"id":"i0","type":"web_search","query":"jax build"}}"#,
            r#"{"type":"item.completed","item":{"id":"i1","type":"reasoning","text":"..."}}"#,
            r#"{"type":"item.completed","item":{"id":"i2","type":"agent_message","text":"Ve Trinity Force."}}"#,
            r#"{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}"#,
            r#"{"type":"turn.failed","error":{"message":"rate limited"}}"#,
        ];
        let events: Vec<ChatEvent> = lines.iter().flat_map(|l| parse_line(l)).collect();
        assert_eq!(
            events,
            vec![
                ChatEvent::Session { id: "t-1".into() },
                ChatEvent::Status {
                    text: "Buscando en la web…".into()
                },
                ChatEvent::Message {
                    text: "Ve Trinity Force.".into()
                },
                ChatEvent::Error {
                    message: "rate limited".into()
                },
            ]
        );
    }
}
