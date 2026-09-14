/**
 * API HTTP mínima (node:http, sin framework) + servidor de estáticos de la UI compilada.
 * Autenticación provisional para el piloto: token en cabecera X-Token (tabla accesos).
 *   DIRECCION → todo. MANAGER → solo lectura de su local y alta de sus checklists.
 */
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { abrir } from '../data/db';
import * as repo from '../data/repo';
import { KPIS, MOTIVO_NEUTRALIZACION_TEXTO, PESOS_BLOQUE } from '../engine/modelo';
import { importarCsvUber } from './integraciones/ubereats';

const db = abrir();
const PUERTO = Number(process.env.PORT ?? 8787);
const DIST = new URL('../ui/dist', import.meta.url).pathname;

type Row = Record<string, any>;
type Ctx = { metodo: string; ruta: string[]; query: URLSearchParams; body: any; acceso: any };
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

function requiereDireccion(c: Ctx) { if (c.acceso?.rol !== 'DIRECCION') throw new HttpError(403, 'Solo dirección'); }
function requiereLocal(c: Ctx, localId: string) {
  if (!c.acceso) throw new HttpError(401, 'Sin acceso');
  if (c.acceso.rol === 'MANAGER' && c.acceso.local_id !== localId) throw new HttpError(403, 'Este local no es el tuyo');
}
const autor = (c: Ctx) => c.acceso?.nombre ?? 'desconocido';

function api(c: Ctx): any {
  const [r0, r1, r2, r3] = c.ruta;
  if (r0 === 'login' && c.metodo === 'POST') {
    const a = repo.acceso(db, String(c.body?.token ?? ''));
    if (!a) throw new HttpError(401, 'Código de acceso no válido');
    return { rol: a.rol, local_id: a.local_id, nombre: a.nombre };
  }
  if (!c.acceso) throw new HttpError(401, 'Sin acceso');
  if (r0 === 'yo') return { rol: c.acceso.rol, local_id: c.acceso.local_id, nombre: c.acceso.nombre };
  if (r0 === 'modelo') return { kpis: KPIS, pesosBloque: PESOS_BLOQUE, motivos: MOTIVO_NEUTRALIZACION_TEXTO };
  if (r0 === 'locales') {
    const ls: Row[] = repo.locales(db).map(l => ({ ...l, manager: repo.managerDeLocal(db, l.id)?.nombre ?? null }));
    return c.acceso.rol === 'MANAGER' ? ls.filter(l => l.id === c.acceso.local_id) : ls;
  }
  if (r0 === 'periodos') return repo.periodos(db);
  if (r0 === 'catalogo') return repo.catalogoLineas(db);

  if (r0 === 'resumen' && r1) {
    requiereDireccion(c);
    const hasta = c.query.get('hasta') ?? undefined;
    return repo.locales(db).map(l => {
      try { const x = repo.calcular(db, l.id, r1, hasta); return { local: l, ok: true, bloques: x.resultado.bloques, logro: x.resultado.logroPonderado, llaves: x.resultado.llavesCumplidas, pago: x.resultado.pago, puertas: x.resultado.puertas.superadas, avisos: x.avisos, manager: repo.managerDeLocal(db, l.id)?.nombre ?? null }; }
      catch (e: any) { return { local: l, ok: false, error: e.message, manager: repo.managerDeLocal(db, l.id)?.nombre ?? null }; }
    });
  }
  if (r0 === 'calculo' && r1 && r2) { requiereLocal(c, r1); return repo.calcular(db, r1, r2, c.query.get('hasta') ?? undefined); }
  if (r0 === 'datos' && r1 && r2) {
    requiereLocal(c, r1);
    const d = repo.datosBrutos(db, r1, r2);
    if (c.acceso.rol === 'MANAGER') { delete (d as any).cualitativa; }
    return { ...d, configuracion: repo.configCruda(db, r1, r2) };
  }

  // Escrituras del Manager: checklist de su local
  if (r0 === 'checklist' && r1 && r2 && c.metodo === 'POST') {
    requiereLocal(c, r1);
    const b = c.body;
    const id = repo.guardarChecklist(db, r1, r2, b.semana, b.hoja, b.firma_manager ?? null, b.firma_jefe_cocina ?? null, b.lineas ?? []);
    return { ok: true, id };
  }

  requiereDireccion(c);
  if (c.metodo !== 'POST' && c.metodo !== 'DELETE') throw new HttpError(404, 'Ruta desconocida');
  const b = c.body ?? {};
  switch (r0) {
    case 'config': repo.guardarConfig(db, r1, r2, b.config ?? {}, autor(c)); if (b.niveles) repo.guardarNiveles(db, r1, r2, b.niveles, autor(c)); if (b.puertas) repo.guardarPuertas(db, r1, r2, b.puertas, autor(c)); return { ok: true };
    case 'mes': repo.guardarMes(db, r1, r2, b, autor(c), b.origen ?? 'manual'); return { ok: true };
    case 'uber':
      if (b.csv) {
        const imp = importarCsvUber(b.csv, b.mes);
        for (const f of imp.filas) repo.guardarUberMes(db, r1, r2, f, autor(c), 'automatico', b.fichero ?? 'csv');
        return { ok: true, importadas: imp.filas.length, columnasNoEncontradas: imp.columnasNoEncontradas };
      }
      repo.guardarUberMes(db, r1, r2, b, autor(c), 'manual'); return { ok: true };
    case 'visita': return { ok: true, id: repo.guardarVisita(db, r1, r2, b) };
    case 'ficha': repo.guardarFicha(db, r1, r2, b); return { ok: true };
    case 'compromiso': repo.guardarCompromiso(db, r1, r2, b, autor(c)); return { ok: true };
    case 'cualitativa': repo.guardarCualitativa(db, r1, r2, b, autor(c)); return { ok: true };
    case 'descuentos': repo.guardarDescuentosMes(db, r1, r2, b, autor(c)); return { ok: true };
    case 'coste': repo.guardarCostePersonalMes(db, r1, r2, b, autor(c)); return { ok: true };
    case 'neutralizacion':
      if (c.metodo === 'DELETE') { repo.borrarNeutralizacion(db, Number(r3 ?? b.id)); return { ok: true }; }
      repo.guardarNeutralizacion(db, r1, r2, b, autor(c)); return { ok: true };
    case 'liquidar': return repo.cerrarLiquidacion(db, r1, r2, b.fecha_extraccion ?? new Date().toISOString().slice(0, 10), autor(c));
  }
  throw new HttpError(404, 'Ruta desconocida');
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname.startsWith('/api/')) {
    let body: any = null;
    if (req.method === 'POST' || req.method === 'DELETE') {
      const chunks: Buffer[] = []; for await (const ch of req) chunks.push(ch as Buffer);
      const txt = Buffer.concat(chunks).toString('utf8'); body = txt ? JSON.parse(txt) : null;
    }
    const token = req.headers['x-token']; const acc = token ? repo.acceso(db, String(token)) : null;
    try {
      const out = api({ metodo: req.method ?? 'GET', ruta: url.pathname.slice(5).split('/').filter(Boolean).map(decodeURIComponent), query: url.searchParams, body, acceso: acc });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(out));
    } catch (e: any) {
      const st = e instanceof HttpError ? e.status : 400;
      res.writeHead(st, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  let f = join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, 'index.html');
  if (!existsSync(f)) { res.writeHead(503); res.end('UI sin compilar: ejecuta npm run build'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f));
});
server.listen(PUERTO, () => console.log(`Complemento de Manager · http://localhost:${PUERTO}`));
