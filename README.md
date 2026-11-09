# League Coach

App de escritorio que funciona como harness sobre tus suscripciones de IA (Claude y ChatGPT, mediante Claude Code y Codex CLI oficiales) y te da builds, estrategias y tutoriales de League of Legends, antes y durante la partida.

**No lee datos de la partida en vivo** (ni la API del cliente ni la memoria del juego), para respetar las políticas de Riot. Todo lo que pasa en la partida lo escribes tú.

## Plan

1. **Esqueleto:** Tauri 2 (backend en Rust, UI en React + TypeScript), CI y ajustes con API keys guardadas en el llavero del sistema.
2. **Tus suscripciones:** Claude Code y Codex CLI ejecutados localmente con tu propia sesión (la app nunca ve tus credenciales), asistente de login y chat con streaming y búsqueda web. API keys y Ollama quedan como opción secundaria.
3. **Datos y perfil:** caché SQLite con Data Dragon, CommunityDragon y Meraki, actualizada solo al cambiar el parche. Cuestionario inicial y perfil del jugador. Modo pre-partida (build, runas, plan y matchup).
4. **Modo en partida:** ventana compacta con atajo global, siempre encima, con preguntas rápidas escritas por ti.

## Conectar tus modelos

Instala [Claude Code](https://code.claude.com/docs/en/setup) y/o [Codex CLI](https://developers.openai.com/codex/cli). En la pantalla **Modelos** de la app, pulsa "Iniciar sesión": se abre una terminal con el login oficial, completas el inicio de sesión en tu navegador y luego "Verificar".

Todo corre en tu PC: no hay servidores propios.

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
