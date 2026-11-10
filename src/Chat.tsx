import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import { openUrl } from "@tauri-apps/plugin-opener";
import { applyEvent, cancelPrompt, humanizeError, pickKind, ProviderKind, sendPrompt } from "./providers";
import type { ProvidersState } from "./App";
import { t } from "./i18n";

type Msg = { role: "user" | "assistant"; text: string; error?: string };

type Props = { providers: ProvidersState; onBusy: (busy: boolean) => void; onGoToModels: () => void };

const examples = () =>
  t(
    [
      "I'm playing Jax top against Darius, what build and runes?",
      "I'm 0/3 on Ahri and their Zed is way ahead, what do I buy?",
      "How do I play Lee Sin's early game against a Kha'Zix?",
    ],
    [
      "Juego Jax top contra Darius, ¿qué build y runas?",
      "Voy 0/3 con Ahri y su Zed está muy adelantado, ¿qué compro?",
      "¿Cómo juego el early de Lee Sin contra un Kha'Zix?",
    ],
  );

/** The model's links open in the system browser, never inside the app. */
const markdownComponents = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href?.startsWith("https://")) openUrl(href);
      }}
    >
      {children}
    </a>
  ),
};

const safeUrl = (url: string) => (url.startsWith("https://") ? url : "");

function Chat({ providers, onBusy, onGoToModels }: Props) {
  const ready = useMemo(() => providers.list.filter((p) => p.logged_in), [providers.list]);
  const [kind, setKind] = useState<ProviderKind | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  useEffect(() => onBusy(busy), [busy, onBusy]);
  const bottom = useRef<HTMLDivElement>(null);

  // If the chosen model stops being available, switch to the first one that is.
  useEffect(() => {
    // The previous model's conversation is no use in another: start a new one.
    if (!ready.some((p) => p.kind === kind)) {
      setKind(pickKind(ready, providers.preferred));
      setSessionId(null);
      setMessages([]);
    }
  }, [ready, kind, providers.preferred]);

  // A new default chosen in Models applies here only before a conversation
  // starts: switching would throw the conversation away.
  useEffect(() => {
    const p = providers.preferred;
    if (p && !busy && messages.length === 0 && ready.some((r) => r.kind === p)) setKind(p);
    // Only when the default itself changes.
  }, [providers.preferred]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  function newChat() {
    setSessionId(null);
    setMessages([]);
  }

  function changeKind(next: ProviderKind) {
    if (messages.length && !window.confirm(
          t(
            "Switching models starts a new conversation. Continue?",
            "Cambiar de modelo empieza una conversación nueva. ¿Continuar?",
          ),
        )) {
      return;
    }
    setKind(next);
    newChat();
  }

  function updateLast(f: (m: Msg) => Msg) {
    setMessages((ms) => [...ms.slice(0, -1), f(ms[ms.length - 1])]);
  }

  async function send(text?: string) {
    const prompt = (text ?? input).trim();
    if (!prompt || !kind || busy) return;
    setInput("");
    setBusy(true);
    setStatus(t("Thinking…", "Pensando…"));
    setMessages((ms) => [...ms, { role: "user", text: prompt }, { role: "assistant", text: "" }]);
    const id = crypto.randomUUID();
    requestId.current = id;
    try {
      await sendPrompt(kind, prompt, sessionId, id, (ev) => {
        if (ev.type === "session") setSessionId(ev.id);
        else if (ev.type === "status") setStatus(ev.text);
        else if (ev.type === "error") updateLast((m) => ({ ...m, error: humanizeError(ev.message) }));
        else if (ev.type === "done") {
          setStatus(null);
          updateLast((m) =>
            m.text.trim() || m.error ? m : {
                  ...m,
                  error: t(
                    "The model returned no answer. Test the connection in Settings › Your AI.",
                    "El modelo no devolvió respuesta. Prueba la conexión en Ajustes › Tu IA.",
                  ),
                },
          );
        } else {
          if (ev.type === "delta" || ev.type === "message") setStatus(null);
          updateLast((m) => ({ ...m, text: applyEvent(m.text, ev) }));
        }
      });
    } catch (e) {
      updateLast((m) => ({ ...m, error: humanizeError(String(e)) }));
    } finally {
      requestId.current = null;
      setBusy(false);
      setStatus(null);
    }
  }

  function stop() {
    if (requestId.current) cancelPrompt(requestId.current);
  }

  if (providers.loading && providers.list.length === 0) {
    return (
      <section>
        <h2>Coach</h2>
        <p className="muted">{t("Checking models…", "Comprobando modelos…")}</p>
      </section>
    );
  }

  if (!ready.length) {
    return (
      <section>
        <h2>Coach</h2>
        <p className="muted">
          {providers.error
            ? t(`Couldn't check the models: ${providers.error}`, `No pude comprobar los modelos: ${providers.error}`)
            : t(
                "No model is connected yet. Connect Claude or ChatGPT to get started.",
                "Todavía no hay ningún modelo conectado. Conecta Claude o ChatGPT para empezar.",
              )}
        </p>
        <button onClick={onGoToModels}>{t("Connect an AI", "Conectar una IA")}</button>
      </section>
    );
  }

  return (
    <section className="chat">
      <header className="chat-header">
        <h2>Coach</h2>
        <select
          aria-label={t("Model", "Modelo")}
          value={kind ?? ""}
          onChange={(e) => changeKind(e.currentTarget.value as ProviderKind)}
          disabled={busy}
        >
          {ready.map((p) => (
            <option key={p.kind} value={p.kind}>
              {p.label}
            </option>
          ))}
        </select>
        <button className="secondary" onClick={newChat} disabled={busy}>
          {t("New conversation", "Nueva conversación")}
        </button>
      </header>

      <div className="messages" aria-live="polite">
        {messages.length === 0 && (
          <div className="examples">
            <p className="muted">{t("Try:", "Prueba con:")}</p>
            {examples().map((ex) => (
              <button key={ex} className="chip" onClick={() => send(ex)}>
                {ex}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role === "assistant" ? (
              <Markdown components={markdownComponents} urlTransform={safeUrl}>
                {m.text}
              </Markdown>
            ) : (
              m.text
            )}
            {m.error && <p className="error">⚠ {m.error}</p>}
          </div>
        ))}
        {status && <p className="muted small">{status}</p>}
        <div ref={bottom} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          aria-label={t("Your question", "Tu pregunta")}
          value={input}
          rows={2}
          placeholder={t("Type your question…", "Escribe tu pregunta…")}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        {busy ? (
          <button type="button" className="danger" onClick={stop}>
            {t("Stop", "Detener")}
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}>
            {t("Send", "Enviar")}
          </button>
        )}
      </form>
    </section>
  );
}

export default Chat;
