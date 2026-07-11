/** Typed client for the analytics API (contract: api/openapi.yaml). */

const BASE = import.meta.env?.VITE_ANALYTICS_HOST ?? "http://localhost:4000";
const KEY = import.meta.env?.VITE_ANALYTICS_SECRET_KEY ?? "";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  segment: (q: unknown) => post("/v1/query/segment", q),
  funnel: (q: unknown) => post<{ steps: any[]; totalConversion: number }>("/v1/query/funnel", q),
  retention: (q: unknown) => post<{ cohorts: any[] }>("/v1/query/retention", q),
  journeys: (q: unknown) => post("/v1/query/journeys", q),
  adoption: (q: unknown) => post("/v1/query/adoption", q),
  taxonomy: () => get<any[]>("/v1/taxonomy"),
  user: (id: string) => get(`/v1/users/${encodeURIComponent(id)}`),
  userEvents: (id: string) => get<any[]>(`/v1/users/${encodeURIComponent(id)}/events`),
  reports: () => get<any[]>("/v1/reports"),
  saveReport: (r: unknown) => post("/v1/reports", r),
  insights: () => get<any[]>("/v1/insights"),
  ask: (question: string) => post<{ bodyMd: string }>("/v1/ai/ask", { question }),
  summary: (periodDays = 7) => post<{ bodyMd: string }>("/v1/ai/summary", { periodDays }),
};
