import { useCallback, useEffect, useState } from "react";
import Chat from "./Chat";
import DraftView from "./DraftView";
import Models from "./Models";
import Settings from "./Settings";
import { NavIcon } from "./icons";
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
        <h1 className="brand">
          <span className="brand-mark" aria-hidden="true">
            LC
          </span>
          League Coach
        </h1>
        {NAV.map((n) => (
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
        <footer className="legal">
          League Coach isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or
          anyone officially involved in producing or managing Riot Games properties. Riot Games, and all
          associated properties are trademarks or registered trademarks of Riot Games, Inc.
          <br />
          League Coach no está respaldado por Riot Games y no refleja las opiniones de Riot Games ni de nadie
          involucrado oficialmente en producir o gestionar sus propiedades. Riot Games y todas sus propiedades
          asociadas son marcas comerciales o registradas de Riot Games, Inc.
        </footer>
      </main>
    </div>
  );
}

export default App;
