//! Almacenamiento de API keys en el llavero del sistema operativo
//! (Windows Credential Manager, macOS Keychain, Secret Service en Linux).
//! Las keys nunca se escriben en disco en texto plano ni se devuelven a la UI.

use serde::Serialize;
use zeroize::Zeroizing;

const SERVICE: &str = "com.aleiruiz.leaguecoach";

/// Proveedores cuyas credenciales sabe guardar la app.
pub const PROVIDERS: &[&str] = &["anthropic", "openai", "openrouter", "riot"];

/// Windows Credential Manager acepta hasta 2560 bytes; ninguna key real se acerca.
const MAX_KEY_LEN: usize = 1024;

#[derive(Debug, thiserror::Error)]
pub enum SecretError {
    #[error("proveedor desconocido: {0}")]
    UnknownProvider(String),
    #[error("la key está vacía")]
    EmptyKey,
    #[error("la key no es válida: {0}")]
    InvalidKey(&'static str),
    #[error("error del llavero del sistema: {0}")]
    Store(String),
}

impl Serialize for SecretError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

/// Backend de almacenamiento. En la app es el llavero del sistema; en los
/// tests, un mapa en memoria.
pub trait SecretStore {
    fn get(&self, provider: &str) -> Result<Option<Zeroizing<String>>, SecretError>;
    fn set(&self, provider: &str, key: &str) -> Result<(), SecretError>;
    /// Borra la entrada; no es error si no existía.
    fn delete(&self, provider: &str) -> Result<(), SecretError>;
}

pub struct Keyring;

impl Keyring {
    fn entry(provider: &str) -> Result<keyring::Entry, SecretError> {
        keyring::Entry::new(SERVICE, provider).map_err(|e| SecretError::Store(e.to_string()))
    }
}

impl SecretStore for Keyring {
    fn get(&self, provider: &str) -> Result<Option<Zeroizing<String>>, SecretError> {
        match Self::entry(provider)?.get_password() {
            Ok(k) => Ok(Some(Zeroizing::new(k))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(SecretError::Store(e.to_string())),
        }
    }

    fn set(&self, provider: &str, key: &str) -> Result<(), SecretError> {
        Self::entry(provider)?
            .set_password(key)
            .map_err(|e| SecretError::Store(e.to_string()))
    }

    fn delete(&self, provider: &str) -> Result<(), SecretError> {
        match Self::entry(provider)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(SecretError::Store(e.to_string())),
        }
    }
}

pub fn validate_provider(provider: &str) -> Result<(), SecretError> {
    if PROVIDERS.contains(&provider) {
        Ok(())
    } else {
        Err(SecretError::UnknownProvider(provider.to_string()))
    }
}

/// Recorta espacios exteriores y rechaza lo que claramente no es una key
/// (un párrafo pegado por error, saltos de línea, etc.).
pub fn validate_key(key: &str) -> Result<&str, SecretError> {
    let key = key.trim();
    if key.is_empty() {
        return Err(SecretError::EmptyKey);
    }
    if key.len() > MAX_KEY_LEN {
        return Err(SecretError::InvalidKey("es demasiado larga"));
    }
    if key.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(SecretError::InvalidKey(
            "contiene espacios o saltos de línea",
        ));
    }
    Ok(key)
}

/// Lee una key desde Rust (para uso interno de los proveedores; no se expone a la UI).
#[allow(dead_code)]
pub fn get_key(
    store: &dyn SecretStore,
    provider: &str,
) -> Result<Option<Zeroizing<String>>, SecretError> {
    validate_provider(provider)?;
    store.get(provider)
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum KeyState {
    Configured,
    Missing,
    Error,
}

#[derive(Debug, Serialize)]
pub struct KeyStatus {
    provider: &'static str,
    state: KeyState,
    error: Option<String>,
}

pub fn set_key(store: &dyn SecretStore, provider: &str, key: &str) -> Result<(), SecretError> {
    validate_provider(provider)?;
    let key = validate_key(key)?;
    store.set(provider, key)
}

pub fn delete_key(store: &dyn SecretStore, provider: &str) -> Result<(), SecretError> {
    validate_provider(provider)?;
    store.delete(provider)
}

/// Estado por proveedor: un error en una entrada no oculta las demás.
pub fn list_keys(store: &dyn SecretStore) -> Vec<KeyStatus> {
    PROVIDERS
        .iter()
        .map(|p| {
            // El valor se descarta (y se borra de memoria) en cuanto sabemos si existe.
            let (state, error) = match store.get(p) {
                Ok(Some(_)) => (KeyState::Configured, None),
                Ok(None) => (KeyState::Missing, None),
                Err(e) => (KeyState::Error, Some(e.to_string())),
            };
            KeyStatus {
                provider: p,
                state,
                error,
            }
        })
        .collect()
}

// Los comandos son `async` para que el llavero (que puede mostrar un diálogo
// de desbloqueo) no congele la ventana: Tauri los ejecuta fuera del hilo principal.

#[tauri::command(async)]
pub fn set_api_key(provider: String, key: String) -> Result<(), SecretError> {
    let key = Zeroizing::new(key);
    set_key(&Keyring, &provider, &key)
}

#[tauri::command(async)]
pub fn delete_api_key(provider: String) -> Result<(), SecretError> {
    delete_key(&Keyring, &provider)
}

#[tauri::command(async)]
pub fn list_api_keys() -> Vec<KeyStatus> {
    list_keys(&Keyring)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;

    #[derive(Default)]
    struct MemStore {
        map: RefCell<HashMap<String, String>>,
        broken: Option<&'static str>,
    }

    impl SecretStore for MemStore {
        fn get(&self, p: &str) -> Result<Option<Zeroizing<String>>, SecretError> {
            if self.broken == Some(p) {
                return Err(SecretError::Store("entrada ambigua".into()));
            }
            Ok(self.map.borrow().get(p).cloned().map(Zeroizing::new))
        }
        fn set(&self, p: &str, k: &str) -> Result<(), SecretError> {
            self.map.borrow_mut().insert(p.into(), k.into());
            Ok(())
        }
        fn delete(&self, p: &str) -> Result<(), SecretError> {
            self.map.borrow_mut().remove(p);
            Ok(())
        }
    }

    fn state_of<'a>(list: &'a [KeyStatus], p: &str) -> &'a KeyState {
        &list.iter().find(|s| s.provider == p).unwrap().state
    }

    #[test]
    fn round_trip_set_list_delete() {
        let store = MemStore::default();
        set_key(&store, "anthropic", "  sk-ant-123  ").unwrap();
        assert_eq!(store.map.borrow()["anthropic"], "sk-ant-123");
        assert_eq!(
            get_key(&store, "anthropic").unwrap().unwrap().as_str(),
            "sk-ant-123"
        );
        let list = list_keys(&store);
        assert_eq!(state_of(&list, "anthropic"), &KeyState::Configured);
        assert_eq!(state_of(&list, "openai"), &KeyState::Missing);

        delete_key(&store, "anthropic").unwrap();
        delete_key(&store, "anthropic").unwrap(); // idempotente
        assert_eq!(
            state_of(&list_keys(&store), "anthropic"),
            &KeyState::Missing
        );
    }

    #[test]
    fn one_broken_entry_does_not_hide_the_rest() {
        let store = MemStore {
            broken: Some("openai"),
            ..Default::default()
        };
        let list = list_keys(&store);
        assert_eq!(list.len(), PROVIDERS.len());
        assert_eq!(state_of(&list, "openai"), &KeyState::Error);
        assert_eq!(state_of(&list, "riot"), &KeyState::Missing);
    }

    #[test]
    fn rejects_unknown_provider() {
        let store = MemStore::default();
        assert!(matches!(
            set_key(&store, "gemini-pirata", "k"),
            Err(SecretError::UnknownProvider(_))
        ));
        assert!(matches!(
            delete_key(&store, "gemini-pirata"),
            Err(SecretError::UnknownProvider(_))
        ));
    }

    #[test]
    fn validates_key_shape() {
        assert!(matches!(validate_key("   "), Err(SecretError::EmptyKey)));
        assert!(matches!(
            validate_key("sk ant"),
            Err(SecretError::InvalidKey(_))
        ));
        assert!(matches!(
            validate_key("sk\nant"),
            Err(SecretError::InvalidKey(_))
        ));
        assert!(matches!(
            validate_key(&"a".repeat(MAX_KEY_LEN + 1)),
            Err(SecretError::InvalidKey(_))
        ));
        assert_eq!(validate_key(" RGAPI-abc ").unwrap(), "RGAPI-abc");
    }

    #[test]
    fn invalid_key_never_reaches_store() {
        let store = MemStore::default();
        assert!(set_key(&store, "anthropic", "dos\npalabras").is_err());
        assert!(store.map.borrow().is_empty());
    }
}
