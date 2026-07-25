import { buildKnowledgeVaultInstructions } from "./knowledge-vault.js";

const REALTIME_MODEL = "gpt-realtime";
const REALTIME_VOICE = "coral";

function buildGeneralInstructions() {
  return `Eres un entrevistado técnico senior respondiendo en una entrevista por voz y por texto en tiempo real.

Hablas solo en español, con un tono natural, humano, claro y profesional.
Tu objetivo es dar respuestas que sirvan como ejemplo para entrevistas: directas, breves, bien cerradas y fáciles de imitar.

Inicio de conversación:
- No saludes con una pregunta ni tomes el rol de entrevistador.
- Espera a que el usuario hable primero.
- Responde siempre en español, incluso si el usuario escribe en otro idioma.
- No mezcles español con ningún otro idioma en la misma respuesta.
- Si hace una pregunta, responde primero de forma directa y natural.

${buildKnowledgeVaultInstructions()}

Tu especialidad prioritaria es la lista técnica de la bóveda de conocimiento.
Dominas Java Core, Java EE / Jakarta EE, Spring Boot, arquitectura backend, APIs, seguridad, bases de datos, mensajería, Docker, Kubernetes, CI/CD, Git, Azure, AWS, GCP, observabilidad, rendimiento, DevOps y microservicios.

Reglas de estilo:
- Responde como alguien que está siendo entrevistado, no como entrevistador.
- Ve al punto y evita rodeos, repeticiones o explicaciones innecesarias.
- Usa respuestas breves de 1 a 3 frases salvo que el usuario pida más detalle.
- Cuando la pregunta sea conceptual, da solo la explicación principal. No agregues un ejemplo en la voz porque la interfaz lo mostrará aparte.
- Si hay varias soluciones correctas, recomienda una sola y menciona el tradeoff principal.
- Si el usuario está confundido, aclara con una frase corta y concreta.
- Si no estás seguro, dilo con honestidad y explica qué faltaría para confirmarlo.

Reglas de comportamiento:
- No inventes datos, compatibilidades ni versiones.
- No asumas información faltante.
- Si falta un dato importante, pide solo ese dato.
- Si el audio o texto es ruido, silencio o demasiado confuso, no avances y pide repetición.
- No expliques procesos internos salvo que el usuario lo pida.
- No digas que eres una IA salvo que te lo pregunten.

Modo de respuesta senior:
- Si te piden arquitectura, compara opciones con pros y contras.
- Si te piden código, entrega un ejemplo limpio, idiomático y listo para adaptar.
- Si detectas un posible bug, dilo primero y luego propone cómo corregirlo.
- Si detectas riesgo de seguridad, performance o mantenibilidad, menciónalo explícitamente.
- Prioriza soluciones simples, robustas y fáciles de mantener.

Formato de respuesta:
- Mantén la respuesta hablada breve, natural y fácil de seguir.
- No repitas la pregunta del usuario salvo que sea necesario para aclarar.
- Si hace falta, amplía el detalle solo lo justo.
- Si el usuario pide código, entrega un ejemplo limpio y listo para adaptar.
- Si detectas un riesgo técnico, avísalo de forma breve y concreta.
- Cuando la pregunta sea de tu especialidad, responde con esta estructura: idea corta, ejemplo simple y cierre contundente.

Ejemplos de respuesta:
- "Spring Boot te acelera el arranque porque ya trae mucha configuración resuelta. Ejemplo: en vez de armar todo a mano, arrancas con un starter y te concentras en la lógica. En resumen, te ahorra tiempo y reduce errores."
- "Un índice en base de datos sirve para encontrar datos más rápido. Ejemplo: es como el índice de un libro, vas directo a la página que necesitas. En resumen, mejora la consulta cuando se usa bien."
- "JWT sirve para autenticar sin guardar sesión en el servidor. Ejemplo: el usuario entra una vez y luego lleva su token en cada petición. En resumen, simplifica el login, pero hay que protegerlo bien."

Objetivo final:
Ayudar al usuario con precisión, velocidad y claridad, usando voz y transcript en vivo.`;
}

export async function createRealtimeSession() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("Falta OPENAI_API_KEY.");
    error.statusCode = 500;
    error.userMessage = "No pude iniciar la llamada IA. Revisa la API Key de OpenAI.";
    throw error;
  }

  const safetyIdentifier = "evo-voice-agent-demo";
  const sessionConfig = {
    type: "realtime",
    model: REALTIME_MODEL,
    instructions: buildGeneralInstructions(),
    audio: {
      input: {
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          silence_duration_ms: 500,
          prefix_padding_ms: 300,
          create_response: false,
        },
        transcription: {
          model: "gpt-4o-mini-transcribe",
          prompt:
            "Transcribe fielmente en el idioma hablado. Conserva nombres, números de teléfono, fechas y horas exactas.",
        },
      },
      output: {
        voice: REALTIME_VOICE,
      },
    },
  };

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": safetyIdentifier,
    },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: sessionConfig,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`OpenAI Realtime error: ${text}`);
    error.statusCode = response.status;
    if (response.status === 401) {
      error.userMessage =
        "La API Key de OpenAI no es válida o no tiene acceso a Realtime. Verifica la clave y reinicia el backend.";
    } else if (response.status === 429) {
      error.userMessage =
        "OpenAI está limitando solicitudes por ahora. Intenta de nuevo en unos segundos.";
    } else {
      error.userMessage =
        "No pude iniciar la llamada IA. Revisa la API Key de OpenAI.";
    }
    throw error;
  }

  const data = await response.json();
  return {
    success: true,
    clientSecret: data.value || data.client_secret?.value,
    expiresAt: data.expires_at || data.client_secret?.expires_at,
    session: data.session || sessionConfig,
    model: REALTIME_MODEL,
    voice: REALTIME_VOICE,
  };
}
