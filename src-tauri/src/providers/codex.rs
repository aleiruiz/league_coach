//! Codex CLI (`codex exec --json`) con la cuenta de ChatGPT del usuario.

use std::path::Path;

use serde_json::Value;

use super::process::{self, Parsed};
use super::{ChatEvent, prompts};

pub async fn login_status(bin: &Path) -> (bool, Option<String>) {
    match process::run_capture(bin, &["login", "status"]).await {
        Ok(out) => parse_login_status(out.status_ok, &out.stdout, &out.stderr),
        Err(e) => (false, Some(format!("No pude consultar la sesión: {e}"))),
    }
}

pub fn parse_login_status(ok: bool, stdout: &str, stderr: &str) -> (bool, Option<String>) {
    // `codex login status` escribe el resultado en stdout o stderr según la versión.
    let text = format!("{stdout}\n{stderr}");
    let lower = text.to_lowercase();
    if lower.contains("not logged in") {
        return (false, Some("No has iniciado sesión.".into()));
    }
    if !ok {
        // Otro fallo (versión vieja, config rota): mostrar el error real en vez
        // de mandar al usuario a reintentar el login.
        let t = process::tail(&text, 2);
        return (
            false,
            Some(if t.is_empty() {
                "`codex login status` falló.".into()
            } else {
                format!("`codex login status` falló: {t}")
            }),
        );
    }
    if lower.contains("api key") {
        return (
            true,
            Some("Conectado con API key (no con tu suscripción).".into()),
        );
    }
    (true, Some("Conectado con tu cuenta de ChatGPT.".into()))
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

pub fn args(session_id: Option<&str>) -> Vec<String> {
    let mut a = vec!["exec".to_string()];
    match session_id {
        Some(id) => {
            a.push("resume".into());
            a.extend(common());
            // El id ya se validó (no empieza con '-'), así que no se lee como flag.
            a.push(id.into());
        }
        None => {
            a.push("--sandbox".into());
            a.push("read-only".into());
            a.extend(common());
        }
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
                "command_execution" => format!(
                    "ejecutar un comando ({})",
                    v["item"]["command"].as_str().unwrap_or("?")
                ),
                "file_change" => "modificar archivos".to_string(),
                _ => "usar una herramienta externa".to_string(),
            };
            vec![Parsed::Abort(format!(
                "Codex intentó {what}; detuve la consulta por seguridad."
            ))]
        }
        Some("thread.started") => v["thread_id"]
            .as_str()
            .map(|id| ev(ChatEvent::Session { id: id.into() }))
            .unwrap_or_default(),
        Some("item.started") if item_type == "web_search" => ev(ChatEvent::Status {
            text: "Buscando en la web…".into(),
        }),
        Some("item.completed") if item_type == "agent_message" => v["item"]["text"]
            .as_str()
            .map(|t| ev(ChatEvent::Message { text: t.into() }))
            .unwrap_or_default(),
        Some("turn.failed") => ev(ChatEvent::Error {
            message: v["error"]["message"]
                .as_str()
                .unwrap_or("Codex no pudo completar la respuesta.")
                .into(),
        }),
        Some("error") => ev(ChatEvent::Error {
            message: v["message"].as_str().unwrap_or("Error de Codex.").into(),
        }),
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
        let (ok, d) = parse_login_status(false, "", "error: unrecognized subcommand 'status'");
        assert!(!ok);
        assert!(d.unwrap().contains("unrecognized subcommand"));
    }

    #[test]
    fn args_new_and_resume() {
        let new = args(None);
        assert_eq!(&new[..3], &["exec", "--sandbox", "read-only"]);
        assert_eq!(new.last().unwrap(), "-");
        let pos = new.iter().position(|x| x == "shell_tool").unwrap();
        assert_eq!(new[pos - 1], "--disable");
        assert!(new.contains(&"mcp_servers={}".to_string()));

        let resumed = args(Some("t-9"));
        assert_eq!(&resumed[..3], &["exec", "resume", "--json"]);
        assert_eq!(&resumed[resumed.len() - 2..], &["t-9", "-"]);
        assert!(resumed.contains(&"sandbox_mode=read-only".to_string()));
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
        let parsed: Vec<Parsed> = lines.iter().flat_map(|l| parse_line(l)).collect();
        assert_eq!(
            parsed,
            vec![
                Parsed::Event(ChatEvent::Session { id: "t-1".into() }),
                Parsed::Event(ChatEvent::Status {
                    text: "Buscando en la web…".into()
                }),
                Parsed::Event(ChatEvent::Message {
                    text: "Ve Trinity Force.".into()
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
