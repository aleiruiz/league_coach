import { useEffect, useMemo, useRef, useState } from "react";
import SafeMarkdown from "./SafeMarkdown";
import BuildCard, { BuildCardSkeleton } from "./BuildCard";
import ChampionPicker from "./ChampionPicker";
import { Champion, championAbilities, currentGame, Draft, gameData, GameData, recommendBuild, Recommendation, Role, ROLES, RuneTree, Shard } from "./game";
import { damageProfile } from "./draft";
import {
  allyRoles,
  applyLive,
  changeRole,
  DraftState,
  EMPTY_DRAFT,
  laneGuessed,
  laneOpponent,
  laneRow,
  ROLE_ORDER,
  setRole,
  sameDraft,
  setSlot,
  Slot,
  taken as takenIds,
  toDraft,
} from "./draft";
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
export function askContext(
  d: DraftState,
  rec: Result | null,
  byId: Map<string, Champion>,
  /** Riot's ability text for you and your lane opponent, if loaded. */
  abilities: string | null = null,
): AskContext | null {
  const me = d.me ? byId.get(d.me) : undefined;
  if (!me) return null;
  const name = (id: string | null) => (id ? (byId.get(id)?.name ?? id) : null);
  const role = ROLES.find((r) => r.id === d.role)?.label() ?? d.role;
  const lane = name(laneOpponent(d));
  const label = lane
    ? t(`${me.name} ${role.toLowerCase()} against ${lane}`, `${me.name} ${role.toLowerCase()} contra ${lane}`)
    : `${me.name} ${role.toLowerCase()}`;
  const list = (ids: (string | null)[]) => ids.map(name).filter(Boolean).join(", ");
  const lines = [
    t("Context from League Coach (not my question):", "Contexto de League Coach (no es mi pregunta):"),
    t(`I'm playing ${me.name} ${role}.`, `Juego ${me.name} ${role}.`),
    lane
      ? laneGuessed(d)
        ? t(`My lane opponent is probably ${lane} (guessed from the champions).`, `Mi rival de línea es probablemente ${lane} (deducido por los campeones).`)
        : t(`My lane opponent is ${lane}.`, `Mi rival de línea es ${lane}.`)
      : "",
    list(d.allies) ? t(`My team: ${list(d.allies)}.`, `Mi equipo: ${list(d.allies)}.`) : "",
    list(d.enemies) ? t(`Enemy team: ${list(d.enemies)}.`, `Equipo rival: ${list(d.enemies)}.`) : "",
    abilities ?? "",
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

/** Longest question sent with a build. */
const MAX_QUESTION = 300;

/** One-click questions for the build (planning ahead: never read from a game in progress). */
const questionPresets = () =>
  t(
    ["What if I fall behind?", "Do I need anti-heal?", "How do I win this lane?"],
    ["¿Y si voy por detrás?", "¿Necesito antisanación?", "¿Cómo gano esta línea?"],
  );

const roleName = (r: Role) => ROLES.find((x) => x.id === r)?.label() ?? r;
/** "jungle", "ADC": the role inside a sentence. */
const roleLower = (r: Role) => (r === "adc" ? "ADC" : roleName(r).toLowerCase());

/** "Fill from my game" found no champ select or game: a normal state, not an error. */
const NOT_IN_GAME = /^(You're not in|No estás en)/;

/** One row of a team, as in champ select: the champion's square, its role, its name. */
function TeamRow({
  side,
  role,
  champ,
  selected,
  me,
  lane,
  guessed,
  roles,
  myRole,
  onSelect,
  onClear,
  onSetRole,
}: {
  side: "ally" | "enemy";
  role: Role;
  champ: Champion | undefined;
  selected: boolean;
  me?: boolean;
  lane?: boolean;
  /** The row's role is guessed from the champion, not known. */
  guessed?: boolean;
  /** Roles this champion can be moved to (its team's rows). */
  roles?: Role[];
  /** Your role, to point out your lane among an enemy's roles. */
  myRole?: Role;
  onSelect: () => void;
  onClear?: () => void;
  onSetRole?: (role: Role) => void;
}) {
  const who = me ? t("You", "Tú") : side === "ally" ? t("Ally", "Aliado") : t("Enemy", "Rival");
  const roleText = guessed ? t(`Likely ${roleLower(role)}`, `${roleName(role)} probable`) : roleName(role);
  const label = `${who}, ${roleText}: ${champ ? champ.name : t("empty", "vacío")}`;
  // The role line is a picker on a filled row (not your own: your role is set
  // in the matchup). The row is a div with one button stretched over it, so
  // the picker can sit inside the row without nesting controls.
  const picker = onSetRole && champ && roles;
  return (
    <div className={`cs-row ${side}${selected ? " selected" : ""}${me ? " me" : ""}${lane ? " lane" : ""}${champ ? " filled" : ""}`}>
      <div className="cs-row-main">
        <button type="button" className="cs-row-hit" onClick={onSelect} aria-pressed={selected} aria-label={label} />
        {champ ? <img src={champ.image} alt="" /> : <span className="plus" aria-hidden="true">+</span>}
        <span className="cs-row-text">
          <span className="cs-row-role">
            {picker ? (
              <select
                className={`cs-role-select${guessed ? " cs-guess" : ""}`}
                value={role}
                onChange={(e) => onSetRole(e.target.value as Role)}
                aria-label={t(`${champ.name}'s role`, `Rol de ${champ.name}`)}
                title={
                  guessed
                    ? t("Guessed from the champion. Pick the right role if it's wrong.", "Deducido por el campeón. Elige el rol correcto si no es así.")
                    : t("Change this champion's role", "Cambia el rol de este campeón")
                }
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r === role ? roleText : roleName(r)}
                    {r === myRole && r !== role ? t(" (your lane)", " (tu línea)") : ""}
                  </option>
                ))}
              </select>
            ) : (
              <span className={guessed ? "cs-guess" : undefined}>{roleText}</span>
            )}
            {me && <span className="cs-badge you">{t("You", "Tú")}</span>}
            {lane && <span className="cs-badge lane">{t("Your lane", "Tu línea")}</span>}
            {selected && <span className="cs-badge picking">{t("Picking", "Eligiendo")}</span>}
          </span>
          <strong>{champ?.name ?? (me ? t("Pick your champion", "Elige tu campeón") : side === "ally" ? t("Add teammate", "Añadir aliado") : t("Add enemy", "Añadir rival"))}</strong>
        </span>
      </div>
      {onClear && champ && (
        <span className="cs-row-actions">
          <button type="button" className="slot-x" onClick={onClear} aria-label={t(`Remove ${champ.name}`, `Quitar ${champ.name}`)}>
            ×
          </button>
        </span>
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
  // The latest picks, for handlers that run after an await or a fast key press.
  const latest = useRef(d);
  latest.current = d;
  /** The slot the picker fills, as in champ select (null: nothing left to pick). */
  const [picking, setPicking] = useState<Slot | null>({ team: "me", index: 0 });
  /** Back on the picks while a build exists ("Change picks"). */
  const [editing, setEditing] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  /** Reading champ select / the live game (Refresh). */
  const [syncing, setSyncing] = useState(false);
  const [liveNote, setLiveNote] = useState<{ text: string; error: boolean } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rec, setRec] = useState<Result | null>(null);
  /** "Anything specific?": sent with the build as the player's notes. */
  const [question, setQuestion] = useState("");
  /** Riot's ability text for you and your lane opponent, for Ask. */
  const [abilities, setAbilities] = useState<string | null>(null);
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

  const kitIds = [d.me, laneOpponent(d)].filter((x): x is string => !!x).join(",");
  useEffect(() => {
    let current = true;
    setAbilities(null);
    if (kitIds && data)
      championAbilities(kitIds.split(","))
        .then((a) => current && setAbilities(a))
        // Without it Ask still works, just without Riot's ability text.
        .catch(() => {});
    return () => {
      current = false;
    };
  }, [kitIds, data]);

  // Ask the coach knows the picks and, once there is one, the build.
  useEffect(() => {
    onContext(askContext(d, rec && !stale ? rec : null, byId, abilities));
  }, [d, rec, stale, byId, lang, onContext, abilities]);

  function select(slot: Slot) {
    setPicking(slot);
    // In the stacked layout the grid is below the teams: bring it into view.
    requestAnimationFrame(() => {
      search.current?.closest(".picker")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      search.current?.focus({ preventScroll: true });
    });
  }

  /** After a pick, the next empty slot that matters most: you, your lane, then the rest by role. */
  function nextEmpty(s: DraftState): Slot | null {
    if (!s.me) return { team: "me", index: 0 };
    const lane = laneRow(s.role);
    if (!s.enemies[lane] && !laneOpponent(s)) return { team: "enemy", index: lane };
    const ally = s.allies.indexOf(null);
    if (ally >= 0) return { team: "ally", index: ally };
    const enemy = s.enemies.indexOf(null);
    return enemy >= 0 ? { team: "enemy", index: enemy } : null;
  }

  function pick(id: string) {
    if (!picking) return;
    const next = setSlot(latest.current, picking, id);
    setD(next);
    setPicking(nextEmpty(next));
  }

  /** Refresh: fill the slots from champ select or the game in progress. Never asks the model. */
  async function refreshFromGame() {
    if (!data || syncing) return;
    setSyncing(true);
    setLiveNote(null);
    try {
      const live = await currentGame();
      const ids = new Set(data.champions.map((c) => c.id));
      const next = applyLive(latest.current, live, (id) => ids.has(id), (id) => byId.get(id)?.tags ?? []);
      setD(next);
      setPicking(nextEmpty(next));
      const filled =
        live.source === "champ_select"
          ? t("Filled from your champ select. Press again as more picks lock in.", "Rellenado con tu selección de campeones. Vuelve a pulsar cuando se bloqueen más picks.")
          : t("Filled from your game in progress.", "Rellenado con tu partida en curso.");
      setLiveNote({ text: filled, error: false });
    } catch (e) {
      const text = String(e);
      setLiveNote(
        NOT_IN_GAME.test(text)
          ? { text: t("Not in champion select right now. Click a slot and pick by hand.", "No estás en selección de campeones ahora mismo. Haz clic en una casilla y elige a mano."), error: false }
          : { text: humanizeError(text), error: true },
      );
    } finally {
      setSyncing(false);
    }
  }

  function reset() {
    setD(EMPTY_DRAFT);
    setPicking({ team: "me", index: 0 });
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
      const asked = question.trim().slice(0, MAX_QUESTION) || null;
      const r = await recommendBuild(usedKind, { ...draft, notes: asked }, id, (ev) => {
        if (ev.type === "status") setStatus(ev.text);
      });
      setRec({ ...r, kind: usedKind, draft: { ...draft, notes: asked }, trees: data?.rune_trees ?? [], shards: data?.shards ?? [] });
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
  const me = champ(d.me);
  const laneId = laneOpponent(d);
  const lane = champ(laneId);
  const taken = takenIds(d);
  const pickingTitle = (p: Slot) => {
    if (p.team === "me") return t("Picking your champion", "Eligiendo tu campeón");
    const role = p.team === "ally" ? allyRoles(d.role)[p.index] : ROLE_ORDER[p.index];
    const r = role === "adc" ? "ADC" : roleName(role).toLowerCase();
    return p.team === "ally" ? t(`Picking your team's ${r}`, `Eligiendo el ${r} de tu equipo`) : t(`Picking the enemy ${r}`, `Eligiendo el ${r} rival`);
  };
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
              <p className={liveNote?.error ? "error small" : "muted"} role="status">
                {liveNote?.text ??
                  t("Click a slot and pick, or fill both teams from your champ select.", "Haz clic en una casilla y elige, o rellena ambos equipos con tu selección de campeones.")}
                {/* Roles guessed from the champions: say so, and how to fix one. */}
                {d.guessed.enemies.some((g, i) => g && d.enemies[i]) &&
                  ` ${t("Enemy roles are guessed from their champions; pick the right role on any that's wrong.", "Los roles rivales se deducen por sus campeones; si alguno está mal, elige su rol en la casilla.")}`}
              </p>
            </div>
            <div className="cs-head-actions">
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
            </div>
          </header>
          {data.notice && <p className="muted small">{data.notice}</p>}

          <div className="cs">
            <section className="cs-team ally" aria-labelledby="cs-ally">
              <h3 id="cs-ally">{t("Your team", "Tu equipo")}</h3>
              {ROLE_ORDER.map((r) => {
                if (r === d.role) {
                  return (
                    <TeamRow
                      key={r}
                      side="ally"
                      role={r}
                      me
                      champ={champ(d.me)}
                      selected={picking?.team === "me"}
                      onSelect={() => select({ team: "me", index: 0 })}
                      onClear={() => setD((s) => setSlot(s, { team: "me", index: 0 }, null))}
                    />
                  );
                }
                const i = allyRoles(d.role).indexOf(r);
                return (
                  <TeamRow
                    key={r}
                    side="ally"
                    role={r}
                    champ={champ(d.allies[i])}
                    guessed={!!d.allies[i] && d.guessed.allies[i]}
                    roles={allyRoles(d.role)}
                    selected={picking?.team === "ally" && picking.index === i}
                    onSelect={() => select({ team: "ally", index: i })}
                    onClear={() => setD((s) => setSlot(s, { team: "ally", index: i }, null))}
                    onSetRole={(role) => setD((s) => setRole(s, "ally", i, role))}
                  />
                );
              })}
            </section>

            <div className="cs-center">
              <section className="cs-matchup" aria-label={t("Your matchup", "Tu enfrentamiento")}>
                <div className="cs-vs">
                  <span className={`cs-face me${me ? "" : " empty"}`}>{me ? <img src={me.image} alt="" /> : "+"}</span>
                  <span className="cs-vs-text">
                    <span className="cs-you-line muted small">
                      {t("You", "Tú")} ·{" "}
                      <select
                        id="cs-role"
                        className="cs-role"
                        aria-label={t("Your role", "Tu rol")}
                        value={d.role}
                        onChange={(e) => {
                          const role = e.currentTarget.value as Role;
                          setD((s) => changeRole(s, role));
                        }}
                      >
                        {ROLES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label()}
                          </option>
                        ))}
                      </select>
                    </span>
                    {me ? <strong>{me.name}</strong> : <span className="cs-placeholder">{t("Your champion", "Tu campeón")}</span>}
                  </span>
                  <span className="muted cs-against">{t("against", "contra")}</span>
                  <span className={`cs-face enemy${lane ? "" : " empty"}`}>{lane ? <img src={lane.image} alt="" /> : "?"}</span>
                  <span className="cs-vs-text">
                    <span className="small cs-lane-label">{d.role === "jungle" ? t("Enemy jungler", "Jungla rival") : t("Your lane", "Tu línea")}</span>
                    {lane ? <strong className="cs-lane-name">{lane.name}</strong> : <span className="cs-placeholder">{t("Not picked", "Sin elegir")}</span>}
                  </span>
                </div>
                <div className="cs-build">
                  <label className="cs-question">
                    <span className="small">{t("Anything specific? (optional)", "¿Algo en concreto? (opcional)")}</span>
                    <input
                      type="text"
                      value={question}
                      maxLength={MAX_QUESTION}
                      disabled={busy}
                      placeholder={t("e.g. what if I fall behind?", "p. ej. ¿y si voy por detrás?")}
                      onChange={(e) => setQuestion(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing && draft && kind && !busy) recommend();
                      }}
                    />
                  </label>
                  <div className="cs-presets" role="group" aria-label={t("Common questions", "Preguntas frecuentes")}>
                    {questionPresets().map((q) => (
                      <button key={q} type="button" className={`chip${question === q ? " on" : ""}`} aria-pressed={question === q} disabled={busy} onClick={() => setQuestion(question === q ? "" : q)}>
                        {q}
                      </button>
                    ))}
                  </div>
                  {getBuild}
                  <span className="muted small">
                    {!d.me
                      ? t("Pick at least your champion.", "Elige al menos tu campeón.")
                      : busy
                        ? (status ?? t("Preparing the build…", "Preparando la build…"))
                        : t("About 20 seconds. Adapts to everyone picked.", "Unos 20 segundos. Se adapta a todos los elegidos.")}
                  </span>
                  {rec && !busy && (
                    <button type="button" className="link-button" onClick={() => setEditing(false)}>
                      {stale ? t("See the previous build", "Ver la build anterior") : t("Back to your build", "Volver a tu build")}
                    </button>
                  )}
                </div>
              </section>
              <div aria-live="polite">{error && <p className="error">⚠ {error}</p>}</div>
              {busy && !rec ? (
                <BuildCardSkeleton />
              ) : picking ? (
                <ChampionPicker
                  inline
                  searchRef={search}
                  champions={data.champions}
                  taken={takenIds(d)}
                  title={pickingTitle(picking)}
                  onPick={pick}
                />
              ) : (
                <p className="muted cs-done">
                  {t("Both teams are in. Click any slot to change it.", "Ambos equipos están listos. Haz clic en una casilla para cambiarla.")}{" "}
                  <button type="button" className="link-button" onClick={reset} disabled={busy}>
                    {t("Clear all", "Borrar todo")}
                  </button>
                </p>
              )}
            </div>

            <section className="cs-team enemy" aria-labelledby="cs-enemy">
              <h3 id="cs-enemy">{t("Enemy team", "Equipo rival")}</h3>
              {ROLE_ORDER.map((r, i) => {
                const id = d.enemies[i];
                const isLane = !!id && id === laneId;
                return (
                  <TeamRow
                    key={r}
                    side="enemy"
                    role={r}
                    champ={champ(id)}
                    lane={isLane}
                    guessed={!!id && d.guessed.enemies[i]}
                    roles={ROLE_ORDER}
                    myRole={d.role}
                    selected={picking?.team === "enemy" && picking.index === i}
                    onSelect={() => select({ team: "enemy", index: i })}
                    onClear={() => setD((s) => setSlot(s, { team: "enemy", index: i }, null))}
                    onSetRole={(role) => setD((s) => setRole(s, "enemy", i, role))}
                  />
                );
              })}
              <DamageBar champs={d.enemies.flatMap((e) => (e && byId.get(e) ? [byId.get(e)!] : []))} />
              {taken.size > 1 && (
                <button type="button" className="link-button cs-clear" onClick={reset} disabled={busy}>
                  {t("Clear all", "Borrar todo")}
                </button>
              )}
            </section>
          </div>
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

    </section>
  );
}

export default DraftView;
