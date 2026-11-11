import { useEffect, useMemo, useRef, useState } from "react";
import SafeMarkdown from "./SafeMarkdown";
import {
  applyEvent,
  cancelPrompt,
  humanizeError,
  pickKind,
  ProviderKind,
  sendPrompt,
} from "./providers";
import type { ProvidersState } from "./App";
import { t } from "./i18n";
import { NavIcon } from "./icons";

type Msg = { role: "user" | "assistant"; text: string; error?: string };

/** What the screen behind the panel is about, so questions don't repeat it. */
export type AskContext = {
  /** "Jax top against Darius": shown in "Talking about". */
  label: string;
  image?: string;
  /** Sent to the AI before a question whenever it changed. */
  prompt: string;
  /** Questions that fit this screen. */
  suggestions: string[];
};

/** Opens the "Ask the coach" panel, from the top of Next game and Improve. */
export function AskButton({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="secondary ask-button" onClick={onClick}>
      <NavIcon name="coach" />
      {label ?? t("Ask the coach", "Preguntar al coach")}
    </button>
  );
}

/** Questions for when no screen gives context. */
const general = () =>
  t(
    [
      "I'm playing Jax top against Darius, what build and runes?",
      "What went wrong in my last game as Ahri against Zed?",
      "How do I play Lee Sin's early game against a Kha'Zix?",
    ],
    [
      "Juego Jax top contra Darius, ¿qué build y runas?",
      "¿Qué salió mal en mi última partida con Ahri contra Zed?",
      "¿Cómo juego el early de Lee Sin contra un Kha'Zix?",
    ],
  );

/** What is sent: the screen's context (when it changed since the last question) and the question. */
export function withContext(
  question: string,
  context: AskContext | null,
  lastSent: string | null,
): string {
  if (!context?.prompt || context.prompt === lastSent) return question;
  return `${context.prompt}\n\n${t("My question:", "Mi pregunta:")} ${question}`;
}

/**
 * "Ask the coach": a side panel over Next game and Improve. It knows what the
 * screen shows (the picks and build, or the review), so a question can be
 * short. One conversation, kept while the panel is closed.
 */
function AskPanel({
  providers,
  open,
  context,
  onClose,
  onBusy,
  onGoToSettings,
}: {
  providers: ProvidersState;
  open: boolean;
  context: AskContext | null;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  onGoToSettings: () => void;
}) {
  const ready = useMemo(
    () => providers.list.filter((p) => p.logged_in),
    [providers.list],
  );
  const kind: ProviderKind | null = pickKind(ready, providers.preferred);
  const [usedKind, setUsedKind] = useState<ProviderKind | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sentContext, setSentContext] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => onBusy(busy), [busy, onBusy]);

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  // Escape closes the panel (focus goes back to the screen).
  useEffect(() => {
    if (!open) return;
    // A picker open beside the panel takes Escape for itself.
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" &&
      !document.querySelector('[aria-modal="true"]') &&
      onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function newChat() {
    setSessionId(null);
    setSentContext(null);
    setMessages([]);
  }

  function updateLast(f: (m: Msg) => Msg) {
    setMessages((ms) => [...ms.slice(0, -1), f(ms[ms.length - 1])]);
  }

  async function send(text?: string) {
    const question = (text ?? input).trim();
    if (!question || !kind || busy) return;
    // A conversation lives in one AI: a new default starts a new one.
    const fresh = usedKind !== kind;
    const session = fresh ? null : sessionId;
    // Without a session the AI has nothing yet, so the context goes again.
    const lastSent = fresh || !session ? null : sentContext;
    if (fresh) {
      setUsedKind(kind);
      setMessages([]);
    }
    const prompt = withContext(question, context, lastSent);
    // Counted as sent only once an answer arrives: a failed or stopped
    // question must not leave later ones without the picks and build.
    let answered = false;
    setInput("");
    setBusy(true);
    setStatus(t("Thinking…", "Pensando…"));
    setMessages((ms) => [
      ...(fresh ? [] : ms),
      { role: "user", text: question },
      { role: "assistant", text: "" },
    ]);
    const id = crypto.randomUUID();
    requestId.current = id;
    try {
      await sendPrompt(kind, prompt, session, id, (ev) => {
        if (ev.type === "session") setSessionId(ev.id);
        else if (ev.type === "status") setStatus(ev.text);
        else if (ev.type === "error") {
          answered = false;
          updateLast((m) => ({ ...m, error: humanizeError(ev.message) }));
        } else if (ev.type === "done") {
          setStatus(null);
          updateLast((m) =>
            m.text.trim() || m.error
              ? m
              : {
                  ...m,
                  error: t(
                    "The AI returned no answer. Test the connection in Settings › Your AI.",
                    "La IA no devolvió respuesta. Prueba la conexión en Ajustes › Tu IA.",
                  ),
                },
          );
        } else {
          if (ev.type === "delta" || ev.type === "message") {
            setStatus(null);
            answered = true;
          }
          updateLast((m) => ({ ...m, text: applyEvent(m.text, ev) }));
        }
      });
    } catch (e) {
      updateLast((m) => ({ ...m, error: humanizeError(String(e)) }));
    } finally {
      if (answered && requestId.current === id)
        setSentContext(context?.prompt ?? null);
      requestId.current = null;
      setBusy(false);
      setStatus(null);
    }
  }

  const suggestions = context?.suggestions.length
    ? context.suggestions
    : general();

  return (
    <aside
      className={open ? "ask-panel open" : "ask-panel"}
      aria-label={t("Ask the coach", "Preguntar al coach")}
      hidden={!open}
    >
      <header className="ask-head">
        <h2>{t("Ask the coach", "Preguntar al coach")}</h2>
        <div className="ask-head-actions">
          {messages.length > 0 && (
            <button
              type="button"
              className="link-button"
              onClick={newChat}
              disabled={busy}
            >
              {t("New conversation", "Nueva conversación")}
            </button>
          )}
          <button
            type="button"
            className="ask-close"
            onClick={onClose}
            aria-label={t("Close", "Cerrar")}
          >
            ×
          </button>
        </div>
      </header>

      {context && (
        <div className="ask-context">
          {context.image && <img src={context.image} alt="" />}
          <div>
            <span className="muted small">
              {t("Talking about", "Hablando de")}
            </span>
            <strong>{context.label}</strong>
          </div>
        </div>
      )}

      {!kind ? (
        <div className="ask-empty">
          <p className="muted">
            {providers.loading
              ? t("Checking your AI apps…", "Revisando tus apps de IA…")
              : t(
                  "Connect Claude or ChatGPT to ask the coach.",
                  "Conecta Claude o ChatGPT para preguntarle al coach.",
                )}
          </p>
          {!providers.loading && (
            <button onClick={onGoToSettings}>
              {t("Connect an AI", "Conectar una IA")}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="ask-messages" aria-live="polite">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <p key={i} className="ask-q">
                  {m.text}
                </p>
              ) : (
                <div key={i} className="ask-a">
                  <span className="muted small">{t("Coach", "Coach")}</span>
                  <SafeMarkdown>{m.text}</SafeMarkdown>
                  {m.error && <p className="error">⚠ {m.error}</p>}
                  {busy &&
                    i === messages.length - 1 &&
                    !m.text.trim() &&
                    !m.error && (
                      <p className="ask-waiting" role="status">
                        <span className="spinner" aria-hidden="true" />
                        {status || t("Thinking…", "Pensando…")}
                      </p>
                    )}
                </div>
              ),
            )}
            {status && busy && messages[messages.length - 1]?.text.trim() && (
              <p className="muted small">{status}</p>
            )}
            <div ref={bottom} />
          </div>

          {messages.length === 0 && (
            <div className="ask-suggest">
              <span className="muted small">
                {t("Try asking", "Prueba a preguntar")}
              </span>
              <div>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chip"
                    onClick={() => send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form
            className="ask-form"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label htmlFor="ask-input" className="muted small">
              {t(
                "Your question about this matchup or your games",
                "Tu pregunta sobre este enfrentamiento o tus partidas",
              )}
            </label>
            <div className="ask-row">
              <textarea
                id="ask-input"
                ref={field}
                rows={2}
                value={input}
                placeholder={t(
                  "e.g. What should I focus on next game?",
                  "p. ej. ¿En qué me enfoco la próxima partida?",
                )}
                onChange={(e) => setInput(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              {busy ? (
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    // A stopped question doesn't count as having sent the context.
                    const id = requestId.current;
                    requestId.current = null;
                    if (id) cancelPrompt(id);
                  }}
                >
                  {t("Stop", "Detener")}
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()}>
                  {t("Ask", "Preguntar")}
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </aside>
  );
}

export default AskPanel;
