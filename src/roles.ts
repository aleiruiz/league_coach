import type { Role } from "./game";

/**
 * Where each champion is usually played, to guess the roles of a team filled
 * without positions (the enemy team in champ select, everyone in a game in
 * progress). Weights: 3 main role, 2 common, 1 sometimes. Data Dragon ids.
 * A champion missing here (newer than this list) is guessed from its class
 * tags, see `tagWeights`.
 */
const TABLE: Record<string, string> = {
  Aatrox: "t3", Ahri: "m3", Akali: "m3 t2", Akshan: "m3 t1", Alistar: "s3", Ambessa: "t3 j1", Amumu: "j3 s2",
  Anivia: "m3 s1", Annie: "m3 s1", Aphelios: "a3", Ashe: "a3 s1", AurelionSol: "m3", Aurora: "m3 t2", Azir: "m3",
  Bard: "s3", Belveth: "j3", Blitzcrank: "s3", Brand: "s3 m1 j1", Braum: "s3", Briar: "j3",
  Caitlyn: "a3", Camille: "t3", Cassiopeia: "m3 t1", Chogath: "t3 m1", Corki: "m3 a1",
  Darius: "t3", Diana: "j3 m2", Draven: "a3", DrMundo: "t3 j1",
  Ekko: "j3 m2", Elise: "j3", Evelynn: "j3", Ezreal: "a3",
  Fiddlesticks: "j3", Fiora: "t3", Fizz: "m3",
  Galio: "m3 s1", Gangplank: "t3", Garen: "t3", Gnar: "t3", Gragas: "j3 t2 s1", Graves: "j3", Gwen: "t3 j1",
  Hecarim: "j3", Heimerdinger: "m3 t2 s2", Hwei: "m3 s1",
  Illaoi: "t3", Irelia: "t3 m2", Ivern: "j3",
  Janna: "s3", JarvanIV: "j3", Jax: "t3 j2", Jayce: "t3 m2", Jhin: "a3", Jinx: "a3",
  KSante: "t3", Kaisa: "a3", Kalista: "a3", Karma: "s3 m1", Karthus: "j3 m1", Kassadin: "m3", Katarina: "m3",
  Kayle: "t3 m1", Kayn: "j3", Kennen: "t3", Khazix: "j3", Kindred: "j3", Kled: "t3", KogMaw: "a3",
  Leblanc: "m3", LeeSin: "j3", Leona: "s3", Lillia: "j3 t1", Lissandra: "m3", Lucian: "a3 m1", Lulu: "s3", Lux: "s3 m2",
  Malphite: "t3 s1", Malzahar: "m3", Maokai: "s3 j2 t1", MasterYi: "j3", Mel: "m3 s2", Milio: "s3",
  MissFortune: "a3", MonkeyKing: "j3 t2", Mordekaiser: "t3", Morgana: "s3 j1",
  Naafiri: "m3", Nami: "s3", Nasus: "t3", Nautilus: "s3", Neeko: "m3 s2", Nidalee: "j3", Nilah: "a3",
  Nocturne: "j3", Nunu: "j3",
  Olaf: "t3 j2", Orianna: "m3", Ornn: "t3",
  Pantheon: "t3 s2 m2", Poppy: "t3 j2 s1", Pyke: "s3",
  Qiyana: "m3 j1", Quinn: "t3",
  Rakan: "s3", Rammus: "j3", RekSai: "j3", Rell: "s3", Renata: "s3", Renekton: "t3", Rengar: "j3 t1",
  Riven: "t3", Rumble: "t3 m1", Ryze: "m3 t1",
  Samira: "a3", Sejuani: "j3", Senna: "s3 a2", Seraphine: "s3 a2 m1", Sett: "t3 s1", Shaco: "j3 s1",
  Shen: "t3 s1", Shyvana: "j3", Singed: "t3", Sion: "t3", Sivir: "a3", Skarner: "j3 t2", Smolder: "a3 m1",
  Sona: "s3", Soraka: "s3", Swain: "s3 m2 a1", Sylas: "m3 j1", Syndra: "m3",
  TahmKench: "t3 s2", Taliyah: "j3 m2", Talon: "m3 j2", Taric: "s3", Teemo: "t3", Thresh: "s3",
  Tristana: "a3 m1", Trundle: "j3 t2", Tryndamere: "t3", TwistedFate: "m3", Twitch: "a3 j1",
  Udyr: "j3 t1", Urgot: "t3",
  Varus: "a3", Vayne: "a3 t1", Veigar: "m3", Velkoz: "s3 m2", Vex: "m3", Vi: "j3", Viego: "j3", Viktor: "m3",
  Vladimir: "m3 t2", Volibear: "t3 j2",
  Warwick: "j3 t1",
  Xayah: "a3", Xerath: "s3 m2", XinZhao: "j3",
  Yasuo: "m3 t2", Yone: "m3 t2", Yorick: "t3", Yunara: "a3", Yuumi: "s3",
  Zaahen: "t3 j1", Zac: "j3 t1", Zed: "m3", Zeri: "a3", Ziggs: "m3 a2", Zilean: "s3 m1", Zoe: "m3", Zyra: "s3",
};

const LETTER: Record<string, Role> = { t: "top", j: "jungle", m: "mid", a: "adc", s: "support" };

/** Weak guesses from Data Dragon's class tags, for champions the table doesn't know. */
const TAG_WEIGHTS: Record<string, Partial<Record<Role, number>>> = {
  Marksman: { adc: 2 },
  Support: { support: 2 },
  Mage: { mid: 2, support: 1 },
  Assassin: { mid: 2, jungle: 1 },
  Fighter: { top: 2, jungle: 1 },
  Tank: { top: 1, jungle: 1, support: 1 },
};

export function tagWeights(tags: string[]): Partial<Record<Role, number>> {
  const out: Partial<Record<Role, number>> = {};
  for (const tag of tags) {
    for (const [r, w] of Object.entries(TAG_WEIGHTS[tag] ?? {})) {
      const role = r as Role;
      out[role] = Math.max(out[role] ?? 0, w);
    }
  }
  return out;
}

/** How usual each role is for a champion (0 = never seen there). */
export function roleWeights(id: string, tags: string[] = []): Partial<Record<Role, number>> {
  const row = TABLE[id];
  if (!row) return tagWeights(tags);
  const out: Partial<Record<Role, number>> = {};
  for (const part of row.split(" ")) out[LETTER[part[0]]] = Number(part.slice(1));
  return out;
}

/** Only for tests: every champion the table lists. */
export const KNOWN_CHAMPIONS = Object.keys(TABLE);

export type RoleGuessInput = {
  id: string;
  tags?: string[];
  /** Carries Smite (a game in progress, or an ally in champ select): almost surely the jungler. */
  smite?: boolean;
  /** Its role is already known: it must stay there. */
  fixed?: Role;
};

/**
 * Gives each champion a different role from `roles`, the most likely
 * combination overall: it tries every assignment (a team has at most 5,
 * so at most 120) and keeps the one whose weights add up highest. Ties go
 * to the earlier assignment, so the result is stable. Returns null for a
 * champion left without a role (more champions than roles).
 */
export function guessRoles(champs: RoleGuessInput[], roles: Role[]): (Role | null)[] {
  const anySmite = champs.some((c) => c.smite);
  const score = (c: RoleGuessInput, r: Role): number => {
    if (c.fixed) return c.fixed === r ? 1000 : -1000;
    let s = roleWeights(c.id, c.tags)[r] ?? 0;
    if (c.smite) s += r === "jungle" ? 20 : -5;
    // Someone else has Smite: the jungle is taken.
    else if (anySmite && r === "jungle") s -= 10;
    return s;
  };
  let best: (Role | null)[] = champs.map(() => null);
  let bestScore = -Infinity;
  const pick: (Role | null)[] = [];
  const used = new Set<Role>();
  const walk = (i: number, total: number) => {
    if (i === champs.length) {
      if (total > bestScore) {
        bestScore = total;
        best = [...pick];
      }
      return;
    }
    let placed = false;
    for (const r of roles) {
      if (used.has(r)) continue;
      placed = true;
      used.add(r);
      pick.push(r);
      walk(i + 1, total + score(champs[i], r));
      pick.pop();
      used.delete(r);
    }
    // No role left for this one: leave it out.
    if (!placed) {
      pick.push(null);
      walk(i + 1, total);
      pick.pop();
    }
  };
  walk(0, 0);
  return best;
}
