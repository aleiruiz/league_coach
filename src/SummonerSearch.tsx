import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { lookupSummoner, RankEntry, Region, riotIdProblem, SummonerPreview } from "./history";
import { humanizeError } from "./providers";
import { t } from "./i18n";

/** A Riot ID searched before, or starred. Kept only on this computer. */
export type PastSearch = { riotId: string; region: string; saved: boolean; at: number };

const STORE = "lc.summonerSearches";
const MAX_RECENT = 8;

export function loadSearches(): PastSearch[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x?.riotId === "string" && typeof x?.region === "string") : [];
  } catch {
    return [];
  }
}

function storeSearches(list: PastSearch[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(list));
  } catch {
    // Without storage the search still works, just without history.
  }
}

const same = (a: { riotId: string; region: string }, b: { riotId: string; region: string }) =>
  a.region === b.region && a.riotId.toLowerCase() === b.riotId.toLowerCase();

/** Adds (or moves to the top) a search; starred ones are always kept, recents up to 8. */
export function remember(list: PastSearch[], riotId: string, region: string, now = Date.now()): PastSearch[] {
  const old = list.find((s) => same(s, { riotId, region }));
  const rest = list.filter((s) => !same(s, { riotId, region }));
  const next = [{ riotId, region, saved: old?.saved ?? false, at: now }, ...rest];
  let recent = 0;
  return next.filter((s) => s.saved || ++recent <= MAX_RECENT);
}

/** Past searches matching what is typed (any part of Name#TAG), starred first. */
export function suggestions(list: PastSearch[], typed: string): PastSearch[] {
  const q = typed.trim().toLowerCase();
  return list
    .filter((s) => !q || s.riotId.toLowerCase().includes(q))
    .sort((a, b) => Number(b.saved) - Number(a.saved) || b.at - a.at);
}

/** "Latin America North (LAN)" → "LAN". */
export const shortRegion = (r: Region | undefined) => r?.label.match(/\(([^)]+)\)\s*$/)?.[1] ?? r?.id.toUpperCase() ?? "";

const QUEUES: Record<string, [string, string]> = {
  RANKED_SOLO_5x5: ["Solo/Duo", "Solo/Dúo"],
  RANKED_FLEX_SR: ["Flex", "Flexible"],
};

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function rankText(r: RankEntry): string {
  // Master and above have no division.
  const tier = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(r.tier) ? title(r.tier) : `${title(r.tier)} ${r.rank}`;
  const games = r.wins + r.losses;
  const wr = games ? Math.round((r.wins / games) * 100) : 0;
  return `${tier} · ${r.league_points} LP · ${r.wins}${t("W", "V")} ${r.losses}${t("L", "D")} (${wr}%)`;
}

type Lookup =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; data: SummonerPreview }
  | { state: "error"; message: string; soft: boolean };

/**
 * Riot ID search in the style of stats sites: region + Name#TAG in one bar,
 * past searches as suggestions, and a preview card when Riot knows that
 * exact Riot ID. Riot has no partial name search, so there is no
 * "players named like…" list: only exact matches and your own history.
 */
export function SummonerSearch({
  regions,
  riotId,
  region,
  onChange,
  onSubmit,
  submitLabel,
}: {
  regions: Region[];
  riotId: string;
  region: string;
  onChange: (riotId: string, region: string) => void;
  onSubmit: (riotId: string, region: string) => void;
  submitLabel: string;
}) {
  const [past, setPast] = useState<PastSearch[]>(loadSearches);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const cache = useRef(new Map<string, Lookup>());
  const listId = useId();

  const list = suggestions(past, riotId).slice(0, 10);
  const regionOf = (id: string) => regions.find((r) => r.id === id);
  const regionCode = (id: string) => shortRegion(regionOf(id)) || id.toUpperCase();

  function update(next: PastSearch[]) {
    setPast(next);
    storeSearches(next);
  }

  // Preview: only for a well-formed Riot ID, after typing pauses.
  useEffect(() => {
    if (!region || riotIdProblem(riotId) !== null) {
      setLookup({ state: "idle" });
      return;
    }
    const key = `${region}|${riotId.trim().toLowerCase()}`;
    const hit = cache.current.get(key);
    if (hit) {
      setLookup(hit);
      return;
    }
    setLookup({ state: "loading" });
    let live = true;
    const timer = window.setTimeout(() => {
      lookupSummoner(riotId, region)
        .then((data) => {
          const found: Lookup = { state: "found", data };
          cache.current.set(key, found);
          if (!live) return;
          setLookup(found);
          update(remember(loadSearches(), `${data.game_name}#${data.tag_line}`, data.region));
        })
        .catch((e) => {
          const message = humanizeError(String(e));
          // No API key yet: a hint, not an error (saving still works). A
          // rejected or expired key needs action, so it stays an error.
          const soft = /^(Paste your Riot API key|Pega tu API key)/.test(message);
          const failed: Lookup = { state: "error", message, soft };
          // Only remember "not found"; a network error should retry.
          if (/No player|Nadie se llama/.test(message)) cache.current.set(key, failed);
          if (live) setLookup(failed);
        });
    }, 600);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [riotId, region]);

  function pick(s: PastSearch) {
    onChange(s.riotId, s.region);
    setOpen(false);
    setActive(-1);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && list.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % list.length);
    } else if (e.key === "ArrowUp" && list.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? list.length - 1 : i - 1));
    } else if (e.key === "Enter" && open && active >= 0 && list[active]) {
      e.preventDefault();
      pick(list[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const found = lookup.state === "found" ? lookup.data : null;

  return (
    <div className="summoner-search">
      <form
        className="search-bar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
          // Use Riot's own spelling when the preview found it.
          if (found && found.region === region) onSubmit(`${found.game_name}#${found.tag_line}`, region);
          else onSubmit(riotId, region);
          if (region && riotIdProblem(riotId) === null) update(remember(past, riotId.trim(), region));
        }}
      >
        <select
          className="search-region"
          aria-label={t("Region", "Región")}
          title={regionOf(region)?.label}
          value={region}
          onChange={(e) => onChange(riotId, e.currentTarget.value)}
        >
          <option value="" disabled>
            {t("Region", "Región")}
          </option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {shortRegion(r)} – {r.label.replace(/\s*\([^)]*\)\s*$/, "")}
            </option>
          ))}
        </select>
        <div className="search-field">
          <input
            role="combobox"
            aria-label="Riot ID"
            aria-expanded={open && list.length > 0}
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            placeholder={t("Riot ID: name + #TAG", "Riot ID: nombre + #TAG")}
            autoComplete="off"
            spellCheck={false}
            value={riotId}
            onChange={(e) => {
              onChange(e.currentTarget.value, region);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={(e) => {
              // Tabbing into the list (star / remove buttons) keeps it open.
              if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) setOpen(false);
            }}
            onKeyDown={onKey}
          />
          {open && list.length > 0 && (
            <ul
              className="search-suggestions"
              id={listId}
              role="listbox"
              onBlur={(e) => {
                if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) setOpen(false);
              }}
            >
              {list.map((s, i) => (
                <li
                  key={`${s.region}|${s.riotId}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? "active" : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                >
                  <button
                    type="button"
                    className={s.saved ? "star on" : "star"}
                    aria-label={
                      s.saved
                        ? t(`Unstar ${s.riotId}`, `Quitar estrella a ${s.riotId}`)
                        : t(`Star ${s.riotId}`, `Marcar ${s.riotId} con estrella`)
                    }
                    title={s.saved ? t("Saved", "Guardado") : t("Save", "Guardar")}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      update(past.map((p) => (same(p, s) ? { ...p, saved: !p.saved } : p)));
                    }}
                  >
                    {s.saved ? "★" : "☆"}
                  </button>
                  <span className="search-id">{s.riotId}</span>
                  <span className="badge">{regionCode(s.region)}</span>
                  <button
                    type="button"
                    className="remove"
                    aria-label={t(`Remove ${s.riotId} from history`, `Quitar ${s.riotId} del historial`)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      update(past.filter((p) => !same(p, s)));
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="submit" disabled={!riotId.trim() || !region}>
          {submitLabel}
        </button>
      </form>

      <div className="search-preview" role="status" aria-live="polite">
        {lookup.state === "loading" && <p className="muted small">{t("Looking it up on Riot…", "Buscando en Riot…")}</p>}
        {lookup.state === "error" && <p className={lookup.soft ? "muted small" : "error small"}>{lookup.message}</p>}
        {found && (
          <div className="summoner-card">
            {found.icon_url ? (
              <img
                src={found.icon_url}
                alt=""
                width={56}
                height={56}
                onError={(e) => (e.currentTarget.style.visibility = "hidden")}
              />
            ) : (
              <span className="summoner-icon-blank" aria-hidden="true" />
            )}
            <div>
              <strong>
                {found.game_name}
                <span className="muted">#{found.tag_line}</span>
              </strong>
              <p className="muted small">
                {regionOf(found.region)?.label ?? regionCode(found.region)} · {t("Level", "Nivel")} {found.level}
              </p>
              {found.ranks === null ? (
                <p className="muted small">{t("Rank unavailable right now", "Rango no disponible por ahora")}</p>
              ) : found.ranks.length ? (
                found.ranks.map((r) => (
                  <p key={r.queue_type} className="small">
                    <span className="muted">{t(...(QUEUES[r.queue_type] ?? [r.queue_type, r.queue_type]))}:</span>{" "}
                    {rankText(r)}
                  </p>
                ))
              ) : (
                <p className="muted small">{t("Unranked this season", "Sin clasificar esta temporada")}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
