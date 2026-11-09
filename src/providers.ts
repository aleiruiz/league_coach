import { Channel, invoke } from "@tauri-apps/api/core";

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

/** Aplica un evento al texto acumulado de la respuesta. */
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

const KNOWN_ERRORS: [RegExp, string][] = [
  [
    /unknown feature flag|unexpected argument|unrecognized option/i,
    "Tu versión del programa del modelo es antigua. Actualízala (p. ej. npm i -g @openai/codex) y vuelve a probar.",
  ],
  [
    /usage limit|rate limit|quota|too many requests|429/i,
    "Llegaste al límite de uso de tu plan. Espera un rato o cambia de modelo en Modelos.",
  ],
  [
    /not logged in|unauthori[sz]ed|authentication|401|expired|invalid api key|log ?in again/i,
    "La sesión no es válida o caducó. Vuelve a iniciar sesión en Modelos.",
  ],
  [
    /no está instalado|not found|enoent/i,
    "No encuentro el programa del modelo. Revisa la instalación en Modelos.",
  ],
  [/network|connect|timed out|dns|offline/i, "Problema de conexión a internet. Inténtalo de nuevo."],
];

/** Traduce los errores comunes de los CLIs a un mensaje en español con la acción sugerida. */
export function humanizeError(raw: string): string {
  // Los mensajes que genera la app ya están en español.
  if (/^(Consulta detenida|El modelo tardó|Codex intentó|Id de conversación)/.test(raw)) {
    return raw;
  }
  for (const [re, msg] of KNOWN_ERRORS) {
    if (re.test(raw)) return `${msg} (Detalle: ${raw})`;
  }
  return raw;
}
