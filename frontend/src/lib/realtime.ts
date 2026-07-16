import { requestRealtimeSession } from "./api";

export type CallStatus = "esperando" | "conectando" | "escuchando" | "respondiendo" | "error";

export type AudioQuality = "Audio limpio" | "Ruido moderado" | "No se escucha bien";

export type TranscriptEntry = {
  id: string;
  speaker: "Usuario" | "Asistente";
  text: string;
};

export type RealtimeCallbacks = {
  onStatusChange: (status: CallStatus) => void;
  onTranscriptChange: (entries: TranscriptEntry[]) => void;
  onError: (message: string) => void;
  onAudioLevel?: (level: number) => void;
  onAudioQuality?: (quality: AudioQuality) => void;
  onLog?: (message: string) => void;
};

export type RealtimeCallController = {
  stop: () => void;
  setMicEnabled: (enabled: boolean) => void;
};

const REALTIME_URL = "https://api.openai.com/v1/realtime/calls";
const SHORT_FILLS = new Set(["mm", "mmm", "eh", "ah", "uh", "hmm", "aja", "ajá", "um", "emm"]);

function normalizeSpeechText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function usefulCharacterCount(value: string) {
  return normalizeSpeechText(value).replace(/[^a-z0-9]/g, "").length;
}

function isDoubtfulTranscript(value: string) {
  const normalized = normalizeSpeechText(value);
  if (!normalized) return true;
  if (normalized === "..." || /^[.\s…-]+$/.test(normalized)) return true;
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  if (compact.length < 2) return true;
  if (SHORT_FILLS.has(normalized) || SHORT_FILLS.has(compact)) return true;
  if (/^(m+|h+|a+h+|e+h+|u+m+)$/.test(compact)) return true;
  return false;
}

function inferAudioQuality(level: number): AudioQuality {
  if (level < 0.035) return "No se escucha bien";
  if (level < 0.13) return "Ruido moderado";
  return "Audio limpio";
}

function createTranscriptStore(onTranscriptChange: RealtimeCallbacks["onTranscriptChange"]) {
  const entries = new Map<string, TranscriptEntry>();

  function upsert(id: string, speaker: TranscriptEntry["speaker"], delta: string) {
    const existing = entries.get(id);
    const nextText = `${existing?.text || ""}${delta}`;
    if (speaker === "Usuario" && (isDoubtfulTranscript(nextText) || usefulCharacterCount(nextText) < 2)) {
      return;
    }

    entries.set(id, { id, speaker, text: nextText });
    onTranscriptChange(Array.from(entries.values()));
  }

  function finalize(id: string, speaker: TranscriptEntry["speaker"], fullText: string) {
    if (speaker === "Usuario" && (isDoubtfulTranscript(fullText) || usefulCharacterCount(fullText) < 2)) {
      return false;
    }
    entries.set(id, { id, speaker, text: fullText });
    onTranscriptChange(Array.from(entries.values()));
    return true;
  }

  return { upsert, finalize };
}

function waitForIceGatheringComplete(peerConnection: RTCPeerConnection) {
  if (peerConnection.iceGatheringState === "complete") return Promise.resolve();

  return new Promise<void>((resolve) => {
    const handleChange = () => {
      if (peerConnection.iceGatheringState === "complete") {
        peerConnection.removeEventListener("icegatheringstatechange", handleChange);
        resolve();
      }
    };

    peerConnection.addEventListener("icegatheringstatechange", handleChange);
    setTimeout(() => {
      peerConnection.removeEventListener("icegatheringstatechange", handleChange);
      resolve();
    }, 4000);
  });
}

export async function startRealtimeCall(callbacks: RealtimeCallbacks) {
  callbacks.onStatusChange("conectando");
  callbacks.onLog?.("Solicitando sesión efímera a OpenAI.");

  const session = await requestRealtimeSession();
  callbacks.onLog?.("Sesión efímera recibida. Iniciando WebRTC.");

  const pc = new RTCPeerConnection();
  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.controls = false;
  audio.setAttribute("playsinline", "true");
  audio.style.display = "none";
  document.body.appendChild(audio);

  pc.ontrack = (event) => {
    audio.srcObject = event.streams[0];
  };

  let micStream: MediaStream;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    callbacks.onLog?.("Permiso de micrófono concedido.");
  } catch {
    pc.close();
    throw new Error("No pude acceder al microfono. Revisa los permisos del navegador.");
  }

  const audioTrack = micStream.getAudioTracks()[0];
  pc.addTrack(audioTrack, micStream);
  callbacks.onLog?.("Track de audio local agregado a la conexión.");

  let audioContext: AudioContext | null = null;
  let rafId = 0;
  try {
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(micStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i];
      const level = Math.min(1, sum / data.length / 255);
      callbacks.onAudioLevel?.(level);
      callbacks.onAudioQuality?.(inferAudioQuality(level));
      rafId = requestAnimationFrame(tick);
    };
    tick();
  } catch {
    callbacks.onAudioLevel?.(0.08);
    callbacks.onAudioQuality?.("Ruido moderado");
  }

  const dc = pc.createDataChannel("oai-events");
  callbacks.onLog?.("DataChannel oai-events creado.");
  const transcripts = createTranscriptStore(callbacks.onTranscriptChange);
  let responseInProgress = false;

  const sendEvent = (payload: unknown) => {
    if (dc.readyState === "open") dc.send(JSON.stringify(payload));
  };

  const requestAssistantResponse = (reason: string) => {
    if (responseInProgress) {
      callbacks.onLog?.(`response.create omitido (${reason}): ya hay una respuesta activa.`);
      return;
    }

    responseInProgress = true;
    callbacks.onLog?.(`Enviando response.create (${reason}).`);
    sendEvent({ type: "response.create" });
  };

  const stop = () => {
    try { dc.close(); } catch { /* no-op */ }
    try {
      pc.getSenders().forEach((sender) => sender.track?.stop());
      pc.close();
    } catch { /* no-op */ }
    try { micStream.getTracks().forEach((track) => track.stop()); } catch { /* no-op */ }
    try { audio.remove(); } catch { /* no-op */ }
    try {
      if (rafId) cancelAnimationFrame(rafId);
      audioContext?.close();
    } catch { /* no-op */ }
  };

  const setMicEnabled = (enabled: boolean) => {
    audioTrack.enabled = enabled;
    callbacks.onLog?.(enabled ? "Micrófono reactivado con barra espaciadora." : "Micrófono pausado con barra espaciadora.");
  };

  dc.onopen = () => {
    callbacks.onLog?.("DataChannel abierto.");
    callbacks.onStatusChange("escuchando");
  };

  dc.onmessage = (message) => {
    let event: any;
    try {
      event = JSON.parse(message.data);
    } catch {
      return;
    }

    switch (event.type) {
      case "response.created":
        responseInProgress = true;
        callbacks.onLog?.(`response.created: ${event.response?.id || "sin-id"}`);
        break;
      case "response.done":
      case "response.completed":
      case "response.cancelled":
      case "response.failed":
        responseInProgress = false;
        callbacks.onLog?.(`response.${event.type.split(".")[1]}: ${event.response?.id || "sin-id"}`);
        break;
      case "conversation.item.input_audio_transcription.delta":
        if (event.item_id && typeof event.delta === "string") {
          callbacks.onStatusChange("escuchando");
          transcripts.upsert(event.item_id, "Usuario", event.delta);
        }
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (event.item_id) {
          const transcript = String(event.transcript || "");
          const accepted = transcripts.finalize(event.item_id, "Usuario", transcript);
          if (!accepted) {
            callbacks.onLog?.("Transcripción de usuario ignorada por ruido o silencio.");
            callbacks.onStatusChange("escuchando");
            break;
          }
          callbacks.onLog?.(`Transcripcion usuario completada: ${transcript}`);
        }
        break;
      case "response.output_text.delta":
      case "response.output_audio_transcript.delta":
        if (event.item_id && typeof event.delta === "string") {
          responseInProgress = true;
          callbacks.onStatusChange("respondiendo");
          transcripts.upsert(event.item_id, "Asistente", event.delta);
        }
        break;
      case "input_audio_buffer.speech_started":
        callbacks.onStatusChange("escuchando");
        callbacks.onLog?.("speech_started");
        break;
      case "input_audio_buffer.speech_stopped":
        callbacks.onStatusChange("respondiendo");
        callbacks.onLog?.("speech_stopped");
        break;
      case "error":
        callbacks.onStatusChange("error");
        callbacks.onError(event.error?.message || "Ocurrió un error en la llamada.");
        callbacks.onLog?.(`Realtime error: ${event.error?.message || "sin mensaje"}`);
        break;
      default:
        break;
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGatheringComplete(pc);

  const sdpResponse = await fetch(REALTIME_URL, {
    method: "POST",
    body: pc.localDescription?.sdp || offer.sdp,
    headers: {
      Authorization: `Bearer ${session.clientSecret}`,
      "Content-Type": "application/sdp",
    },
  });

  if (!sdpResponse.ok) {
    stop();
    callbacks.onLog?.(`WebRTC SDP response failed: ${sdpResponse.status}`);
    throw new Error("No pude iniciar la llamada IA. Revisa la API Key de OpenAI.");
  }

  const answer = { type: "answer" as RTCSdpType, sdp: await sdpResponse.text() };
  await pc.setRemoteDescription(answer);
  callbacks.onLog?.("Remote description aplicada. Conexión lista.");

  callbacks.onStatusChange("escuchando");

  return { stop, setMicEnabled, pc, dc, audio };
}
