import type { Role } from "./game";

/** Íconos propios (no son los de Riot): un minimapa con la línea resaltada. */
export function RoleIcon({ role, size = 18 }: { role: Role; size?: number }) {
  const on = "currentColor";
  const off = "color-mix(in srgb, currentColor 28%, transparent)";
  const path = (d: string, active: boolean) => (
    <path d={d} fill="none" stroke={active ? on : off} strokeWidth={active ? 2.4 : 1.6} strokeLinecap="round" strokeLinejoin="round" />
  );
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      {path("M3 15 V3 H15", role === "top")}
      {path("M5 17 H17 V5", role === "adc" || role === "support")}
      {path("M5.5 14.5 L14.5 5.5", role === "mid")}
      {role === "jungle" && (
        <g fill={on}>
          <circle cx="7" cy="8.5" r="1.7" />
          <circle cx="13" cy="11.5" r="1.7" />
        </g>
      )}
      {role === "support" && <circle cx="15" cy="15" r="2.6" fill={on} />}
    </svg>
  );
}

type NavName = "draft" | "progress" | "coach" | "models" | "settings";

export function NavIcon({ name }: { name: NavName }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "draft")
    return (
      <svg {...common}>
        <path d="M4 20 L14 10 M14 4 h6 v6 L10 20 l-6 0 0 -6 z" />
      </svg>
    );
  if (name === "progress")
    return (
      <svg {...common}>
        <path d="M4 19 h16 M6 16 l4 -5 3 3 5 -7" />
        <path d="M15 7 h3 v3" />
      </svg>
    );
  if (name === "coach")
    return (
      <svg {...common}>
        <path d="M4 5 h16 v11 h-9 l-4 3 v-3 h-3 z" />
      </svg>
    );
  if (name === "models")
    return (
      <svg {...common}>
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12 L20 3 M16 7 l3 3" />
    </svg>
  );
}
