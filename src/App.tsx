import { useCallback, useEffect, useState } from "react";
import Chat from "./Chat";
import DraftView from "./DraftView";
import Models from "./Models";
import Settings from "./Settings";
import { providerStatuses, ProviderStatus } from "./providers";
import "./App.css";

type View = "draft" | "coach" | "models" | "settings";

const NAV: { view: View; label: string }[] = [
  { view: "draft", label: "Partida" },
  { view: "coach", label: "Preguntar" },
  { view: "models", label: "Modelos" },
  { view: "settings", label: "API keys (opcional)" },
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

  const providers: ProvidersState = { list, loading, error, refresh };

  // Las vistas quedan montadas (solo se ocultan) para no perder la
  // conversación ni una respuesta en curso al cambiar de pestaña.
  return (
    <div className="app">
      <nav className="sidebar">
        <h1 className="brand">League Coach</h1>
        {NAV.map((n) => (
          <button
            key={n.view}
            className={view === n.view ? "nav active" : "nav"}
            aria-current={view === n.view ? "page" : undefined}
            onClick={() => setView(n.view)}
          >
            {n.label}
          </button>
        ))}
      </nav>
      <main className="content">
        <div hidden={view !== "draft"}>
          <DraftView providers={providers} onGoToModels={() => setView("models")} />
        </div>
        <div hidden={view !== "coach"}>
          <Chat providers={providers} onGoToModels={() => setView("models")} />
        </div>
        <div hidden={view !== "models"}>
          <Models providers={providers} />
        </div>
        <div hidden={view !== "settings"}>
          <Settings />
        </div>
      </main>
    </div>
  );
}

export default App;
