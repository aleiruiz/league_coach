import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { t } from "./i18n";

export type UpdateInfo = { version: string; currentVersion: string; notes: string | null };

type State =
  | { kind: "none" }
  | { kind: "ready"; info: UpdateInfo }
  | { kind: "installing"; info: UpdateInfo }
  | { kind: "failed"; info: UpdateInfo; error: string };

/** Looks again every 6 hours, for an app left open all day. */
const RECHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Sidebar card shown when a newer build of `main` is published. Nothing shows
 * when up to date, offline, or in a dev build. Installing closes the app, so
 * it waits while an answer is still coming in.
 */
export default function UpdateNotice({ busy }: { busy: boolean }) {
  const [state, setState] = useState<State>({ kind: "none" });
  const [version, setVersion] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const info = await invoke<UpdateInfo | null>("check_update");
      // Don't interrupt an install or a "Later" with the same version.
      setState((s) => (s.kind === "installing" ? s : info ? { kind: "ready", info } : { kind: "none" }));
    } catch {
      // Offline or GitHub unreachable: try again at the next check.
    }
  }, []);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
    check();
    const id = window.setInterval(check, RECHECK_MS);
    return () => window.clearInterval(id);
  }, [check]);

  const install = async (info: UpdateInfo) => {
    setState({ kind: "installing", info });
    try {
      await invoke("install_update");
    } catch (e) {
      setState({ kind: "failed", info, error: String(e) });
    }
  };

  if (state.kind === "none") {
    return version ? <span className="app-version">{t(`Version ${version}`, `Versión ${version}`)}</span> : null;
  }

  const { info } = state;
  return (
    <div className="update-card" role="status">
      <strong>{t(`Update ready: ${info.version}`, `Actualización lista: ${info.version}`)}</strong>
      {info.notes && <span className="update-notes">{info.notes}</span>}
      {state.kind === "installing" ? (
        <span className="update-hint">{t("Downloading… the app will reopen.", "Descargando… la app se volverá a abrir.")}</span>
      ) : (
        <>
          {state.kind === "failed" && (
            <span className="update-error">{t(`Couldn't update: ${state.error}`, `No se pudo actualizar: ${state.error}`)}</span>
          )}
          {busy && (
            <span className="update-hint">{t("Waiting for the answer in progress.", "Esperando a la respuesta en curso.")}</span>
          )}
          <div className="update-actions">
            <button className="small-button" disabled={busy} onClick={() => install(info)}>
              {state.kind === "failed" ? t("Try again", "Reintentar") : t("Restart and update", "Reiniciar y actualizar")}
            </button>
            <button className="secondary small-button" onClick={() => setState({ kind: "none" })}>
              {t("Later", "Luego")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
