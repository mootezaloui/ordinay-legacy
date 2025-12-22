const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const message = `API error ${res.status}`;
    throw new Error(message);
  }
  return res.json();
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: any) =>
    request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
