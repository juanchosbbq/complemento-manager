/**
 * Servidor HTTP mínimo (node:http, sin framework): API JSON en /api/* y estáticos de la UI compilada.
 * Las rutas están en server/rutas.ts. La sesión va en la cabecera X-Token (ver data/auth.ts).
 */
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, resolve, sep } from 'node:path';
import { abrir } from '../data/db';
import * as auth from '../data/auth';
import { api, HttpError } from './rutas';

const db = abrir();
auth.limpiarSesionesCaducadas(db);
setInterval(() => auth.limpiarSesionesCaducadas(db), 6 * 3600 * 1000).unref();
const PUERTO = Number(process.env.PORT ?? 8787);
const DIST = resolve(new URL('../ui/dist', import.meta.url).pathname);
/** Tamaño máximo de una petición. Sobra para un CSV mensual de Uber. */
const MAX_CUERPO = 5 * 1024 * 1024;

const SEGURIDAD: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:", "img-src 'self' data: blob:", "connect-src 'self'",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '),
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

function leerCuerpo(req: http.IncomingMessage): Promise<any> {
  return new Promise((ok, mal) => {
    const trozos: Buffer[] = []; let total = 0;
    req.on('data', (t: Buffer) => {
      total += t.length;
      // Por encima del máximo se sigue leyendo (y descartando) hasta el final, para poder contestar con el error.
      if (total <= MAX_CUERPO) trozos.push(t);
    });
    req.on('end', () => {
      if (total > MAX_CUERPO) return mal(new HttpError(413, 'La petición es demasiado grande'));
      const txt = Buffer.concat(trozos).toString('utf8');
      try { ok(txt ? JSON.parse(txt) : null); } catch { mal(new HttpError(400, 'Petición no válida')); }
    });
    req.on('error', mal);
  });
}

function json(res: http.ServerResponse, estado: number, cuerpo: unknown) {
  res.writeHead(estado, { ...SEGURIDAD, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(cuerpo));
}

/** Copia completa de la base de datos (solo Dirección). Se hace con VACUUM INTO: es coherente aunque haya escrituras a la vez. */
function copiaDeSeguridad(res: http.ServerResponse) {
  const dir = mkdtempSync(join(tmpdir(), 'copia-'));
  const fichero = join(dir, 'incentivos.db');
  try {
    db.exec(`VACUUM INTO '${fichero.replace(/'/g, "''")}'`);
    const datos = readFileSync(fichero);
    const nombre = `incentivos-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.db`;
    res.writeHead(200, { ...SEGURIDAD, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${nombre}"`, 'Cache-Control': 'no-store' });
    res.end(datos);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function atenderApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  try {
    const metodo = req.method ?? 'GET';
    const body = metodo === 'POST' || metodo === 'DELETE' ? await leerCuerpo(req) : null;
    const token = req.headers['x-token'];
    const acceso = token ? auth.sesion(db, String(token)) : null;
    const ruta = url.pathname.slice(5).split('/').filter(Boolean).map(decodeURIComponent);
    if (ruta[0] === 'copia' && metodo === 'GET') {
      if (acceso?.rol !== 'DIRECCION') throw new HttpError(acceso ? 403 : 401, 'Solo dirección');
      return copiaDeSeguridad(res);
    }
    json(res, 200, api(db, { metodo, ruta, query: url.searchParams, body, acceso }));
  } catch (e: any) {
    // Los errores de validación del repositorio son Error normales: se devuelven como 400 con su mensaje.
    const estado = e instanceof HttpError ? e.status : 400;
    if (!res.headersSent) json(res, estado, { error: e?.message ?? 'Error' });
  }
}

function atenderEstatico(res: http.ServerResponse, url: URL) {
  let f = resolve(DIST, '.' + decodeURIComponent(url.pathname));
  if (!f.startsWith(DIST + sep) || !existsSync(f) || statSync(f).isDirectory()) f = join(DIST, 'index.html');
  if (!existsSync(f)) { res.writeHead(503); res.end('UI sin compilar: ejecuta npm run build'); return; }
  // Los ficheros de /assets llevan hash en el nombre: se pueden cachear para siempre. index.html, nunca.
  const cache = url.pathname.startsWith('/assets/') && !f.endsWith('index.html') ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { ...SEGURIDAD, 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream', 'Cache-Control': cache });
  res.end(readFileSync(f));
}

const server = http.createServer((req, res) => {
  let url: URL;
  try { url = new URL(req.url ?? '/', 'http://x'); decodeURIComponent(url.pathname); }
  catch { res.writeHead(400); res.end('Ruta no válida'); return; }
  if (url.pathname.startsWith('/api/')) { void atenderApi(req, res, url); return; }
  try { atenderEstatico(res, url); }
  catch { if (!res.headersSent) { res.writeHead(500); res.end('Error'); } }
});
server.listen(PUERTO, () => console.log(`Complemento de Manager · http://localhost:${PUERTO}`));
