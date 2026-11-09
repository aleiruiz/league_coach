import type { Card, Ref } from "./game";

function Icon({ r, size = 44 }: { r: Ref; size?: number }) {
  return (
    <figure className={r.valid ? "icon" : "icon invalid"} title={r.valid ? r.name : `${r.name} (no existe en este parche)`}>
      {r.image ? (
        <img src={r.image} alt="" width={size} height={size} />
      ) : (
        <div className="icon-missing" style={{ width: size, height: size }}>
          ?
        </div>
      )}
      <figcaption>{r.name}</figcaption>
    </figure>
  );
}

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

function BuildCard({ card, patch, warnings, retried, onRetry }: {
  card: Card;
  patch: string;
  warnings: string[];
  retried: boolean;
  onRetry?: () => void;
}) {
  return (
    <article className="build-card">
      <header>
        <p className="summary">{card.summary}</p>
        <span className="badge">Parche {patch}</span>
      </header>

      <section>
        <h4>Build principal</h4>
        <div className="icon-row">
          {card.core_items.map((r, i) => (
            <div key={i} className="step">
              <span className="step-n">{i + 1}</span>
              <Icon r={r} size={52} />
            </div>
          ))}
          {card.boots.name && <Icon r={card.boots} size={52} />}
        </div>
        {card.starting_items.length > 0 && (
          <div className="sub">
            <span className="muted small">Inicio:</span>
            <div className="icon-row compact">
              {card.starting_items.map((r, i) => (
                <Icon key={i} r={r} size={32} />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="two-col">
        <div>
          <h4>Runas</h4>
          <div className="icon-row compact">
            <Icon r={card.runes.primary_tree} size={28} />
            <Icon r={card.runes.keystone} size={52} />
            {card.runes.primary.map((r, i) => (
              <Icon key={i} r={r} size={32} />
            ))}
          </div>
          <div className="icon-row compact">
            <Icon r={card.runes.secondary_tree} size={28} />
            {card.runes.secondary.map((r, i) => (
              <Icon key={i} r={r} size={32} />
            ))}
          </div>
        </div>
        <div>
          <h4>Habilidades y hechizos</h4>
          {card.skill_order.max.length > 0 && (
            <p className="skills">
              {card.skill_order.max.map((k, i) => (
                <span key={i}>
                  {i > 0 && <span className="muted"> › </span>}
                  <span className="key">{k}</span>
                </span>
              ))}
              <span className="muted small"> orden de maximización</span>
            </p>
          )}
          {card.skill_order.first_levels && <p className="small">Primeros niveles: {card.skill_order.first_levels}</p>}
          {card.summoner_spells.length > 0 && (
            <div className="icon-row compact">
              {card.summoner_spells.map((r, i) => (
                <Icon key={i} r={r} size={32} />
              ))}
            </div>
          )}
        </div>
      </section>

      {card.situational.length > 0 && (
        <section>
          <h4>Situacionales</h4>
          <ul className="situational">
            {card.situational.map((s, i) => (
              <li key={i}>
                <Icon r={s.item} size={36} />
                <span>{s.when}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="plan">
        <h4>Plan de partida</h4>
        <dl>
          <dt>Early</dt>
          <dd>{card.game_plan.early}</dd>
          <dt>Mid</dt>
          <dd>{card.game_plan.mid}</dd>
          <dt>Late</dt>
          <dd>{card.game_plan.late}</dd>
        </dl>
      </section>

      {(card.threats.length > 0 || card.matchup_tips.length > 0) && (
        <section className="two-col">
          {card.threats.length > 0 && (
            <div>
              <h4>Amenazas</h4>
              <ul>
                {card.threats.map((t, i) => (
                  <li key={i}>
                    <strong>{t.champion}:</strong> {t.why}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {card.matchup_tips.length > 0 && (
            <div>
              <h4>Claves del matchup</h4>
              <ul>
                {card.matchup_tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {card.caveat && <p className="muted small">Nota: {card.caveat}</p>}
      {warnings.length > 0 && (
        <div className="card-warnings">
          <p className="error small">
            {retried ? "Le pedí al modelo que lo corrigiera y no lo logró del todo. " : ""}
            Lo marcado en rojo no es válido en este parche: {warnings.join(". ")}.
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
