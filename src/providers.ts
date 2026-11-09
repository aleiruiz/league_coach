import { Channel, invoke } from "@tauri-apps/api/core";
import { t } from "./i18n";

export type ProviderKind = "claude_code" | "codex";

export type ProviderStatus = {
  kind: ProviderKind;
  label: string;
  install_url: string;
  installed: boolean;
  version: string | null;
  logged_in: boolean;
  detail: string | null;
};

export type ChatEvent =
  | { type: "session"; id: string }
  | { type: "delta"; text: string }
  | { type: "break" }
  | { type: "message"; text: string }
  | { type: "final"; text: string }
  | { type: "status"; text: string }
  | { type: "error"; message: string }
  | { type: "sources"; urls: string[] }
  | { type: "done" };

export function providerStatuses() {
  return invoke<ProviderStatus[]>("provider_statuses");
}

export function openLogin(kind: ProviderKind) {
  return invoke<void>("open_login", { kind });
}

export function testProvider(kind: ProviderKind) {
  return invoke<string>("test_provider", { kind });
}

export function cancelPrompt(requestId: string) {
  return invoke<void>("cancel_prompt", { requestId });
}

export function sendPrompt(
  kind: ProviderKind,
  prompt: string,
  sessionId: string | null,
  requestId: string,
  onEvent: (ev: ChatEvent) => void,
) {
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("send_prompt", {
    kind,
    prompt,
    sessionId,
    requestId,
    onEvent: channel,
  });
}

/** Applies an event to the answer text gathered so far. */
export function applyEvent(text: string, ev: ChatEvent): string {
  const sep = (t: string) => (t && !t.endsWith("\n\n") ? "\n\n" : "");
  switch (ev.type) {
    case "delta":
      return text + ev.text;
    case "break":
      return text + sep(text);
    case "message":
      return text + sep(text) + ev.text;
    case "final":
      return text.trim() ? text : ev.text;
    default:
      return text;
  }
}

const knownErrors = (): [RegExp, string][] => [
  [
    /unknown feature flag|unexpected argument|unrecognized option/i,
    t(
      "Your version of the model's program is old. Update it (e.g. npm i -g @openai/codex) and try again.",
      "Tu versión del programa del modelo es antigua. Actualízala (p. ej. npm i -g @openai/codex) y vuelve a probar.",
    ),
  ],
  [
    /usage limit|rate limit|quota|too many requests|429/i,
    t(
      "You reached your plan's usage limit. Wait a while or switch models in Models.",
      "Llegaste al límite de uso de tu plan. Espera un rato o cambia de modelo en Modelos.",
    ),
  ],
  [
    /not logged in|unauthori[sz]ed|authentication|401|expired|invalid api key|log ?in again/i,
    t(
      "The session isn't valid or has expired. Sign in again in Models.",
      "La sesión no es válida o caducó. Vuelve a iniciar sesión en Modelos.",
    ),
  ],
  [
    /is not installed|no está instalado|not found|enoent/i,
    t(
      "I can't find the model's program. Check the installation in Models.",
      "No encuentro el programa del modelo. Revisa la instalación en Modelos.",
    ),
  ],
  [
    /network|connect|timed out|dns|offline/i,
    t("Internet connection problem. Try again.", "Problema de conexión a internet. Inténtalo de nuevo."),
  ],
];

/** Messages the app writes itself (in either language): already readable. */
const APP_MESSAGE =
  /^(Request stopped|Consulta detenida|The model took|El modelo tardó|Codex tried|Codex intentó|Invalid conversation id|Id de conversación)/;

/** Turns common CLI errors into a readable message with the suggested action. */
export function humanizeError(raw: string): string {
  if (APP_MESSAGE.test(raw)) return raw;
  for (const [re, msg] of knownErrors()) {
    if (re.test(raw)) return `${msg} (${t("Detail", "Detalle")}: ${raw})`;
  }
  return raw;
}

export type LimitWindow = {
  id: string;
  used_percent: number;
  window_minutes: number | null;
  resets_at: number | null;
};

export type UsageBucket = { hour: number; input: number; cached: number; output: number; queries: number };

export type ProviderUsage = {
  kind: ProviderKind;
  buckets: UsageBucket[];
  limits: { windows: LimitWindow[]; seen_at: number } | null;
  limits_source: "answer" | "live" | null;
  limits_error: string | null;
};

export type ModelOption = { id: string; name: string; description: string };

export type ProviderModels = {
  selected: string | null;
  options: ModelOption[];
  default_name: string | null;
  error: string | null;
};

export function usageOverview(kind: ProviderKind) {
  return invoke<ProviderUsage>("usage_overview", { kind });
}

export function providerModels(kind: ProviderKind) {
  return invoke<ProviderModels>("provider_models", { kind });
}

export function setProviderModel(kind: ProviderKind, model: string | null) {
  return invoke<void>("set_provider_model", { kind, model });
}
