"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { startRealtimeCall } from "@/lib/realtime";
import type { AudioQuality, CallStatus, RealtimeCallController, TranscriptEntry } from "@/lib/realtime";
import { CallStatus as StatusBadge } from "@/components/CallStatus";

const demoMode = String(process.env.NEXT_PUBLIC_DEMO_MODE || "").toLowerCase() === "true";
const FLOATING_LAYOUT_KEY = "solucionador-preguntas-ia:floating-layout";
const EXAMPLE_FLOATING_LAYOUT_KEY = "solucionador-preguntas-ia:example-floating-layout";

const statusLabel: Record<CallStatus, string> = {
  esperando: "Esperando",
  conectando: "Conectando",
  escuchando: "Escuchando",
  respondiendo: "Respondiendo",
  error: "Error",
};

const audioQualityClass: Record<AudioQuality, string> = {
  "Audio limpio": "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
  "Ruido moderado": "border-amber-500/20 bg-amber-500/10 text-amber-100",
  "No se escucha bien": "border-rose-500/20 bg-rose-500/10 text-rose-100",
};

function formatNowClock() {
  return new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeLookupText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type ContentLanguage = "es" | "en";

function toHumanExample(example: string) {
  return example.replace(/^(Ejemplo|Example):\s*/i, "").trim();
}

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
  "mejor",
]);

function detectContentLanguage(...values: string[]): ContentLanguage {
  const text = normalizeLookupText(values.join(" "));
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

const TOPIC_STOP_WORDS = new Set([
  "que",
  "es",
  "como",
  "para",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "y",
  "o",
  "en",
  "por",
  "con",
  "sobre",
  "explica",
  "definicion",
  "dime",
  "hablame",
  "muestrame",
  "cual",
  "cuál",
  "cuando",
  "cuándo",
  "diferencia",
  "ventaja",
  "ventajas",
  "desventaja",
  "desventajas",
]);

type InterviewStyle = "conceptual" | "comparison" | "advantage" | "process";

type TopicExample = {
  terms: string[];
  examples: Record<InterviewStyle, string>;
};

const TOPIC_EXAMPLES_ES: TopicExample[] = [
  {
    terms: ["herencia"],
    examples: {
      conceptual: "Ejemplo: como cuando un hijo aprende cosas de su papá o mamá.",
      comparison: "Ejemplo: sirve cuando quieres repetir menos cosas y aprovechar lo que ya existe.",
      advantage: "Ejemplo: te ahorra trabajo porque usas una base que ya está hecha.",
      process: "Ejemplo: primero haces una base y luego otra parte usa esa misma base.",
    },
  },
  {
    terms: ["encapsulacion"],
    examples: {
      conceptual: "Ejemplo: como una caja de juguetes con tapa, donde guardas las cosas para que no se mezclen.",
      comparison: "Ejemplo: es mejor que dejar todo tirado, porque así cuidas lo que tienes.",
      advantage: "Ejemplo: te ayuda a mantener todo ordenado y protegido.",
      process: "Ejemplo: guardas la información adentro y solo la sacas por una puerta segura.",
    },
  },
  {
    terms: ["polimorfismo"],
    examples: {
      conceptual: "Ejemplo: como usar el mismo control para prender cosas distintas.",
      comparison: "Ejemplo: una misma orden sirve para varias cosas sin cambiar la idea principal.",
      advantage: "Ejemplo: te deja cambiar una parte sin romper todo lo demás.",
      process: "Ejemplo: haces una regla común y varias cosas la siguen a su manera.",
    },
  },
  {
    terms: ["api rest", "rest", "endpoint"],
    examples: {
      conceptual: "Ejemplo: como un mesero que lleva tu pedido a la cocina y luego te trae la comida.",
      comparison: "Ejemplo: es útil porque todos saben qué pedir y qué recibir.",
      advantage: "Ejemplo: hace más fácil que dos sistemas se entiendan.",
      process: "Ejemplo: pides algo, lo buscan y te devuelven la respuesta.",
    },
  },
  {
    terms: ["microservic"],
    examples: {
      conceptual: "Ejemplo: como una feria con varios puestos, y cada puesto hace una cosa distinta.",
      comparison: "Ejemplo: es mejor que tener un solo puesto que haga todo.",
      advantage: "Ejemplo: si un puesto falla, los otros siguen funcionando.",
      process: "Ejemplo: separas el trabajo en partes pequeñas y cada una ayuda por su lado.",
    },
  },
  {
    terms: ["servicio"],
    examples: {
      conceptual: "Ejemplo: como un ayudante que hace una tarea específica en la cocina.",
      comparison: "Ejemplo: es mejor que meter todo en una sola persona.",
      advantage: "Ejemplo: así cada quien sabe qué hacer y no se confunde.",
      process: "Ejemplo: recibes la tarea y la pasas al ayudante correcto.",
    },
  },
  {
    terms: ["controlador", "controller"],
    examples: {
      conceptual: "Ejemplo: como la persona de la puerta que escucha y manda el pedido al lugar correcto.",
      comparison: "Ejemplo: es mejor que solo organice el trabajo y no haga todo él mismo.",
      advantage: "Ejemplo: así la app queda más ordenada y fácil de entender.",
      process: "Ejemplo: recibe lo que le piden, lo pasa al ayudante y devuelve la respuesta.",
    },
  },
  {
    terms: ["repository", "repositorio"],
    examples: {
      conceptual: "Ejemplo: como un cajón donde guardas y sacas información.",
      comparison: "Ejemplo: es mejor que buscar cosas por toda la casa.",
      advantage: "Ejemplo: te ayuda a encontrar y guardar datos más rápido.",
      process: "Ejemplo: primero guardas la cosa en el cajón y luego la buscas cuando la necesitas.",
    },
  },
  {
    terms: ["middleware"],
    examples: {
      conceptual: "Ejemplo: como un guardia en la puerta que revisa quién entra.",
      comparison: "Ejemplo: es mejor poner un solo guardia que revisar a mano cada vez.",
      advantage: "Ejemplo: evita que entren cosas o personas que no deben pasar.",
      process: "Ejemplo: revisa primero, y si todo está bien, deja seguir.",
    },
  },
  {
    terms: ["jwt", "token", "auth", "autenticacion", "autorizacion"],
    examples: {
      conceptual: "Ejemplo: como una pulsera que te dejan en un parque para saber que ya entraste.",
      comparison: "Ejemplo: es más fácil que enseñar tu nombre cada vez.",
      advantage: "Ejemplo: te ayuda a entrar sin repetir todo otra vez.",
      process: "Ejemplo: te dan la pulsera al entrar y la muestras después para pasar.",
    },
  },
  {
    terms: ["docker", "contenedor"],
    examples: {
      conceptual: "Ejemplo: como una lonchera que lleva la comida igual a cualquier lugar.",
      comparison: "Ejemplo: es mejor que llevar todo suelto, porque no se desordena.",
      advantage: "Ejemplo: así funciona casi igual en cualquier computadora.",
      process: "Ejemplo: metes todo en una caja y la abres donde la necesites.",
    },
  },
  {
    terms: ["ci/cd", "ci cd", "pipeline"],
    examples: {
      conceptual: "Ejemplo: como una fábrica donde primero revisan, luego empacan y al final envían.",
      comparison: "Ejemplo: es mejor que hacer todo a mano porque va más rápido y ordenado.",
      advantage: "Ejemplo: ayuda a que no se nos olvide ningún paso.",
      process: "Ejemplo: pasa por una fila de revisión antes de salir.",
    },
  },
  {
    terms: ["transaccion", "atomic", "atomicidad"],
    examples: {
      conceptual: "Ejemplo: como comprar todo junto en una sola bolsa o no comprar nada.",
      comparison: "Ejemplo: es mejor que dejar las cosas a medias.",
      advantage: "Ejemplo: evita que algo quede incompleto si pasa un problema.",
      process: "Ejemplo: haces todo el paquete y al final lo confirmas.",
    },
  },
  {
    terms: ["indice", "index"],
    examples: {
      conceptual: "Ejemplo: como el índice de un libro que te dice dónde está cada cosa.",
      comparison: "Ejemplo: es mejor que leer todo el libro para encontrar una página.",
      advantage: "Ejemplo: te ayuda a encontrar respuestas mucho más rápido.",
      process: "Ejemplo: marcas una página importante para ir directo ahí.",
    },
  },
  {
    terms: ["sql"],
    examples: {
      conceptual: "Ejemplo: como preguntarle a un bibliotecario dónde está un libro.",
      comparison: "Ejemplo: es mejor que buscar a ciegas en todo el cuarto.",
      advantage: "Ejemplo: te ayuda a pedir solo lo que necesitas.",
      process: "Ejemplo: haces la pregunta y la base te responde con la información.",
    },
  },
  {
    terms: ["join"],
    examples: {
      conceptual: "Ejemplo: como juntar dos piezas de rompecabezas para ver la imagen completa.",
      comparison: "Ejemplo: es mejor que mirar dos listas por separado.",
      advantage: "Ejemplo: te deja ver la relación entre dos cosas al mismo tiempo.",
      process: "Ejemplo: unes las piezas que tienen algo en común.",
    },
  },
  {
    terms: ["normalizacion"],
    examples: {
      conceptual: "Ejemplo: como guardar los juguetes por tipo en cajas distintas.",
      comparison: "Ejemplo: es mejor que meter todo mezclado en una sola caja.",
      advantage: "Ejemplo: así encuentras las cosas fácil y no repites información.",
      process: "Ejemplo: separas cada cosa en su lugar correcto.",
    },
  },
  {
    terms: ["base de datos", "bases de datos", "database", "db", "mysql", "postgres", "postgresql", "oracle", "sql server"],
    examples: {
      conceptual: "Ejemplo: como una caja grande donde guardas toda la información ordenada.",
      comparison: "Ejemplo: es mejor que tener papeles regados por todos lados.",
      advantage: "Ejemplo: te ayuda a guardar y encontrar datos sin perderte.",
      process: "Ejemplo: pones cada cosa en su lugar para encontrarla después.",
    },
  },
  {
    terms: ["cache", "caché"],
    examples: {
      conceptual: "Ejemplo: como tener una galleta cerca para no ir hasta la cocina cada vez.",
      comparison: "Ejemplo: es mejor que volver a buscar lo mismo una y otra vez.",
      advantage: "Ejemplo: te da la respuesta más rápido.",
      process: "Ejemplo: primero miras tu bolsita y solo si no está, vas a buscarla.",
    },
  },
  {
    terms: ["queue", "cola", "rabbitmq", "kafka"],
    examples: {
      conceptual: "Ejemplo: como la fila para subir al tobogán, donde cada niño espera su turno.",
      comparison: "Ejemplo: es mejor que empujarse todos al mismo tiempo.",
      advantage: "Ejemplo: ayuda a que todo se haga con orden.",
      process: "Ejemplo: te pones en la fila, esperas y luego te toca.",
    },
  },
  {
    terms: ["testing", "unitario", "unit test", "prueba unitaria"],
    examples: {
      conceptual: "Ejemplo: como probar un juguete antes de regalarlo.",
      comparison: "Ejemplo: es mejor revisar primero que descubrir el problema después.",
      advantage: "Ejemplo: evita sorpresas cuando ya todo está funcionando.",
      process: "Ejemplo: lo enciendes, ves si funciona y revisas si salió bien.",
    },
  },
  {
    terms: ["seguridad", "security", "seguro"],
    examples: {
      conceptual: "Ejemplo: como poner una cerradura en la puerta de tu casa.",
      comparison: "Ejemplo: es mejor que dejar la puerta abierta.",
      advantage: "Ejemplo: protege lo que no quieres que otros toquen.",
      process: "Ejemplo: revisas quién entra y solo dejas pasar a quien sí puede.",
    },
  },
  {
    terms: ["observabilidad", "logs", "metricas", "tracing"],
    examples: {
      conceptual: "Ejemplo: como una linterna que te deja ver en dónde se perdió algo.",
      comparison: "Ejemplo: es mejor que adivinar qué pasó.",
      advantage: "Ejemplo: te ayuda a encontrar problemas más rápido.",
      process: "Ejemplo: miras las pistas hasta saber dónde está el error.",
    },
  },
  {
    terms: ["performance"],
    examples: {
      conceptual: "Ejemplo: como encontrar un atajo para llegar más rápido al parque.",
      comparison: "Ejemplo: es mejor ir por el camino corto que por el largo.",
      advantage: "Ejemplo: hace que todo responda más rápido.",
      process: "Ejemplo: buscas qué está tardando más y lo arreglas primero.",
    },
  },
  {
    terms: ["escalabilidad"],
    examples: {
      conceptual: "Ejemplo: como poner más cajas en una fila cuando llegan más personas.",
      comparison: "Ejemplo: es mejor que una sola persona atienda todo.",
      advantage: "Ejemplo: así puedes atender a más sin que se haga un enredo.",
      process: "Ejemplo: agregas más ayuda cuando hay más trabajo.",
    },
  },
  {
    terms: ["ia", "inteligencia artificial", "llm", "prompt", "agente", "openai"],
    examples: {
      conceptual: "Ejemplo: como un robot que escucha y trata de ayudarte con respuestas.",
      comparison: "Ejemplo: es mejor que buscar todo en un libro gigante.",
      advantage: "Ejemplo: te ayuda a hacer tareas más rápido.",
      process: "Ejemplo: le dices qué quieres, lo piensa y te responde.",
    },
  },
  {
    terms: ["spring boot"],
    examples: {
      conceptual: "Ejemplo: como una caja de herramientas ya lista para empezar a construir.",
      comparison: "Ejemplo: es mejor que armar todo desde cero.",
      advantage: "Ejemplo: te ahorra tiempo para comenzar más rápido.",
      process: "Ejemplo: sacas las piezas listas y empiezas a usarlas.",
    },
  },
  {
    terms: ["java"],
    examples: {
      conceptual: "Ejemplo: como construir con bloques de LEGO bien ordenados.",
      comparison: "Ejemplo: es mejor cuando quieres algo fuerte y ordenado.",
      advantage: "Ejemplo: te ayuda a hacer programas claros y confiables.",
      process: "Ejemplo: unes bloques, luego otros bloques, hasta formar la casa.",
    },
  },
  {
    terms: ["angular"],
    examples: {
      conceptual: "Ejemplo: como un kit de LEGO que ya trae instrucciones para armarlo.",
      comparison: "Ejemplo: es mejor cuando quieres todo muy ordenado desde el inicio.",
      advantage: "Ejemplo: te da piezas y reglas para no perderte.",
      process: "Ejemplo: sigues las instrucciones, armas la pieza y la conectas con otra.",
    },
  },
  {
    terms: ["react"],
    examples: {
      conceptual: "Ejemplo: como jugar con bloques que puedes mover y cambiar rápido.",
      comparison: "Ejemplo: es mejor cuando quieres armarlo a tu manera.",
      advantage: "Ejemplo: te deja hacer cosas que se repiten sin volverlas a escribir.",
      process: "Ejemplo: haces pedacitos pequeños y luego los juntas.",
    },
  },
  {
    terms: ["hook"],
    examples: {
      conceptual: "Ejemplo: como un ganchito pequeño que te ayuda a agarrar algo.",
      comparison: "Ejemplo: es mejor que repetir la misma idea una y otra vez.",
      advantage: "Ejemplo: hace que la tarea sea más fácil de usar otra vez.",
      process: "Ejemplo: lo conectas y luego lo usas cuando lo necesitas.",
    },
  },
  {
    terms: ["estado", "state"],
    examples: {
      conceptual: "Ejemplo: como el marcador de un juego que dice cuánto va el partido.",
      comparison: "Ejemplo: es mejor tenerlo claro para no confundirte.",
      advantage: "Ejemplo: ayuda a que la pantalla cambie cuando algo cambia.",
      process: "Ejemplo: cambias el número y todo se actualiza solo.",
    },
  },
  {
    terms: ["next js", "nextjs"],
    examples: {
      conceptual: "Ejemplo: como un cuaderno que ya trae la respuesta lista cuando lo abres.",
      comparison: "Ejemplo: es mejor cuando quieres que algo cargue rápido y ordenado.",
      advantage: "Ejemplo: ayuda a mostrar la página más rápido.",
      process: "Ejemplo: primero preparas la hoja y luego la enseñas.",
    },
  },
  {
    terms: ["node"],
    examples: {
      conceptual: "Ejemplo: como un mensajero que lleva y trae recados rápido.",
      comparison: "Ejemplo: es mejor cuando quieres responder sin esperar mucho.",
      advantage: "Ejemplo: sirve para hacer cosas veloces y sencillas.",
      process: "Ejemplo: pones al mensajero a trabajar y le das sus rutas.",
    },
  },
  {
    terms: ["python"],
    examples: {
      conceptual: "Ejemplo: como una navaja suiza con muchas herramientas.",
      comparison: "Ejemplo: es mejor cuando quieres hacer muchas tareas con poco esfuerzo.",
      advantage: "Ejemplo: te sirve para resolver cosas rápido y fácil.",
      process: "Ejemplo: tomas una herramienta, la usas y ves el resultado.",
    },
  },
  {
    terms: ["c#"],
    examples: {
      conceptual: "Ejemplo: como usar un cuaderno bien ordenado para escribir tareas.",
      comparison: "Ejemplo: es mejor cuando trabajas con herramientas de Microsoft.",
      advantage: "Ejemplo: te ayuda a hacer programas grandes sin perder el orden.",
      process: "Ejemplo: escribes, organizas y conectas cada parte con cuidado.",
    },
  },
];

const TOPIC_EXAMPLES_EN: TopicExample[] = [
  {
    terms: ["herencia"],
    examples: {
      conceptual: "Example: like a child learning things from their mom or dad.",
      comparison: "Example: it helps when you want to repeat less and reuse what already exists.",
      advantage: "Example: it saves work because you start from something already built.",
      process: "Example: first you build a base, then another part uses that same base.",
    },
  },
  {
    terms: ["encapsulacion"],
    examples: {
      conceptual: "Example: like a toy box with a lid, where you keep things from mixing together.",
      comparison: "Example: it is better than leaving everything scattered around.",
      advantage: "Example: it helps keep things organized and protected.",
      process: "Example: you keep the information inside and only open it through a safe door.",
    },
  },
  {
    terms: ["polimorfismo"],
    examples: {
      conceptual: "Example: like using the same remote to turn on different things.",
      comparison: "Example: one order works for several things without changing the main idea.",
      advantage: "Example: it lets you change one part without breaking the rest.",
      process: "Example: you make one common rule and several things follow it their own way.",
    },
  },
  {
    terms: ["api rest", "rest", "endpoint"],
    examples: {
      conceptual: "Example: like a waiter taking your order to the kitchen and bringing the food back.",
      comparison: "Example: it works well because everyone knows what to ask for and what to expect.",
      advantage: "Example: it makes it easier for two systems to understand each other.",
      process: "Example: you ask for something, they look for it, and they send back the answer.",
    },
  },
  {
    terms: ["microservic"],
    examples: {
      conceptual: "Example: like a fair with many stalls, and each stall does one job.",
      comparison: "Example: it is better than having one stall do everything.",
      advantage: "Example: if one stall fails, the others keep working.",
      process: "Example: you split the work into small parts and each one helps on its own.",
    },
  },
  {
    terms: ["servicio"],
    examples: {
      conceptual: "Example: like an assistant who does one specific task in the kitchen.",
      comparison: "Example: it is better than putting everything on one person.",
      advantage: "Example: everyone knows their job and nobody gets confused.",
      process: "Example: you receive the task and pass it to the right helper.",
    },
  },
  {
    terms: ["controlador", "controller"],
    examples: {
      conceptual: "Example: like the person at the door who listens and sends the request to the right place.",
      comparison: "Example: it is better if it only organizes the work instead of doing everything itself.",
      advantage: "Example: that keeps the app cleaner and easier to understand.",
      process: "Example: it receives the request, passes it to the helper, and returns the answer.",
    },
  },
  {
    terms: ["repository", "repositorio"],
    examples: {
      conceptual: "Example: like a drawer where you store and take information out.",
      comparison: "Example: it is better than looking for things all over the house.",
      advantage: "Example: it helps you find and save data faster.",
      process: "Example: first you put the item in the drawer, then you look for it when needed.",
    },
  },
  {
    terms: ["middleware"],
    examples: {
      conceptual: "Example: like a guard at the door checking who gets in.",
      comparison: "Example: it is better than checking by hand every single time.",
      advantage: "Example: it keeps the wrong people or things from getting through.",
      process: "Example: it checks first, and if everything is fine, it lets them continue.",
    },
  },
  {
    terms: ["jwt", "token", "auth", "autenticacion", "autorizacion"],
    examples: {
      conceptual: "Example: like a wristband at a park that shows you already got in.",
      comparison: "Example: it is easier than saying your name every time.",
      advantage: "Example: it lets you get in without repeating everything again.",
      process: "Example: they give you the wristband when you enter and you show it later to pass through.",
    },
  },
  {
    terms: ["docker", "contenedor"],
    examples: {
      conceptual: "Example: like a lunch box that carries the food the same way anywhere.",
      comparison: "Example: it is better than carrying everything loose because nothing gets messy.",
      advantage: "Example: it works almost the same on any computer.",
      process: "Example: you put everything in a box and open it wherever you need it.",
    },
  },
  {
    terms: ["ci/cd", "ci cd", "pipeline"],
    examples: {
      conceptual: "Example: like a factory where they inspect, pack, and then ship.",
      comparison: "Example: it is better than doing everything by hand because it is faster and more organized.",
      advantage: "Example: it helps us not forget any step.",
      process: "Example: it goes through a review line before it leaves.",
    },
  },
  {
    terms: ["transaccion", "atomic", "atomicidad"],
    examples: {
      conceptual: "Example: like buying everything in one bag or not buying anything at all.",
      comparison: "Example: it is better than leaving things half done.",
      advantage: "Example: it avoids ending up with something incomplete if a problem happens.",
      process: "Example: you do the whole package and confirm it at the end.",
    },
  },
  {
    terms: ["indice", "index"],
    examples: {
      conceptual: "Example: like the index in a book that tells you where everything is.",
      comparison: "Example: it is better than reading the whole book to find one page.",
      advantage: "Example: it helps you find answers much faster.",
      process: "Example: you mark an important page so you can jump straight there.",
    },
  },
  {
    terms: ["sql"],
    examples: {
      conceptual: "Example: like asking a librarian where a book is.",
      comparison: "Example: it is better than searching blindly all over the room.",
      advantage: "Example: it helps you ask only for what you need.",
      process: "Example: you ask the question and the database gives you the information.",
    },
  },
  {
    terms: ["join"],
    examples: {
      conceptual: "Example: like putting two puzzle pieces together to see the full picture.",
      comparison: "Example: it is better than looking at two lists separately.",
      advantage: "Example: it lets you see the relationship between two things at the same time.",
      process: "Example: you connect the pieces that share something in common.",
    },
  },
  {
    terms: ["normalizacion"],
    examples: {
      conceptual: "Example: like keeping toys sorted into different boxes by type.",
      comparison: "Example: it is better than mixing everything into one box.",
      advantage: "Example: it makes things easier to find and avoids repeating information.",
      process: "Example: you put each thing in its proper place.",
    },
  },
  {
    terms: ["base de datos", "bases de datos", "database", "db", "mysql", "postgres", "postgresql", "oracle", "sql server"],
    examples: {
      conceptual: "Example: like a big box where you keep all the information in order.",
      comparison: "Example: it is better than having papers scattered everywhere.",
      advantage: "Example: it helps you store and find data without getting lost.",
      process: "Example: you place each thing in its own spot so you can find it later.",
    },
  },
  {
    terms: ["cache", "caché"],
    examples: {
      conceptual: "Example: like keeping a cookie nearby so you do not go back to the kitchen every time.",
      comparison: "Example: it is better than looking for the same thing over and over.",
      advantage: "Example: it gives you the answer faster.",
      process: "Example: you check your pocket first, and only go look if it is not there.",
    },
  },
  {
    terms: ["queue", "cola", "rabbitmq", "kafka"],
    examples: {
      conceptual: "Example: like the line for the slide, where each kid waits their turn.",
      comparison: "Example: it is better than everyone pushing at once.",
      advantage: "Example: it helps keep things orderly.",
      process: "Example: you get in line, wait, and then it is your turn.",
    },
  },
  {
    terms: ["testing", "unitario", "unit test", "prueba unitaria"],
    examples: {
      conceptual: "Example: like testing a toy before giving it away.",
      comparison: "Example: it is better to check first than to find the problem later.",
      advantage: "Example: it avoids surprises once everything is already running.",
      process: "Example: you turn it on, see if it works, and check if it came out right.",
    },
  },
  {
    terms: ["seguridad", "security", "seguro"],
    examples: {
      conceptual: "Example: like putting a lock on your front door.",
      comparison: "Example: it is better than leaving the door open.",
      advantage: "Example: it protects what you do not want others to touch.",
      process: "Example: you check who comes in and only let in the right people.",
    },
  },
  {
    terms: ["observabilidad", "logs", "metricas", "tracing"],
    examples: {
      conceptual: "Example: like a flashlight that helps you see where something got lost.",
      comparison: "Example: it is better than guessing what happened.",
      advantage: "Example: it helps you find problems faster.",
      process: "Example: you follow the clues until you find the error.",
    },
  },
  {
    terms: ["performance"],
    examples: {
      conceptual: "Example: like finding a shortcut to get to the park faster.",
      comparison: "Example: it is better to take the short road than the long one.",
      advantage: "Example: it makes everything respond faster.",
      process: "Example: you look for what is taking the longest and fix that first.",
    },
  },
  {
    terms: ["escalabilidad"],
    examples: {
      conceptual: "Example: like adding more boxes in a line when more people arrive.",
      comparison: "Example: it is better than having one person handle everything.",
      advantage: "Example: it lets you serve more people without creating a mess.",
      process: "Example: you add more help when there is more work.",
    },
  },
  {
    terms: ["ia", "inteligencia artificial", "llm", "prompt", "agente", "openai"],
    examples: {
      conceptual: "Example: like a robot that listens and tries to help with answers.",
      comparison: "Example: it is better than searching through a giant book.",
      advantage: "Example: it helps you finish tasks faster.",
      process: "Example: you tell it what you want, it thinks, and it answers you.",
    },
  },
  {
    terms: ["spring boot"],
    examples: {
      conceptual: "Example: like a toolbox that is ready to use right away.",
      comparison: "Example: it is better than building everything from scratch.",
      advantage: "Example: it saves time so you can start faster.",
      process: "Example: you grab the ready pieces and start using them.",
    },
  },
  {
    terms: ["java"],
    examples: {
      conceptual: "Example: like building with LEGO blocks that are neatly organized.",
      comparison: "Example: it is better when you want something strong and well organized.",
      advantage: "Example: it helps you make clear and reliable programs.",
      process: "Example: you connect blocks, then more blocks, until the house is built.",
    },
  },
  {
    terms: ["angular"],
    examples: {
      conceptual: "Example: like a LEGO kit that already comes with instructions.",
      comparison: "Example: it is better when you want everything organized from the start.",
      advantage: "Example: it gives you pieces and rules so you do not get lost.",
      process: "Example: you follow the instructions, build the piece, and connect it to another.",
    },
  },
  {
    terms: ["react"],
    examples: {
      conceptual: "Example: like playing with blocks you can move and change quickly.",
      comparison: "Example: it is better when you want to build it your own way.",
      advantage: "Example: it lets you reuse things that repeat without writing them again.",
      process: "Example: you make small pieces and then put them together.",
    },
  },
  {
    terms: ["hook"],
    examples: {
      conceptual: "Example: like a small hook that helps you grab something.",
      comparison: "Example: it is better than repeating the same idea over and over.",
      advantage: "Example: it makes the task easier to use again.",
      process: "Example: you connect it and then use it whenever you need it.",
    },
  },
  {
    terms: ["estado", "state"],
    examples: {
      conceptual: "Example: like the scoreboard in a game that shows the current score.",
      comparison: "Example: it is better when it is clear so you do not get confused.",
      advantage: "Example: it helps the screen change when something changes.",
      process: "Example: you change the number and everything updates by itself.",
    },
  },
  {
    terms: ["next js", "nextjs"],
    examples: {
      conceptual: "Example: like a notebook that already has the answer ready when you open it.",
      comparison: "Example: it is better when you want something to load fast and stay organized.",
      advantage: "Example: it helps show the page faster.",
      process: "Example: first you prepare the page, then you show it.",
    },
  },
  {
    terms: ["node"],
    examples: {
      conceptual: "Example: like a messenger who carries notes back and forth fast.",
      comparison: "Example: it is better when you want a response without waiting too long.",
      advantage: "Example: it is good for fast and simple things.",
      process: "Example: you put the messenger to work and give them their routes.",
    },
  },
  {
    terms: ["python"],
    examples: {
      conceptual: "Example: like a Swiss army knife with many tools.",
      comparison: "Example: it is better when you want to do many tasks with little effort.",
      advantage: "Example: it helps you solve things quickly and easily.",
      process: "Example: you take one tool, use it, and see the result.",
    },
  },
  {
    terms: ["c#"],
    examples: {
      conceptual: "Example: like using a well-organized notebook to write tasks.",
      comparison: "Example: it is better when you work with Microsoft tools.",
      advantage: "Example: it helps you build large programs without losing order.",
      process: "Example: you write, organize, and connect each part carefully.",
    },
  },
];

function inferInterviewStyle(question: string, answer: string): InterviewStyle {
  const source = normalizeLookupText(`${question} ${answer}`);

  if (
    source.includes("diferencia") ||
    source.includes("difference") ||
    source.includes("compar") ||
    source.includes(" vs ") ||
    source.includes(" compare ") ||
    source.includes("cual conviene") ||
    source.includes("cuál conviene") ||
    source.includes("which one") ||
    source.includes("best option") ||
    source.includes("mejor opcion") ||
    source.includes("mejor opción")
  ) {
    return "comparison";
  }

  if (
    source.includes("ventaja") ||
    source.includes("benefit") ||
    source.includes("advantage") ||
    source.includes("beneficio") ||
    source.includes("por que usar") ||
    source.includes("porque usar") ||
    source.includes("por qué usar") ||
    source.includes("why use") ||
    source.includes("por que elegir") ||
    source.includes("porque elegir") ||
    source.includes("why choose") ||
    source.includes("por qué elegir")
  ) {
    return "advantage";
  }

  if (
    source.includes("como") ||
    source.includes("how") ||
    source.includes("paso") ||
    source.includes("step") ||
    source.includes("proceso") ||
    source.includes("process") ||
    source.includes("implementar") ||
    source.includes("implement") ||
    source.includes("crear") ||
    source.includes("create") ||
    source.includes("construir") ||
    source.includes("build") ||
    source.includes("workflow") ||
    source.includes("flujo")
  ) {
    return "process";
  }

  return "conceptual";
}

function buildInterviewExample(question: string, answer: string) {
  const source = normalizeLookupText(`${question} ${answer}`);
  const style = inferInterviewStyle(question, answer);
  const language = detectContentLanguage(question, answer);
  const topicExamples = language === "en" ? TOPIC_EXAMPLES_EN : TOPIC_EXAMPLES_ES;

  for (const mapping of topicExamples) {
    if (mapping.terms.some((term) => source.includes(term))) {
      return toHumanExample(mapping.examples[style]);
    }
  }

  const questionTopic = normalizeLookupText(question)
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .split(" ")
    .filter((word) => word && !TOPIC_STOP_WORDS.has(word));

  const topic = questionTopic.slice(0, 3).join(" ") || "este concepto";
  const fallbackTopic = language === "en" ? "this concept" : "este concepto";

  if (style === "comparison") {
    return topic === fallbackTopic
      ? (language === "en"
          ? "It is like comparing two toys to see which one works better for you."
          : "Es como comparar dos juguetes para ver cuál te sirve más.")
      : language === "en"
        ? `It is like comparing ${topic} with another option to see which one works better for you.`
        : `Es como comparar ${topic} con otra opción para ver cuál te sirve más.`;
  }

  if (style === "advantage") {
    return topic === fallbackTopic
      ? (language === "en"
          ? "It is like choosing something that makes things easier."
          : "Es como elegir algo que te ayuda a hacer las cosas más fácil.")
      : language === "en"
        ? `It is like choosing ${topic} because it helps you do things more easily.`
        : `Es como elegir ${topic} porque te ayuda a hacer las cosas más fácil.`;
  }

  if (style === "process") {
    return topic === fallbackTopic
      ? (language === "en"
          ? "It is like building something step by step, first one part and then the next."
          : "Es como armar algo paso a paso, primero una parte y luego la otra.")
      : language === "en"
        ? `It is like building ${topic} step by step, first one part and then the next.`
        : `Es como armar ${topic} paso a paso, primero una parte y luego la otra.`;
  }

  return topic === fallbackTopic
    ? (language === "en"
        ? "It is like using an idea to solve a real-life task."
        : "Es como usar una idea para resolver una tarea de la vida real.")
    : language === "en"
      ? `It is like using ${topic} to solve a real-life task.`
      : `Es como usar ${topic} para resolver una tarea de la vida real.`;
}

type FloatingPosition = {
  x: number;
  y: number;
};

type FloatingLayout = {
  isFloating: boolean;
  isFloatingExpanded: boolean;
  isFloatingMinimized: boolean;
  position: FloatingPosition | null;
};

type PanelLayout = {
  isFloating: boolean;
  isFloatingExpanded: boolean;
  isFloatingMinimized: boolean;
  position: FloatingPosition | null;
};

export default function Page() {
  const [status, setStatus] = useState<CallStatus>("esperando");
  const [audioLevel, setAudioLevel] = useState(0.08);
  const [audioQuality, setAudioQuality] = useState<AudioQuality>("Ruido moderado");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const [isFloating, setIsFloating] = useState(false);
  const [isFloatingExpanded, setIsFloatingExpanded] = useState(false);
  const [isFloatingMinimized, setIsFloatingMinimized] = useState(false);
  const [floatingPosition, setFloatingPosition] = useState<FloatingPosition | null>(null);
  const [isExampleFloating, setIsExampleFloating] = useState(false);
  const [isExampleFloatingExpanded, setIsExampleFloatingExpanded] = useState(false);
  const [isExampleFloatingMinimized, setIsExampleFloatingMinimized] = useState(false);
  const [exampleFloatingPosition, setExampleFloatingPosition] = useState<FloatingPosition | null>(null);
  const [startPromptOpen, setStartPromptOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isMicPaused, setIsMicPaused] = useState(false);
  const callRef = useRef<RealtimeCallController | null>(null);
  const isMicPausedRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const floatingShellRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const exampleShellRef = useRef<HTMLElement | null>(null);
  const exampleDragStateRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const hasHydratedLayoutRef = useRef(false);
  const hasHydratedExampleLayoutRef = useRef(false);

  useEffect(() => () => callRef.current?.stop(), []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FLOATING_LAYOUT_KEY);
      if (!raw) return;

      const saved = JSON.parse(raw) as Partial<FloatingLayout>;
      setIsFloating(Boolean(saved.isFloating));
      setIsFloatingExpanded(Boolean(saved.isFloatingExpanded));
      setIsFloatingMinimized(Boolean(saved.isFloatingMinimized));
      if (saved.position && typeof saved.position.x === "number" && typeof saved.position.y === "number") {
        setFloatingPosition(saved.position);
      }
    } catch {
      // Ignore invalid persisted state.
    } finally {
      hasHydratedLayoutRef.current = true;
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(EXAMPLE_FLOATING_LAYOUT_KEY);
      if (!raw) return;

      const saved = JSON.parse(raw) as Partial<PanelLayout>;
      setIsExampleFloating(Boolean(saved.isFloating));
      setIsExampleFloatingExpanded(Boolean(saved.isFloatingExpanded));
      setIsExampleFloatingMinimized(Boolean(saved.isFloatingMinimized));
      if (saved.position && typeof saved.position.x === "number" && typeof saved.position.y === "number") {
        setExampleFloatingPosition(saved.position);
      }
    } catch {
      // Ignore invalid persisted state.
    } finally {
      hasHydratedExampleLayoutRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasHydratedLayoutRef.current) return;
    const payload: FloatingLayout = {
      isFloating,
      isFloatingExpanded,
      isFloatingMinimized,
      position: floatingPosition,
    };
    try {
      window.localStorage.setItem(FLOATING_LAYOUT_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  }, [floatingPosition, isFloating, isFloatingExpanded, isFloatingMinimized]);

  useEffect(() => {
    if (!hasHydratedExampleLayoutRef.current) return;
    const payload: PanelLayout = {
      isFloating: isExampleFloating,
      isFloatingExpanded: isExampleFloatingExpanded,
      isFloatingMinimized: isExampleFloatingMinimized,
      position: exampleFloatingPosition,
    };
    try {
      window.localStorage.setItem(EXAMPLE_FLOATING_LAYOUT_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  }, [exampleFloatingPosition, isExampleFloating, isExampleFloatingExpanded, isExampleFloatingMinimized]);

  useEffect(() => {
    if (!isFloating || isFloatingExpanded) return;
    if (floatingPosition) return;
    if (typeof window === "undefined") return;

    const width = Math.min(window.innerWidth - 24, 560);
    const height = Math.min(window.innerHeight - 24, 540);
    const maxX = Math.max(12, window.innerWidth - width - 12);
    const maxY = Math.max(12, window.innerHeight - height - 12);
    setFloatingPosition({
      x: clamp(window.innerWidth - width - 16, 12, maxX),
      y: clamp(window.innerHeight - height - 16, 12, maxY),
    });
  }, [floatingPosition, isFloating, isFloatingExpanded]);

  useEffect(() => {
    if (!isExampleFloating || isExampleFloatingExpanded) return;
    if (exampleFloatingPosition) return;
    if (typeof window === "undefined") return;

    const width = Math.min(window.innerWidth - 24, 420);
    const height = Math.min(window.innerHeight - 24, 320);
    const maxX = Math.max(12, window.innerWidth - width - 12);
    const maxY = Math.max(12, window.innerHeight - height - 12);
    setExampleFloatingPosition({
      x: clamp(window.innerWidth - width - 16, 12, maxX),
      y: clamp(window.innerHeight - height - 16, 12, maxY),
    });
  }, [exampleFloatingPosition, isExampleFloating, isExampleFloatingExpanded]);

  useEffect(() => {
    if (!isFloating || isFloatingExpanded || !floatingPosition) return;

    const handleResize = () => {
      setFloatingPosition((current) => {
        if (!current || !floatingShellRef.current) return current;

        const rect = floatingShellRef.current.getBoundingClientRect();
        const maxX = Math.max(12, window.innerWidth - rect.width - 12);
        const maxY = Math.max(12, window.innerHeight - rect.height - 12);

        return {
          x: clamp(current.x, 12, maxX),
          y: clamp(current.y, 12, maxY),
        };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [floatingPosition, isFloating, isFloatingExpanded]);

  useEffect(() => {
    if (!isExampleFloating || isExampleFloatingExpanded || !exampleFloatingPosition) return;

    const handleResize = () => {
      setExampleFloatingPosition((current) => {
        if (!current || !exampleShellRef.current) return current;

        const rect = exampleShellRef.current.getBoundingClientRect();
        const maxX = Math.max(12, window.innerWidth - rect.width - 12);
        const maxY = Math.max(12, window.innerHeight - rect.height - 12);

        return {
          x: clamp(current.x, 12, maxX),
          y: clamp(current.y, 12, maxY),
        };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [exampleFloatingPosition, isExampleFloating, isExampleFloatingExpanded]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries]);

  useEffect(() => {
    isMicPausedRef.current = isMicPaused;
  }, [isMicPaused]);

  useEffect(() => {
    if (!isCalling) return;

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return target.matches("input, textarea, select") || target.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      toggleMicPausedState();
    };

    const restoreMic = () => {
      if (!isMicPausedRef.current) return;
      setMicPausedState(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", restoreMic);
    document.addEventListener("visibilitychange", restoreMic);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", restoreMic);
      document.removeEventListener("visibilitychange", restoreMic);
    };
  }, [isCalling]);

  const orbStyle = useMemo(() => {
    const boost = isCalling ? 1 + audioLevel * 0.55 : 1;
    const glow = 0.25 + audioLevel * 0.8;
    return {
      transform: `scale(${boost})`,
      filter: `drop-shadow(0 0 ${18 + glow * 28}px rgba(204, 72, 255, ${0.35 + glow * 0.35})) drop-shadow(0 0 ${12 + glow * 20}px rgba(108, 102, 255, ${0.18 + glow * 0.28}))`,
    };
  }, [audioLevel, isCalling]);

  const latestAssistantText = useMemo(() => {
    return entries
      .filter((entry) => entry.speaker === "Asistente")
      .at(-1)?.text || "";
  }, [entries]);

  const latestUserText = useMemo(() => {
    return entries
      .filter((entry) => entry.speaker === "Usuario")
      .at(-1)?.text || "";
  }, [entries]);

  const latestInterviewExampleText = useMemo(() => {
    if (!latestAssistantText || !latestUserText) return "";
    return buildInterviewExample(latestUserText, latestAssistantText);
  }, [latestAssistantText, latestUserText]);

  const recentAssistantEntries = useMemo(
    () => entries.filter((entry) => entry.speaker === "Asistente").slice(-4),
    [entries]
  );

  const setMicPausedState = (paused: boolean) => {
    isMicPausedRef.current = paused;
    setIsMicPaused(paused);
    callRef.current?.setMicEnabled(!paused);
  };

  const toggleMicPausedState = () => {
    setMicPausedState(!isMicPausedRef.current);
  };

  const startCall = async () => {
    setError(null);
    setEntries([]);
    setLogs([]);

    try {
      const call = await startRealtimeCall({
        onStatusChange: setStatus,
        onTranscriptChange: setEntries,
        onError: (message) => {
          setError(message);
          setStatus("error");
        },
        onAudioLevel: setAudioLevel,
        onAudioQuality: setAudioQuality,
        onLog: (message) => setLogs((current) => [message, ...current].slice(0, 12)),
      });

      callRef.current = call;
      setIsCalling(true);
      setMicPausedState(false);
      setStatus("escuchando");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No pude iniciar la llamada IA. Revisa la API Key de OpenAI.";
      setError(message);
      setStatus("error");
      setIsCalling(false);
    }
  };

  const handleStart = () => {
    if (isCalling) return;
    setStartPromptOpen(true);
  };

  const handleCancelStart = () => {
    if (countdown !== null) return;
    setStartPromptOpen(false);
  };

  const handleConfirmStart = async () => {
    if (isCalling) return;
    setStartPromptOpen(false);
    setError(null);
    for (const value of [3, 2, 1]) {
      setCountdown(value);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setCountdown(null);
    await startCall();
  };

  const handleStop = () => {
    callRef.current?.stop();
    callRef.current = null;
    setIsCalling(false);
    isMicPausedRef.current = false;
    setIsMicPaused(false);
    setStatus("esperando");
    setAudioLevel(0.08);
    setAudioQuality("Ruido moderado");
    setStartPromptOpen(false);
    setCountdown(null);
  };

  const handleToggleFloating = () => {
    setIsFloating((current) => !current);
    setIsFloatingMinimized(false);
  };

  const handleToggleExpanded = () => {
    setIsFloatingExpanded((current) => !current);
    setIsFloatingMinimized(false);
  };

  const handleToggleMinimized = () => {
    setIsFloatingMinimized((current) => !current);
  };

  const handleToggleExampleFloating = () => {
    setIsExampleFloating((current) => !current);
    setIsExampleFloatingMinimized(false);
  };

  const handleToggleExampleExpanded = () => {
    setIsExampleFloatingExpanded((current) => !current);
    setIsExampleFloatingMinimized(false);
  };

  const handleToggleExampleMinimized = () => {
    setIsExampleFloatingMinimized((current) => !current);
  };

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isFloating || isFloatingExpanded || isFloatingMinimized) return;
    if (event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest("button")) return;
    if (!floatingShellRef.current) return;

    const rect = floatingShellRef.current.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) return;
    if (!floatingShellRef.current) return;

    const rect = floatingShellRef.current.getBoundingClientRect();
    const maxX = Math.max(12, window.innerWidth - rect.width - 12);
    const maxY = Math.max(12, window.innerHeight - rect.height - 12);
    const nextX = clamp(event.clientX - dragStateRef.current.offsetX, 12, maxX);
    const nextY = clamp(event.clientY - dragStateRef.current.offsetY, 12, maxY);
    setFloatingPosition({ x: nextX, y: nextY });
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) return;
    dragStateRef.current = null;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore capture release failures.
    }
  };

  const handleExampleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isExampleFloating || isExampleFloatingExpanded || isExampleFloatingMinimized) return;
    if (event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest("button")) return;
    if (!exampleShellRef.current) return;

    const rect = exampleShellRef.current.getBoundingClientRect();
    exampleDragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleExampleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!exampleDragStateRef.current || exampleDragStateRef.current.pointerId !== event.pointerId) return;
    if (!exampleShellRef.current) return;

    const rect = exampleShellRef.current.getBoundingClientRect();
    const maxX = Math.max(12, window.innerWidth - rect.width - 12);
    const maxY = Math.max(12, window.innerHeight - rect.height - 12);
    const nextX = clamp(event.clientX - exampleDragStateRef.current.offsetX, 12, maxX);
    const nextY = clamp(event.clientY - exampleDragStateRef.current.offsetY, 12, maxY);
    setExampleFloatingPosition({ x: nextX, y: nextY });
  };

  const handleExampleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!exampleDragStateRef.current || exampleDragStateRef.current.pointerId !== event.pointerId) return;
    exampleDragStateRef.current = null;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore capture release failures.
    }
  };

  const teleprompterShellClass = isFloating
    ? isFloatingExpanded
      ? "fixed inset-3 z-30 overflow-hidden rounded-[2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(18,18,28,0.98),rgba(6,6,10,0.98))] shadow-[0_30px_120px_rgba(0,0,0,0.72)] backdrop-blur-2xl transition-all duration-300"
      : isFloatingMinimized
        ? "fixed z-30 h-auto overflow-hidden rounded-[1.5rem] border border-white/12 bg-[linear-gradient(180deg,rgba(18,18,28,0.96),rgba(6,6,10,0.96))] shadow-[0_24px_90px_rgba(0,0,0,0.65)] backdrop-blur-2xl transition-all duration-300 w-[min(92vw,26rem)]"
        : "fixed z-30 max-h-[calc(100vh-1.5rem)] overflow-hidden rounded-[2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(18,18,28,0.96),rgba(6,6,10,0.96))] shadow-[0_30px_120px_rgba(0,0,0,0.65)] backdrop-blur-2xl transition-all duration-300 w-[min(92vw,34rem)]"
    : "sticky top-4 min-h-[calc(100vh-2rem)] overflow-hidden rounded-[1.7rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.04))] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-300 md:p-5";

  const teleprompterBodyClass = isFloating ? (isFloatingExpanded ? "h-full p-4 md:p-5" : "p-4 md:p-5") : "";
  const showTeleprompterContent = !isFloatingMinimized;

  const teleprompterShellStyle =
    isFloating && !isFloatingExpanded && floatingPosition
      ? {
          left: `${floatingPosition.x}px`,
          top: `${floatingPosition.y}px`,
        }
      : undefined;

  const exampleShellClass = isExampleFloating
    ? isExampleFloatingExpanded
      ? "fixed inset-3 z-20 overflow-hidden rounded-[2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(18,18,28,0.98),rgba(6,6,10,0.98))] shadow-[0_30px_120px_rgba(0,0,0,0.72)] backdrop-blur-2xl transition-all duration-300"
      : isExampleFloatingMinimized
        ? "fixed z-20 h-auto overflow-hidden rounded-[1.5rem] border border-white/12 bg-[linear-gradient(180deg,rgba(18,18,28,0.96),rgba(6,6,10,0.96))] shadow-[0_24px_90px_rgba(0,0,0,0.65)] backdrop-blur-2xl transition-all duration-300 w-[min(92vw,24rem)]"
        : "fixed z-20 max-h-[calc(100vh-1.5rem)] overflow-hidden rounded-[2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(18,18,28,0.96),rgba(6,6,10,0.96))] shadow-[0_30px_120px_rgba(0,0,0,0.65)] backdrop-blur-2xl transition-all duration-300 w-[min(92vw,28rem)]"
    : "rounded-[1.4rem] border border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),rgba(9,9,13,0.97))] p-5";

  const exampleBodyClass = isExampleFloating ? (isExampleFloatingExpanded ? "h-full p-4 md:p-5" : "p-4 md:p-5") : "";
  const showExampleContent = !isExampleFloatingMinimized;

  const exampleShellStyle =
    isExampleFloating && !isExampleFloatingExpanded && exampleFloatingPosition
      ? {
          left: `${exampleFloatingPosition.x}px`,
          top: `${exampleFloatingPosition.y}px`,
        }
      : undefined;

  const floatingPanel = (
    <section
      ref={floatingShellRef}
      className={teleprompterShellClass}
      style={teleprompterShellStyle}
    >
      <div
        className={teleprompterBodyClass}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.35em] text-white/35">Teleprompter en vivo</div>
            <div className="mt-1 text-sm text-white/70">Ventana flotante independiente</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleFloating}
              onPointerDown={(event) => event.stopPropagation()}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/75 transition hover:bg-white/10"
            >
              Fijar
            </button>
            <button
              onClick={handleToggleExpanded}
              onPointerDown={(event) => event.stopPropagation()}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/75 transition hover:bg-white/10"
            >
              {isFloatingExpanded ? "Reducir" : "Pantalla completa"}
            </button>
            <button
              onClick={handleToggleMinimized}
              onPointerDown={(event) => event.stopPropagation()}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/75 transition hover:bg-white/10"
            >
              {isFloatingMinimized ? "Abrir" : "Minimizar"}
            </button>
          </div>
        </div>

        {isFloatingMinimized ? (
          <div className="mt-3 rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80">
            Mini-player activo. Arrástrame o ábreme para ver el teleprompter completo.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-[1.4rem] border border-fuchsia-500/20 bg-[radial-gradient(circle_at_top_left,rgba(120,84,255,0.22),rgba(9,9,13,0.97))] p-5">
              <div className="text-[10px] uppercase tracking-[0.35em] text-white/35">Lo que dice Evo</div>
              <div className="mt-4 min-h-[180px]">
                {latestAssistantText ? (
                    <p
                      className="max-w-none font-semibold tracking-[-0.05em] text-white"
                      style={{
                        fontSize: isFloatingExpanded
                        ? "clamp(1.55rem, 3.2vw, 3.4rem)"
                        : "clamp(1.4rem, 2.8vw, 3rem)",
                      lineHeight: 1.14,
                    }}
                  >
                    {latestAssistantText}
                  </p>
                ) : (
                  <div className="flex h-full min-h-[180px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/15 px-6 text-center text-sm text-white/45">
                    Aquí aparecerá la respuesta del asistente en grande.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),rgba(9,9,13,0.97))] p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-[0.35em] text-white/35">Ejemplo</div>
                <div className="text-[11px] text-white/45">Solo lectura</div>
              </div>
              <div className="mt-4 min-h-[96px]">
                {latestInterviewExampleText ? (
                    <p
                      className="max-w-none font-medium tracking-[-0.03em] text-cyan-50"
                      style={{
                        fontSize: isFloatingExpanded ? "clamp(0.92rem, 1.6vw, 1.45rem)" : "clamp(0.84rem, 1.35vw, 1.15rem)",
                        lineHeight: 1.22,
                      }}
                    >
                    {latestInterviewExampleText}
                  </p>
                ) : (
                  <div className="flex min-h-[96px] items-center rounded-3xl border border-dashed border-white/10 bg-black/15 px-6 text-sm text-white/45">
                    El ejemplo corto aparecerá aquí y no se escuchará.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );

  const examplePanel = (
    <section ref={exampleShellRef} className={exampleShellClass} style={exampleShellStyle}>
      <div
        className={exampleBodyClass}
        onPointerDown={handleExampleDragStart}
        onPointerMove={handleExampleDragMove}
        onPointerUp={handleExampleDragEnd}
        onPointerCancel={handleExampleDragEnd}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.35em] text-white/35">Ejemplo</div>
            <div className="mt-1 text-sm text-white/70">Solo lectura</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleExampleFloating}
              onPointerDown={(event) => event.stopPropagation()}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/75 transition hover:bg-white/10"
            >
              {isExampleFloating ? "Fijar" : "Flotante"}
            </button>
            {isExampleFloating ? (
              <button
                onClick={handleToggleExampleExpanded}
                onPointerDown={(event) => event.stopPropagation()}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/75 transition hover:bg-white/10"
              >
                {isExampleFloatingExpanded ? "Reducir" : "Pantalla completa"}
              </button>
            ) : null}
            {isExampleFloating ? (
              <button
                onClick={handleToggleExampleMinimized}
                onPointerDown={(event) => event.stopPropagation()}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/75 transition hover:bg-white/10"
              >
                {isExampleFloatingMinimized ? "Abrir" : "Minimizar"}
              </button>
            ) : null}
          </div>
        </div>

        {isExampleFloatingMinimized ? (
          <div className="mt-3 rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80">
            Tarjeta minimizada. Ábreme para ver el ejemplo.
          </div>
        ) : showExampleContent ? (
          <div className="mt-4">
            {latestInterviewExampleText ? (
              <p
                className="max-w-none font-medium tracking-[-0.03em] text-cyan-50"
                style={{
                  fontSize: isExampleFloatingExpanded ? "clamp(1.05rem, 2vw, 2rem)" : "clamp(0.95rem, 1.8vw, 1.7rem)",
                  lineHeight: 1.16,
                }}
              >
                {latestInterviewExampleText}
              </p>
            ) : (
              <div className="flex min-h-[96px] items-center rounded-3xl border border-dashed border-white/10 bg-black/15 px-6 text-sm text-white/45">
                El ejemplo corto aparecerá aquí y no se escuchará.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div
        className={`mx-auto flex min-h-screen w-full max-w-6xl flex-col px-3 pt-3 md:px-6 md:pt-6 ${
          isFloating ? "pb-[26rem] md:pb-8" : "pb-10 md:pb-8"
        }`}
      >
        <header className="safe-top mb-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.45em] text-white/35">Voice Demo</div>
            <h1 className="text-lg font-semibold tracking-wide">Solucionador de Preguntas IA</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/70">
              Asistente técnico
            </span>
            <span className="rounded-full border border-fuchsia-500/25 bg-fuchsia-500/10 px-3 py-1 text-[11px] text-fuchsia-200">
              {demoMode ? "Demo" : "Realtime"}
            </span>
          </div>
        </header>

        <section className="grid items-start gap-6 lg:grid-cols-[0.72fr_1.28fr] xl:grid-cols-[0.68fr_1.32fr]">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[0_18px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl md:p-6 lg:sticky lg:top-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.45em] text-white/35">Conversacion por voz</p>
                <h2 className="mt-1 text-xl font-semibold tracking-wide text-white">Asistente en tiempo real</h2>
              </div>
              <StatusBadge status={status} />
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/35">Estado</div>
                <div className="mt-1 text-sm font-medium text-white">{statusLabel[status]}</div>
              </div>
              <div className="text-right text-[11px] text-white/45">
                <div>{formatNowClock()}</div>
                <div>WebRTC activo</div>
                {isCalling ? <div>{isMicPaused ? "Micrófono pausado" : "Micrófono activo"}</div> : null}
              </div>
            </div>

            {isCalling ? (
              <div
                className={`mt-3 rounded-2xl border px-4 py-3 transition ${
                  isMicPaused
                    ? "border-amber-500/25 bg-amber-500/10 text-amber-100"
                    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.28em] text-white/45">Control rápido</div>
                    <div className="mt-1 text-sm font-medium">
                      {isMicPaused ? "Micrófono detenido por barra espaciadora" : "Micrófono escuchando"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isMicPaused ? "bg-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.55)]" : "bg-emerald-300 shadow-[0_0_16px_rgba(74,222,128,0.55)]"
                      }`}
                    />
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold text-white/90">
                      {isMicPaused ? "Pausado" : "Activo"}
                    </span>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-white/65">
                  Presioná <span className="rounded-md border border-white/15 bg-black/30 px-1.5 py-0.5 font-semibold text-white">Espacio</span> para alternar entre escuchar y pausar.
                </div>
                <button
                  onClick={toggleMicPausedState}
                  className={`mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-semibold transition active:scale-[0.99] ${
                    isMicPaused
                      ? "border-amber-400/30 bg-amber-500/15 text-amber-100 hover:bg-amber-500/20"
                      : "border-emerald-400/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20"
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      isMicPaused
                        ? "bg-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.55)]"
                        : "bg-emerald-300 shadow-[0_0_16px_rgba(74,222,128,0.55)] animate-pulse"
                    }`}
                  />
                  {isMicPaused ? "Reanudar escucha" : "Pausar escucha"}
                </button>
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/35">Audio</div>
                <div className="mt-1 text-sm font-medium text-white">Calidad de señal</div>
              </div>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${audioQualityClass[audioQuality]}`}>
                {audioQuality}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(18,18,28,0.92),rgba(5,5,7,0.96))] p-4">
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-[radial-gradient(circle_at_center,rgba(22,22,34,1),rgba(7,7,10,0.98))]">
                <div
                  className={`absolute inset-0 rounded-full bg-[conic-gradient(from_180deg,rgba(205,64,255,0.95),rgba(112,102,255,0.95),rgba(205,64,255,0.95))] opacity-80 blur-[1px] transition duration-300 ${
                    isMicPaused ? "grayscale-0 saturate-75" : "animate-pulse"
                  }`}
                  style={orbStyle}
                />
                <div className="absolute inset-[2px] rounded-full bg-[radial-gradient(circle_at_center,rgba(18,18,28,0.96),rgba(6,6,10,0.98))]" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full border border-white/10 bg-black/55 backdrop-blur-md">
                    <span className="text-[9px] uppercase tracking-[0.3em] text-white/35">Voice</span>
                    <span className="mt-1 text-xs font-semibold text-white">AI</span>
                  </div>
                </div>
                <div className={`absolute -bottom-2 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.28em] ${isMicPaused ? "border-amber-400/25 bg-amber-500/15 text-amber-100" : "border-emerald-400/25 bg-emerald-500/15 text-emerald-100"}`}>
                  {isMicPaused ? "Pausado" : "Activo"}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/85 text-balance">
                  {isCalling
                    ? "La llamada está activa. Habla con naturalidad y la respuesta se irá viendo en pantalla mientras se escucha por audio."
                    : "Toca iniciar, concede permiso al micrófono y habla con el asistente en tiempo real."}
                </p>
                {isCalling ? (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-white/65">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isMicPaused ? "bg-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.55)]" : "bg-emerald-300 shadow-[0_0_16px_rgba(74,222,128,0.55)]"
                      }`}
                    />
                    <span>{isMicPaused ? "Espacio: micrófono pausado" : "Espacio: micrófono activo"}</span>
                  </div>
                ) : null}
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-white/10">
                    <div className="h-2 rounded-full bg-gradient-to-r from-fuchsia-400 to-indigo-400 transition-all duration-75" style={{ width: `${Math.max(12, audioLevel * 100)}%` }} />
                  </div>
                  <span className="text-[11px] text-white/45">Audio</span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button onClick={handleStart} disabled={isCalling} className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">
                Iniciar llamada
              </button>
              <button onClick={handleStop} disabled={!isCalling} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">
                Finalizar llamada
              </button>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
            ) : null}
          </div>

          <div className="space-y-4">
            {!isFloating ? (
            <section
              ref={floatingShellRef}
              className={teleprompterShellClass}
              style={teleprompterShellStyle}
            >
              <div
                className={teleprompterBodyClass}
                onPointerDown={handleDragStart}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
              >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.35em] text-white/35">Teleprompter en vivo</div>
                  <div className="mt-1 text-sm text-white/70">Una pantalla prioritaria para leer en grande</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleToggleFloating}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/75 transition hover:bg-white/10"
                  >
                    {isFloating ? "Fijar" : "Flotante"}
                  </button>
                  {isFloating ? (
                    <button
                      onClick={handleToggleExpanded}
                      onPointerDown={(event) => event.stopPropagation()}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/75 transition hover:bg-white/10"
                    >
                      {isFloatingExpanded ? "Reducir" : "Pantalla completa"}
                    </button>
                  ) : null}
                  {isFloating ? (
                    <button
                      onClick={handleToggleMinimized}
                      onPointerDown={(event) => event.stopPropagation()}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/75 transition hover:bg-white/10"
                    >
                      {isFloatingMinimized ? "Abrir" : "Minimizar"}
                    </button>
                  ) : null}
                  <div className="rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-3 py-1 text-[11px] text-fuchsia-100">
                    {countdown !== null ? `En ${countdown}` : status === "respondiendo" ? "Escribiendo..." : "En vivo"}
                  </div>
                </div>
              </div>

              {isFloating && isFloatingMinimized ? (
                <div className="mt-3 rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.35em] text-white/35">Mini-player</div>
                      <div className="mt-1 text-sm font-medium text-white">Teleprompter minimizado</div>
                    </div>
                    <div className="text-right text-[11px] text-white/55">
                      <div>{isFloatingExpanded ? "Pantalla completa" : "Ventana flotante"}</div>
                      <div>{statusLabel[status]}</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {showTeleprompterContent ? (
              <div className={`mt-4 grid gap-4 ${isFloating ? "grid-cols-1" : "md:grid-cols-[1.18fr_0.82fr]"}`}>
                <div className="rounded-[1.4rem] border border-fuchsia-500/20 bg-[radial-gradient(circle_at_top_left,rgba(120,84,255,0.22),rgba(9,9,13,0.97))] p-5 md:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] uppercase tracking-[0.35em] text-white/35">Lo que dice Evo</div>
                    <div className="flex items-center gap-2 text-[11px] text-white/45">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.55)]" />
                      En vivo
                    </div>
                  </div>

                  <div className="mt-4 min-h-[360px] md:min-h-[520px]">
                    {latestAssistantText ? (
                      <p
                      className="max-w-none whitespace-pre-wrap break-words font-semibold tracking-[-0.04em] text-white"
                      style={{
                        fontSize: isFloating
                          ? "clamp(1.45rem, 3vw, 3.2rem)"
                          : "clamp(1.25rem, 2.2vw, 2.4rem)",
                        lineHeight: 1.12,
                      }}
                    >
                        {latestAssistantText}
                        {isCalling ? (
                          <span className="ml-1 inline-block h-[0.95em] w-[0.14em] translate-y-[0.14em] animate-pulse rounded-full bg-fuchsia-300 align-middle" />
                        ) : null}
                      </p>
                    ) : (
                      <div className="flex h-full min-h-[220px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/15 px-6 text-center">
                        <div>
                          <div className="text-sm text-white/45">La respuesta del asistente aparecerá aquí en grande.</div>
                          <div className="mt-2 text-xs uppercase tracking-[0.3em] text-white/25">Habla para comenzar</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-[1.25rem] border border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),rgba(9,9,13,0.97))] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.35em] text-white/35">Cómo lo diría</div>
                  <div className="text-[11px] text-white/45">Solo lectura</div>
                </div>
                    <div className="mt-3 min-h-[120px]">
                      {latestInterviewExampleText ? (
                        <p
                          className="max-w-none whitespace-pre-wrap break-words font-medium tracking-[-0.03em] text-cyan-50"
                          style={{
                            fontSize: isFloating ? "clamp(0.92rem, 1.6vw, 1.5rem)" : "clamp(0.84rem, 1.35vw, 1.2rem)",
                            lineHeight: 1.22,
                          }}
                        >
                          {latestInterviewExampleText}
                        </p>
                      ) : (
                        <div className="flex min-h-[120px] items-center rounded-2xl border border-dashed border-white/10 bg-black/15 px-5 text-sm text-white/45">
                          El ejemplo corto aparecerá aquí y no se escuchará.
                        </div>
                      )}
                    </div>
                  </div>

                  {recentAssistantEntries.length > 0 ? (
                    <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                      {recentAssistantEntries.map((entry) => (
                        <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                          <p className="text-sm leading-6 text-white/82">{entry.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

              </div>
              ) : null}

              {showTeleprompterContent ? (
                <div className="mt-4 max-h-[240px] space-y-3 overflow-y-auto pr-1 hide-scrollbar">
                  {entries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/45">
                      La transcripción completa aparecerá aquí mientras dure la llamada.
                    </div>
                  ) : (
                    entries.slice(-8).map((entry) => (
                      <div
                        key={entry.id}
                        className={`rounded-2xl border p-4 transition ${
                          entry.speaker === "Asistente"
                            ? "border-fuchsia-500/20 bg-white/[0.07]"
                            : "border-white/10 bg-white/5"
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                            {entry.speaker}
                          </div>
                          {entry.speaker === "Asistente" ? (
                            <span className="rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] text-fuchsia-100">
                              En vivo
                            </span>
                          ) : null}
                        </div>
                        <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-6 text-white/90 md:text-[1rem] md:leading-7">
                          {entry.text || "..."}
                        </p>
                      </div>
                    ))
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              ) : null}
              </div>
            </section>
            ) : typeof window !== "undefined"
              ? createPortal(floatingPanel, document.body)
              : null}

            {isExampleFloating && typeof window !== "undefined" ? createPortal(examplePanel, document.body) : null}

            {!isExampleFloating ? (
              <section className={exampleShellClass}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.35em] text-white/35">Ejemplo</div>
                    <div className="mt-1 text-sm text-white/70">Solo lectura</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleToggleExampleFloating}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/75 transition hover:bg-white/10"
                    >
                      Flotante
                    </button>
                  </div>
                </div>
                <div className="mt-4">
                  {latestInterviewExampleText ? (
                    <p
                      className="max-w-none font-medium tracking-[-0.03em] text-cyan-50"
                      style={{
                        fontSize: "clamp(0.84rem, 1.35vw, 1.15rem)",
                        lineHeight: 1.22,
                      }}
                    >
                      {latestInterviewExampleText}
                    </p>
                  ) : (
                    <div className="flex min-h-[96px] items-center rounded-3xl border border-dashed border-white/10 bg-black/15 px-6 text-sm text-white/45">
                      El ejemplo corto aparecerá aquí y no se escuchará.
                    </div>
                  )}
                </div>
              </section>
            ) : null}

            <section className={`rounded-[1.35rem] border border-white/10 bg-white/5 p-4 ${isFloatingExpanded ? "hidden" : ""}`}>
              <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-white/45">Logs</div>
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1 text-xs text-white/75 hide-scrollbar">
                {logs.length === 0 ? (
                  <div className="text-white/40">Aquí verás cada paso de la llamada en vivo.</div>
                ) : (
                  logs.map((log, index) => (
                    <div key={`${index}-${log}`} className="rounded-2xl border border-white/8 bg-black/25 px-3 py-2">{log}</div>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>
      </div>

      {startPromptOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,28,0.98),rgba(6,6,10,0.98))] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.6)]">
            <div className="text-[10px] uppercase tracking-[0.35em] text-white/35">Confirmación</div>
            <h3 className="mt-2 text-2xl font-semibold text-white">¿Ya te encuentras listo o lista?</h3>
            <p className="mt-3 text-sm leading-6 text-white/70">
              Si confirmas, hacemos una cuenta regresiva y arrancamos la llamada en vivo.
            </p>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={handleConfirmStart}
                className="flex-1 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110"
              >
                Sí, empezar
              </button>
              <button
                onClick={handleCancelStart}
                className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                No todavía
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {countdown !== null ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.4em] text-white/40">Ya estamos en vivo</div>
            <div className="mt-3 text-8xl font-semibold tracking-[-0.08em] text-white md:text-[8rem]">
              {countdown}
            </div>
            <div className="mt-3 text-sm text-white/65">Arrancando la llamada...</div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
