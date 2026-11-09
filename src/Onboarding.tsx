import { useState, type ReactNode } from "react";
import type { ProvidersState } from "./App";
import { ProviderSetup, modelsIntro } from "./Models";
import { RiotAccount } from "./Settings";
import { Lang, LANGUAGES, t } from "./i18n";

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: ReactNode }) {
  return (
    <section className={done ? "panel setup-step done" : "panel setup-step"}>
      <h3 className="setup-title">
        <span className="setup-n" aria-hidden="true">
          {done ? "✓" : n}
        </span>
        {title}
        {done && <span className="badge ok">{t("Done", "Listo")}</span>}
      </h3>
      {children}
    </section>
  );
}

/**
 * First run: before showing anything else, the player connects an AI CLI and
 * says who they are in League (Riot ID + region). Everything here can be
 * changed later in Models and Settings.
 */
function Onboarding({
  providers,
  aiReady,
  accountReady,
  lang,
  onLanguage,
  onAccountSaved,
  onDone,
}: {
  providers: ProvidersState;
  aiReady: boolean;
  accountReady: boolean;
  lang: Lang;
  onLanguage: (l: Lang) => Promise<void>;
  onAccountSaved: () => void;
  onDone: () => void;
}) {
  const ready = aiReady && accountReady;
  const [langError, setLangError] = useState<string | null>(null);
  return (
    <div className="setup">
      <header className="setup-head">
        <h1 className="brand">
          <span className="brand-mark" aria-hidden="true">
            LC
          </span>
          League Coach
        </h1>
        <div className="lang-picker" role="radiogroup" aria-label={t("Language", "Idioma")}>
          {LANGUAGES.map((l) => (
            <button
              key={l.value}
              role="radio"
              aria-checked={lang === l.value}
              className={lang === l.value ? "chip on" : "chip"}
              onClick={() => {
                if (l.value !== lang) onLanguage(l.value).catch((e) => setLangError(String(e)));
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </header>
      {langError && <p className="error small">{langError}</p>}
      <h2>{t("Let's get you set up", "Vamos a configurarlo")}</h2>
      <p className="muted">
        {t(
          "Two quick steps before you start. You can change both later in Models and Settings.",
          "Dos pasos rápidos antes de empezar. Puedes cambiar ambos después en Modelos y Ajustes.",
        )}
      </p>

      <Step n={1} done={aiReady} title={t("Connect your AI", "Conecta tu IA")}>
        <p className="muted small">
          {modelsIntro()}{" "}
          {t("One connected model is enough.", "Con un modelo conectado basta.")}
        </p>
        <ProviderSetup providers={providers} />
      </Step>

      <Step n={2} done={accountReady} title={t("Your League account", "Tu cuenta de League")}>
        <p className="muted small">
          {t(
            "Your Riot ID (Name#TAG, as shown in your League client profile) and the server you play on.",
            "Tu Riot ID (Nombre#TAG, como sale en tu perfil del cliente de League) y el servidor donde juegas.",
          )}
        </p>
        <RiotAccount compact onSaved={onAccountSaved} />
        <p className="muted small">
          {t(
            "Reading your games in “My progress” also needs a Riot API key, which you can add later in Settings.",
            "Para leer tus partidas en «Mi progreso» también hace falta una API key de Riot, que puedes añadir después en Ajustes.",
          )}
        </p>
      </Step>

      <div className="setup-actions">
        <button className="primary" onClick={onDone} disabled={!ready}>
          {t("Start", "Empezar")}
        </button>
        {!ready && (
          <span className="muted small">
            {!aiReady && !accountReady
              ? t("Finish both steps to continue.", "Completa los dos pasos para continuar.")
              : !aiReady
                ? t("Connect at least one model to continue.", "Conecta al menos un modelo para continuar.")
                : t("Set your Riot ID and region (Use as my account) to continue.", "Elige tu Riot ID y tu región (Usar como mi cuenta) para continuar.")}
          </span>
        )}
      </div>
    </div>
  );
}

export default Onboarding;
