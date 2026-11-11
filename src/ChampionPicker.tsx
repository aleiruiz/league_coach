import { useEffect, useRef, useState } from "react";
import { Champion, searchChampions } from "./game";
import { t } from "./i18n";

type Props = {
  champions: Champion[];
  taken: Set<string>;
  title: string;
  onPick: (id: string) => void;
  onClose?: () => void;
  /** Part of the page (Next game's champ select) instead of a dialog over it. */
  inline?: boolean;
  /** The search field, for the page to focus when a slot is chosen. */
  searchRef?: React.RefObject<HTMLInputElement | null>;
  /** Shown next to the title (e.g. "Mark as your lane opponent"). */
  extra?: React.ReactNode;
};

const TAGS: [string, string, string][] = [
  ["Fighter", "Fighter", "Luchador"],
  ["Tank", "Tank", "Tanque"],
  ["Mage", "Mage", "Mago"],
  ["Assassin", "Assassin", "Asesino"],
  ["Marksman", "Marksman", "Tirador"],
  ["Support", "Support", "Soporte"],
];

function ChampionPicker({ champions, taken, title, onPick, onClose, inline, searchRef, extra }: Props) {
  const [query, setQuery] = useState("");
  const own = useRef<HTMLInputElement>(null);
  const input = searchRef ?? own;
  const [tag, setTag] = useState<string | null>(null);
  const results = searchChampions(champions, query).filter((c) => !tag || c.tags.includes(tag));

  useEffect(() => {
    if (!inline) input.current?.focus();
  }, []);

  useEffect(() => {
    if (inline || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const body = (
    <>
        <header className="picker-header">
          <h3 id={inline ? "picker-title" : undefined}>{title}</h3>
          {extra}
          <input
            ref={input}
            aria-label={t("Search champion", "Buscar campeón")}
            placeholder={t("Search champion…", "Buscar campeón…")}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !query.trim()) return;
              // Enter elige el primer libre solo si ya se escribió algo.
              const first = results.find((c) => !taken.has(c.id));
              if (first) {
                onPick(first.id);
                setQuery("");
              }
            }}
          />
          {!inline && onClose && (
            <button className="secondary" onClick={onClose}>
              {t("Close", "Cerrar")}
            </button>
          )}
        </header>
        <div className="picker-tags" role="group" aria-label={t("Filter by class", "Filtrar por clase")}>
          <button className={tag === null ? "chip on" : "chip"} aria-pressed={tag === null} onClick={() => setTag(null)}>
            {t("All", "Todos")}
          </button>
          {TAGS.map(([id, en, es]) => (
            <button key={id} className={tag === id ? "chip on" : "chip"} aria-pressed={tag === id} onClick={() => setTag(tag === id ? null : id)}>
              {t(en, es)}
            </button>
          ))}
        </div>
        <div className="picker-grid">
          {results.map((c) => (
            <button
              key={c.id}
              className="champ-tile"
              disabled={taken.has(c.id)}
              onClick={() => {
                onPick(c.id);
                setQuery("");
              }}
              title={`${c.name}, ${c.title}`}
            >
              <img src={c.image} alt="" loading="lazy" />
              <span>{c.name}</span>
            </button>
          ))}
          {results.length === 0 && (
            <p className="muted picker-empty">{tag
                ? t("No champion of that class matches the search.", "Ningún campeón de esa clase coincide con la búsqueda.")
                : t("No champions with that name.", "No hay campeones con ese nombre.")}</p>
          )}
        </div>
    </>
  );
  if (inline) {
    return (
      <section className="picker inline" aria-labelledby="picker-title">
        {body}
      </section>
    );
  }
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>
  );
}

export default ChampionPicker;
