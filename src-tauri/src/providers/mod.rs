//! Proveedores de modelos que usan la suscripción del usuario a través de los
//! CLIs oficiales (Claude Code y Codex). La app nunca ve ni guarda credenciales:
//! el login se hace con el flujo propio de cada CLI y nosotros solo lo ejecutamos.

pub mod claude_code;
pub mod codex;
mod process;
pub mod prompts;
mod terminal;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

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
    let mut out = Vec::new();
    for kind in ProviderKind::ALL {
        out.push(status(kind).await);
    }
    out
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
        st.detail = Some("No está instalado o no está en el PATH.".into());
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

/// Abre una terminal con el comando de login oficial del CLI.
#[tauri::command]
pub fn open_login(kind: ProviderKind) -> Result<(), String> {
    let bin = process::resolve(kind.binary())
        .ok_or_else(|| format!("{} no está instalado.", kind.label()))?;
    terminal::open_with(&bin, kind.login_args()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_prompt(
    app: AppHandle,
    kind: ProviderKind,
    prompt: String,
    session_id: Option<String>,
    on_event: Channel<ChatEvent>,
) -> Result<(), String> {
    let bin = process::resolve(kind.binary())
        .ok_or_else(|| format!("{} no está instalado.", kind.label()))?;

    // Directorio de trabajo propio, para que el CLI no cargue instrucciones
    // de otros proyectos del usuario.
    let workdir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("workspace");
    std::fs::create_dir_all(&workdir).map_err(|e| e.to_string())?;

    let (args, stdin) = match kind {
        ProviderKind::ClaudeCode => {
            let prompt_file = workdir.join("coach-prompt.md");
            std::fs::write(&prompt_file, prompts::COACH).map_err(|e| e.to_string())?;
            (
                claude_code::args(&prompt_file, session_id.as_deref()),
                prompt.clone(),
            )
        }
        ProviderKind::Codex => (
            codex::args(session_id.as_deref()),
            codex::stdin_prompt(&prompt, session_id.is_none()),
        ),
    };
    let parse: fn(&str) -> Vec<ChatEvent> = match kind {
        ProviderKind::ClaudeCode => claude_code::parse_line,
        ProviderKind::Codex => codex::parse_line,
    };

    let send = |ev: ChatEvent| {
        let _ = on_event.send(ev);
    };
    let result = process::stream(&bin, &args, &workdir, &stdin, parse, &send).await;
    if let Err(e) = result {
        send(ChatEvent::Error { message: e });
    }
    send(ChatEvent::Done);
    Ok(())
}
