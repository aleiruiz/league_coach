import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import { openUrl } from "@tauri-apps/plugin-opener";
import BuildCard, { BuildCardSkeleton } from "./BuildCard";
import ChampionPicker from "./ChampionPicker";
import { Champion, Draft, gameData, GameData, recommendBuild, Recommendation, Role, ROLES } from "./game";
import { applyEvent, cancelPrompt, humanizeError, ProviderKind, sendPrompt } from "./providers";
import type { ProvidersState } from "./App";

type Slot = { team: "me" | "ally" | "enemy"; index: number };

const EMPTY: (string | null)[] = [null, null, null, null];
const EMPTY5: (string | null)[] = [null, null, null, null, null];

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

  const [role, setRole] = useState<Role>("top");
  const [me, setMe] = useState<string | null>(null);
  const [allies, setAllies] = useState(EMPTY);
  const [enemies, setEnemies] = useState(EMPTY5);
  const [lane, setLane] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [picking, setPicking] = useState<Slot | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rec, setRec] = useState<Recommendation | null>(null);
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
  const taken = new Set([me, ...allies, ...enemies].filter(Boolean) as string[]);

  function pick(id: string) {
    if (!picking) return;
    if (picking.team === "me") setMe(id);
    if (picking.team === "ally") setAllies((a) => a.map((x, i) => (i === picking.index ? id : x)));
    if (picking.team === "enemy") setEnemies((a) => a.map((x, i) => (i === picking.index ? id : x)));
    setPicking(null);
  }

  function clearEnemy(i: number) {
    if (enemies[i] === lane) setLane(null);
    setEnemies((a) => a.map((x, j) => (j === i ? null : x)));
  }

  function reset() {
    setMe(null);
    setAllies(EMPTY);
    setEnemies(EMPTY5);
    setLane(null);
    setNotes("");
    setRec(null);
    setAnswers([]);
    setError(null);
  }

  async function recommend() {
    if (!me || !kind || busy) return;
    const draft: Draft = {
      role,
      champion: me,
      allies: allies.filter(Boolean) as string[],
      enemies: enemies.filter(Boolean) as string[],
      lane_opponent: lane,
      notes: notes.trim() || null,
    };
    const id = crypto.randomUUID();
    requestId.current = id;
    setBusy(true);
    setError(null);
    setRec(null);
    setAnswers([]);
    setStatus("Preparando la build…");
    try {
      const r = await recommendBuild(kind, draft, id, (ev) => {
        if (ev.type === "status") setStatus(ev.text);
      });
      setRec(r);
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
    if (!q || !kind || !rec?.session_id || busy) return;
    setFollowUp("");
    setBusy(true);
    setAnswers((a) => [...a, { q, a: "" }]);
    const update = (f: (x: { q: string; a: string; error?: string }) => { q: string; a: string; error?: string }) =>
      setAnswers((a) => [...a.slice(0, -1), f(a[a.length - 1])]);
    const id = crypto.randomUUID();
    requestId.current = id;
    try {
      await sendPrompt(
        kind,
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

      {dataError && <p className="error">No pude cargar los datos del parche: {dataError}</p>}
      {!data && !dataError && <p className="muted">Cargando campeones del parche…</p>}

      {data && (
        <>
          <div className="role-bar" role="radiogroup" aria-label="Tu rol">
            {ROLES.map((r) => (
              <button
                key={r.id}
                role="radio"
                aria-checked={role === r.id}
                className={role === r.id ? "role on" : "role"}
                onClick={() => setRole(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="teams">
            <div className="team ally-team">
              <h3>Tu equipo</h3>
              <Portrait
                champ={me ? byId.get(me) : undefined}
                label="Tu campeón"
                onClick={() => setPicking({ team: "me", index: 0 })}
                onClear={() => setMe(null)}
              />
              {allies.map((a, i) => (
                <Portrait
                  key={i}
                  champ={a ? byId.get(a) : undefined}
                  label="Aliado"
                  onClick={() => setPicking({ team: "ally", index: i })}
                  onClear={() => setAllies((x) => x.map((y, j) => (j === i ? null : y)))}
                />
              ))}
            </div>
            <div className="vs">VS</div>
            <div className="team enemy-team">
              <h3>Rivales</h3>
              {enemies.map((e, i) => (
                <Portrait
                  key={i}
                  champ={e ? byId.get(e) : undefined}
                  label="Rival"
                  onClick={() => setPicking({ team: "enemy", index: i })}
                  onClear={() => clearEnemy(i)}
                  star={e ? { on: lane === e, toggle: () => setLane(lane === e ? null : e) } : undefined}
                />
              ))}
            </div>
          </div>

          <div className="draft-actions">
            <textarea
              aria-label="Notas de la partida"
              rows={2}
              placeholder="Opcional: cómo va la partida (p. ej. voy 0/2, su jungla campea mucho mi línea)"
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
            />
            {busy ? (
              <button className="danger" onClick={() => requestId.current && cancelPrompt(requestId.current)}>
                Detener
              </button>
            ) : (
              <button className="primary" onClick={recommend} disabled={!me || !kind}>
                Recomendar build
              </button>
            )}
          </div>
          {!me && <p className="muted small">Elige al menos tu campeón. Con rivales la build se adapta mucho mejor.</p>}
        </>
      )}

      <div aria-live="polite">
        {status && <p className="muted small">{status}</p>}
        {error && <p className="error">⚠ {error}</p>}
      </div>
      {busy && !rec && answers.length === 0 && <BuildCardSkeleton />}
      {rec && <BuildCard card={rec.card} patch={rec.patch} warnings={rec.warnings} />}

      {rec?.session_id && (
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
          taken={taken}
          title={picking.team === "me" ? "Tu campeón" : picking.team === "ally" ? "Aliado" : "Rival"}
          onPick={pick}
          onClose={() => setPicking(null)}
        />
      )}
    </section>
  );
}

export default DraftView;
