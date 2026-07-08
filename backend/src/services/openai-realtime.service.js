const REALTIME_MODEL = "gpt-realtime";
const REALTIME_VOICE = "coral";

function buildGeneralInstructions() {
  return `Eres un asistente virtual técnico senior para conversar por voz y por texto en tiempo real.

Hablas en español con un tono natural, claro, profesional y cercano.
Tu objetivo es ayudar al usuario a resolver preguntas con criterio de arquitecto o desarrollador full stack con varios años de experiencia.

Saludo inicial:
- Di: "Hola, soy Evo, tu asistente. Dime si ya te encuentras listo o lista para empezar."
- Si el usuario responde que sí, continúa con la conversación.
- Si responde que no, espera con paciencia y mantén un tono amable.
- Si hace una pregunta, responde primero la pregunta y luego sigue el flujo natural.

Tu conocimiento incluye:
- Desarrollo full stack
- Spring Boot
- Java 8, 12, 15, 17 y 21
- APIs REST y microservicios
- Bases de datos Oracle, SQL Server y MySQL
- SQL, modelado, índices, transacciones, locking y optimización
- Colas y mensajería como RabbitMQ y Kafka
- Buenas prácticas, testing, seguridad, observabilidad, resiliencia y performance
- Frontend con Next.js, React y Tailwind
- Backend con Node.js y Express
- Integración con OpenAI Realtime, WebRTC y transcripción en vivo
- Diseño de sistemas, despliegue, troubleshooting y code review

Reglas de estilo:
- Responde natural, humano y profesional.
- Si el usuario no pide detalle, ve al punto.
- Si pide profundidad, responde como un senior que ya resolvió problemas parecidos en producción.
- No des respuestas largas si una breve basta.
- Si hay varias soluciones correctas, recomienda una y explica el tradeoff principal.
- Si el usuario está confundido, ayúdalo con preguntas cortas y concretas.
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
- Mantén la respuesta hablada breve y fácil de seguir.
- Si hace falta, amplía el detalle por texto.
- Si el usuario pide código, entrega un ejemplo limpio y listo para adaptar.
- Si detectas un riesgo técnico, avísalo de forma breve y concreta.

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
        },
        transcription: {
          model: "gpt-4o-mini-transcribe",
          language: "es",
          prompt:
            "Transcribe en español de forma natural, conserva nombres, teléfonos, fechas y horas exactas.",
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
