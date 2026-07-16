import { describe, expect, it } from "vitest";
import {
  buildResponseLanguageInstructions,
  detectContentLanguage,
  lockConversationLanguage,
  normalizeLanguageText,
} from "./language";

describe("language detection", () => {
  it("detects English from a typical interview opening", () => {
    expect(detectContentLanguage("I am doing well, thanks for asking. How can I help you today?")).toBe("en");
  });

  it("detects Spanish from a typical interview opening", () => {
    expect(detectContentLanguage("Estoy bien, gracias por preguntar. ¿En qué te ayudo?")).toBe("es");
  });

  it("detects English for technical questions in English", () => {
    expect(detectContentLanguage("Hello, can you explain dependency injection?")).toBe("en");
  });

  it("detects Spanish for technical questions in Spanish", () => {
    expect(detectContentLanguage("Hola, ¿puedes explicarme la inyección de dependencias?")).toBe("es");
  });

  it("keeps a single language when the first message decides it", () => {
    const first = lockConversationLanguage(null, "en");
    const later = lockConversationLanguage(first, "es");

    expect(first).toBe("en");
    expect(later).toBe("en");
  });
});

describe("language instructions", () => {
  it("returns only English guidance for English", () => {
    const instructions = buildResponseLanguageInstructions("en");
    expect(instructions).toContain("Answer only in English.");
    expect(instructions).not.toContain("Responde solo en español.");
  });

  it("returns only Spanish guidance for Spanish", () => {
    const instructions = buildResponseLanguageInstructions("es");
    expect(instructions).toContain("Responde solo en español.");
    expect(instructions).not.toContain("Answer only in English.");
  });
});

describe("normalization", () => {
  it("normalizes accents and spacing", () => {
    expect(normalizeLanguageText("  Inyección   de   dependencias  ")).toBe("inyeccion de dependencias");
  });
});
