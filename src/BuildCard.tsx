import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Card, Champion, Ref, RuneTree, Shard, Stat } from "./game";
import { currentLang, missingText, t } from "./i18n";
import SafeMarkdown from "./SafeMarkdown";
import { AskButton } from "./AskPanel";
import { Key, parseKeys, skillPath, SPECIAL_R } from "./skills";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function Icon({ r, size = 44, caption = true }: { r: Ref; size?: number; caption?: boolean }) {
  return (
    <figure className={r.valid ? "icon" : "icon invalid"} title={r.valid ? r.name : t(`${r.name} (not valid on this patch)`, `${r.name} (no válido en este parche)`)}>
      {r.image ? (
        <img src={r.image} alt="" width={size} height={size} />
      ) : (
        <div className="icon-missing" style={{ width: size, height: size }}>
          ?
        </div>
      )}
      {caption && <figcaption>{r.name}</figcaption>}
    </figure>
  );
}

/* ---------- quoted stats ---------- */

const pct = (v: number | null) => (v === null ? null : `${v.toFixed(1)}%`);

export function wrClass(v: number) {
  if (v >= 51.5) return "wr high";
  if (v >= 50) return "wr mid";
  if (v >= 48.5) return "wr low";
  return "wr bad";
}

function StatRow({ s }: { s: Stat }) {
  return (
    <li className="stat">
      {s.tier && <span className="tier">{s.tier}</span>}
      <div className="stat-main">
        <div className="stat-nums">
          {s.win_rate !== null && <span className={wrClass(s.win_rate)}>{pct(s.win_rate)} WR</span>}
          {s.pick_rate !== null && <span className="num">{pct(s.pick_rate)} pick</span>}
          {s.ban_rate !== null && <span className="num">{pct(s.ban_rate)} ban</span>}
          {s.games !== null && (
            <span className="num muted">
              {s.games.toLocaleString(currentLang())} {t("games", "partidas")}
            </span>
          )}
        </div>
        <div className="stat-src">
          {s.about && <span>{s.about}</span>}
          {s.rank && <span className="muted"> · {s.rank}</span>}
          <span className={s.current_patch ? "muted" : "warn"}>
            {" "}
            · {t("patch", "parche")} {s.patch || "?"}
            {!s.current_patch && t(" (not the current one)", " (no es el actual)")}
          </span>
        </div>
      </div>
      <a
        className="source"
        href={s.url}
        onClick={(e) => {
          e.preventDefault();
          openUrl(s.url);
        }}
        title={s.url}
      >
        {s.site} ↗
      </a>
    </li>
  );
}

/** Direct links to the champion page on stats sites (to check by hand). */
export function statLinks(c: Champion) {
  const slug = (c.id === "MonkeyKing" ? "wukong" : c.id).toLowerCase();
  return [
    { site: "u.gg", url: `https://u.gg/lol/champions/${slug}/build` },
    { site: "op.gg", url: `https://www.op.gg/champions/${slug}/build` },
  ];
}

/* ---------- runes ---------- */

function RuneRows({ tree, rows, picked }: { tree: RuneTree; rows: number[]; picked: Ref[] }) {
  const chosen = new Set(picked.filter((r) => r.valid).map((r) => norm(r.name)));
  return (
    <>
      {rows.map((row) => (
        <div key={row} className={row === 0 ? "rune-row keystones" : "rune-row"}>
          {tree.slots[row]?.map((r) => {
            const on = chosen.has(norm(r.name));
            return <img key={r.id} src={r.icon} alt={on ? r.name : ""} title={on ? r.name : t(`${r.name} (not picked)`, `${r.name} (no elegida)`)} className={on ? "rune on" : "rune"} />;
          })}
        </div>
      ))}
    </>
  );
}

function RunePage({ card, trees, shardRows }: { card: Card; trees: RuneTree[]; shardRows: Shard[][] }) {
  const r = card.runes;
  const find = (ref: Ref) => (ref.valid ? trees.find((x) => norm(x.name) === norm(ref.name)) : undefined);
  const primary = find(r.primary_tree);
  const secondary = find(r.secondary_tree);
  const picked = [r.keystone, ...r.primary, ...r.secondary];
  // If a tree isn't recognized, show the plain list (invalid ones in red).
  if (!primary || !secondary) {
    return (
      <div className="icon-row compact">
        {[r.primary_tree, r.keystone, ...r.primary, r.secondary_tree, ...r.secondary].map((x, i) => (
          <Icon key={i} r={x} size={32} />
        ))}
      </div>
    );
  }
  const shards = r.shards.map((s) => (s.valid ? norm(s.name) : ""));
  const invalid = picked.filter((x) => !x.valid);
  return (
    <div className="rune-page">
      <div className="rune-tree">
        <div className="tree-head">
          <img src={primary.icon} alt="" />
          <span>{primary.name}</span>
        </div>
        <RuneRows tree={primary} rows={[0, 1, 2, 3]} picked={[r.keystone, ...r.primary]} />
      </div>
      <div className="rune-tree">
        <div className="tree-head">
          <img src={secondary.icon} alt="" />
          <span>{secondary.name}</span>
        </div>
        <RuneRows tree={secondary} rows={[1, 2, 3]} picked={r.secondary} />
        {r.shards.length > 0 && (
          <div className="shards" aria-label={t("Shards", "Fragmentos")}>
            {shardRows.map((row, i) => (
              <div key={i} className="shard-row">
                {row.map((s, j) => (
                  <span key={j} className={shards[i] === norm(s.name) ? "shard on" : "shard"} title={s.name}>
                    {s.short}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="rune-names small muted">
        {picked
          .filter((x) => x.valid)
          .map((x) => x.name)
          .join(" · ")}
      </p>
      {invalid.length > 0 && (
        <p className="error small">
          {t("Don't fit this page:", "No encajan en esta página:")} {invalid.map((x) => x.name).join(", ")}
        </p>
      )}
    </div>
  );
}

/* ---------- skills ---------- */

function SkillGrid({ max, first }: { max: string[]; first: string }) {
  const path = skillPath(max, first);
  if (!path) return null;
  const keys: Key[] = ["Q", "W", "E", "R"];
  return (
    <div className="skill-grid" role="table" aria-label={t("Skill order by level", "Orden de habilidades por nivel")}>
      {keys.map((k) => (
        <div key={k} className="skill-line" role="row">
          <span className="skill-key" role="rowheader">
            {k}
          </span>
          {path.map((p, lvl) => (
            <span key={lvl} role="cell" className={p === k ? `lvl on k-${k}` : "lvl"}>
              {p === k ? lvl + 1 : ""}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- card ---------- */

export function BuildCardSkeleton() {
  return (
    <article className="build-card skeleton" aria-busy="true" aria-label={t("Preparing the build", "Preparando la build")}>
      <div className="sk-line wide" />
      <div className="sk-row">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="sk-icon" />
        ))}
      </div>
      <div className="sk-line" />
      <div className="sk-row">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="sk-icon small" />
        ))}
      </div>
      <div className="sk-line" />
      <div className="sk-line wide" />
    </article>
  );
}

/* ---------- the sheet ---------- */

/** "Precision, with Resolve second" */
function treeLine(card: Card): string {
  const p = card.runes.primary_tree.name;
  const s = card.runes.secondary_tree.name;
  if (!p) return "";
  return s ? t(`${p}, with ${s} second`, `${p}, con ${s} de secundaria`) : p;
}

/** One rune or shard in the summary: its icon, then its name. */
function RuneLine({ r, size }: { r: Ref; size: number }) {
  return (
    <li className={r.valid ? undefined : "error"}>
      <Icon r={r} size={size} caption={false} />
      <span>{r.name}</span>
    </li>
  );
}

/** Runes as a keystone and every rune with its icon; the full page is one click away. */
function RunesSummary({ card, trees, shards }: { card: Card; trees: RuneTree[]; shards: Shard[][] }) {
  const [full, setFull] = useState(false);
  const r = card.runes;
  const shardRefs = r.shards.filter((s) => s.valid);
  return (
    <div className="sheet-block">
      <h5>{t("Runes", "Runas")}</h5>
      <div className="keystone">
        <Icon r={r.keystone} size={56} caption={false} />
        <div>
          <strong className={r.keystone.valid ? undefined : "error"}>{r.keystone.name}</strong>
          <span className="muted small">{treeLine(card)}</span>
        </div>
      </div>
      <div className="rune-list">
        <ul aria-label={r.primary_tree.name || t("Primary runes", "Runas principales")}>
          {r.primary.map((x, i) => (
            <RuneLine key={i} r={x} size={32} />
          ))}
        </ul>
        <ul aria-label={r.secondary_tree.name || t("Secondary runes", "Runas secundarias")}>
          {r.secondary.map((x, i) => (
            <RuneLine key={i} r={x} size={32} />
          ))}
        </ul>
      </div>
      {shardRefs.length > 0 && (
        <ul className="rune-shards" aria-label={t("Stat shards", "Fragmentos de estadísticas")}>
          {shardRefs.map((x, i) => (
            <RuneLine key={i} r={x} size={22} />
          ))}
        </ul>
      )}
      <button type="button" className="link-button" aria-expanded={full} onClick={() => setFull((v) => !v)}>
        {full ? t("Hide the full rune page", "Ocultar la página de runas") : t("Show the full rune page", "Ver la página de runas completa")}
      </button>
      {full && <RunePage card={card} trees={trees} shardRows={shards} />}
    </div>
  );
}

function IconGroup({ title, refs }: { title: string; refs: Ref[] }) {
  return (
    <div className="sheet-block">
      <h5>{title}</h5>
      <div className="icon-row compact">
        {refs.map((r, i) => (
          <Icon key={i} r={r} size={44} />
        ))}
        {refs.length === 0 && <span className="muted small">{t("No data", "Sin datos")}</span>}
      </div>
    </div>
  );
}

function Abilities({ card, champion }: { card: Card; champion?: Champion }) {
  const [grid, setGrid] = useState(true);
  const { max, first_levels } = card.skill_order;
  if (max.length === 0) return null;
  const first = parseKeys(first_levels);
  const special = champion && SPECIAL_R.has(champion.id);
  return (
    <div className="sheet-block">
      <h5>{t("Abilities", "Habilidades")}</h5>
      <p className="ability-order">
        <span className="muted">{t("Level up first", "Sube primero")}</span>
        {max.map((k, i) => (
          <span key={i} className="ability-step">
            {i > 0 && <span className="muted">{t("then", "luego")}</span>}
            <span className={i === 0 ? "key first" : "key"}>{k}</span>
          </span>
        ))}
      </p>
      {first.length > 0 && (
        <p className="muted small">
          {t(`First levels: ${first.join(", ")}.`, `Primeros niveles: ${first.join(", ")}.`)}
        </p>
      )}
      {special ? (
        <p className="small muted">
          {t(
            `${champion!.name} doesn't follow the standard R order, so there is no level-by-level table.`,
            `${champion!.name} no sigue el orden estándar de la R, así que no hay tabla por niveles.`,
          )}
        </p>
      ) : (
        <>
          <button type="button" className="link-button" aria-expanded={grid} onClick={() => setGrid((v) => !v)}>
            {grid ? t("Hide level by level", "Ocultar nivel por nivel") : t("Show level by level", "Ver nivel por nivel")}
          </button>
          {grid && <SkillGrid max={max} first={first_levels} />}
        </>
      )}
    </div>
  );
}

/** One line under the sheet: patch and where any figure comes from. */
function SourcesLine({
  card,
  patch,
  champion,
  retry,
}: {
  card: Card;
  patch: string;
  champion?: Champion;
  /** "Get a different build", beside the line. */
  retry?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const sites = [...new Map(card.stats.map((s) => [s.site, s])).values()];
  const link = (site: string, url: string) => (
    <a
      key={site}
      className="inline-link"
      href={url}
      onClick={(e) => {
        e.preventDefault();
        openUrl(url);
      }}
    >
      {site}
    </a>
  );
  const join = (xs: React.ReactNode[]) =>
    xs.flatMap((x, i) => (i === 0 ? [x] : [i === xs.length - 1 ? t(" and ", " y ") : ", ", x]));
  const n = card.stats.length;
  return (
    <div className="sources">
      <div className="sources-line">
      <p className="muted small">
        {t(`Checked against patch ${patch}.`, `Comprobado con el parche ${patch}.`)}{" "}
        {n > 0 ? (
          <>
            {t(`${n} figure${n > 1 ? "s" : ""} cited:`, `${n} cifra${n > 1 ? "s" : ""} citada${n > 1 ? "s" : ""}:`)}{" "}
            {join(sites.map((s) => link(s.site, s.url)))}.{" "}
            <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              {open ? t("Hide figures", "Ocultar cifras") : t("Show figures", "Ver cifras")}
            </button>
          </>
        ) : (
          <>
            {card.stats_verifiable
              ? t("No figures cited.", "Sin cifras citadas.")
              : t(
                  "No figures cited: this AI doesn't show where its numbers come from.",
                  "Sin cifras citadas: esta IA no muestra de dónde salen sus números.",
                )}
            {champion && (
              <>
                {" "}
                {t("Check it yourself on", "Compruébalo en")}{" "}
                {join(statLinks(champion).map((l) => link(l.site, l.url)))}.
              </>
            )}
          </>
        )}
      </p>
      {retry && (
        <button type="button" className="secondary" onClick={retry}>
          {t("Get a different build", "Pedir otra build")}
        </button>
      )}
      </div>
      {open && n > 0 && (
        <>
          <ul className="stats">
            {card.stats.map((s, i) => (
              <StatRow key={i} s={s} />
            ))}
          </ul>
          <p className="small muted">
            {t(
              "Each page came up in the AI's search, but the number is reported by the AI: open it to confirm. League Coach doesn't calculate win rates.",
              "Cada página salió en la búsqueda de la IA, pero el número lo reporta ella: ábrela para confirmarlo. League Coach no calcula win rates.",
            )}
            {card.stats_dropped > 0 &&
              t(
                ` ${card.stats_dropped} figure${card.stats_dropped > 1 ? "s" : ""} not found in that search ${card.stats_dropped > 1 ? "were" : "was"} dropped.`,
                ` Se descartaron ${card.stats_dropped} cifra${card.stats_dropped > 1 ? "s" : ""} que no salía${card.stats_dropped > 1 ? "n" : ""} en esa búsqueda.`,
              )}
          </p>
        </>
      )}
    </div>
  );
}

type Props = {
  card: Card;
  patch: string;
  warnings: string[];
  incomplete: string[];
  notes: string | null;
  analysis: string;
  retried: boolean;
  /** "Get a different build"; missing while it can't be asked. */
  onRetry?: () => void;
  onChangePicks: () => void;
  onAsk: () => void;
  trees: RuneTree[];
  shards: Shard[][];
  champion?: Champion;
  lane?: Champion;
  roleLabel: string;
};

/**
 * The build as one sheet: what to set before the game starts and what to do
 * during it, with the plan and threats in a second tab.
 */
function BuildCard({
  card,
  patch,
  warnings,
  incomplete,
  notes,
  analysis,
  retried,
  onRetry,
  onChangePicks,
  onAsk,
  trees,
  shards,
  champion,
  lane,
  roleLabel,
}: Props) {
  const [tab, setTab] = useState<"build" | "play">("build");
  const [answerOpen, setAnswerOpen] = useState(false);
  const [answerLong, setAnswerLong] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);
  // A new build starts on its Build tab, with the answer clamped.
  useEffect(() => {
    setAnswerOpen(false);
    setTab("build");
  }, [card]);
  // "Show more" only if the answer doesn't fit in the clamped height.
  useLayoutEffect(() => {
    const el = answerRef.current;
    if (el && !answerOpen) setAnswerLong(el.scrollHeight > el.clientHeight + 2);
  }, [card.answer, answerOpen]);
  return (
    <article className="build-card sheet">
      <header className="sheet-head">
        {champion && <img className="card-champ" src={champion.image} alt="" />}
        <div>
          <h3>
            {champion?.name ?? t("Your build", "Tu build")} <span className="role-word">{roleLabel.toLowerCase()}</span>
            {lane && (
              <>
                {" "}
                <span className="muted">{t("against", "contra")}</span> {lane.name}
              </>
            )}
          </h3>
          <button type="button" className="link-button" onClick={onChangePicks}>
            {t("Change picks", "Cambiar picks")}
          </button>
        </div>
        <AskButton onClick={onAsk} />
      </header>
      <p className="sheet-summary">{card.summary}</p>

      {notes && card.answer && (
        <section className="panel answer-panel" aria-label={t("Answer to your notes", "Respuesta a tus notas")}>
          <h4 className="panel-title">{t("Your question", "Tu pregunta")}</h4>
          <blockquote className="answer-q">{notes}</blockquote>
          <div ref={answerRef} className={answerOpen ? "answer-text" : answerLong ? "answer-text clamped faded" : "answer-text clamped"}>
            <SafeMarkdown>{card.answer}</SafeMarkdown>
          </div>
          {(answerLong || answerOpen) && (
            <button className="link-button" onClick={() => setAnswerOpen((o) => !o)}>
              {answerOpen ? t("Show less", "Ver menos") : t("Show more", "Ver más")}
            </button>
          )}
        </section>
      )}

      <div className="tabs" role="tablist" aria-label={t("Build or how to play", "Build o cómo jugar")}>
        <button type="button" role="tab" id="tab-build" aria-selected={tab === "build"} aria-controls="pane-build" className={tab === "build" ? "tab on" : "tab"} onClick={() => setTab("build")}>
          {t("Build", "Build")}
        </button>
        <button type="button" role="tab" id="tab-play" aria-selected={tab === "play"} aria-controls="pane-play" className={tab === "play" ? "tab on" : "tab"} onClick={() => setTab("play")}>
          {t("How to play", "Cómo jugarla")}
        </button>
      </div>

      {tab === "build" ? (
        <div className="sheet-grid" role="tabpanel" id="pane-build" aria-labelledby="tab-build">
          <section className="panel">
            <h4 className="panel-title">{t("Set before the game starts", "Antes de que empiece la partida")}</h4>
            <RunesSummary card={card} trees={trees} shards={shards} />
            <div className="sheet-pair">
              <IconGroup title={t("Summoner spells", "Hechizos de invocador")} refs={card.summoner_spells} />
              {card.starting_items.length > 0 && <IconGroup title={t("Starting items", "Objetos iniciales")} refs={card.starting_items} />}
            </div>
          </section>
          <section className="panel">
            <h4 className="panel-title">{t("During the game", "Durante la partida")}</h4>
            <div className="sheet-block">
              <h5>{t("Items, in this order", "Objetos, en este orden")}</h5>
              <div className="item-order-row">
                <ol className="item-order">
                  {card.core_items.map((r, i) => (
                    <li key={i}>
                      <Icon r={r} size={48} />
                    </li>
                  ))}
                </ol>
                {/* Boots fit in whenever they're needed: no place in the order. */}
                {card.boots.name && (
                  <div className="item-boots">
                    <span className="muted" aria-hidden="true">
                      +
                    </span>
                    <Icon r={card.boots} size={48} />
                  </div>
                )}
              </div>
            </div>
            <Abilities card={card} champion={champion} />
            {card.situational.length > 0 && (
              <div className="sheet-block">
                <h5>{t("Swap in if needed", "Cambia si hace falta")}</h5>
                <ul className="situational">
                  {card.situational.map((s, i) => (
                    <li key={i}>
                      <Icon r={s.item} size={36} caption={false} />
                      <p>
                        <strong className={s.item.valid ? undefined : "error"}>{s.item.name}</strong>{" "}
                        <span className="muted">{s.when}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="sheet-play" role="tabpanel" id="pane-play" aria-labelledby="tab-play">
          <section className="panel plan">
            <h4 className="panel-title">{t("Game plan", "Plan de partida")}</h4>
            <dl>
              <dt>{t("Early", "Inicio")}</dt>
              <dd>{card.game_plan.early}</dd>
              <dt>{t("Mid", "Mitad")}</dt>
              <dd>{card.game_plan.mid}</dd>
              <dt>{t("Late", "Final")}</dt>
              <dd>{card.game_plan.late}</dd>
            </dl>
          </section>
          {(card.threats.length > 0 || card.matchup_tips.length > 0) && (
            <div className="two-col">
              {card.matchup_tips.length > 0 && (
                <section className="panel">
                  <h4 className="panel-title">{lane ? t(`Against ${lane.name}`, `Contra ${lane.name}`) : t("Matchup tips", "Claves del matchup")}</h4>
                  <ul>
                    {card.matchup_tips.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </section>
              )}
              {card.threats.length > 0 && (
                <section className="panel">
                  <h4 className="panel-title">{t("Watch out for", "Cuidado con")}</h4>
                  <ul>
                    {card.threats.map((x, i) => (
                      <li key={i}>
                        <strong>{x.champion}:</strong> {x.why}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
          {card.caveat && (
            <p className="muted small">
              {t("Note:", "Nota:")} {card.caveat}
            </p>
          )}
          {analysis && (
            <details className="analysis">
              <summary>{t("See the AI's full analysis", "Ver el análisis completo de la IA")}</summary>
              <p className="muted small">
                {t(
                  "Unverified AI text. Only the cited figures below the sheet were checked against its search.",
                  "Texto de la IA sin verificar. Solo las cifras citadas bajo la hoja se comprobaron contra su búsqueda.",
                )}
              </p>
              <div className="analysis-text">
                <SafeMarkdown>{analysis}</SafeMarkdown>
              </div>
            </details>
          )}
        </div>
      )}

      {(warnings.length > 0 || incomplete.length > 0) && (
        <p className="error small">
          {retried
            ? t("I asked the AI to fix it and it didn't fully manage. ", "Le pedí a la IA que lo corrigiera y no lo logró del todo. ")
            : ""}
          {warnings.length > 0 && (
            <>
              {t("What's marked in red isn't valid on this patch:", "Lo marcado en rojo no es válido en este parche:")} {warnings.join(". ")}.{" "}
            </>
          )}
          {incomplete.length > 0 && (
            <>
              {t("The build is incomplete:", "La build quedó incompleta:")} {missingText(incomplete)}.
            </>
          )}
        </p>
      )}

      <footer className="sheet-foot">
        <SourcesLine card={card} patch={patch} champion={champion} retry={onRetry} />
      </footer>
    </article>
  );
}

export default BuildCard;
