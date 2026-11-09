import { afterEach, describe, expect, it } from "vitest";
import { applyEvent, humanizeError } from "./providers";
import { missingText, setLangForTests } from "./i18n";

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
  afterEach(() => setLangForTests("en"));

  it("explains usage limits and expired sessions, in English by default", () => {
    expect(humanizeError("Usage limit reached")).toMatch(/usage limit/);
    expect(humanizeError("401 Unauthorized")).toMatch(/Sign in again/);
  });

  it("answers in Spanish when the user picked it", () => {
    setLangForTests("es");
    expect(humanizeError("Usage limit reached")).toMatch(/límite de uso/);
    expect(humanizeError("401 Unauthorized")).toMatch(/Detalle: 401/);
  });

  it("asks to update the CLI if it doesn't know a flag", () => {
    expect(humanizeError("Error: Unknown feature flag: browser_use")).toMatch(/Update it/);
  });

  it("leaves the app's own messages as they are, in either language", () => {
    expect(humanizeError("Request stopped.")).toBe("Request stopped.");
    expect(humanizeError("Consulta detenida.")).toBe("Consulta detenida.");
  });
});

describe("missingText", () => {
  afterEach(() => setLangForTests("en"));

  it("joins the missing parts in the app language", () => {
    expect(missingText(["the summary"])).toBe("the summary is missing");
    expect(missingText(["the summary", "the boots"])).toBe("the summary and the boots are missing");
    setLangForTests("es");
    expect(missingText(["el resumen"])).toBe("falta el resumen");
    expect(missingText(["las botas"])).toBe("faltan las botas");
    expect(missingText(["el resumen", "las botas"])).toBe("faltan el resumen y las botas");
  });
});
