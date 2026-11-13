import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ProvidersState } from "./App";
import ChampionPicker from "./ChampionPicker";
import { Champion, gameData, Role, ROLES } from "./game";
import { GameStats, matchHistory } from "./history";
import { record } from "./gameRows";
import {
  byTier,
  fetchTierList,
  loadPins,
  loadRole,
  Main,
  mains as pickMains,
  MAIN_MIN_GAMES,
  MAX_PINS,
  savedTierLists,
  savePins,
  saveRole,
  TierList,
  usualRole,
} from "./tierList";
import { RoleIcon } from "./icons";
import { Lang, t } from "./i18n";
import { cancelPrompt, humanizeError } from "./providers";

type Props = {
  providers: ProvidersState;
  lang: Lang;
  /** Bumped when the Riot account or the games change. */
  version: number;
  onBusy: (busy: boolean) => void;
  onGoToSettings: () => void;
};

const roleLabel = (r: Role) => ROLES.find((x) => x.id === r)?.label() ?? r;

function Face({ c, size }: { c: Champion | undefined; size: number }) {
  return c ? (
    <img className="ch-face" src={c.image} alt="" width={size} height={size} />
  ) : (
    <span className="ch-face icon-missing" style={{ width: size, height: size }} aria-hidden="true" />
  );
}

const pct = (v: number | null, lang: Lang) =>
  v === null ? "–" : `${v.toLocaleString(lang === "es" ? "es-MX" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function MainCard({
  m,
  champ,
  tierHere,
  lang,
  onUnpin,
}: {
  m: Main;
  champ: Champion | undefined;
  tierHere: { tier: string; role: Role } | null;
  lang: Lang;
  onUnpin: () => void;
}) {
  const name = champ?.name ?? m.champion;
  return (
    <li className={m.pinned ? "ch-main pinned" : "ch-main"}>
      <Face c={champ} size={48} />
      <div className="ch-main-text">
        <strong>{name}</strong>
        <span className="muted small">{m.games === 0 ? t("Pinned, no games yet", "Fijado, aún sin partidas") : record(m.wins, m.games - m.wins)}</span>
        {m.games > 0 && (
          <span className="muted small">
            {[
              m.games === 1 ? t("1 game", "1 partida") : t(`${m.games} games`, `${m.games} partidas`),
              m.role ? roleLabel(m.role) : null,
              m.kda !== null ? `KDA ${m.kda.toLocaleString(lang === "es" ? "es-MX" : "en-US", { maximumFractionDigits: 1 })}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>
      <div className="ch-main-side">
        {tierHere && (
          <span className="tier" title={t(`Tier in ${roleLabel(tierHere.role)} on the tier list below`, `Tier en ${roleLabel(tierHere.role)} en la tier list de abajo`)}>
            {tierHere.tier}
          </span>
        )}
        {tierHere && tierHere.role !== m.role && (
          <span className="muted small">{t(`in ${roleLabel(tierHere.role)}`, `en ${roleLabel(tierHere.role)}`)}</span>
        )}
        {m.pinned && (
          <button type="button" className="link-button small" onClick={onUnpin} aria-label={t(`Unpin ${name}`, `Desfijar a ${name}`)}>
            {t("Unpin", "Desfijar")}
          </button>
        )}
      </div>
    </li>
  );
}

function Champions({ providers, lang, version, onBusy, onGoToSettings }: Props) {
  const [champs, setChamps] = useState<Champion[]>([]);
  const [patch, setPatch] = useState<string | null>(null);
  const [games, setGames] = useState<GameStats[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [pins, setPins] = useState<string[]>(loadPins);
  const [picking, setPicking] = useState(false);
  const [lists, setLists] = useState<Partial<Record<Role, TierList>>>({});
  const [role, setRoleState] = useState<Role | null>(loadRole);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    gameData()
      .then((d) => {
        setChamps(d.champions);
        setPatch(d.patch);
      })
      .catch(() => {});
  }, [lang]);
  useEffect(() => {
    matchHistory()
      .then((h) => {
        setGames(h.games);
        setConfigured(h.configured);
      })
      .catch(() => setConfigured(false));
  }, [version]);
  useEffect(() => {
    savedTierLists()
      .then(setLists)
      .catch(() => {});
  }, []);
  useEffect(() => onBusy(busy), [busy, onBusy]);

  const byId = useMemo(() => new Map(champs.map((c) => [c.id.toLowerCase(), c])), [champs]);
  const champ = (id: string) => byId.get(id.toLowerCase());
  const mains = useMemo(() => pickMains(games, pins), [games, pins]);
  const shownRole: Role = role ?? usualRole(games) ?? mains.find((m) => m.role)?.role ?? "mid";
  const list = lists[shownRole];
  const mainIds = new Set(mains.map((m) => m.champion.toLowerCase()));
  const claude = providers.list.find((p) => p.kind === "claude_code" && p.logged_in);

  const setPinsSaved = (next: string[]) => {
    setPins(next);
    savePins(next);
  };
  const setRole = (r: Role) => {
    setRoleState(r);
    saveRole(r);
    setError(null);
  };

  /** A main's tier: in the list for its own role if it's been read, else in the one on screen. */
  const tierOf = (m: Main): { tier: string; role: Role } | null => {
    for (const r of [m.role, shownRole]) {
      const e = r ? lists[r]?.entries.find((x) => x.champion.toLowerCase() === m.champion.toLowerCase()) : undefined;
      if (r && e) return { tier: e.tier, role: r };
    }
    return null;
  };

  const getList = useCallback(async () => {
    if (!claude) return;
    const id = crypto.randomUUID();
    requestId.current = id;
    const forRole = shownRole;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const l = await fetchTierList(claude.kind, forRole, id, (ev) => {
        if (ev.type === "status") setStatus(ev.text);
      });
      setLists((s) => ({ ...s, [forRole]: l }));
    } catch (e) {
      setError(humanizeError(String(e)));
    } finally {
      requestId.current = null;
      setBusy(false);
      setStatus(null);
    }
  }, [claude, shownRole]);

  const dateText = (ms: number) =>
    new Date(ms).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" });
  const stale = !!list && !!patch && list.app_patch !== patch;
  const otherPagePatch = !!list && !!list.patch && !!patch && list.patch !== patch;

  return (
    <section className="champions" aria-busy={busy}>
      <header className="moment-head">
        <div>
          <h2>{t("Champions", "Campeones")}</h2>
          <p className="muted">
            {t("This patch's tier list and the champions you play most.", "La tier list de este parche y los campeones que más juegas.")}
          </p>
        </div>
      </header>

      <section className="panel ch-mains" aria-labelledby="mains-title">
        <div className="ch-panel-head">
          <h3 id="mains-title" className="panel-title">
            {t("Your mains", "Tus mains")}
          </h3>
          <button type="button" className="secondary" onClick={() => setPicking(true)} disabled={champs.length === 0 || pins.length >= MAX_PINS}
            title={pins.length >= MAX_PINS ? t(`Up to ${MAX_PINS} pinned champions`, `Hasta ${MAX_PINS} campeones fijados`) : undefined}
          >
            {t("Pin a champion", "Fijar un campeón")}
          </button>
        </div>
        {configured === false && pins.length === 0 && (
          <p className="muted">
            {t(
              "Add your Riot ID in Settings to see the champions you play most, or pin them yourself.",
              "Agrega tu Riot ID en Ajustes para ver los campeones que más juegas, o fíjalos tú.",
            )}{" "}
            <button type="button" className="link-button" onClick={onGoToSettings}>
              {t("Open Settings", "Abrir Ajustes")}
            </button>
          </p>
        )}
        {configured && mains.length === 0 && (
          <p className="muted">
            {t(
              `No champion with ${MAIN_MIN_GAMES} or more games yet. Update in Games after you play, or pin your mains.`,
              `Aún no hay campeones con ${MAIN_MIN_GAMES} partidas o más. Actualiza en Partidas cuando juegues, o fija tus mains.`,
            )}
          </p>
        )}
        {mains.length > 0 && (
          <>
            <ul className="ch-main-list">
              {mains.map((m) => (
                <MainCard
                  key={m.champion}
                  m={m}
                  champ={champ(m.champion)}
                  tierHere={tierOf(m)}
                  lang={lang}
                  onUnpin={() => setPinsSaved(pins.filter((p) => p !== m.champion))}
                />
              ))}
            </ul>
            {games.length > 0 && (
              <p className="muted small">
                {t(
                  `From your last ${games.length} games${pins.length ? ", pinned ones first" : ""}.`,
                  `De tus últimas ${games.length} partidas${pins.length ? ", primero los fijados" : ""}.`,
                )}
              </p>
            )}
          </>
        )}
      </section>

      <section className="panel ch-tiers" aria-labelledby="tiers-title">
        <div className="ch-panel-head">
          <h3 id="tiers-title" className="panel-title">
            {patch ? t(`Patch ${patch} tier list`, `Tier list del parche ${patch}`) : t("Tier list", "Tier list")}
          </h3>
          <div className="ch-roles" role="radiogroup" aria-label={t("Role", "Rol")}>
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={shownRole === r.id}
                className={shownRole === r.id ? "chip on" : "chip"}
                disabled={busy}
                onClick={() => setRole(r.id)}
              >
                <RoleIcon role={r.id} size={16} />
                {r.label()}
              </button>
            ))}
          </div>
        </div>

        <div className="ch-source">
          {list ? (
            <p className="muted small">
              {t("From", "De")}{" "}
              <a
                className="source"
                href={list.url}
                title={list.url}
                onClick={(e) => {
                  e.preventDefault();
                  openUrl(list.url);
                }}
              >
                {list.site} ↗
              </a>
              {list.patch ? ` · ${t("patch", "parche")} ${list.patch}` : ""}
              {list.rank ? ` · ${list.rank}` : ""} · {t(`read ${dateText(list.fetched_at)}`, `leída el ${dateText(list.fetched_at)}`)}
            </p>
          ) : (
            <p className="muted small">
              {t(
                `No ${roleLabel(shownRole)} tier list yet. The AI looks it up on a stats site (u.gg, op.gg, Mobalytics…) and links the page it used.`,
                `Aún no hay tier list de ${roleLabel(shownRole)}. La IA la busca en un sitio de estadísticas (u.gg, op.gg, Mobalytics…) y enlaza la página que usó.`,
              )}
            </p>
          )}
          <div className="update">
            {status && (
              <span className="muted small" role="status">
                {status}
              </span>
            )}
            {busy ? (
              <button type="button" className="danger" onClick={() => requestId.current && cancelPrompt(requestId.current)}>
                {t("Stop", "Detener")}
              </button>
            ) : (
              <button type="button" className={list && !stale ? "secondary" : "primary"} disabled={!claude}
                onClick={getList}
                title={t("One request to Claude Code, which searches the web", "Una consulta a Claude Code, que busca en la web")}
              >
                {list ? t("Look it up again", "Buscarla de nuevo") : t("Get the tier list", "Traer la tier list")}
              </button>
            )}
          </div>
        </div>

        {!claude && (
          <p className="muted small">
            {t(
              "The tier list needs Claude Code: it's the AI that shows where its numbers come from.",
              "La tier list necesita Claude Code: es la IA que muestra de dónde salen sus números.",
            )}{" "}
            <button type="button" className="link-button" onClick={onGoToSettings}>
              {t("Open Settings", "Abrir Ajustes")}
            </button>
          </p>
        )}
        {error && <p className="error">⚠ {error}</p>}
        {stale && list && (
          <p className="ch-stale small">
            {t(
              `Read on patch ${list.app_patch}. This is patch ${patch}: refresh it.`,
              `Leída en el parche ${list.app_patch}. Este es el parche ${patch}: actualízala.`,
            )}
          </p>
        )}
        {!stale && list && otherPagePatch && (
          <p className="ch-stale small">
            {t(
              `The page showed patch ${list.patch}, not ${patch}.`,
              `La página mostraba el parche ${list.patch}, no el ${patch}.`,
            )}
          </p>
        )}

        {list?.partial && (
          <p className="ch-stale small">
            <strong>{t("Partial list.", "Lista parcial.")}</strong>{" "}
            {t(
              `The AI could only read ${list.entries.length} champions from ${list.site}. Open the page for the full list, or look it up again.`,
              `La IA solo pudo leer ${list.entries.length} campeones de ${list.site}. Abre la página para ver la lista completa, o búscala de nuevo.`,
            )}
          </p>
        )}

        {list && (
          <>
            <div className="ch-table" role="table" aria-label={t(`${roleLabel(shownRole)} tier list`, `Tier list de ${roleLabel(shownRole)}`)}>
              <div className="ch-row ch-row-head" role="row">
                <span role="columnheader">{t("Tier", "Tier")}</span>
                <span role="columnheader">{t("Champion", "Campeón")}</span>
                <span role="columnheader">{t("Win rate", "Win rate")}</span>
                <span role="columnheader">{t("Pick rate", "Pick rate")}</span>
                <span role="columnheader">{t("Ban rate", "Ban rate")}</span>
              </div>
              {byTier(list.entries).map((g) => (
                <div key={g.tier} className="ch-tier-group" role="rowgroup">
                  {g.entries.map((e, i) => {
                    const c = champ(e.champion);
                    const mine = mainIds.has(e.champion.toLowerCase());
                    return (
                      <div key={e.champion} className={mine ? "ch-row mine" : "ch-row"} role="row">
                        <span role="cell">{i === 0 ? <span className="tier">{g.tier}</span> : <span className="visually-hidden">{g.tier}</span>}</span>
                        <span role="cell" className="ch-name">
                          <Face c={c} size={28} />
                          {c?.name ?? e.champion}
                          {mine && <span className="badge mine">{t("Your main", "Tu main")}</span>}
                        </span>
                        <span role="cell">{pct(e.win_rate, lang)}</span>
                        <span role="cell">{pct(e.pick_rate, lang)}</span>
                        <span role="cell">{pct(e.ban_rate, lang)}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <a
              className="ch-full-list"
              href={list.url}
              title={list.url}
              onClick={(e) => {
                e.preventDefault();
                openUrl(list.url);
              }}
            >
              {t(`Open the full ${roleLabel(shownRole)} tier list on ${list.site} ↗`, `Abrir la tier list completa de ${roleLabel(shownRole)} en ${list.site} ↗`)}
            </a>
            <p className="muted small">
              {list.opened
                ? t(
                    `Read by the AI from ${list.site}'s ${roleLabel(shownRole)} tier list page (${list.entries.length} champions). The AI can misread a page: open it to confirm the numbers. League Coach doesn't compute win rates.`,
                    `Leída por la IA de la página de tier list de ${roleLabel(shownRole)} de ${list.site} (${list.entries.length} campeones). La IA puede leer mal una página: ábrela para confirmar los números. League Coach no calcula win rates.`,
                  )
                : t(
                    `What the AI found for ${list.site}'s ${roleLabel(shownRole)} tier list in its web search (${list.entries.length} champions). Open the page for the full list and to confirm the numbers. League Coach doesn't compute win rates.`,
                    `Lo que la IA encontró de la tier list de ${roleLabel(shownRole)} de ${list.site} en su búsqueda web (${list.entries.length} campeones). Abre la página para ver la lista completa y confirmar los números. League Coach no calcula win rates.`,
                  )}
              {list.dropped > 0 &&
                t(
                  ` ${list.dropped} row${list.dropped > 1 ? "s" : ""} that didn't match this patch's champions ${list.dropped > 1 ? "were" : "was"} dropped.`,
                  ` Se descartaron ${list.dropped} fila${list.dropped > 1 ? "s" : ""} que no coincidía${list.dropped > 1 ? "n" : ""} con los campeones de este parche.`,
                )}
            </p>
          </>
        )}
      </section>

      {picking && (
        <ChampionPicker
          champions={champs}
          taken={new Set(pins)}
          title={t("Pin a main", "Fijar un main")}
          onPick={(id) => {
            setPinsSaved([...pins, id]);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </section>
  );
}

export default Champions;
