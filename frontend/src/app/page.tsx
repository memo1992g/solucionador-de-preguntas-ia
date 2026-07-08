"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { startRealtimeCall } from "@/lib/realtime";
import type { AudioQuality, CallStatus, TranscriptEntry } from "@/lib/realtime";
import { CallStatus as StatusBadge } from "@/components/CallStatus";

const demoMode = String(process.env.NEXT_PUBLIC_DEMO_MODE || "").toLowerCase() === "true";
const FLOATING_LAYOUT_KEY = "solucionador-preguntas-ia:floating-layout";

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
  const [startPromptOpen, setStartPromptOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const callRef = useRef<{ stop: () => void } | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const floatingShellRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const hasHydratedLayoutRef = useRef(false);

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
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries]);

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

  const recentAssistantEntries = useMemo(
    () => entries.filter((entry) => entry.speaker === "Asistente").slice(-4),
    [entries]
  );

  const recentUserEntries = useMemo(
    () => entries.filter((entry) => entry.speaker === "Usuario").slice(-4),
    [entries]
  );

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
                        ? "clamp(2rem, 4.5vw, 4.8rem)"
                        : "clamp(1.8rem, 4vw, 4.2rem)",
                      lineHeight: 1.08,
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

            <div className="rounded-[1.4rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.14),rgba(9,9,13,0.97))] p-5">
              <div className="text-[10px] uppercase tracking-[0.35em] text-white/35">Lo que dijiste tú</div>
              <div className="mt-4 min-h-[140px]">
                {latestUserText ? (
                  <p
                    className="max-w-none font-medium tracking-[-0.04em] text-white/95"
                    style={{
                      fontSize: isFloatingExpanded
                        ? "clamp(1.5rem, 3vw, 3.2rem)"
                        : "clamp(1.35rem, 2.6vw, 2.8rem)",
                      lineHeight: 1.12,
                    }}
                  >
                    {latestUserText}
                  </p>
                ) : (
                  <div className="flex h-full min-h-[140px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/15 px-6 text-center text-sm text-white/45">
                    Aquí aparecerá lo que digas tú en tiempo real.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
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
              </div>
            </div>

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
                <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_180deg,rgba(205,64,255,0.95),rgba(112,102,255,0.95),rgba(205,64,255,0.95))] opacity-80 blur-[1px]" style={orbStyle} />
                <div className="absolute inset-[2px] rounded-full bg-[radial-gradient(circle_at_center,rgba(18,18,28,0.96),rgba(6,6,10,0.98))]" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full border border-white/10 bg-black/55 backdrop-blur-md">
                    <span className="text-[9px] uppercase tracking-[0.3em] text-white/35">Voice</span>
                    <span className="mt-1 text-xs font-semibold text-white">AI</span>
                  </div>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/85 text-balance">
                  {isCalling
                    ? "La llamada está activa. Habla con naturalidad y la respuesta se irá viendo en pantalla mientras se escucha por audio."
                    : "Toca iniciar, concede permiso al micrófono y habla con el asistente en tiempo real."}
                </p>
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
                            ? "clamp(1.9rem, 4vw, 4.2rem)"
                            : "clamp(1.35rem, 2.4vw, 3.15rem)",
                          lineHeight: 1.04,
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

                <div className="rounded-[1.4rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.14),rgba(9,9,13,0.97))] p-5 md:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] uppercase tracking-[0.35em] text-white/35">Lo que dijiste tú</div>
                    <div className="flex items-center gap-2 text-[11px] text-white/45">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.55)]" />
                      Detectado
                    </div>
                  </div>

                  <div className="mt-4 min-h-[360px] md:min-h-[520px]">
                    {latestUserText ? (
                      <p
                        className="max-w-none whitespace-pre-wrap break-words font-medium tracking-[-0.03em] text-white/95"
                        style={{
                          fontSize: isFloating
                            ? "clamp(1.4rem, 2.8vw, 3rem)"
                            : "clamp(1.05rem, 1.9vw, 2.25rem)",
                          lineHeight: 1.1,
                        }}
                      >
                        {latestUserText}
                      </p>
                    ) : (
                      <div className="flex h-full min-h-[220px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/15 px-6 text-center">
                        <div>
                          <div className="text-sm text-white/45">Aquí aparecerá lo que digas tú en tiempo real.</div>
                          <div className="mt-2 text-xs uppercase tracking-[0.3em] text-white/25">Micrófono activo</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {recentUserEntries.length > 0 ? (
                    <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                      {recentUserEntries.map((entry) => (
                        <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                          <p className="text-sm leading-6 text-white/78">{entry.text}</p>
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
            ) : typeof window !== "undefined" ? createPortal(floatingPanel, document.body) : null}

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
