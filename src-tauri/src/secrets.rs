//! Almacenamiento de API keys en el llavero del sistema operativo
//! (Windows Credential Manager, macOS Keychain, Secret Service en Linux).
//! Las keys nunca se escriben en disco en texto plano ni se devuelven a la UI.

use serde::Serialize;

const SERVICE: &str = "com.aleiruiz.leaguecoach";

/// Proveedores cuyas credenciales sabe guardar la app.
pub const PROVIDERS: &[&str] = &["anthropic", "openai", "openrouter", "riot"];

#[derive(Debug, thiserror::Error)]
pub enum SecretError {
    #[error("proveedor desconocido: {0}")]
    UnknownProvider(String),
    #[error("la key está vacía")]
    EmptyKey,
    #[error("error del llavero del sistema: {0}")]
    Keyring(#[from] keyring::Error),
}

impl Serialize for SecretError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub fn validate_provider(provider: &str) -> Result<(), SecretError> {
    if PROVIDERS.contains(&provider) {
        Ok(())
    } else {
        Err(SecretError::UnknownProvider(provider.to_string()))
    }
}

fn entry(provider: &str) -> Result<keyring::Entry, SecretError> {
    validate_provider(provider)?;
    Ok(keyring::Entry::new(SERVICE, provider)?)
}

/// Lee una key desde Rust (para uso interno de los proveedores; no se expone a la UI).
#[allow(dead_code)]
pub fn get_key(provider: &str) -> Result<Option<String>, SecretError> {
    match entry(provider)?.get_password() {
        Ok(k) => Ok(Some(k)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

#[derive(Serialize)]
pub struct KeyStatus {
    provider: String,
    configured: bool,
}

#[tauri::command]
pub fn set_api_key(provider: String, key: String) -> Result<(), SecretError> {
    let key = key.trim();
    if key.is_empty() {
        return Err(SecretError::EmptyKey);
    }
    entry(&provider)?.set_password(key)?;
    Ok(())
}

#[tauri::command]
pub fn delete_api_key(provider: String) -> Result<(), SecretError> {
    match entry(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

#[tauri::command]
pub fn list_api_keys() -> Result<Vec<KeyStatus>, SecretError> {
    PROVIDERS
        .iter()
        .map(|p| {
            Ok(KeyStatus {
                provider: p.to_string(),
                configured: get_key(p)?.is_some(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_known_providers() {
        for p in PROVIDERS {
            assert!(validate_provider(p).is_ok());
        }
    }

    #[test]
    fn rejects_unknown_provider() {
        assert!(matches!(
            validate_provider("gemini-pirata"),
            Err(SecretError::UnknownProvider(_))
        ));
    }

    #[test]
    fn rejects_empty_key_before_touching_keyring() {
        assert!(matches!(
            set_api_key("anthropic".into(), "   ".into()),
            Err(SecretError::EmptyKey)
        ));
    }
}
