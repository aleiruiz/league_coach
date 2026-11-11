# League Coach

A desktop coach for League of Legends that runs on top of the AI subscription you already have. It drives the official Claude Code and Codex CLIs, signed in with your own account, and gives you builds, matchup plans and reviews of your past games.

Everything runs on your computer. There are no League Coach servers, and the app never sees your AI credentials.

**Riot policy:** the coach only helps before and after a game. It never reads live game data (no Live Client Data API, no game memory, no overlays), and it never makes decisions for you during a game. See [Riot policy](#riot-policy) below.

## What it does

The app has three sections in the left navigation, plus Settings and the Ask panel.

- **Next game.** A champ select board: your team on the left, the enemy team on the right, each slot by role, and your matchup in the center with an inline champion picker. Press **Get build** for a build card with items, every rune with its icon, summoner spells, the level-by-level skill order and a matchup plan, adapted to everyone picked and to the current patch. **Fill from my game** fills the slots from your champ select (read from the League client on your computer) or from a game that is loading, only when you press it.
- **Improve.** Reviews your recent finished games (Riot Match-V5) and gives you one focus with a drill for your next 5 games, with your numbers and how they trend against the previous review.
- **Games.** Your match history with filters (all games or ranked only). Each game opens a **Match details** page with both teams, what went well, what to improve, the best players of the game, and a full scoreboard.
- **Ask the coach.** A side panel for follow-up questions about the matchup on screen, a game, or your progress. It is meant for before and after a game.
- **Settings.** Your League account (Riot ID search and region), your Riot key, your AI (connection status, plan usage and limits, which model to use by default), language (English or Español) and the data notice.

The first time you open the app, a short setup asks you to connect one AI and set your Riot ID and region.

The current patch is loaded from Data Dragon on startup and included in every prompt, so answers match the live patch.

## Connect your AI

Install [Claude Code](https://code.claude.com/docs/en/setup), [Codex CLI](https://developers.openai.com/codex/cli), or both. Then, in the first-run setup or in **Settings › Your AI**, press **Sign in**: a terminal opens with the CLI's official login, you finish it in your browser, and the app checks the connection. One connected model is enough. If you connect both, pick the default one in **Settings › Your AI**.

## Riot API key

Improve, Games, Match details and the Riot ID search read data from Riot's API, so they need a Riot API key. Next game and the build card work without one.

**Development key (quick, expires every 24 hours).**
1. Sign in at [developer.riotgames.com](https://developer.riotgames.com/) with your Riot account.
2. On the dashboard, press **Regenerate API key** and copy it (it starts with `RGAPI-`).
3. Paste it in the app in **Settings › Your League account › Riot key** and press **Save**.

The app shows how old the saved key is and warns you once it has probably expired. Repeat the steps and use **Replace key** to put in a new one.

**Personal API key (does not expire).**
1. At [developer.riotgames.com](https://developer.riotgames.com/), open **Register Product** and choose **Personal API Key**.
2. Describe the app (a personal coach for your own games, used by you and maybe a few friends) and submit it.
3. Riot reviews each request by hand, so approval can take a while. Once approved, the key appears in your products on the dashboard.
4. Paste it in the same place: **Settings › Your League account › Riot key**.

The key is stored in your operating system's keychain, never in an app file, and is only sent to Riot. Changing the key clears the cached account id, because Riot encrypts ids per key.

## Riot policy

Riot does not allow third-party apps to draw conclusions for you during gameplay or to dictate your decisions. So:

- Advice is for before the game (champ select, builds, matchup plans) and after it (reviews, match details, questions about past games).
- The app never reads the game process, its memory, or the Live Client Data API, and it does not poll anything.
- **Fill from my game** only reads when you press it. In champ select it reads champions and positions from the League client on your computer, never other players' names. During a loading or running game it uses Riot's official Spectator-V5 API. It only fills the slots; you still ask for the build yourself.

League Coach isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

## Stack

Tauri 2 with a Rust backend (`src-tauri/`) and a React + TypeScript UI (`src/`), built with Vite. Game data comes from Data Dragon, cached locally and refreshed when the patch changes. The AI providers are the unmodified official CLIs, spawned locally.

## Development

Requirements: Rust 1.85 or newer (the crate uses `edition = "2024"`) and Node 22. See [Tauri's prerequisites](https://tauri.app/start/prerequisites/) for each OS. To use the app you also need at least one of the Claude Code or Codex CLIs installed and signed in.

**Windows:**
- Visual Studio Build Tools with the "Desktop development with C++" workload.
- WebView2 (already installed on Windows 10 and 11).
- Rust with the MSVC toolchain (`rustup default stable-msvc`).

Run the app in development mode:

```bash
npm install
npm run tauri dev
```

Build the Windows installer with `npm run tauri build -- --bundles nsis`. It produces a per-user `.exe` that installs without admin rights. CI also uploads it as the `league-coach-windows` artifact on every push to `main`. The installer is not signed, so Windows SmartScreen shows a warning: choose "More info", then "Run anyway".

Checks that CI runs (on Ubuntu and Windows):

```bash
npm run build
npm test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```
