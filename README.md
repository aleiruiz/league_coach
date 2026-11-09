# League Coach

App de escritorio que funciona como harness para cualquier modelo de IA (Claude, OpenAI, OpenRouter u Ollama local) y te da builds, estrategias y tutoriales de League of Legends, antes y durante la partida.

**No lee datos de la partida en vivo** (ni la API del cliente ni la memoria del juego), para respetar las políticas de Riot. Todo lo que pasa en la partida lo escribes tú.

## Plan

1. **Esqueleto:** Tauri 2 (backend en Rust, UI en React + TypeScript), CI y ajustes con API keys guardadas en el llavero del sistema.
2. **Modelos intercambiables:** trait `Provider` con Anthropic y "compatible con OpenAI" (OpenAI, OpenRouter, Ollama), chat con streaming y herramientas (datos del parche, búsqueda web del proveedor).
3. **Datos y perfil:** caché SQLite con Data Dragon, CommunityDragon y Meraki, actualizada solo al cambiar el parche. Cuestionario inicial y perfil del jugador. Modo pre-partida (build, runas, plan y matchup).
4. **Modo en partida:** ventana compacta con atajo global, siempre encima, con preguntas rápidas escritas por ti.

## Desarrollo

Requisitos generales: Rust 1.85 o superior (el crate usa `edition = "2024"`) y Node 22. Detalle por sistema en los [prerrequisitos de Tauri](https://tauri.app/start/prerequisites/).

**Windows:**
- Visual Studio Build Tools con la carga de trabajo "Desarrollo de escritorio con C++".
- WebView2 (ya viene instalado en Windows 10 y 11).
- Rust con el toolchain MSVC (`rustup default stable-msvc`).

El instalador se genera con `npm run tauri build -- --bundles nsis` (un `.exe` que se instala por usuario, sin permisos de administrador). El CI también lo publica como artefacto en cada push a `main`. Como no está firmado, Windows SmartScreen mostrará un aviso: "Más información" y luego "Ejecutar de todas formas".

```bash
npm install
npm run tauri dev
```

Checks que corre el CI:

```bash
npm run build
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```
