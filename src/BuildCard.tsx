import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Card, Champion, Ref, Role, RuneTree, Shard, Stat } from "./game";
import { currentLang, missingText, t } from "./i18n";
import { RoleIcon } from "./icons";
import SafeMarkdown from "./SafeMarkdown";
import { Key, skillPath, SPECIAL_R } from "./skills";

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

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className ? `panel ${className}` : "panel"}>
      <h4 className="panel-title">{title}</h4>
      {children}
    </section>
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

type Props = {
  card: Card;
  patch: string;
  warnings: string[];
  incomplete: string[];
  notes: string | null;
  analysis: string;
  retried: boolean;
  onRetry?: () => void;
  trees: RuneTree[];
  shards: Shard[][];
  champion?: Champion;
  lane?: Champion;
  role: Role;
  roleLabel: string;
};

function BuildCard({
  card,
  patch,
  warnings,
  incomplete,
  notes,
  analysis,
  retried,
  onRetry,
  trees,
  shards,
  champion,
  lane,
  role,
  roleLabel,
}: Props) {
  const [answerOpen, setAnswerOpen] = useState(false);
  const [answerLong, setAnswerLong] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);
  // A new build starts clamped again.
  useEffect(() => setAnswerOpen(false), [card]);
  // "Show more" only if the answer doesn't fit in the clamped height.
  useLayoutEffect(() => {
    const el = answerRef.current;
    if (el && !answerOpen) setAnswerLong(el.scrollHeight > el.clientHeight + 2);
  }, [card.answer, answerOpen]);
  // Without figures, the panel goes last: it doesn't push the build out of view.
  const statsPanel = (
  <section className="panel stats-panel">
    <h4 className="panel-title">{t("Quoted stats", "Estadísticas citadas")}</h4>
    {card.stats.length > 0 ? (
      <ul className="stats">
        {card.stats.map((s, i) => (
          <StatRow key={i} s={s} />
        ))}
      </ul>
    ) : (
      <p className="small">
        {card.stats_verifiable
          ? t(
              "No quoted figures: the model brought no stats-site data that can be checked for this build.",
              "Sin cifras citadas: el modelo no trajo datos de sitios de estadísticas que se puedan comprobar en esta build.",
            )
          : t(
              "No quoted figures: this model doesn't expose its search sources, so I can't check where its numbers come from. With Claude they are shown.",
              "Sin cifras citadas: este modelo no expone las fuentes de su búsqueda, así que no puedo comprobar de dónde salen sus números. Con Claude sí se muestran.",
            )}
      </p>
    )}
    <p className="small muted">
      {card.stats.length > 0 &&
        t(
          "The page did come up in the model's search, but the number is reported by the model: open it to confirm. ",
          "La página sí salió en la búsqueda del modelo, pero el número lo reporta él: ábrela para confirmarlo. ",
        )}
      {card.stats_verifiable &&
        card.stats_dropped > 0 &&
        t(
          `I dropped ${card.stats_dropped} figure${card.stats_dropped > 1 ? "s" : ""} that ${card.stats_dropped > 1 ? "weren't" : "wasn't"} in those results. `,
          `Descarté ${card.stats_dropped} cifra${card.stats_dropped > 1 ? "s" : ""} que no salía${card.stats_dropped > 1 ? "n" : ""} en esos resultados. `,
        )}
      {t("League Coach doesn't calculate win rates.", "League Coach no calcula win rates.")}
      {champion && (
        <>
          {" "}
          {t("Check it yourself:", "Ver por tu cuenta:")}{" "}
          {statLinks(champion).map((l, i) => (
            <span key={l.site}>
              {i > 0 && " · "}
              <a
                className="inline-link"
                href={l.url}
                onClick={(e) => {
                  e.preventDefault();
                  openUrl(l.url);
                }}
              >
                {l.site} ↗
              </a>
            </span>
          ))}
        </>
      )}
    </p>
  </section>
  );
  return (
    <article className="build-card">
      <header className="card-head">
        {champion && <img className="card-champ" src={champion.image} alt="" />}
        <div className="card-title">
          <h3>
            {champion?.name ?? t("Your build", "Tu build")}
            <span className="role-pill">
              <RoleIcon role={role} size={14} /> {roleLabel}
            </span>
            {lane && (
              <span className="vs-pill">
                vs <img src={lane.image} alt="" /> {lane.name}
              </span>
            )}
          </h3>
          <p className="summary">{card.summary}</p>
        </div>
        <span className="badge patch">
          {t("Patch", "Parche")} {patch}
        </span>
      </header>

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

      {card.stats.length > 0 && statsPanel}


      <div className="card-grid">
        <Section title={t("Runes", "Runas")} className="runes-panel">
          <RunePage card={card} trees={trees} shardRows={shards} />
        </Section>

        <div className="card-col">
          <Section title={t("Spells", "Hechizos")}>
            <div className="icon-row compact">
              {card.summoner_spells.map((r, i) => (
                <Icon key={i} r={r} size={36} />
              ))}
              {card.summoner_spells.length === 0 && <span className="muted small">{t("No data", "Sin datos")}</span>}
            </div>
          </Section>
          {card.starting_items.length > 0 && (
            <Section title={t("Start", "Inicio")}>
              <div className="icon-row compact">
                {card.starting_items.map((r, i) => (
                  <Icon key={i} r={r} size={36} />
                ))}
              </div>
            </Section>
          )}
          <Section title={t("Core build", "Build principal")}>
            <div className="item-path">
              {card.core_items.map((r, i) => (
                <div key={i} className="step">
                  {i > 0 && <span className="arrow">›</span>}
                  <Icon r={r} size={48} />
                </div>
              ))}
              {card.boots.name && (
                <div className="step">
                  <span className="arrow">+</span>
                  <Icon r={card.boots} size={48} />
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>

      {card.skill_order.max.length > 0 && (
        <Section title={t("Skills", "Habilidades")}>
          <p className="skills">
            {card.skill_order.max.map((k, i) => (
              <span key={i}>
                {i > 0 && <span className="muted"> › </span>}
                <span className="key">{k}</span>
              </span>
            ))}
            <span className="muted small"> {t("max priority", "prioridad de maximización")}</span>
          </p>
          {champion && SPECIAL_R.has(champion.id) ? (
            <p className="small muted">
              {t(
                `${champion.name} doesn't follow the standard R order, so I don't draw the per-level table.`,
                `${champion.name} no sigue el orden estándar de la R, así que no dibujo la tabla por niveles.`,
              )}
            </p>
          ) : (
            <SkillGrid max={card.skill_order.max} first={card.skill_order.first_levels} />
          )}
        </Section>
      )}

      {card.situational.length > 0 && (
        <Section title={t("Situational", "Situacionales")}>
          <ul className="situational">
            {card.situational.map((s, i) => (
              <li key={i}>
                <Icon r={s.item} size={36} caption={false} />
                <div>
                  <strong className={s.item.valid ? undefined : "error"}>{s.item.name}</strong>
                  <p className="small muted">{s.when}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t("Game plan", "Plan de partida")} className="plan">
        <dl>
          <dt>Early</dt>
          <dd>{card.game_plan.early}</dd>
          <dt>Mid</dt>
          <dd>{card.game_plan.mid}</dd>
          <dt>Late</dt>
          <dd>{card.game_plan.late}</dd>
        </dl>
      </Section>

      {(card.threats.length > 0 || card.matchup_tips.length > 0) && (
        <div className="two-col">
          {card.threats.length > 0 && (
            <Section title={t("Threats", "Amenazas")}>
              <ul>
                {card.threats.map((x, i) => (
                  <li key={i}>
                    <strong>{x.champion}:</strong> {x.why}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {card.matchup_tips.length > 0 && (
            <Section title={t("Matchup tips", "Claves del matchup")}>
              <ul>
                {card.matchup_tips.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {card.caveat && (
        <p className="muted small">
          {t("Note:", "Nota:")} {card.caveat}
        </p>
      )}
      {card.stats.length === 0 && statsPanel}
      {analysis && (
        <details className="analysis">
          <summary>{t("See the model's full analysis", "Ver el análisis completo del modelo")}</summary>
          <p className="muted small">
            {t(
              "Unverified model text. Figures checked against its search are under “Quoted stats”.",
              "Texto del modelo sin verificar. Las cifras comprobadas contra su búsqueda están en «Estadísticas citadas».",
            )}
          </p>
          <div className="analysis-text">
            <SafeMarkdown>{analysis}</SafeMarkdown>
          </div>
        </details>
      )}
      {(warnings.length > 0 || incomplete.length > 0) && (
        <div className="card-warnings">
          <p className="error small">
            {retried
              ? t(
                  "I asked the model to fix it and it didn't fully manage. ",
                  "Le pedí al modelo que lo corrigiera y no lo logró del todo. ",
                )
              : ""}
            {warnings.length > 0 && (
              <>
                {t("What's marked in red isn't valid on this patch:", "Lo marcado en rojo no es válido en este parche:")}{" "}
                {warnings.join(". ")}.{" "}
              </>
            )}
            {incomplete.length > 0 && (
              <>
                {t("The card is incomplete:", "La tarjeta quedó incompleta:")} {missingText(incomplete)}.
              </>
            )}
          </p>
          {onRetry && (
            <button className="secondary" onClick={onRetry}>
              {t("Ask for another build", "Pedir otra build")}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export default BuildCard;
