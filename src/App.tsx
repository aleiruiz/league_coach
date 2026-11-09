import { useEffect, useState } from "react";
import Chat from "./Chat";
import Models from "./Models";
import Settings from "./Settings";
import { providerStatuses, ProviderStatus } from "./providers";
import "./App.css";

type View = "coach" | "models" | "settings";

const NAV: { view: View; label: string }[] = [
  { view: "coach", label: "Coach" },
  { view: "models", label: "Modelos" },
  { view: "settings", label: "API keys (opcional)" },
];

function App() {
  const [view, setView] = useState<View>("coach");
  const [providers, setProviders] = useState<ProviderStatus[]>([]);

  useEffect(() => {
    providerStatuses().then(setProviders).catch(() => setProviders([]));
  }, []);

  return (
    <div className="app">
      <nav className="sidebar">
        <h1 className="brand">League Coach</h1>
        {NAV.map((n) => (
          <button
            key={n.view}
            className={view === n.view ? "nav active" : "nav"}
            onClick={() => setView(n.view)}
          >
            {n.label}
          </button>
        ))}
      </nav>
      <main className="content">
        {view === "coach" && (
          <Chat providers={providers} onGoToModels={() => setView("models")} />
        )}
        {view === "models" && <Models onChange={setProviders} />}
        {view === "settings" && <Settings />}
      </main>
    </div>
  );
}

export default App;
