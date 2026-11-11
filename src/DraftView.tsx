import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SafeMarkdown from "./SafeMarkdown";
import BuildCard, { BuildCardSkeleton } from "./BuildCard";
import ChampionPicker from "./ChampionPicker";
import { Champion, currentGame, Draft, gameData, GameData, recommendBuild, Recommendation, ROLES, RuneTree, Shard } from "./game";
import { damageProfile } from "./draft";
import { applyLive, DraftState, EMPTY_DRAFT, otherEnemies, sameDraft, setLane, setSlot, Slot, taken as takenIds, toDraft } from "./draft";

/** A slot of the teams, or step 3 (the lane opponent). */
type Pick = Slot | { team: "lane"; index: 0 };
import { cancelPrompt, humanizeError, pickKind, ProviderKind } from "./providers";
import { AskButton, type AskContext } from "./AskPanel";
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

/** "Jax top against Darius" and what the AI should know about the game and its build. */
export function askContext(d: DraftState, rec: Result | null, byId: Map<string, Champion>): AskContext | null {
  const me = d.me ? byId.get(d.me) : undefined;
  if (!me) return null;
  const name = (id: string | null) => (id ? (byId.get(id)?.name ?? id) : null);
  const role = ROLES.find((r) => r.id === d.role)?.label() ?? d.role;
  const lane = name(d.lane);
  const label = lane
    ? t(`${me.name} ${role.toLowerCase()} against ${lane}`, `${me.name} ${role.toLowerCase()} contra ${lane}`)
    : `${me.name} ${role.toLowerCase()}`;
  const list = (ids: (string | null)[]) => ids.map(name).filter(Boolean).join(", ");
  const lines = [
    t("Context from League Coach (not my question):", "Contexto de League Coach (no es mi pregunta):"),
    t(`I'm playing ${me.name} ${role}.`, `Juego ${me.name} ${role}.`),
    lane ? t(`My lane opponent is ${lane}.`, `Mi rival de línea es ${lane}.`) : "",
    list(d.allies) ? t(`My team: ${list(d.allies)}.`, `Mi equipo: ${list(d.allies)}.`) : "",
    list(d.enemies) ? t(`Enemy team: ${list(d.enemies)}.`, `Equipo rival: ${list(d.enemies)}.`) : "",
  ];
  if (rec && !rec.card_error) {
    const c = rec.card;
    const items = [...c.core_items, ...(c.boots.name ? [c.boots] : [])].map((r) => r.name).join(", ");
    lines.push(
      t(
        `The build you gave me: ${c.runes.keystone.name} (${c.runes.primary_tree.name}/${c.runes.secondary_tree.name}), ${c.summoner_spells.map((r) => r.name).join(" + ")}, items in order: ${items}. Skill max order: ${c.skill_order.max.join(" > ")}.`,
        `La build que me diste: ${c.runes.keystone.name} (${c.runes.primary_tree.name}/${c.runes.secondary_tree.name}), ${c.summoner_spells.map((r) => r.name).join(" + ")}, objetos en orden: ${items}. Orden de maximizar: ${c.skill_order.max.join(" > ")}.`,
      ),
    );
  }
  lines.push(
    t(
      "Answer in plain text (not JSON), short and direct, as a few bullets.",
      "Responde en texto normal (no JSON), corto y directo, en unas pocas viñetas.",
    ),
  );
  return {
    label,
    image: me.image,
    prompt: lines.filter(Boolean).join("\n"),
    suggestions: t(
      ["How do I play levels 1 to 3?", "When is my power spike?", "Where is their jungler likely to start?", "What does this matchup punish?"],
      ["¿Cómo juego los niveles 1 a 3?", "¿Cuándo es mi pico de poder?", "¿Por dónde suele empezar su jungla?", "¿Qué castiga este enfrentamiento?"],
    ),
  };
}

/** Step 3's title: a jungler has no lane, it faces the other jungler. */
function laneTitle(role: string): string {
  return role === "jungle" ? t("Enemy jungler", "Jungla rival") : t("Who you lane against", "Contra quién vas en línea");
}

/** Steps 1 and 3: a big card with the champion, or a call to pick one. */
function BigPick({ champ, empty, tone, onClick, onClear }: {
  champ: Champion | undefined;
  empty: string;
  tone: "me" | "enemy";
  onClick: () => void;
  onClear?: () => void;
}) {
  return (
    <div className={`big-pick ${tone}${champ ? " filled" : ""}`}>
      <button type="button" className="big-pick-main" onClick={onClick} aria-label={champ ? t(`${champ.name}. Change`, `${champ.name}. Cambiar`) : empty}>
        {champ ? <img src={champ.image} alt="" /> : <span className="plus">+</span>}
        <span className="big-pick-text">
          <strong>{champ?.name ?? empty}</strong>
          {champ && <span className="muted small">{t("Click to change", "Clic para cambiar")}</span>}
        </span>
      </button>
      {champ && onClear && (
        <button type="button" className="slot-x" onClick={onClear} aria-label={t(`Remove ${champ.name}`, `Quitar ${champ.name}`)}>
          ×
        </button>
      )}
    </div>
  );
}

/** One of the optional teammates or enemies: a small square. */
function MiniPick({ champ, label, onClick, onClear }: {
  champ: Champion | undefined;
  label: string;
  onClick: () => void;
  onClear: () => void;
}) {
  return (
    <div className={champ ? "mini-pick filled" : "mini-pick"}>
      <button
        type="button"
        className="mini-pick-main"
        onClick={onClick}
        title={champ?.name ?? label}
        aria-label={champ ? t(`${label}: ${champ.name}. Change`, `${label}: ${champ.name}. Cambiar`) : t(`Add ${label.toLowerCase()}`, `Añadir ${label.toLowerCase()}`)}
      >
        {champ ? <img src={champ.image} alt="" /> : <span className="plus">+</span>}
      </button>
      {champ && (
        <button type="button" className="slot-x" onClick={onClear} aria-label={t(`Remove ${champ.name}`, `Quitar ${champ.name}`)}>
          ×
        </button>
      )}
    </div>
  );
}

/** Estimated split of enemy damage (from Riot's ratings, not from stats). */
function DamageBar({ champs }: { champs: Champion[] }) {
  // One champion says nothing about a team.
  if (champs.length < 2) return null;
  const p = damageProfile(champs);
  return (
    <div className="dmg" title={t("Estimated from each champion's damage ratings", "Estimado con las valoraciones de daño de cada campeón")}>
      <div className="dmg-bar" aria-hidden="true">
        <span className="ad" style={{ flexGrow: p.ad }} />
        <span className="ap" style={{ flexGrow: p.ap }} />
        <span className="mixed" style={{ flexGrow: p.mixed }} />
      </div>
      <p className="dmg-legend small">
        <span className="muted">{t("Enemy damage:", "Daño rival:")}</span>{" "}
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
  onPatch,
  onAsk,
  onContext,
}: {
  providers: ProvidersState;
  lang: Lang;
  onBusy: (busy: boolean) => void;
  onGoToModels: () => void;
  /** Tells the sidebar which patch the champion data is from. */
  onPatch?: (patch: string) => void;
  /** Opens "Ask the coach". */
  onAsk: () => void;
  /** What Ask should know about this screen (null: nothing picked yet). */
  onContext: (c: AskContext | null) => void;
}) {
  const ready = useMemo(() => providers.list.filter((p) => p.logged_in), [providers.list]);
  const [kind, setKind] = useState<ProviderKind | null>(null);
  const [data, setData] = useState<GameData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  const [d, setD] = useState<DraftState>(EMPTY_DRAFT);
  const [picking, setPicking] = useState<Pick | null>(null);
  /** Back on the three picks while a build exists ("Change picks"). */
  const [editing, setEditing] = useState(false);
  // To give focus back to the slot when the picker closes.
  const opener = useRef<HTMLElement | null>(null);

  const [busy, setBusy] = useState(false);
  /** Reading champ select / the live game (Refresh). */
  const [syncing, setSyncing] = useState(false);
  const [liveNote, setLiveNote] = useState<{ text: string; error: boolean } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rec, setRec] = useState<Result | null>(null);
  const requestId = useRef<string | null>(null);
  const top = useRef<HTMLElement>(null);
  // The build replaces the picks (and back): start at the top of the screen.
  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, [rec, editing]);

  useEffect(() => {
    // Reloads when the language changes: names come in the new locale.
    let current = true;
    setDataError(null);
    gameData()
      .then((g) => {
        if (!current) return;
        setData(g);
        onPatch?.(g.patch);
      })
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

  // Ask the coach knows the picks and, once there is one, the build.
  useEffect(() => {
    onContext(askContext(d, rec && !stale ? rec : null, byId));
  }, [d, rec, stale, byId, lang, onContext]);

  function openPicker(slot: Pick) {
    opener.current = document.activeElement as HTMLElement | null;
    setPicking(slot);
  }

  const closePicker = useCallback(() => {
    setPicking(null);
    requestAnimationFrame(() => opener.current?.focus());
  }, []);

  function pick(id: string) {
    if (!picking) return;
    const slot = picking;
    setD((s) => (slot.team === "lane" ? setLane(s, id) : setSlot(s, slot, id)));
    closePicker();
  }

  /** Refresh: fill the slots from champ select or the game in progress. Never asks the model. */
  async function refreshFromGame() {
    if (!data || syncing) return;
    setSyncing(true);
    setLiveNote(null);
    try {
      const live = await currentGame();
      const ids = new Set(data.champions.map((c) => c.id));
      setD((s) => applyLive(s, live, (id) => ids.has(id)));
      setLiveNote({
        text:
          live.source === "champ_select"
            ? t(
                "Filled from your champ select. Press again as more picks lock in.",
                "Rellenado con tu selección de campeones. Vuelve a pulsar cuando se bloqueen más picks.",
              )
            : t("Filled from your game in progress.", "Rellenado con tu partida en curso."),
        error: false,
      });
    } catch (e) {
      setLiveNote({ text: humanizeError(String(e)), error: true });
    } finally {
      setSyncing(false);
    }
  }

  function reset() {
    setD(EMPTY_DRAFT);
    setLiveNote(null);
    setRec(null);
    setError(null);
    setEditing(false);
  }

  async function recommend() {
    if (!draft || !kind || busy) return;
    const usedKind = kind;
    const id = crypto.randomUUID();
    requestId.current = id;
    setBusy(true);
    setError(null);
    setRec(null);
    setStatus(t("Preparing the build…", "Preparando la build…"));
    try {
      const r = await recommendBuild(usedKind, draft, id, (ev) => {
        if (ev.type === "status") setStatus(ev.text);
      });
      setRec({ ...r, kind: usedKind, draft, trees: data?.rune_trees ?? [], shards: data?.shards ?? [] });
      setEditing(false);
    } catch (e) {
      setError(humanizeError(String(e)));
    } finally {
      requestId.current = null;
      setBusy(false);
      setStatus(null);
    }
  }

  if (!ready.length && !providers.loading) {
    return (
      <section>
        <h2>{t("Next game", "Próxima partida")}</h2>
        <p className="muted">{t("Connect Claude or ChatGPT to get builds.", "Conecta Claude o ChatGPT para recibir builds.")}</p>
        <button onClick={onGoToModels}>{t("Connect an AI", "Conectar una IA")}</button>
      </section>
    );
  }

  const champ = (id: string | null) => (id ? byId.get(id) : undefined);
  const showSheet = !!rec && !editing;
  const getBuild = busy ? (
    <button className="danger big-button" onClick={() => requestId.current && cancelPrompt(requestId.current)}>
      {t("Stop", "Detener")}
    </button>
  ) : (
    <button className="primary big-button" onClick={recommend} disabled={!draft || !kind}>
      {rec && stale ? t("Get new build", "Pedir build nueva") : t("Get build", "Ver build")}
    </button>
  );

  return (
    <section className="draft" ref={top}>
      {dataError && (
        <p className="error">
          {t("Couldn't load the patch data:", "No pude cargar los datos del parche:")} {dataError}
        </p>
      )}
      {!data && !dataError && <p className="muted">{t("Loading the patch's champions…", "Cargando campeones del parche…")}</p>}

      {data && !showSheet && (
        <>
          <header className="moment-head">
            <div>
              <h2>{t("Next game", "Próxima partida")}</h2>
              <p className="muted">{t("Three picks and you get your build.", "Tres elecciones y tienes tu build.")}</p>
            </div>
            <button
              className="secondary"
              onClick={refreshFromGame}
              disabled={busy || syncing}
              title={t(
                "Fill the champions from your champ select (League client on this computer) or your game in progress (Riot API). It doesn't ask the coach anything.",
                "Rellena los campeones con tu selección de campeones (cliente de League en esta computadora) o tu partida en curso (API de Riot). No le pregunta nada al coach.",
              )}
            >
              {syncing ? t("Reading…", "Leyendo…") : t("Fill from my game", "Rellenar con mi partida")}
            </button>
            <AskButton onClick={onAsk} />
          </header>
          {liveNote && (
            <p className={liveNote.error ? "error small" : "muted small"} role="status">
              {liveNote.text}
            </p>
          )}
          {data.notice && <p className="muted small">{data.notice}</p>}

          <div className="picks">
            <div className="pick-step">
              <h3 className="step-title">
                <span className="step-num">1</span> {t("Your champion", "Tu campeón")}
              </h3>
              <BigPick
                champ={champ(d.me)}
                empty={t("Pick your champion", "Elige tu campeón")}
                tone="me"
                onClick={() => openPicker({ team: "me", index: 0 })}
              />
            </div>
            <div className="pick-step">
              <h3 className="step-title" id="role-title">
                <span className="step-num">2</span> {t("Your role", "Tu rol")}
              </h3>
              <div className="role-chips" role="radiogroup" aria-labelledby="role-title">
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    role="radio"
                    aria-checked={d.role === r.id}
                    className={d.role === r.id ? "chip on" : "chip"}
                    onClick={() => setD((s) => ({ ...s, role: r.id }))}
                  >
                    {r.label()}
                  </button>
                ))}
              </div>
            </div>
            <div className="pick-step">
              <h3 className="step-title">
                <span className="step-num">3</span> {laneTitle(d.role)}
              </h3>
              <BigPick
                champ={champ(d.lane)}
                empty={d.role === "jungle" ? t("Pick the enemy jungler", "Elige al jungla rival") : t("Pick your lane opponent", "Elige a tu rival de línea")}
                tone="enemy"
                onClick={() => openPicker({ team: "lane", index: 0 })}
                onClear={d.lane ? () => setD((s) => setLane(s, null)) : undefined}
              />
            </div>
          </div>

          <div className="get-build">
            {getBuild}
            <span className="muted small">
              {!d.me
                ? t("Pick at least your champion.", "Elige al menos tu campeón.")
                : busy
                  ? status ?? t("Preparing the build…", "Preparando la build…")
                  : t("Takes about 20 seconds.", "Tarda unos 20 segundos.")}
            </span>
            {rec && !busy && (
              <button type="button" className="link-button" onClick={() => setEditing(false)}>
                {stale ? t("See the previous build", "Ver la build anterior") : t("Back to your build", "Volver a tu build")}
              </button>
            )}
          </div>
          <div aria-live="polite">{error && <p className="error">⚠ {error}</p>}</div>
          {busy && !rec && <BuildCardSkeleton />}

          <section className="rest" aria-labelledby="rest-title">
            <div className="rest-head">
              <div>
                <h3 id="rest-title">
                  {t("Add the rest of both teams", "Añade el resto de ambos equipos")}{" "}
                  <span className="muted">{t("(optional)", "(opcional)")}</span>
                </h3>
                <p className="muted small">{t("The build adapts to who else is in the game.", "La build se adapta a quién más está en la partida.")}</p>
              </div>
              <div className="rest-actions">
                <button type="button" className="link-button" onClick={reset} disabled={busy}>
                  {t("Clear all", "Borrar todo")}
                </button>
              </div>
            </div>

            <div className="rest-teams">
              <div>
                <h4 className="ally-t">{t("Your team", "Tu equipo")}</h4>
                <div className="mini-slots">
                  {d.allies.map((a, i) => (
                    <MiniPick
                      key={i}
                      champ={champ(a)}
                      label={t("Ally", "Aliado")}
                      onClick={() => openPicker({ team: "ally", index: i })}
                      onClear={() => setD((s) => setSlot(s, { team: "ally", index: i }, null))}
                    />
                  ))}
                </div>
              </div>
              <div>
                <h4 className="enemy-t">{t("Enemy team", "Equipo rival")}</h4>
                <div className="mini-slots">
                  {otherEnemies(d).map(({ id, index }) => (
                    <MiniPick
                      key={index}
                      champ={champ(id)}
                      label={t("Enemy", "Rival")}
                      onClick={() => openPicker({ team: "enemy", index })}
                      onClear={() => setD((s) => setSlot(s, { team: "enemy", index }, null))}
                    />
                  ))}
                </div>
                <DamageBar champs={d.enemies.flatMap((e) => (e && byId.get(e) ? [byId.get(e)!] : []))} />
              </div>
            </div>
          </section>
        </>
      )}

      {showSheet && (
        <>
          {stale && (
            <div className="stale-note" role="status">
              <span>
                {t(
                  "Your picks changed since this build, so it may not fit anymore.",
                  "Tus picks cambiaron desde esta build, así que puede que ya no encaje.",
                )}
              </span>
              {!busy && (
                <button type="button" className="primary" onClick={recommend} disabled={!draft || !kind}>
                  {t("Get new build", "Pedir build nueva")}
                </button>
              )}
            </div>
          )}
          <div aria-live="polite">
            {busy && status && <p className="muted small">{status}</p>}
            {error && <p className="error">⚠ {error}</p>}
          </div>
          {rec.card_error ? (
            <section className="panel analysis-only">
              <h4 className="panel-title">{t("The AI's analysis", "El análisis de la IA")}</h4>
              <div className="card-warnings">
                <p className="error small">
                  {cardFailure(rec.card_error)} {t("Here is its analysis in the meantime.", "Aquí tienes su análisis mientras tanto.")}
                </p>
                {!busy && (
                  <button className="secondary" onClick={recommend}>
                    {t("Get a different build", "Pedir otra build")}
                  </button>
                )}
                <button type="button" className="link-button" onClick={() => setEditing(true)}>
                  {t("Change picks", "Cambiar picks")}
                </button>
              </div>
              <p className="muted small">
                {t(
                  "Unverified AI text: any figures it mentions aren't checked.",
                  "Texto de la IA sin verificar: las cifras que mencione no están comprobadas.",
                )}
              </p>
              <SafeMarkdown>{rec.analysis}</SafeMarkdown>
            </section>
          ) : (
            <BuildCard
              trees={rec.trees}
              shards={rec.shards}
              champion={byId.get(rec.draft.champion)}
              lane={rec.draft.lane_opponent ? byId.get(rec.draft.lane_opponent) : undefined}
              roleLabel={ROLES.find((r) => r.id === rec.draft.role)?.label() ?? rec.draft.role}
              card={rec.card}
              patch={rec.patch}
              warnings={rec.warnings}
              incomplete={rec.incomplete}
              notes={rec.notes}
              analysis={rec.analysis}
              retried={rec.retried}
              onRetry={busy || stale ? undefined : recommend}
              onChangePicks={() => setEditing(true)}
              onAsk={onAsk}
            />
          )}

        </>
      )}

      {picking && data && (
        <ChampionPicker
          champions={data.champions}
          taken={
            picking.team === "lane"
              ? // An enemy already in the team can become the lane opponent.
                new Set([d.me, ...d.allies].filter((x): x is string => !!x))
              : takenIds(d)
          }
          title={
            picking.team === "me"
              ? t("Your champion", "Tu campeón")
              : picking.team === "lane"
                ? laneTitle(d.role)
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
