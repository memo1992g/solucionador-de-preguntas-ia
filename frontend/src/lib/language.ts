export type ContentLanguage = "es" | "en";

const ENGLISH_HINTS = new Set([
  "the",
  "and",
  "what",
  "how",
  "why",
  "can",
  "could",
  "would",
  "should",
  "you",
  "i",
  "am",
  "is",
  "are",
  "when",
  "where",
  "because",
  "there",
  "this",
  "that",
  "with",
  "from",
  "for",
  "about",
  "between",
  "good",
  "better",
  "thanks",
  "thank",
  "please",
  "hello",
  "hi",
  "explain",
  "tell",
  "show",
  "help",
  "need",
  "want",
  "today",
  "dependency",
  "injection",
  "difference",
]);

const SPANISH_HINTS = new Set([
  "el",
  "la",
  "los",
  "las",
  "que",
  "como",
  "porque",
  "para",
  "entre",
  "cuando",
  "donde",
  "qué",
  "por",
  "con",
  "gracias",
  "hola",
  "buen",
  "mejor",
]);

export function normalizeLanguageText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function detectContentLanguage(...values: string[]): ContentLanguage {
  const text = normalizeLanguageText(values.join(" "));
  if (!text) return "es";

  if (/[áéíóúñ]/i.test(text)) return "es";
  if (/[äöüß]/i.test(text)) return "en";

  const tokens = text.split(" ").filter(Boolean);
  let englishScore = 0;
  let spanishScore = 0;

  for (const token of tokens) {
    if (ENGLISH_HINTS.has(token)) englishScore += 1;
    if (SPANISH_HINTS.has(token)) spanishScore += 1;
  }

  return englishScore > spanishScore ? "en" : "es";
}

export function buildResponseLanguageInstructions(language: ContentLanguage) {
  if (language === "en") {
    return [
      "Answer only in English.",
      "Do not mix Spanish and English in the same response.",
      "Keep the tone natural, concise, and interview-like.",
    ].join(" ");
  }

  return [
    "Responde solo en español.",
    "No mezcles español e inglés en la misma respuesta.",
    "Mantén un tono natural, breve y de entrevista.",
  ].join(" ");
}

export function lockConversationLanguage(
  current: ContentLanguage | null,
  detected: ContentLanguage
): ContentLanguage {
  return current ?? detected;
}
