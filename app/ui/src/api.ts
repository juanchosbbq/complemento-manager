const store = typeof sessionStorage !== 'undefined' ? sessionStorage : { getItem: () => null, setItem: () => {} };
let token = store.getItem('token') ?? '';
export const setToken = (t: string) => { token = t; store.setItem('token', t); };
export const getToken = () => token;
export async function api<T = any>(ruta: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  const r = await fetch('/api/' + ruta, { method: opts.method ?? 'GET', headers: { 'Content-Type': 'application/json', 'X-Token': token }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({ error: 'Respuesta no válida' }));
  if (!r.ok) throw new Error(j.error ?? r.statusText);
  return j as T;
}
export const post = <T = any,>(ruta: string, body: any) => api<T>(ruta, { method: 'POST', body });
export const eur = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
export const num = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? '—' : n.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
export const MESES: Record<string, string> = { '01': 'enero', '02': 'febrero', '03': 'marzo', '04': 'abril', '05': 'mayo', '06': 'junio', '07': 'julio', '08': 'agosto', '09': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre' };
export const nombreMes = (m: string) => MESES[m.slice(5, 7)] ?? m;
