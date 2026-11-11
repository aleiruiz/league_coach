import { useCallback, useEffect, useRef, useState } from "react";
import AskPanel, { type AskContext } from "./AskPanel";
import DraftView from "./DraftView";
import Progress from "./Progress";
import Games from "./Games";
import Settings, { LegalNotice } from "./Settings";
import Onboarding from "./Onboarding";
import { riotAccount, riotIdOf, RiotProfile } from "./history";
import { NavIcon } from "./icons";
import { loadPreferred, pickKind, ProviderKind, providerStatuses, ProviderStatus, savePreferred, shortName } from "./providers";
import { currentLang, Lang, saveLanguage, t } from "./i18n";
import "./App.css";

type View = "draft" | "progress" | "games" | "settings";

/** The two moments the app is for (before a game and after it), then the games themselves. */
const nav = (): { view: "draft" | "progress" | "games"; label: string; hint: string }[] => [
  { view: "draft", label: t("Next game", "Próxima partida"), hint: t("Build and matchup plan", "Build y plan de la línea") },
  { view: "progress", label: t("Improve", "Mejorar"), hint: t("What to work on", "En qué trabajar") },
  { view: "games", label: t("Games", "Partidas"), hint: t("Your match history", "Tu historial") },
];

export type ProvidersState = {
  list: ProviderStatus[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Default AI chosen in Models (null: the first signed-in one). */
  preferred: ProviderKind | null;
  setPreferred: (kind: ProviderKind | null) => void;
};

function App() {
  const [view, setView] = useState<View>("draft");
  const [list, setList] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(currentLang());
  // Views with a request in flight: the language can't change mid-request.
  const [busy, setBusy] = useState({ draft: false, coach: false, progress: false });
  const [accountVersion, setAccountVersion] = useState(0);
  // Bumped when Improve or Games read new games, so the other one reloads.
  const [historyVersion, setHistoryVersion] = useState(0);
  const historyChanged = useCallback(() => setHistoryVersion((v) => v + 1), []);
  const accountSaved = useCallback(() => setAccountVersion((v) => v + 1), []);
  const draftBusy = useCallback((b: boolean) => setBusy((s) => (s.draft === b ? s : { ...s, draft: b })), []);
  const coachBusy = useCallback((b: boolean) => setBusy((s) => (s.coach === b ? s : { ...s, coach: b })), []);
  const progressBusy = useCallback((b: boolean) => setBusy((s) => (s.progress === b ? s : { ...s, progress: b })), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setList(await providerStatuses());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const changeLanguage = useCallback(
    async (l: Lang) => {
      await saveLanguage(l);
      setLang(l);
      // Provider details come from the backend in the chosen language.
      refresh();
    },
    [refresh],
  );

  const [preferred, setPreferredState] = useState<ProviderKind | null>(loadPreferred);
  const setPreferred = useCallback((kind: ProviderKind | null) => {
    savePreferred(kind);
    setPreferredState(kind);
  }, []);
  const [patch, setPatch] = useState<string | null>(null);
  // "Ask the coach": a panel over Next game and Improve, told what each shows.
  const [askOpen, setAskOpen] = useState(false);
  // Closing the panel puts keyboard focus back on the button that opened it.
  const askOpener = useRef<HTMLElement | null>(null);
  const openAsk = useCallback(() => {
    askOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAskOpen(true);
  }, []);
  const closeAsk = useCallback(() => {
    setAskOpen(false);
    const el = askOpener.current;
    askOpener.current = null;
    if (el?.isConnected) requestAnimationFrame(() => el.focus());
  }, []);
  const [contexts, setContexts] = useState<{ draft: AskContext | null; progress: AskContext | null; games: AskContext | null }>({
    draft: null,
    progress: null,
    games: null,
  });
  const draftContext = useCallback((c: AskContext | null) => setContexts((s) => ({ ...s, draft: c })), []);
  const progressContext = useCallback((c: AskContext | null) => setContexts((s) => ({ ...s, progress: c })), []);
  const gamesContext = useCallback((c: AskContext | null) => setContexts((s) => ({ ...s, games: c })), []);
  const providers: ProvidersState = { list, loading, error, refresh, preferred, setPreferred };
  const signedIn = list.filter((p) => p.logged_in);
  const aiInUse = signedIn.find((p) => p.kind === pickKind(signedIn, preferred)) ?? null;

  // First-run setup: nothing else shows until an AI CLI is connected and the
  // Riot ID + region are saved. Checked once at startup; after that, signing
  // out of a CLI doesn't lock the app again (Models says what's wrong).
  const [account, setAccount] = useState<RiotProfile | null | undefined>(undefined);
  useEffect(() => {
    riotAccount()
      .then((a) => setAccount(a.profile))
      .catch(() => setAccount(null));
  }, [accountVersion]);
  const aiReady = list.some((p) => p.logged_in);
  const accountReady = !!account && !!riotIdOf(account) && !!account.region;
  const checking = account === undefined || (loading && list.length === 0);
  const [entered, setEntered] = useState(false);
  const firstCheck = useRef(true);
  useEffect(() => {
    if (checking || !firstCheck.current) return;
    firstCheck.current = false;
    if (aiReady && accountReady) setEntered(true);
  }, [checking, aiReady, accountReady]);

  if (!entered) {
    return (
      <div className="app setup-app">
        <main className="content">
          {/* While the first check runs, and in the frame before the effect lets an
              already set-up player in, show the splash instead of flashing setup. */}
          {firstCheck.current && (checking || (aiReady && accountReady)) ? (
            <p className="muted setup-checking">{t("Checking your setup…", "Comprobando tu configuración…")}</p>
          ) : (
            <Onboarding
              providers={providers}
              aiReady={aiReady}
              accountReady={accountReady}
              lang={lang}
              onLanguage={changeLanguage}
              onAccountSaved={accountSaved}
              onDone={() => setEntered(true)}
            />
          )}
          <Legal lang={lang} />
        </main>
      </div>
    );
  }

  // The Ask panel belongs to the screens that have something to ask about:
  // Games only while a finished game is open.
  const asksHere = view === "draft" || view === "progress" || (view === "games" && !!contexts.games);
  // Views stay mounted (only hidden) so switching tabs doesn't lose the
  // conversation or an answer in progress. Changing the language re-renders
  // them in place: the draft and the chat are kept, and the draft view
  // reloads the game data in the new language (champion ids don't change).
  return (
    <div className={askOpen && asksHere ? "app ask-open" : "app"}>
      <nav className="sidebar">
        <h1 className="brand">
          <span className="brand-mark" aria-hidden="true">
            LC
          </span>
          League Coach
        </h1>
        {nav().map((n) => (
          <button
            key={n.view}
            className={view === n.view ? "nav active" : "nav"}
            aria-current={view === n.view ? "page" : undefined}
            onClick={() => {
              setView(n.view);
            }}
          >
            <NavIcon name={n.view} />
            <span className="nav-text">
              <span>{n.label}</span>
              <span className="nav-hint">{n.hint}</span>
            </span>
          </button>
        ))}
        <div className="nav-spacer" />
        <div className="nav-status" aria-live="polite">
          <span className="nav-status-line">
            <span className={aiInUse ? "dot ok" : "dot"} aria-hidden="true" />
            {aiInUse
              ? t(`${shortName(aiInUse.label)} connected`, `${shortName(aiInUse.label)} conectado`)
              : t("No AI connected", "Ninguna IA conectada")}
          </span>
          {patch && <span>{t(`Patch ${patch}`, `Parche ${patch}`)}</span>}
        </div>
        <button
          className={view === "settings" ? "nav active" : "nav"}
          aria-current={view === "settings" ? "page" : undefined}
          onClick={() => setView("settings")}
        >
          <NavIcon name="settings" />
          {t("Settings", "Ajustes")}
        </button>
      </nav>
      <main className="content">
        <div hidden={view !== "draft"}>
          <DraftView
            providers={providers}
            lang={lang}
            onBusy={draftBusy}
            onGoToModels={() => setView("settings")}
            onPatch={setPatch}
            onAsk={openAsk}
            onContext={draftContext}
          />
        </div>
        <div hidden={view !== "progress"}>
          <Progress
            providers={providers}
            lang={lang}
            accountVersion={accountVersion}
            onBusy={progressBusy}
            onGoToSettings={() => setView("settings")}
            onGoToModels={() => setView("settings")}
            onAsk={openAsk}
            onContext={progressContext}
            historyVersion={historyVersion}
            onHistoryChanged={historyChanged}
            onGoToGames={() => setView("games")}
          />
        </div>
        <div hidden={view !== "games"}>
          <Games
            lang={lang}
            active={view === "games"}
            version={historyVersion + accountVersion}
            onChanged={historyChanged}
            onGoToSettings={() => setView("settings")}
            onAsk={openAsk}
            onContext={gamesContext}
          />
        </div>
        <div hidden={view !== "settings"}>
          <Settings
            lang={lang}
            onLanguage={changeLanguage}
            locked={busy.draft || busy.coach || busy.progress}
            onRiotAccount={accountSaved}
            providers={providers}
            active={view === "settings"}
          />
        </div>
      </main>
      {/* Kept mounted so the conversation survives closing it; over the two moments and an open game. */}
      <AskPanel
        providers={providers}
        open={askOpen && asksHere}
        context={view === "draft" ? contexts.draft : view === "progress" ? contexts.progress : view === "games" ? contexts.games : null}
        onClose={closeAsk}
        onBusy={coachBusy}
        onGoToSettings={() => {
          setAskOpen(false);
          setView("settings");
        }}
      />
    </div>
  );
}

/** First-run setup keeps Riot's notice visible (the app proper has it in Settings › About). */
function Legal({ lang }: { lang: Lang }) {
  return (
    <footer>
      <LegalNotice lang={lang} />
    </footer>
  );
}

export default App;
