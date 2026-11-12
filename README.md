# League Coach

A desktop coach for League of Legends that runs on top of the AI subscription you already have. It drives the official Claude Code and Codex CLIs, signed in with your own account, and gives you builds, matchup plans and reviews of your past games.

Everything runs on your computer. There are no League Coach servers, and the app never sees your AI credentials.

**Riot policy:** the coach only helps before and after a game. It never reads live game data (no Live Client Data API, no game memory, no overlays), and it never makes decisions for you during a game. See [Riot policy](#riot-policy) below.

## What it does

The app has four sections in the left navigation, plus Settings and the Ask panel.

- **Next game.** A champ select board: your team on the left, the enemy team on the right, each slot by role, and your matchup in the center with an inline champion picker. Press **Get build** for a build card with items, every rune with its icon, summoner spells, the level-by-level skill order and a matchup plan, adapted to everyone picked and to the current patch. **Fill from my game** fills the slots from your champ select (read from the League client on your computer) or from a game that is loading, only when you press it.
- **Champions.** This patch's tier list for each role and your mains. The AI looks the tier list up on one stats site (u.gg, op.gg, Mobalytics, Lolalytics, League of Graphs or METAsrc); it is kept only if that page came up in the AI's own web search, every number links to it, and champions are checked against the patch. It needs Claude Code, the AI that shows its search sources. Your mains are the champions you played most in your saved games (2 or more), and you can pin your own.
- **Improve.** Reviews your recent finished games (Riot Match-V5) and gives you one focus with a drill for your next 5 games, with your numbers and how they trend against the previous review.
- **Games.** Your match history with filters (all games, ranked only, or one champion). **Load older games** at the bottom reads 20 more from Riot each press, up to your last 200 Summoner's Rift games; Improve still reviews the newest 20. Each game opens a **Match details** page with both teams, what went well, what to improve, the best players of the game, and a full scoreboard.
- **Ask the coach.** A side panel for follow-up questions about the matchup on screen, a game, or your progress. It is meant for before and after a game.
- **Settings.** Your League account (Riot ID search and region), your Riot key, your AI (connection status, plan usage and limits, which model to use by default), language (English or Español) and the data notice.

The first time you open the app, a short setup asks you to connect one AI and set your Riot ID and region.

The current patch is loaded from Data Dragon on startup and included in every prompt, so answers match the live patch.

## Install

Windows 10 or 11:

1. Open the [latest release](https://github.com/aleiruiz/league_coach/releases/latest) and download the file ending in `_x64-setup.exe`.
2. Run it. It installs for your user only, so it doesn't ask for admin rights. The installer isn't code-signed, so Windows SmartScreen may warn you: choose **More info**, then **Run anyway**.
3. Open **League Coach** from the Start menu and follow the first-run setup.

### Updates

Every change merged into `main` publishes a new release, numbered `0.1.<build>`. When the app opens (and every 6 hours while it stays open) it checks the latest release. If there is a newer one, a card at the bottom of the left navigation shows the new version and what changed. Press **Restart and update**: the app downloads the installer, checks its signature, closes, installs and opens again. Your settings, saved games and AI sign-ins are kept. Press **Later** to hide the card until the next check. While an AI answer is still coming in, the update waits for it.

The current version is shown at the bottom of the left navigation. Builds run with `npm run tauri dev` never check for updates.

## Connect your AI

Install [Claude Code](https://code.claude.com/docs/en/setup), [Codex CLI](https://developers.openai.com/codex/cli), or both. Then, in the first-run setup or in **Settings › Your AI**, press **Sign in**: a terminal opens with the CLI's official login, you finish it in your browser, and the app checks the connection. One connected model is enough. If you connect both, pick the default one in **Settings › Your AI**.

## Riot API key

Improve, Games, Match details and the Riot ID search read data from Riot's API, so they need a Riot API key. So does **Fill from my game** during a loading or running game (Spectator-V5). Next game, the build card and Fill from my game in champ select work without one.

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
- The app never reads the game process, its memory, or the Live Client Data API, and it never polls anything live. The only background check is for finished games: while the app is open, it asks Match-V5 for new games every 5 minutes. With automatic review off in Settings, that check only fetches the games and spends no AI request.
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

Build a Windows installer yourself with `npm run tauri build -- --bundles nsis`. It produces a per-user `.exe` that installs without admin rights.

### Publishing releases

CI publishes a GitHub Release on every push to `main`: the NSIS installer, its signature and `latest.json`, which the app's updater reads. The updater only installs files signed with the project's key, so CI needs that key as a secret. One-time setup:

1. Generate the key pair on your computer, in the repo folder:

   ```bash
   npm run tauri signer generate -- -w ~/.tauri/league-coach.key
   ```

   Pick a password when asked. This writes `league-coach.key` (private, keep it safe and never commit it) and `league-coach.key.pub` (public).
2. In GitHub, open **Settings › Secrets and variables › Actions** and add two repository secrets: `TAURI_SIGNING_PRIVATE_KEY` with the full contents of `league-coach.key`, and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` with the password.
3. Put the contents of `league-coach.key.pub` in `src-tauri/tauri.conf.json`, under `plugins.updater.pubkey`.

If the private key is lost, installed apps can't update to builds signed with a new key: install the new version by hand once. Without the secret, CI still runs its checks but skips the release with a warning, and it refuses to publish while `pubkey` is not a real Tauri public key.

The version comes from the workflow's run number. If `.github/workflows/ci.yml` is ever renamed or recreated, the count starts again at 1 and installed apps would see every new build as older: raise the base then (for example `0.2.<run number>`, in the `VERSION` line of the `release` job). Re-running a `main` run reuses its version, so it updates that release instead of making a new one.

Checks that CI runs (on Ubuntu and Windows):

```bash
npm run build
npm test
cd src-tauri && cargo fmt --check && cargo clippy --locked --all-targets -- -D warnings && cargo test --locked
```
