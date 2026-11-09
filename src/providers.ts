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

export function sendPrompt(
  kind: ProviderKind,
  prompt: string,
  sessionId: string | null,
  onEvent: (ev: ChatEvent) => void,
) {
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("send_prompt", { kind, prompt, sessionId, onEvent: channel });
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
