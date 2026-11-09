import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { applyEvent, ProviderKind, ProviderStatus, sendPrompt } from "./providers";

type Msg = { role: "user" | "assistant"; text: string; error?: string };

type Props = { providers: ProviderStatus[]; onGoToModels: () => void };

function Chat({ providers, onGoToModels }: Props) {
  const ready = providers.filter((p) => p.logged_in);
  const [kind, setKind] = useState<ProviderKind | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!kind && ready.length) setKind(ready[0].kind);
  }, [ready, kind]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  function newChat() {
    setSessionId(null);
    setMessages([]);
  }

  function updateLast(f: (m: Msg) => Msg) {
    setMessages((ms) => [...ms.slice(0, -1), f(ms[ms.length - 1])]);
  }

  async function send() {
    const prompt = input.trim();
    if (!prompt || !kind || busy) return;
    setInput("");
    setBusy(true);
    setStatus("Pensando…");
    setMessages((ms) => [...ms, { role: "user", text: prompt }, { role: "assistant", text: "" }]);
    try {
      await sendPrompt(kind, prompt, sessionId, (ev) => {
        if (ev.type === "session") setSessionId(ev.id);
        else if (ev.type === "status") setStatus(ev.text);
        else if (ev.type === "error") updateLast((m) => ({ ...m, error: ev.message }));
        else if (ev.type === "done") setStatus(null);
        else {
          if (ev.type === "delta" || ev.type === "message") setStatus(null);
          updateLast((m) => ({ ...m, text: applyEvent(m.text, ev) }));
        }
      });
    } catch (e) {
      updateLast((m) => ({ ...m, error: String(e) }));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  if (!ready.length) {
    return (
      <section>
        <h2>Coach</h2>
        <p className="muted">
          Todavía no hay ningún modelo conectado. Conecta Claude o ChatGPT para
          empezar.
        </p>
        <button onClick={onGoToModels}>Conectar modelos</button>
      </section>
    );
  }

  return (
    <section className="chat">
      <header className="chat-header">
        <h2>Coach</h2>
        <select
          value={kind ?? ""}
          onChange={(e) => {
            setKind(e.currentTarget.value as ProviderKind);
            newChat();
          }}
          disabled={busy}
        >
          {ready.map((p) => (
            <option key={p.kind} value={p.kind}>
              {p.label}
            </option>
          ))}
        </select>
        <button className="secondary" onClick={newChat} disabled={busy}>
          Nueva conversación
        </button>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <p className="muted">
            Pregunta lo que quieras: "Juego Jax top contra Darius, ¿qué build y
            runas?" o "Voy 0/3 con Ahri, su Zed está muy adelantado, ¿qué
            compro?".
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role === "assistant" ? <Markdown>{m.text}</Markdown> : m.text}
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
          value={input}
          rows={2}
          placeholder="Escribe tu pregunta…"
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Enviar
        </button>
      </form>
    </section>
  );
}

export default Chat;
