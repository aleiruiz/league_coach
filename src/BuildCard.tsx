import { openUrl } from "@tauri-apps/plugin-opener";
import type { Card, Champion, Ref, Role, RuneTree, Stat } from "./game";
import { SHARD_ROWS } from "./game";
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
    <figure className={r.valid ? "icon" : "icon invalid"} title={r.valid ? r.name : `${r.name} (no válido en este parche)`}>
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

/* ---------- estadísticas citadas ---------- */

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
          {s.games !== null && <span className="num muted">{s.games.toLocaleString("es")} partidas</span>}
        </div>
        <div className="stat-src">
          {s.about && <span>{s.about}</span>}
          {s.rank && <span className="muted"> · {s.rank}</span>}
          <span className={s.current_patch ? "muted" : "warn"}>
            {" "}
            · parche {s.patch || "?"}
            {!s.current_patch && " (no es el actual)"}
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

/** Enlaces directos a la página del campeón en sitios de stats (para comprobar a mano). */
export function statLinks(c: Champion) {
  const slug = (c.id === "MonkeyKing" ? "wukong" : c.id).toLowerCase();
  return [
    { site: "u.gg", url: `https://u.gg/lol/champions/${slug}/build` },
    { site: "op.gg", url: `https://www.op.gg/champions/${slug}/build` },
  ];
}

/* ---------- runas ---------- */

function RuneRows({ tree, rows, picked }: { tree: RuneTree; rows: number[]; picked: Ref[] }) {
  const chosen = new Set(picked.filter((r) => r.valid).map((r) => norm(r.name)));
  return (
    <>
      {rows.map((row) => (
        <div key={row} className={row === 0 ? "rune-row keystones" : "rune-row"}>
          {tree.slots[row]?.map((r) => {
            const on = chosen.has(norm(r.name));
            return <img key={r.id} src={r.icon} alt={on ? r.name : ""} title={on ? r.name : `${r.name} (no elegida)`} className={on ? "rune on" : "rune"} />;
          })}
        </div>
      ))}
    </>
  );
}

function RunePage({ card, trees }: { card: Card; trees: RuneTree[] }) {
  const r = card.runes;
  const find = (ref: Ref) => (ref.valid ? trees.find((t) => norm(t.name) === norm(ref.name)) : undefined);
  const primary = find(r.primary_tree);
  const secondary = find(r.secondary_tree);
  const picked = [r.keystone, ...r.primary, ...r.secondary];
  // Si no se reconoce alguna rama, se muestra la lista simple (con lo inválido en rojo).
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
          <div className="shards" aria-label="Fragmentos">
            {SHARD_ROWS.map((row, i) => (
              <div key={i} className="shard-row">
                {row.map(([name, short], j) => (
                  <span key={j} className={shards[i] === norm(name) ? "shard on" : "shard"} title={name}>
                    {short}
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
      {invalid.length > 0 && <p className="error small">No encajan en esta página: {invalid.map((x) => x.name).join(", ")}</p>}
    </div>
  );
}

/* ---------- habilidades ---------- */

function SkillGrid({ max, first }: { max: string[]; first: string }) {
  const path = skillPath(max, first);
  if (!path) return null;
  const keys: Key[] = ["Q", "W", "E", "R"];
  return (
    <div className="skill-grid" role="table" aria-label="Orden de habilidades por nivel">
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

/* ---------- tarjeta ---------- */

export function BuildCardSkeleton() {
  return (
    <article className="build-card skeleton" aria-busy="true" aria-label="Preparando la build">
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
  champion?: Champion;
  lane?: Champion;
  role: Role;
  roleLabel: string;
};

/** «a, b y c» */
function listaHumana(xs: string[]): string {
  return xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/** «falta el resumen», «faltan las botas», «faltan el resumen y las botas». */
function faltan(xs: string[]): string {
  const plural = xs.length > 1 || /^(los|las) /.test(xs[0] ?? "");
  return `${plural ? "faltan" : "falta"} ${listaHumana(xs)}`;
}

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
  champion,
  lane,
  role,
  roleLabel,
}: Props) {
  return (
    <article className="build-card">
      <header className="card-head">
        {champion && <img className="card-champ" src={champion.image} alt="" />}
        <div className="card-title">
          <h3>
            {champion?.name ?? "Tu build"}
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
        <span className="badge patch">Parche {patch}</span>
      </header>

      {notes && card.answer && (
        <section className="panel answer-panel" aria-label="Respuesta a tus notas">
          <h4 className="panel-title">Tu pregunta</h4>
          <blockquote className="answer-q">{notes}</blockquote>
          <p>{card.answer}</p>
        </section>
      )}

      <section className="panel stats-panel">
        <h4 className="panel-title">Estadísticas citadas</h4>
        {card.stats.length > 0 ? (
          <ul className="stats">
            {card.stats.map((s, i) => (
              <StatRow key={i} s={s} />
            ))}
          </ul>
        ) : (
          <p className="small">
            {card.stats_verifiable
              ? "Sin cifras citadas: el modelo no trajo datos de sitios de estadísticas que se puedan comprobar en esta build."
              : "Sin cifras citadas: este modelo no expone las fuentes de su búsqueda, así que no puedo comprobar de dónde salen sus números. Con Claude sí se muestran."}
          </p>
        )}
        <p className="small muted">
          {card.stats.length > 0 &&
            "La página sí salió en la búsqueda del modelo, pero el número lo reporta él: ábrela para confirmarlo. "}
          {card.stats_verifiable &&
            card.stats_dropped > 0 &&
            `Descarté ${card.stats_dropped} cifra${card.stats_dropped > 1 ? "s" : ""} que no salía${card.stats_dropped > 1 ? "n" : ""} en esos resultados. `}
          League Coach no calcula win rates.
          {champion && (
            <>
              {" "}
              Ver por tu cuenta:{" "}
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

      <div className="card-grid">
        <Section title="Runas" className="runes-panel">
          <RunePage card={card} trees={trees} />
        </Section>

        <div className="card-col">
          <Section title="Hechizos">
            <div className="icon-row compact">
              {card.summoner_spells.map((r, i) => (
                <Icon key={i} r={r} size={36} />
              ))}
              {card.summoner_spells.length === 0 && <span className="muted small">Sin datos</span>}
            </div>
          </Section>
          {card.starting_items.length > 0 && (
            <Section title="Inicio">
              <div className="icon-row compact">
                {card.starting_items.map((r, i) => (
                  <Icon key={i} r={r} size={36} />
                ))}
              </div>
            </Section>
          )}
          <Section title="Build principal">
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
        <Section title="Habilidades">
          <p className="skills">
            {card.skill_order.max.map((k, i) => (
              <span key={i}>
                {i > 0 && <span className="muted"> › </span>}
                <span className="key">{k}</span>
              </span>
            ))}
            <span className="muted small"> prioridad de maximización</span>
          </p>
          {champion && SPECIAL_R.has(champion.id) ? (
            <p className="small muted">{champion.name} no sigue el orden estándar de la R, así que no dibujo la tabla por niveles.</p>
          ) : (
            <SkillGrid max={card.skill_order.max} first={card.skill_order.first_levels} />
          )}
        </Section>
      )}

      {card.situational.length > 0 && (
        <Section title="Situacionales">
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

      <Section title="Plan de partida" className="plan">
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
            <Section title="Amenazas">
              <ul>
                {card.threats.map((t, i) => (
                  <li key={i}>
                    <strong>{t.champion}:</strong> {t.why}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {card.matchup_tips.length > 0 && (
            <Section title="Claves del matchup">
              <ul>
                {card.matchup_tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {card.caveat && <p className="muted small">Nota: {card.caveat}</p>}
      {analysis && (
        <details className="analysis">
          <summary>Ver el análisis completo del modelo</summary>
          <div className="analysis-text">
            <SafeMarkdown>{analysis}</SafeMarkdown>
          </div>
        </details>
      )}
      {(warnings.length > 0 || incomplete.length > 0) && (
        <div className="card-warnings">
          <p className="error small">
            {retried ? "Le pedí al modelo que lo corrigiera y no lo logró del todo. " : ""}
            {warnings.length > 0 && <>Lo marcado en rojo no es válido en este parche: {warnings.join(". ")}. </>}
            {incomplete.length > 0 && <>La tarjeta quedó incompleta: {faltan(incomplete)}.</>}
          </p>
          {onRetry && (
            <button className="secondary" onClick={onRetry}>
              Pedir otra build
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export default BuildCard;
