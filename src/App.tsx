import { useState } from "react";
import Settings from "./Settings";
import "./App.css";

type View = "coach" | "settings";

function App() {
  const [view, setView] = useState<View>("coach");

  return (
    <div className="app">
      <nav className="sidebar">
        <h1 className="brand">League Coach</h1>
        <button
          className={view === "coach" ? "nav active" : "nav"}
          onClick={() => setView("coach")}
        >
          Coach
        </button>
        <button
          className={view === "settings" ? "nav active" : "nav"}
          onClick={() => setView("settings")}
        >
          Ajustes
        </button>
      </nav>
      <main className="content">
        {view === "coach" ? (
          <section>
            <h2>Coach</h2>
            <p className="muted">
              Aquí vivirá el chat con el modelo (paso 2 del plan). Primero
              configura al menos un proveedor en Ajustes.
            </p>
          </section>
        ) : (
          <Settings />
        )}
      </main>
    </div>
  );
}

export default App;
