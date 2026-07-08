# Solucionador de Preguntas IA

Asistente de voz en tiempo real con transcript visible en pantalla.

## Estructura

- `frontend`: Next.js + React + Tailwind CSS
- `backend`: Node.js + Express + OpenAI Realtime

## Requisitos

- Node.js 18 o superior
- `OPENAI_API_KEY` con acceso a Realtime

## Configurar backend

```bash
cd backend
npm install
copy .env.example .env
```

## Configurar frontend

```bash
cd frontend
npm install
copy .env.example .env.local
```

## Ejecutar en desarrollo

Abre dos terminales:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

Frontend: `http://localhost:3000`

Backend: `http://localhost:3001`

## Qué incluye

- Captura de micrófono
- WebRTC con OpenAI Realtime
- Transcripción en vivo
- Respuesta hablada en tiempo real
- Panel de logs
- Indicador de calidad de audio

## Despliegue en Vercel

1. Sube el repositorio a GitHub.
2. Crea un proyecto nuevo en Vercel.
3. Usa `frontend` como `Root Directory`.
4. Deja los comandos por defecto:
   - Build: `npm run build`
   - Start: automático de Next.js
5. Configura estas variables en Vercel:
   - `OPENAI_API_KEY`
   - `NEXT_PUBLIC_DEMO_MODE=false`
   - `NEXT_PUBLIC_API_URL` si usas un backend separado
