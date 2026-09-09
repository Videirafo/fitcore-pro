export const apiBase = process.env.NEXT_PUBLIC_FITCORE_API_BASE || "";

export async function fitcoreFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    cache: "no-store",
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.mensagem || data.erro || `HTTP ${response.status}`);
  return data as T;
}
