//! Proveedores de modelos que usan la suscripción del usuario a través de los
//! CLIs oficiales (Claude Code y Codex). La app nunca ve ni guarda credenciales:
//! el login se hace con el flujo propio de cada CLI y nosotros solo lo ejecutamos.

pub mod claude_code;
pub mod codex;
mod process;
pub use process::{DEFAULT_TIMEOUT, is_stopped};
pub mod prompts;
mod terminal;

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tokio::sync::oneshot;

use crate::i18n::{self, tr};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    ClaudeCode,
    Codex,
}

impl ProviderKind {
    pub const ALL: [ProviderKind; 2] = [ProviderKind::ClaudeCode, ProviderKind::Codex];

    pub fn binary(self) -> &'static str {
        match self {
            ProviderKind::ClaudeCode => "claude",
            ProviderKind::Codex => "codex",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            ProviderKind::ClaudeCode => "Claude (Claude Code)",
            ProviderKind::Codex => "ChatGPT (Codex CLI)",
        }
    }

    pub fn install_url(self) -> &'static str {
        match self {
            ProviderKind::ClaudeCode => "https://code.claude.com/docs/en/setup",
            ProviderKind::Codex => "https://developers.openai.com/codex/cli",
        }
    }

    pub fn login_args(self) -> &'static [&'static str] {
        match self {
            ProviderKind::ClaudeCode => &["auth", "login"],
            ProviderKind::Codex => &["login"],
        }
    }
}

/// Evento que la app recibe mientras el modelo responde.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChatEvent {
    /// Id de la conversación del CLI, para continuarla después.
    Session {
        id: String,
    },
    /// Fragmento de texto que se agrega a la respuesta.
    Delta {
        text: String,
    },
    /// Empieza un bloque nuevo de respuesta (después de usar una herramienta).
    Break,
    /// Mensaje completo (Codex no hace streaming por fragmentos).
    Message {
        text: String,
    },
    /// Texto final; la UI lo usa solo si no llegó nada por streaming.
    Final {
        text: String,
    },
    /// El modelo está usando una herramienta (búsqueda web, etc.).
    Status {
        text: String,
    },
    Error {
        message: String,
    },
    /// URLs que devolvió una herramienta de búsqueda (no las que escribe el
    /// modelo). Sirven para comprobar que una cifra citada viene de ahí.
    Sources {
        urls: Vec<String>,
    },
    Done,
}

#[derive(Debug, Serialize)]
pub struct ProviderStatus {
    kind: ProviderKind,
    label: &'static str,
    install_url: &'static str,
    installed: bool,
    version: Option<String>,
    logged_in: bool,
    detail: Option<String>,
}

#[tauri::command]
pub async fn provider_statuses() -> Vec<ProviderStatus> {
    // En paralelo: cada CLI tarda un poco en arrancar.
    let (a, b) = tokio::join!(status(ProviderKind::ALL[0]), status(ProviderKind::ALL[1]));
    vec![a, b]
}

async fn status(kind: ProviderKind) -> ProviderStatus {
    let mut st = ProviderStatus {
        kind,
        label: kind.label(),
        install_url: kind.install_url(),
        installed: false,
        version: None,
        logged_in: false,
        detail: None,
    };
    let Some(bin) = process::resolve(kind.binary()) else {
        st.detail = Some(
            tr(
                "Not installed, or not on the PATH.",
                "No está instalado o no está en el PATH.",
            )
            .into(),
        );
        return st;
    };
    st.installed = true;
    st.version = process::run_capture(&bin, &["--version"])
        .await
        .ok()
        .map(|o| o.stdout.trim().to_string());

    let (logged_in, detail) = match kind {
        ProviderKind::ClaudeCode => claude_code::login_status(&bin).await,
        ProviderKind::Codex => codex::login_status(&bin).await,
    };
    st.logged_in = logged_in;
    st.detail = detail;
    st
}

fn not_installed(kind: ProviderKind) -> String {
    tr(
        format!("{} is not installed.", kind.label()),
        format!("{} no está instalado.", kind.label()),
    )
}

/// Abre una terminal con el comando de login oficial del CLI.
#[tauri::command]
pub fn open_login(kind: ProviderKind) -> Result<(), String> {
    let bin = process::resolve(kind.binary()).ok_or_else(|| not_installed(kind))?;
    terminal::open_with(&bin, kind.login_args()).map_err(|e| e.to_string())
}

/// Ids de sesión que generan los CLIs (UUID o similar). Se validan porque
/// terminan como argumentos del proceso: uno que empiece con `-` se leería
/// como un flag.
pub fn valid_session_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && !id.starts_with('-')
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Consultas en curso, para poder detenerlas desde la UI.
#[derive(Default)]
pub struct Running(Mutex<HashMap<String, oneshot::Sender<()>>>);

impl Running {
    /// Registra una consulta y devuelve el receptor que la cancela.
    pub fn register(&self, request_id: &str) -> oneshot::Receiver<()> {
        let (tx, rx) = oneshot::channel();
        self.0.lock().unwrap().insert(request_id.to_string(), tx);
        rx
    }

    pub fn finish(&self, request_id: &str) {
        self.0.lock().unwrap().remove(request_id);
    }
}

#[tauri::command]
pub fn cancel_prompt(running: State<'_, Running>, request_id: String) {
    if let Some(tx) = running.0.lock().unwrap().remove(&request_id) {
        let _ = tx.send(());
    }
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn send_prompt(
    app: AppHandle,
    running: State<'_, Running>,
    kind: ProviderKind,
    prompt: String,
    session_id: Option<String>,
    request_id: String,
    on_event: Channel<ChatEvent>,
) -> Result<(), String> {
    let send = |ev: ChatEvent| {
        let _ = on_event.send(ev);
    };
    let (tx, rx) = oneshot::channel();
    running.0.lock().unwrap().insert(request_id.clone(), tx);
    let result = run(
        &app,
        kind,
        &prompt,
        session_id.as_deref(),
        process::DEFAULT_TIMEOUT,
        Some(rx),
        &send,
    )
    .await;
    running.0.lock().unwrap().remove(&request_id);
    if let Err(e) = result {
        send(ChatEvent::Error { message: e });
    }
    send(ChatEvent::Done);
    Ok(())
}

/// Consulta mínima para comprobar que la sesión de verdad responde
/// (cupo agotado, token revocado, etc. no se ven en `auth status`).
#[tauri::command]
pub async fn test_provider(app: AppHandle, kind: ProviderKind) -> Result<String, String> {
    let collected = Mutex::new(Collected::default());
    let send = |ev: ChatEvent| collected.lock().unwrap().push(&ev);
    run(
        &app,
        kind,
        "This is a connection test. Reply with just the word OK.",
        None,
        Duration::from_secs(60),
        None,
        &send,
    )
    .await?;
    let c = collected.into_inner().unwrap();
    if let Some(e) = c.error {
        return Err(e);
    }
    let text = c.text.trim().to_string();
    if text.is_empty() {
        Err(tr(
            "The model returned no answer.",
            "El modelo no devolvió respuesta.",
        )
        .into())
    } else {
        Ok(text)
    }
}

/// Ejecuta una consulta en el CLI del proveedor y emite sus eventos.
pub async fn run(
    app: &AppHandle,
    kind: ProviderKind,
    prompt: &str,
    session_id: Option<&str>,
    timeout: Duration,
    cancel: Option<oneshot::Receiver<()>>,
    send: &(dyn Fn(ChatEvent) + Send + Sync),
) -> Result<(), String> {
    if session_id.is_some_and(|id| !valid_session_id(id)) {
        return Err(tr("Invalid conversation id.", "Id de conversación inválido.").into());
    }
    let bin = process::resolve(kind.binary()).ok_or_else(|| not_installed(kind))?;

    // Directorio de trabajo propio y vacío, para que el CLI no cargue
    // instrucciones ni archivos de otros proyectos del usuario.
    let workdir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("workspace");
    std::fs::create_dir_all(&workdir).map_err(|e| e.to_string())?;

    let (args, stdin) = match kind {
        ProviderKind::ClaudeCode => {
            // Fuera del workdir, para que no quede a la vista del modelo.
            let prompt_file = workdir.with_file_name("coach-prompt.md");
            std::fs::write(&prompt_file, prompts::coach(i18n::lang()))
                .map_err(|e| e.to_string())?;
            (
                claude_code::args(&prompt_file, session_id),
                prompt.to_string(),
            )
        }
        ProviderKind::Codex => (
            codex::args(session_id),
            codex::stdin_prompt(prompt, session_id.is_none()),
        ),
    };
    let parse: fn(&str) -> Vec<process::Parsed> = match kind {
        ProviderKind::ClaudeCode => claude_code::parse_line,
        ProviderKind::Codex => codex::parse_line,
    };
    let opts = process::StreamOptions {
        workdir: &workdir,
        stdin: &stdin,
        timeout,
        cancel,
    };
    process::stream(&bin, &args, opts, parse, send).await
}

/// Junta el texto de una respuesta a partir de sus eventos (misma lógica que la UI).
#[derive(Default, Debug)]
pub struct Collected {
    pub text: String,
    pub session_id: Option<String>,
    pub error: Option<String>,
    /// URLs de los resultados de búsqueda vistos en esta consulta.
    pub sources: Vec<String>,
}

impl Collected {
    pub fn push(&mut self, ev: &ChatEvent) {
        let needs_sep = !self.text.is_empty() && !self.text.ends_with("\n\n");
        match ev {
            ChatEvent::Session { id } => self.session_id = Some(id.clone()),
            ChatEvent::Delta { text } => self.text.push_str(text),
            ChatEvent::Break if needs_sep => self.text.push_str("\n\n"),
            ChatEvent::Message { text } => {
                if needs_sep {
                    self.text.push_str("\n\n");
                }
                self.text.push_str(text);
            }
            ChatEvent::Final { text } if self.text.trim().is_empty() => self.text = text.clone(),
            ChatEvent::Error { message } => self.error = Some(message.clone()),
            ChatEvent::Sources { urls } => self.sources.extend(urls.iter().cloned()),
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_id_validation() {
        assert!(valid_session_id("0b6f1c2e-1d2a-4c3b-9e8f-112233445566"));
        assert!(valid_session_id("t_9"));
        for bad in [
            "",
            "--version",
            "-r",
            "--dangerously-skip-permissions",
            "a b",
            "a=b",
            "../x",
        ] {
            assert!(!valid_session_id(bad), "{bad}");
        }
        assert!(!valid_session_id(&"a".repeat(129)));
    }

    #[test]
    fn collects_text_like_the_ui() {
        let mut c = Collected::default();
        for ev in [
            ChatEvent::Session { id: "s".into() },
            ChatEvent::Break,
            ChatEvent::Delta { text: "a".into() },
            ChatEvent::Break,
            ChatEvent::Delta { text: "b".into() },
            ChatEvent::Final {
                text: "ignorado".into(),
            },
        ] {
            c.push(&ev);
        }
        assert_eq!(c.text, "a\n\nb");
        assert_eq!(c.session_id.as_deref(), Some("s"));

        let mut c = Collected::default();
        c.push(&ChatEvent::Final {
            text: "solo final".into(),
        });
        assert_eq!(c.text, "solo final");
    }
}
