const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
  } catch {
    const target = API_URL ? `${API_URL}${path}` : path;
    throw new Error(
      `No pude conectar con ${target}. Revisa que el backend esté encendido y que la URL sea correcta.`
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.message || `Request failed with status ${response.status}`
    );
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return data as T;
}

export async function requestRealtimeSession() {
  return fetchJson<{
    success: boolean;
    clientSecret: string;
    expiresAt: number;
    model: string;
    voice: string;
    session: unknown;
  }>("/api/realtime/session", {
    method: "POST",
  });
}
