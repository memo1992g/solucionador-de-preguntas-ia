import { describe, expect, it } from "vitest";
import { normalizeLanguageText } from "./language";

describe("normalization", () => {
  it("normalizes accents and spacing", () => {
    expect(normalizeLanguageText("  Inyección   de   dependencias  ")).toBe("inyeccion de dependencias");
  });
});
