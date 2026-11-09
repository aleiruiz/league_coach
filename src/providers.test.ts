import { describe, expect, it } from "vitest";
import { applyEvent, humanizeError } from "./providers";

describe("applyEvent", () => {
  it("acumula deltas y separa bloques con break", () => {
    let t = "";
    t = applyEvent(t, { type: "break" });
    t = applyEvent(t, { type: "delta", text: "Hola" });
    t = applyEvent(t, { type: "break" });
    t = applyEvent(t, { type: "delta", text: "mundo" });
    expect(t).toBe("Hola\n\nmundo");
  });

  it("separa mensajes completos de Codex", () => {
    let t = applyEvent("", { type: "message", text: "uno" });
    t = applyEvent(t, { type: "message", text: "dos" });
    expect(t).toBe("uno\n\ndos");
  });

  it("usa final solo si no llegó texto", () => {
    expect(applyEvent("", { type: "final", text: "fin" })).toBe("fin");
    expect(applyEvent("ya", { type: "final", text: "fin" })).toBe("ya");
  });

  it("ignora eventos sin texto", () => {
    expect(applyEvent("x", { type: "status", text: "Buscando" })).toBe("x");
  });
});

describe("humanizeError", () => {
  it("traduce límites de uso y sesión caducada", () => {
    expect(humanizeError("Usage limit reached")).toMatch(/límite de uso/);
    expect(humanizeError("401 Unauthorized")).toMatch(/iniciar sesión/);
  });

  it("deja tal cual los mensajes propios", () => {
    expect(humanizeError("Consulta detenida.")).toBe("Consulta detenida.");
  });
});
