import {
  clock,
  COUNTS,
  Compared,
  kda,
  MIN_PEERS,
  peersOf,
  standouts,
} from "./gameSummary";
import { aheadBehind, GameStats, METRICS, pct, roleName, signed } from "./history";
import { t } from "./i18n";

/** Deaths before this minute count as early (same line the review uses). */
const EARLY_MIN = 14;
/** Team gold lead at 15:00 that counts as thrown when lost (THROWN_LEAD_GOLD in history.rs). */
const LEAD_GOLD = 1500;

/** This game's own count is a whole number ("2", not "2.0"); averages keep a decimal. */
export function formatCompared(c: Compared, v: number, own = false): string {
  if (own && COUNTS.has(c.key)) return String(Math.round(v));
  return METRICS.find((m) => m.key === c.key)?.format(v) ?? String(v);
}

function Standout({ c }: { c: Compared }) {
  return (
    <li>
      <span className="muted">{c.label}:</span>{" "}
      <strong>{formatCompared(c, c.value, true)}</strong>{" "}
      <span className="muted small">
        ({t("usually", "normalmente")} {formatCompared(c, c.usual)})
      </span>
    </li>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="gd-stat" title={hint}>
      <span className="gd-stat-label">{label}</span>
      <span className="gd-stat-value">{value}</span>
    </div>
  );
}

/** When each death happened, on a bar the length of the game. */
function DeathTimeline({ g, label }: { g: GameStats; label: string }) {
  const len = Math.max(g.minutes, ...g.death_minutes, 1);
  const at = (m: number) => `${Math.min(100, (m / len) * 100)}%`;
  return (
    <div className="gd-deaths">
      <div className="gd-deaths-head">
        <span className="gd-stat-label">{label}</span>
        <span className="muted small">
          {g.death_minutes.length === 0
            ? t("No deaths", "Sin muertes")
            : g.death_minutes.map(clock).join(" · ")}
        </span>
      </div>
      <div className="gd-bar" aria-hidden="true">
        {g.minutes > EARLY_MIN && (
          <span className="gd-early" style={{ width: at(EARLY_MIN) }} />
        )}
        {g.death_minutes.map((m, i) => (
          <span
            key={i}
            className={m < EARLY_MIN ? "gd-death early" : "gd-death"}
            style={{ left: at(m) }}
            title={clock(m)}
          />
        ))}
      </div>
      <div className="gd-bar-scale muted small" aria-hidden="true">
        <span>0:00</span>
        {g.minutes > EARLY_MIN && (
          <span style={{ left: at(EARLY_MIN) }}>14:00</span>
        )}
        <span>{clock(g.minutes)}</span>
      </div>
    </div>
  );
}

/**
 * Summary of one finished game: its numbers, what stood out against the
 * player's other games in the same role, and when they died. Built only
 * from the stats already saved; nothing is sent to a model.
 */
export function GameDetail({
  g,
  games,
  id,
  compare = true,
}: {
  g: GameStats;
  games: GameStats[];
  id: string;
  /** Match details shows the comparison itself above, and KDA, kills and minions per minute in its table. */
  compare?: boolean;
}) {
  const full = compare;
  const { better, worse } = standouts(g, games);
  const peers = peersOf(g, games).length;
  const role = roleName(g.role);
  const threw =
    !g.win && g.team_gold_diff_15 !== null && g.team_gold_diff_15 >= LEAD_GOLD;
  const comeback =
    g.win && g.team_gold_diff_15 !== null && g.team_gold_diff_15 <= -LEAD_GOLD;
  return (
    <div className="game-detail" id={id}>
      {(threw || comeback) && (
        <p className={threw ? "gd-note bad" : "gd-note good"}>
          {threw
            ? t(
                `Your team was ${signed(g.team_gold_diff_15!)} gold ahead at 15:00 and lost.`,
                `Tu equipo iba ${signed(g.team_gold_diff_15!)} de oro arriba al 15:00 y perdió.`,
              )
            : t(
                `Comeback: your team was ${signed(g.team_gold_diff_15!)} gold at 15:00 and won.`,
                `Remontada: tu equipo iba ${signed(g.team_gold_diff_15!)} de oro al 15:00 y ganó.`,
              )}
        </p>
      )}

      <div className="gd-grid">
        {full && <Stat
          label="KDA"
          value={kda(g)?.toFixed(1) ?? t("Perfect", "Perfecto")}
          hint={`${g.kills}/${g.deaths}/${g.assists}`}
        />}
        {full && <Stat
          label={t("Kills you were in", "Kills en las que participaste")}
          value={pct(g.kill_participation)}
        />}
        <Stat
          label={t("Share of team damage", "Parte del daño del equipo")}
          value={pct(g.damage_share)}
          hint={t(
            "Share of your team's damage to champions",
            "Parte del daño a campeones de tu equipo",
          )}
        />
        {/* A support isn't judged on CS: the tiles would hint at farming more. */}
        {g.role !== "UTILITY" && (
          <>
            {full && <Stat label={t("Minions per minute", "Súbditos por minuto")} value={g.cs_per_min.toFixed(1)} />}
            <Stat
              label={t("Minions at 10 min", "Súbditos al minuto 10")}
              value={
                g.cs_at_10 !== null
                  ? `${g.cs_at_10}${g.cs_diff_10 !== null ? ` (${aheadBehind(g.cs_diff_10, 0.5, "")})` : ""}`
                  : "—"
              }
              hint={t(
                "In brackets: vs your lane opponent",
                "Entre paréntesis: vs tu rival de línea",
              )}
            />
          </>
        )}
        <Stat
          label={t("Gold vs opponent at 15 min", "Oro vs rival al minuto 15")}
          value={g.gold_diff_15 !== null ? aheadBehind(g.gold_diff_15, 50, "") : "—"}
          hint={t("You vs your lane opponent", "Tú vs tu rival de línea")}
        />
        <Stat
          label={t("Team gold lead at 15 min", "Ventaja de oro del equipo al minuto 15")}
          value={
            g.team_gold_diff_15 !== null ? aheadBehind(g.team_gold_diff_15, 50, "") : "—"
          }
        />
        <Stat
          label={t("Vision score per minute", "Visión por minuto")}
          value={g.vision_per_min.toFixed(2)}
        />
        <Stat
          label={t("Wards", "Wards")}
          value={t(
            `${g.wards_placed} placed, ${g.wards_killed} cleared, ${g.control_wards} control`,
            `${g.wards_placed} puestas, ${g.wards_killed} destruidas, ${g.control_wards} de control`,
          )}
        />
        <Stat
          label={t("First item done at", "Primer ítem terminado al")}
          value={g.first_item_min !== null ? clock(g.first_item_min) : "—"}
        />
      </div>

      <DeathTimeline g={g} label={full ? t("Deaths", "Muertes") : t("When you died", "Cuándo moriste")} />

      {!compare ? null : peers >= MIN_PEERS ? (
        better.length || worse.length ? (
          <div className="gd-compare">
            <p className="muted small">
              {t(
                `Compared with your other ${peers} ${role} games:`,
                `Comparado con tus otras ${peers} partidas de ${role}:`,
              )}
            </p>
            <div className="gd-columns">
              {better.length > 0 && (
                <div>
                  <h4 className="gd-good">
                    {t("Better than usual", "Mejor que de costumbre")}
                  </h4>
                  <ul>
                    {better.map((c) => (
                      <Standout key={c.key} c={c} />
                    ))}
                  </ul>
                </div>
              )}
              {worse.length > 0 && (
                <div>
                  <h4 className="gd-bad">
                    {t("Worse than usual", "Peor que de costumbre")}
                  </h4>
                  <ul>
                    {worse.map((c) => (
                      <Standout key={c.key} c={c} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="muted small">
            {t(
              `A typical game for you as ${role}: nothing far from your usual numbers.`,
              `Una partida típica tuya de ${role}: nada lejos de tus números habituales.`,
            )}
          </p>
        )
      ) : (
        <p className="muted small">
          {t(
            `Play a few more ${role} games to compare this one with your usual numbers.`,
            `Juega unas cuantas partidas más de ${role} para comparar esta con tus números habituales.`,
          )}
        </p>
      )}
    </div>
  );
}
