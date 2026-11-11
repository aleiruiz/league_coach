// Champion, item, spell and rune art for the Games screens, from Data Dragon.

import { useEffect, useMemo, useState } from "react";
import { Champion, GameData, gameData } from "./game";
import type { PlayerDetail } from "./matchDetails";
import { Lang, t } from "./i18n";

/** Images by Riot's ids: champions by name, spells and runes by number. */
export type Art = {
  version: string;
  champ: (id: string) => Champion | undefined;
  /** By Riot's numeric id, as bans come. */
  champByKey: (key: number) => Champion | undefined;
  spell: (key: number) => { name: string; image: string } | undefined;
  rune: (id: number) => { name: string; icon: string } | undefined;
  item: (id: number) => string | undefined;
};

export function useArt(lang: Lang): Art | null {
  const [data, setData] = useState<GameData | null>(null);
  useEffect(() => {
    let current = true;
    gameData()
      .then((d) => current && setData(d))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [lang]);
  return useMemo(() => {
    if (!data) return null;
    const champs = new Map(data.champions.map((c) => [c.id.toLowerCase(), c]));
    const byKey = new Map(data.champions.map((c) => [c.key, c]));
    const spells = new Map((data.spells ?? []).map((s) => [s.key, s]));
    const runes = new Map<number, { name: string; icon: string }>();
    for (const tree of data.rune_trees) {
      runes.set(tree.id, tree);
      for (const slot of tree.slots) for (const r of slot) runes.set(r.id, r);
    }
    const items = new Map((data.items ?? []).map((i) => [Number(i.id), i.name]));
    return {
      version: data.version,
      champ: (id) => champs.get(id.toLowerCase()),
      champByKey: (key) => byKey.get(key),
      spell: (key) => spells.get(key),
      rune: (id) => runes.get(id),
      item: (id) => items.get(id),
    };
  }, [data]);
}

export function Pic({ src, title, size, className }: { src?: string; title?: string; size: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <img className={className} src={src} alt="" title={title} width={size} height={size} onError={() => setBroken(true)} />
  ) : (
    <span className={`${className ?? ""} pic-missing`} title={title} style={{ width: size, height: size }} aria-hidden="true" />
  );
}

export function ChampPic({ art, id, size, className }: { art: Art | null; id: string; size: number; className?: string }) {
  const c = art?.champ(id);
  return <Pic src={c?.image} title={c?.name ?? id} size={size} className={className ?? "g-champ"} />;
}

export const champName = (art: Art | null, id: string) => art?.champ(id)?.name ?? id;

/** Bought items packed to the left, the trinket kept last. */
function packed(items: number[]): number[] {
  const bought = items.slice(0, 6).filter(Boolean);
  return [...bought, ...Array(6 - bought.length).fill(0), items[6] ?? 0];
}

export function Items({ p, art, size = 26 }: { p: PlayerDetail; art: Art | null; size?: number }) {
  const label = t("Final items", "Objetos finales");
  return (
    <span className="g-items" aria-label={label}>
      {packed(p.items).map((id, i) =>
        id ? (
          <Pic
            key={i}
            className={i === 6 ? "g-item trinket" : "g-item"}
            src={art ? `https://ddragon.leagueoflegends.com/cdn/${art.version}/img/item/${id}.png` : undefined}
            title={art?.item(id)}
            size={size}
          />
        ) : (
          <span key={i} className={i === 6 ? "g-item empty trinket" : "g-item empty"} aria-hidden="true" />
        ),
      )}
    </span>
  );
}

