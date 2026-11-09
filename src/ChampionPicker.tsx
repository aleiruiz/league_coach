import { useEffect, useRef, useState } from "react";
import { Champion, searchChampions } from "./game";

type Props = {
  champions: Champion[];
  taken: Set<string>;
  title: string;
  onPick: (id: string) => void;
  onClose: () => void;
};

function ChampionPicker({ champions, taken, title, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const results = searchChampions(champions, query);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <header className="picker-header">
          <h3>{title}</h3>
          <input
            ref={input}
            aria-label="Buscar campeón"
            placeholder="Buscar campeón…"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              const first = results.find((c) => !taken.has(c.id));
              if (e.key === "Enter" && first) onPick(first.id);
            }}
          />
          <button className="secondary" onClick={onClose}>
            Cerrar
          </button>
        </header>
        <div className="picker-grid">
          {results.map((c) => (
            <button
              key={c.id}
              className="champ-tile"
              disabled={taken.has(c.id)}
              onClick={() => onPick(c.id)}
              title={`${c.name}, ${c.title}`}
            >
              <img src={c.image} alt="" loading="lazy" />
              <span>{c.name}</span>
            </button>
          ))}
          {results.length === 0 && <p className="muted">No hay campeones con ese nombre.</p>}
        </div>
      </div>
    </div>
  );
}

export default ChampionPicker;
