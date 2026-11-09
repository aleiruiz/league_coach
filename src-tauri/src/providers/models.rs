//! Model chosen for each provider. `None` keeps the CLI's own default
//! (whatever the user's plan or CLI settings pick).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::{ProviderKind, codex};
use crate::i18n::tr;

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
struct ModelsFile {
    #[serde(default)]
    claude_code: Option<String>,
    #[serde(default)]
    codex: Option<String>,
}

impl ModelsFile {
    fn slot(&mut self, kind: ProviderKind) -> &mut Option<String> {
        match kind {
            ProviderKind::ClaudeCode => &mut self.claude_code,
            ProviderKind::Codex => &mut self.codex,
        }
    }
}

/// Model ids go into the CLI's arguments: letters, digits and `._-[]`, never
/// starting with `-` (it would read as a flag).
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '[' | ']'))
}

fn path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("models.json"))
}

fn read(app: &AppHandle) -> ModelsFile {
    path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

/// Model to pass to the CLI, if the user chose one (and it is still valid).
pub fn selected(app: &AppHandle, kind: ProviderKind) -> Option<String> {
    read(app).slot(kind).clone().filter(|m| valid_id(m))
}

#[derive(Debug, Serialize, PartialEq)]
pub struct ModelOption {
    id: String,
    name: String,
    description: String,
}

#[derive(Debug, Serialize)]
pub struct ProviderModels {
    /// `None`: the CLI's default.
    selected: Option<String>,
    options: Vec<ModelOption>,
    /// Name of the model the CLI uses by default, when it says.
    default_name: Option<String>,
    /// Why the list couldn't be read (the picker then only offers the default).
    error: Option<String>,
}

/// Claude Code has no command that lists models: these are the aliases its
/// `--help` names, which always point to the latest model of each family.
fn claude_options() -> Vec<ModelOption> {
    [
        (
            "opus",
            "Opus",
            tr(
                "Most capable, uses your limits fastest.",
                "El más capaz; gasta tus límites más rápido.",
            ),
        ),
        (
            "sonnet",
            "Sonnet",
            tr(
                "Fast and capable for everyday questions.",
                "Rápido y capaz para el día a día.",
            ),
        ),
        (
            "fable",
            "Fable",
            tr("Newest model family.", "La familia de modelos más nueva."),
        ),
    ]
    .into_iter()
    .map(|(id, name, d)| ModelOption {
        id: id.into(),
        name: name.into(),
        description: d.into(),
    })
    .collect()
}

#[tauri::command]
pub async fn provider_models(app: AppHandle, kind: ProviderKind) -> ProviderModels {
    let selected = selected(&app, kind);
    match kind {
        ProviderKind::ClaudeCode => ProviderModels {
            selected,
            options: claude_options(),
            default_name: None,
            error: None,
        },
        ProviderKind::Codex => {
            let listed = match super::resolve(kind) {
                Some(bin) => codex::list_models(&bin).await,
                None => Err(super::not_installed(kind)),
            };
            match listed {
                Ok(list) => ProviderModels {
                    selected,
                    default_name: list.iter().find(|m| m.3).map(|m| m.1.clone()),
                    options: list
                        .into_iter()
                        .filter(|m| valid_id(&m.0))
                        .map(|(id, name, description, _)| ModelOption {
                            id,
                            name,
                            description,
                        })
                        .collect(),
                    error: None,
                },
                Err(e) => ProviderModels {
                    selected,
                    options: vec![],
                    default_name: None,
                    error: Some(e),
                },
            }
        }
    }
}

#[tauri::command]
pub fn set_provider_model(
    app: AppHandle,
    kind: ProviderKind,
    model: Option<String>,
) -> Result<(), String> {
    let model = model
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty());
    if model.as_deref().is_some_and(|m| !valid_id(m)) {
        return Err(tr("Invalid model name.", "Nombre de modelo inválido.").into());
    }
    let p = path(&app).ok_or("No settings folder")?;
    let mut file = read(&app);
    *file.slot(kind) = model;
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    std::fs::write(p, text).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_ids_cannot_become_flags() {
        for ok in ["opus", "gpt-6.1-sol", "claude-opus-5-5[1m]", "o3"] {
            assert!(valid_id(ok), "{ok}");
        }
        for bad in [
            "",
            "-m",
            "--dangerously-skip-permissions",
            "a b",
            "a=b",
            "x;y",
            "../x",
        ] {
            assert!(!valid_id(bad), "{bad}");
        }
        assert!(!valid_id(&"a".repeat(65)));
    }
}
