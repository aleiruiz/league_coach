import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import { openUrl } from "@tauri-apps/plugin-opener";
import BuildCard, { BuildCardSkeleton } from "./BuildCard";
import ChampionPicker from "./ChampionPicker";
import { Champion, Draft, gameData, GameData, recommendBuild, Recommendation, ROLES } from "./game";
import { DraftState, EMPTY_DRAFT, sameDraft, setSlot, Slot, taken as takenIds, toDraft, toggleLane } from "./draft";
import { applyEvent, cancelPrompt, humanizeError, ProviderKind, sendPrompt } from "./providers";
import type { ProvidersState } from "./App";

/** Build recibida, con el modelo y el draft que la generaron. */
type Result = Recommendation & { kind: ProviderKind; draft: Draft };

const mdLinks = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href?.startsWith("https://")) openUrl(href);
      }}
    >
      {children}
    </a>
  ),
};

function Portrait({ champ, label, onClick, onClear, star }: {
  champ: Champion | undefined;
  label: string;
  onClick: () => void;
  onClear?: () => void;
  star?: { on: boolean; toggle: () => void };
}) {
  return (
    <div className={champ ? "slot filled" : "slot"}>
      <button className="slot-main" onClick={onClick} aria-label={champ ? `${label}: ${champ.name}. Cambiar` : `Elegir ${label}`}>
        {champ ? <img src={champ.image} alt="" /> : <span className="plus">+</span>}
        <span className="slot-name">{champ?.name ?? label}</span>
      </button>
      {champ && onClear && (
        <button className="slot-x" onClick={onClear} aria-label={`Quitar ${champ.name}`}>
          ×
        </button>
      )}
      {champ && star && (
        <button
          className={star.on ? "slot-star on" : "slot-star"}
          onClick={star.toggle}
          aria-pressed={star.on}
          title="Rival de línea"
          aria-label={`Marcar a ${champ.name} como rival de línea`}
        >
          ★
        </button>
      )}
    </div>
  );
}

function DraftView({ providers, onGoToModels }: { providers: ProvidersState; onGoToModels: () => void }) {
  const ready = useMemo(() => providers.list.filter((p) => p.logged_in), [providers.list]);
  const [kind, setKind] = useState<ProviderKind | null>(null);
  const [data, setData] = useState<GameData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  const [d, setD] = useState<DraftState>(EMPTY_DRAFT);
  const [picking, setPicking] = useState<Slot | null>(null);
  // Para devolver el foco a la casilla al cerrar el selector.
  const opener = useRef<HTMLElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rec, setRec] = useState<Result | null>(null);
  const [followUp, setFollowUp] = useState("");
  const [answers, setAnswers] = useState<{ q: string; a: string; error?: string }[]>([]);
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    gameData().then(setData).catch((e) => setDataError(String(e)));
  }, []);

  useEffect(() => {
    if (!ready.some((p) => p.kind === kind)) setKind(ready[0]?.kind ?? null);
  }, [ready, kind]);

  const byId = useMemo(() => new Map(data?.champions.map((c) => [c.id, c]) ?? []), [data]);
  const draft = toDraft(d);
  // La build ya no corresponde a lo que hay en pantalla.
  const stale = !!rec && !sameDraft(rec.draft, draft);

  function openPicker(slot: Slot) {
    opener.current = document.activeElement as HTMLElement | null;
    setPicking(slot);
  }

  const closePicker = useCallback(() => {
    setPicking(null);
    requestAnimationFrame(() => opener.current?.focus());
  }, []);

  function pick(id: string) {
    if (!picking) return;
    setD((s) => setSlot(s, picking, id));
    closePicker();
  }

  function reset() {
    setD(EMPTY_DRAFT);
    setRec(null);
    setAnswers([]);
    setError(null);
  }

  async function recommend() {
    if (!draft || !kind || busy) return;
    const usedKind = kind;
    const id = crypto.randomUUID();
    requestId.current = id;
    setBusy(true);
    setError(null);
    setRec(null);
    setAnswers([]);
    setStatus("Preparando la build…");
    try {
      const r = await recommendBuild(usedKind, draft, id, (ev) => {
        if (ev.type === "status") setStatus(ev.text);
      });
      setRec({ ...r, kind: usedKind, draft });
    } catch (e) {
      setError(humanizeError(String(e)));
    } finally {
      requestId.current = null;
      setBusy(false);
      setStatus(null);
    }
  }

  async function ask() {
    const q = followUp.trim();
    // Se sigue con el mismo modelo que hizo la build: la sesión es suya.
    if (!q || !rec?.session_id || stale || busy) return;
    setFollowUp("");
    setBusy(true);
    setAnswers((a) => [...a, { q, a: "" }]);
    const update = (f: (x: { q: string; a: string; error?: string }) => { q: string; a: string; error?: string }) =>
      setAnswers((a) => [...a.slice(0, -1), f(a[a.length - 1])]);
    const id = crypto.randomUUID();
    requestId.current = id;
    try {
      await sendPrompt(
        rec.kind,
        `${q}\n\n(Responde en texto normal, no en JSON.)`,
        rec.session_id,
        id,
        (ev) => {
          if (ev.type === "status") setStatus(ev.text);
          else if (ev.type === "error") update((x) => ({ ...x, error: humanizeError(ev.message) }));
          else if (ev.type !== "session" && ev.type !== "done") {
            setStatus(null);
            update((x) => ({ ...x, a: applyEvent(x.a, ev) }));
          }
        },
      );
    } catch (e) {
      update((x) => ({ ...x, error: humanizeError(String(e)) }));
    } finally {
      requestId.current = null;
      setBusy(false);
      setStatus(null);
    }
  }

  if (!ready.length && !providers.loading) {
    return (
      <section>
        <h2>Tu partida</h2>
        <p className="muted">Conecta Claude o ChatGPT para recibir builds.</p>
        <button onClick={onGoToModels}>Conectar modelos</button>
      </section>
    );
  }

  return (
    <section className="draft">
      <header className="draft-header">
        <h2>Tu partida</h2>
        {data && <span className="badge">Parche {data.patch}</span>}
        {ready.length > 1 && (
          <select aria-label="Modelo" value={kind ?? ""} onChange={(e) => setKind(e.currentTarget.value as ProviderKind)} disabled={busy}>
            {ready.map((p) => (
              <option key={p.kind} value={p.kind}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        <button className="secondary" onClick={reset} disabled={busy}>
          Nueva partida
        </button>
      </header>

      {data?.notice && <p className="muted small">{data.notice}</p>}
      {dataError && <p className="error">No pude cargar los datos del parche: {dataError}</p>}
      {!data && !dataError && <p className="muted">Cargando campeones del parche…</p>}

      {data && (
        <>
          <div className="role-bar" role="radiogroup" aria-label="Tu rol">
            {ROLES.map((r) => (
              <button
                key={r.id}
                role="radio"
                aria-checked={d.role === r.id}
                className={d.role === r.id ? "role on" : "role"}
                onClick={() => setD((s) => ({ ...s, role: r.id }))}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="teams">
            <div className="team ally-team">
              <h3>Tu equipo</h3>
              <Portrait
                champ={d.me ? byId.get(d.me) : undefined}
                label="Tu campeón"
                onClick={() => openPicker({ team: "me", index: 0 })}
                onClear={() => setD((s) => setSlot(s, { team: "me", index: 0 }, null))}
              />
              {d.allies.map((a, i) => (
                <Portrait
                  key={i}
                  champ={a ? byId.get(a) : undefined}
                  label="Aliado"
                  onClick={() => openPicker({ team: "ally", index: i })}
                  onClear={() => setD((s) => setSlot(s, { team: "ally", index: i }, null))}
                />
              ))}
            </div>
            <div className="vs">VS</div>
            <div className="team enemy-team">
              <h3>Rivales</h3>
              {d.enemies.map((e, i) => (
                <Portrait
                  key={i}
                  champ={e ? byId.get(e) : undefined}
                  label="Rival"
                  onClick={() => openPicker({ team: "enemy", index: i })}
                  onClear={() => setD((s) => setSlot(s, { team: "enemy", index: i }, null))}
                  star={e ? { on: d.lane === e, toggle: () => setD((s) => toggleLane(s, e)) } : undefined}
                />
              ))}
            </div>
          </div>

          <div className="draft-actions">
            <textarea
              aria-label="Notas de la partida"
              rows={2}
              placeholder="Opcional: cómo va la partida (p. ej. voy 0/2, su jungla campea mucho mi línea)"
              value={d.notes}
              onChange={(e) => {
                const notes = e.currentTarget.value;
                setD((s) => ({ ...s, notes }));
              }}
            />
            {busy ? (
              <button className="danger" onClick={() => requestId.current && cancelPrompt(requestId.current)}>
                Detener
              </button>
            ) : (
              <button className="primary" onClick={recommend} disabled={!draft || !kind}>
                {stale ? "Recalcular build" : "Recomendar build"}
              </button>
            )}
          </div>
          {!d.me && <p className="muted small">Elige al menos tu campeón. Con rivales la build se adapta mucho mejor.</p>}
        </>
      )}

      <div aria-live="polite">
        {status && <p className="muted small">{status}</p>}
        {error && <p className="error">⚠ {error}</p>}
      </div>
      {busy && !rec && answers.length === 0 && <BuildCardSkeleton />}
      {stale && !busy && (
        <p className="stale-note" role="status">
          Cambiaste la partida desde esta build. Pulsa «Recalcular build» para adaptarla.
        </p>
      )}
      {rec && (
        <div className={stale ? "stale" : undefined}>
          <BuildCard card={rec.card} patch={rec.patch} warnings={rec.warnings} />
        </div>
      )}

      {rec?.session_id && !stale && (
        <section className="follow-up">
          <h4>Preguntar más sobre esta partida</h4>
          {answers.map((x, i) => (
            <div key={i} className="qa">
              <p className="q">{x.q}</p>
              <div className="bubble assistant">
                <Markdown components={mdLinks} urlTransform={(u) => (u.startsWith("https://") ? u : "")}>
                  {x.a}
                </Markdown>
                {x.error && <p className="error">⚠ {x.error}</p>}
              </div>
            </div>
          ))}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <textarea
              aria-label="Pregunta sobre la build"
              rows={2}
              placeholder="¿Y si su ADC se adelanta? ¿Cuándo voy por el Heraldo?"
              value={followUp}
              onChange={(e) => setFollowUp(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask();
                }
              }}
            />
            <button type="submit" disabled={busy || !followUp.trim()}>
              Preguntar
            </button>
          </form>
        </section>
      )}

      {picking && data && (
        <ChampionPicker
          champions={data.champions}
          taken={takenIds(d)}
          title={picking.team === "me" ? "Tu campeón" : picking.team === "ally" ? "Aliado" : "Rival"}
          onPick={pick}
          onClose={closePicker}
        />
      )}
    </section>
  );
}

export default DraftView;
