import { invoke } from "@tauri-apps/api/core";

/** App language: English by default, Spanish only if the user picks it. */
export type Lang = "en" | "es";

export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
];

let current: Lang = "en";

export const currentLang = () => current;

/** Text in the current language: `t("Stop", "Detener")`. */
export function t<T>(en: T, es: T): T {
  return current === "es" ? es : en;
}

/** Reads the saved language before the first render (English if it fails). */
export async function loadLanguage(): Promise<Lang> {
  try {
    const l = await invoke<Lang>("get_language");
    if (l === "en" || l === "es") current = l;
  } catch {
    current = "en";
  }
  document.documentElement.lang = current;
  return current;
}

/** Saves the language; the backend reloads game data in that locale. */
export async function saveLanguage(l: Lang): Promise<void> {
  await invoke("set_language", { language: l });
  current = l;
  document.documentElement.lang = l;
}

/** "a, b and c" / «a, b y c» */
export function humanList(xs: string[]): string {
  const and = t(" and ", " y ");
  return xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")}${and}${xs[xs.length - 1]}`;
}

/** "the summary is missing" / «falta el resumen», «faltan las botas». */
export function missingText(xs: string[]): string {
  const list = humanList(xs);
  if (currentLang() === "es") {
    const plural = xs.length > 1 || /^(los|las) /.test(xs[0] ?? "");
    return `${plural ? "faltan" : "falta"} ${list}`;
  }
  const plural = xs.length > 1 || / (items|boots|shards|spells)$/.test(xs[0] ?? "");
  return `${list} ${plural ? "are" : "is"} missing`;
}

/** Only for tests. */
export function setLangForTests(l: Lang) {
  current = l;
}
