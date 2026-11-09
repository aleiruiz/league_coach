export type Key = "Q" | "W" | "E" | "R";

const BASIC: Key[] = ["Q", "W", "E"];
const ULT_LEVELS = [6, 11, 16];

/** Letras Q/W/E en el orden en que aparecen (p. ej. "E-Q-W" o "E, luego Q y W"). */
export function parseKeys(text: string): Key[] {
  return (text.toUpperCase().match(/\b[QWE]\b/g) ?? []) as Key[];
}

/**
 * Orden de habilidades nivel a nivel (1 a 18) con la regla estándar:
 * primeros niveles como los indica el modelo, R en 6/11/16 y después se
 * maximiza según `max`, sin pasar del rango que permite el nivel
 * (rango n desde el nivel 2n-1). Devuelve null si no hay datos.
 */
export function skillPath(max: string[], firstLevels: string): Key[] | null {
  const order = max.map((k) => k.trim().toUpperCase()).filter((k): k is Key => BASIC.includes(k as Key));
  if (order.length === 0) return null;
  for (const k of BASIC) if (!order.includes(k)) order.push(k);
  const first = parseKeys(firstLevels);
  const rank: Record<Key, number> = { Q: 0, W: 0, E: 0, R: 0 };
  const path: Key[] = [];
  for (let level = 1; level <= 18; level++) {
    let k: Key | undefined;
    if (ULT_LEVELS.includes(level)) k = "R";
    else {
      const allowed = (x: Key) => rank[x] < 5 && rank[x] + 1 <= Math.floor((level + 1) / 2);
      const wanted = first[path.filter((p) => p !== "R").length];
      k = wanted && allowed(wanted) && path.length < first.length + 1 ? wanted : order.find(allowed);
    }
    if (!k) return path;
    rank[k]++;
    path.push(k);
  }
  return path;
}
