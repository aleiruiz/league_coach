import { useCallback, useEffect, useState } from "react";
import Chat from "./Chat";
import DraftView from "./DraftView";
import Models from "./Models";
import Settings from "./Settings";
import { NavIcon } from "./icons";
import { providerStatuses, ProviderStatus } from "./providers";
import { currentLang, Lang, saveLanguage, t } from "./i18n";
import "./App.css";

type View = "draft" | "coach" | "models" | "settings";

const nav = (): { view: View; label: string }[] => [
  { view: "draft", label: t("Game", "Partida") },
  { view: "coach", label: t("Ask", "Preguntar") },
  { view: "models", label: t("Models", "Modelos") },
  { view: "settings", label: t("Settings", "Ajustes") },
];

export type ProvidersState = {
  list: ProviderStatus[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

function App() {
  const [view, setView] = useState<View>("draft");
  const [list, setList] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(currentLang());
  // Views with a request in flight: the language can't change mid-request.
  const [busy, setBusy] = useState({ draft: false, coach: false });
  const draftBusy = useCallback((b: boolean) => setBusy((s) => (s.draft === b ? s : { ...s, draft: b })), []);
  const coachBusy = useCallback((b: boolean) => setBusy((s) => (s.coach === b ? s : { ...s, coach: b })), []);

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

  const providers: ProvidersState = { list, loading, error, refresh };

  // Views stay mounted (only hidden) so switching tabs doesn't lose the
  // conversation or an answer in progress. Changing the language re-renders
  // them in place: the draft and the chat are kept, and the draft view
  // reloads the game data in the new language (champion ids don't change).
  return (
    <div className="app">
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
            onClick={() => setView(n.view)}
          >
            <NavIcon name={n.view} />
            {n.label}
          </button>
        ))}
      </nav>
      <main className="content">
        <div hidden={view !== "draft"}>
          <DraftView providers={providers} lang={lang} onBusy={draftBusy} onGoToModels={() => setView("models")} />
        </div>
        <div hidden={view !== "coach"}>
          <Chat providers={providers} onBusy={coachBusy} onGoToModels={() => setView("models")} />
        </div>
        <div hidden={view !== "models"}>
          <Models providers={providers} />
        </div>
        <div hidden={view !== "settings"}>
          <Settings lang={lang} onLanguage={changeLanguage} locked={busy.draft || busy.coach} />
        </div>
        <footer className="legal">
          League Coach isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or
          anyone officially involved in producing or managing Riot Games properties. Riot Games, and all
          associated properties are trademarks or registered trademarks of Riot Games, Inc.
          {lang === "es" && (
            <>
              <br />
              League Coach no está respaldado por Riot Games y no refleja las opiniones de Riot Games ni de
              nadie involucrado oficialmente en producir o gestionar sus propiedades. Riot Games y todas sus
              propiedades asociadas son marcas comerciales o registradas de Riot Games, Inc.
            </>
          )}
        </footer>
      </main>
    </div>
  );
}

export default App;
