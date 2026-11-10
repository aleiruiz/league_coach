import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SafeMarkdown from "./SafeMarkdown";
import BuildCard, { BuildCardSkeleton } from "./BuildCard";
import ChampionPicker from "./ChampionPicker";
import { Champion, Draft, gameData, GameData, recommendBuild, Recommendation, ROLES, RuneTree, Shard } from "./game";
import { RoleIcon } from "./icons";
import { damageProfile } from "./draft";
import { DraftState, EMPTY_DRAFT, sameDraft, setSlot, Slot, taken as takenIds, toDraft, toggleLane } from "./draft";
import { applyEvent, cancelPrompt, humanizeError, pickKind, ProviderKind, sendPrompt } from "./providers";
import type { ProvidersState } from "./App";
import { Lang, t } from "./i18n";

/** Build received, with the model and the draft that produced it. */
type Result = Recommendation & {
  kind: ProviderKind;
  draft: Draft;
  /** Rune trees and shards in the language the card was built in. */
  trees: RuneTree[];
  shards: Shard[][];
};

/** Why the card failed, in the player's words. */
function cardFailure(e: string): string {
  if (/^(The model took|El modelo tardó)/.test(e)) {
    return t("The model took too long to build the card.", "El modelo tardó demasiado en armar la tarjeta.");
  }
  if (/^(Invalid JSON|The answer has no JSON|JSON inválido|La respuesta no contiene)/.test(e)) {
    return t(
      "I couldn't turn the model's answer into a card.",
      "No pude convertir la respuesta del modelo en una tarjeta.",
    );
  }
  // Usage limit, expired session, failing CLI…: the real reason matters.
  return t(`I couldn't build the card: ${humanizeError(e)}`, `No pude armar la tarjeta: ${humanizeError(e)}`);
}

function Portrait({ champ, label, onClick, onClear, star, me }: {
  champ: Champion | undefined;
  label: string;
  onClick: () => void;
  onClear?: () => void;
  star?: { on: boolean; toggle: () => void };
  me?: boolean;
}) {
  const cls = ["slot", champ && "filled", me && "me", star?.on && "lane"].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <button className="slot-main" onClick={onClick} aria-label={champ ? t(`${label}: ${champ.name}. Change`, `${label}: ${champ.name}. Cambiar`) : t(`Pick ${label}`, `Elegir ${label}`)}>
        {champ ? <img src={champ.image} alt="" /> : <span className="plus">+</span>}
        <span className="slot-text">
          {me && <span className="slot-tag">{t("You", "Tú")}</span>}
          {star?.on && <span className="slot-tag lane">{t("Lane opponent", "Rival de línea")}</span>}
          <span className="slot-name">{champ?.name ?? label}</span>
        </span>
      </button>
      {champ && onClear && (
        <button className="slot-x" onClick={onClear} aria-label={t(`Remove ${champ.name}`, `Quitar ${champ.name}`)}>
          ×
        </button>
      )}
      {champ && star && (
        <button
          className={star.on ? "slot-star on" : "slot-star"}
          onClick={star.toggle}
          aria-pressed={star.on}
          title={t("Lane opponent", "Rival de línea")}
          aria-label={t(`Mark ${champ.name} as lane opponent`, `Marcar a ${champ.name} como rival de línea`)}
        >
          ★
        </button>
      )}
    </div>
  );
}

/** Estimated split of enemy damage (from Riot's ratings, not from stats). */
function DamageBar({ champs }: { champs: Champion[] }) {
  if (champs.length === 0) return null;
  const p = damageProfile(champs);
  return (
    <div className="dmg" title={t("Estimated from each champion's damage ratings", "Estimado con las valoraciones de daño de cada campeón")}>
      <div className="dmg-bar" aria-hidden="true">
        <span className="ad" style={{ flexGrow: p.ad }} />
        <span className="ap" style={{ flexGrow: p.ap }} />
        <span className="mixed" style={{ flexGrow: p.mixed }} />
      </div>
      <p className="dmg-legend small">
        <span className="ad-t">
          {t("Physical", "Físico")} {p.adPct}%
        </span>{" "}
        ·{" "}
        <span className="ap-t">
          {t("Magic", "Mágico")} {p.apPct}%
        </span>
        {p.mixed > 0 && (
          <span className="muted">
            {" "}
            · {t("Mixed", "Mixto")} {100 - p.adPct - p.apPct}%
          </span>
        )}
        {p.tanks > 0 && (
          <span className="muted">
            {" "}
            · {p.tanks} {t("durable", p.tanks > 1 ? "resistentes" : "resistente")}
          </span>
        )}
      </p>
    </div>
  );
}

function DraftView({
  providers,
  lang,
  onBusy,
  onGoToModels,
}: {
  providers: ProvidersState;
  lang: Lang;
  onBusy: (busy: boolean) => void;
  onGoToModels: () => void;
}) {
  const ready = useMemo(() => providers.list.filter((p) => p.logged_in), [providers.list]);
  const [kind, setKind] = useState<ProviderKind | null>(null);
  const [data, setData] = useState<GameData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  const [d, setD] = useState<DraftState>(EMPTY_DRAFT);
  const [picking, setPicking] = useState<Slot | null>(null);
  // To give focus back to the slot when the picker closes.
  const opener = useRef<HTMLElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rec, setRec] = useState<Result | null>(null);
  const [followUp, setFollowUp] = useState("");
  const [answers, setAnswers] = useState<{ q: string; a: string; error?: string }[]>([]);
  const requestId = useRef<string | null>(null);
  const result = useRef<HTMLDivElement>(null);
  // When a new build arrives, scroll to it (it sits below the draft).
  useEffect(() => {
    if (rec) result.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [rec]);

  useEffect(() => {
    // Reloads when the language changes: names come in the new locale.
    let current = true;
    setDataError(null);
    gameData()
      .then((g) => current && setData(g))
      .catch((e) => current && setDataError(String(e)));
    return () => {
      current = false;
    };
  }, [lang]);

  useEffect(() => onBusy(busy), [busy, onBusy]);

  useEffect(() => {
    if (!ready.some((p) => p.kind === kind)) setKind(pickKind(ready, providers.preferred));
  }, [ready, kind, providers.preferred]);

  // A new default chosen in Models applies here unless a request is running.
  useEffect(() => {
    const p = providers.preferred;
    if (p && !busy && ready.some((r) => r.kind === p)) setKind(p);
    // Only when the default itself changes.
  }, [providers.preferred]);

  const byId = useMemo(() => new Map(data?.champions.map((c) => [c.id, c]) ?? []), [data]);
  const draft = toDraft(d);
  // The build no longer matches what is on screen.
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
    setStatus(t("Preparing the build…", "Preparando la build…"));
    try {
      const r = await recommendBuild(usedKind, draft, id, (ev) => {
        if (ev.type === "status") setStatus(ev.text);
      });
      setRec({ ...r, kind: usedKind, draft, trees: data?.rune_trees ?? [], shards: data?.shards ?? [] });
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
    // Keep going with the model that made the build: the session is its own.
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
        `${q}\n\n(Answer in plain text, not JSON.)`,
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
        <h2>{t("Your game", "Tu partida")}</h2>
        <p className="muted">{t("Connect Claude or ChatGPT to get builds.", "Conecta Claude o ChatGPT para recibir builds.")}</p>
        <button onClick={onGoToModels}>{t("Connect models", "Conectar modelos")}</button>
      </section>
    );
  }

  return (
    <section className="draft">
      <header className="draft-header">
        <h2>{t("Your game", "Tu partida")}</h2>
        {data && (
          <span className="badge">
            {t("Patch", "Parche")} {data.patch}
          </span>
        )}
        {ready.length > 1 && (
          <select aria-label={t("Model", "Modelo")} value={kind ?? ""} onChange={(e) => setKind(e.currentTarget.value as ProviderKind)} disabled={busy}>
            {ready.map((p) => (
              <option key={p.kind} value={p.kind}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        <button className="secondary" onClick={reset} disabled={busy}>
          {t("New game", "Nueva partida")}
        </button>
      </header>

      {data?.notice && <p className="muted small">{data.notice}</p>}
      {dataError && (
        <p className="error">
          {t("Couldn't load the patch data:", "No pude cargar los datos del parche:")} {dataError}
        </p>
      )}
      {!data && !dataError && <p className="muted">{t("Loading the patch's champions…", "Cargando campeones del parche…")}</p>}

      {data && (
        <>
          <div className="role-bar" role="radiogroup" aria-label={t("Your role", "Tu rol")}>
            {ROLES.map((r) => (
              <button
                key={r.id}
                role="radio"
                aria-checked={d.role === r.id}
                className={d.role === r.id ? "role on" : "role"}
                onClick={() => setD((s) => ({ ...s, role: r.id }))}
              >
                <RoleIcon role={r.id} />
                {r.label()}
              </button>
            ))}
          </div>

          <div className="teams">
            <div className="team ally-team">
              <h3>{t("Your team", "Tu equipo")}</h3>
              <Portrait
                champ={d.me ? byId.get(d.me) : undefined}
                label={t("Your champion", "Tu campeón")}
                me
                onClick={() => openPicker({ team: "me", index: 0 })}
                onClear={() => setD((s) => setSlot(s, { team: "me", index: 0 }, null))}
              />
              {d.allies.map((a, i) => (
                <Portrait
                  key={i}
                  champ={a ? byId.get(a) : undefined}
                  label={t("Ally", "Aliado")}
                  onClick={() => openPicker({ team: "ally", index: i })}
                  onClear={() => setD((s) => setSlot(s, { team: "ally", index: i }, null))}
                />
              ))}
            </div>
            <div className="vs">VS</div>
            <div className="team enemy-team">
              <h3>{t("Enemies", "Rivales")}</h3>
              <DamageBar champs={d.enemies.flatMap((e) => (e && byId.get(e) ? [byId.get(e)!] : []))} />
              {d.enemies.map((e, i) => (
                <Portrait
                  key={i}
                  champ={e ? byId.get(e) : undefined}
                  label={t("Enemy", "Rival")}
                  onClick={() => openPicker({ team: "enemy", index: i })}
                  onClear={() => setD((s) => setSlot(s, { team: "enemy", index: i }, null))}
                  star={e ? { on: d.lane === e, toggle: () => setD((s) => toggleLane(s, e)) } : undefined}
                />
              ))}
            </div>
          </div>

          <div className="draft-actions">
            <textarea
              aria-label={t("Game notes", "Notas de la partida")}
              rows={2}
              placeholder={t(
                "Optional: how the game is going (e.g. I'm 0/2, their jungler camps my lane a lot)",
                "Opcional: cómo va la partida (p. ej. voy 0/2, su jungla campea mucho mi línea)",
              )}
              value={d.notes}
              onChange={(e) => {
                const notes = e.currentTarget.value;
                setD((s) => ({ ...s, notes }));
              }}
            />
            {busy ? (
              <button className="danger" onClick={() => requestId.current && cancelPrompt(requestId.current)}>
                {t("Stop", "Detener")}
              </button>
            ) : (
              <button className="primary" onClick={recommend} disabled={!draft || !kind}>
                {stale ? t("Recalculate build", "Recalcular build") : t("Recommend build", "Recomendar build")}
              </button>
            )}
          </div>
          {!d.me && (
            <p className="muted small">
              {t(
                "Pick at least your champion. With enemies the build adapts much better.",
                "Elige al menos tu campeón. Con rivales la build se adapta mucho mejor.",
              )}
            </p>
          )}
        </>
      )}

      <div aria-live="polite">
        {status && <p className="muted small">{status}</p>}
        {error && <p className="error">⚠ {error}</p>}
      </div>
      {busy && !rec && answers.length === 0 && <BuildCardSkeleton />}
      {stale && !busy && (
        <p className="stale-note" role="status">
          {t(
            "You changed the game since this build. Press “Recalculate build” to adapt it.",
            "Cambiaste la partida desde esta build. Pulsa «Recalcular build» para adaptarla.",
          )}
        </p>
      )}
      <div ref={result} />
      {rec?.card_error && (
        <section className={stale ? "panel analysis-only stale" : "panel analysis-only"}>
          <h4 className="panel-title">{t("Model analysis", "Análisis del modelo")}</h4>
          <div className="card-warnings">
            <p className="error small">
              {cardFailure(rec.card_error)}{" "}
              {t("Here is its analysis in the meantime.", "Aquí tienes su análisis mientras tanto.")}
            </p>
            {!stale && !busy && (
              <button className="secondary" onClick={recommend}>
                {t("Ask for another build", "Pedir otra build")}
              </button>
            )}
          </div>
          <p className="muted small">
            {t(
              "Unverified model text: any figures it mentions aren't checked.",
              "Texto del modelo sin verificar: las cifras que mencione no están comprobadas.",
            )}
          </p>
          <SafeMarkdown>{rec.analysis}</SafeMarkdown>
        </section>
      )}
      {rec && !rec.card_error && (
        <div className={stale ? "stale" : undefined}>
          <BuildCard
            trees={rec.trees}
            shards={rec.shards}
            champion={byId.get(rec.draft.champion)}
            lane={rec.draft.lane_opponent ? byId.get(rec.draft.lane_opponent) : undefined}
            role={rec.draft.role}
            roleLabel={ROLES.find((r) => r.id === rec.draft.role)?.label() ?? rec.draft.role}
            card={rec.card}
            patch={rec.patch}
            warnings={rec.warnings}
            incomplete={rec.incomplete}
            notes={rec.notes}
            analysis={rec.analysis}
            retried={rec.retried}
            onRetry={stale || busy ? undefined : recommend}
          />
        </div>
      )}

      {rec?.session_id && !stale && (
        <section className="follow-up">
          <h4>{t("Ask more about this game", "Preguntar más sobre esta partida")}</h4>
          {answers.map((x, i) => (
            <div key={i} className="qa">
              <p className="q">{x.q}</p>
              <div className="bubble assistant">
                <SafeMarkdown>{x.a}</SafeMarkdown>
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
              aria-label={t("Question about the build", "Pregunta sobre la build")}
              rows={2}
              placeholder={t(
                "What if their ADC gets ahead? When do I go for Herald?",
                "¿Y si su ADC se adelanta? ¿Cuándo voy por el Heraldo?",
              )}
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
              {t("Ask", "Preguntar")}
            </button>
          </form>
        </section>
      )}

      {picking && data && (
        <ChampionPicker
          champions={data.champions}
          taken={takenIds(d)}
          title={
            picking.team === "me"
              ? t("Your champion", "Tu campeón")
              : picking.team === "ally"
                ? t("Ally", "Aliado")
                : t("Enemy", "Rival")
          }
          onPick={pick}
          onClose={closePicker}
        />
      )}
    </section>
  );
}

export default DraftView;
