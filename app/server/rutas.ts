/**
 * Rutas de la API JSON. Cada petición llega ya autenticada (o sin sesión) desde server/index.ts.
 *   DIRECCION → todo.
 *   MANAGER   → lectura de su local y sus checklists semanales, dentro de la ventana de edición.
 */
import type { DB } from '../data/db';
import * as repo from '../data/repo';
import * as auth from '../data/auth';
import { KPIS, MOTIVO_NEUTRALIZACION_TEXTO, PESOS_BLOQUE } from '../engine/modelo';
import { importarCsvUber } from './integraciones/ubereats';

type Row = Record<string, any>;
export type Acceso = ReturnType<typeof auth.sesion>;
export type Ctx = { metodo: string; ruta: string[]; query: URLSearchParams; body: any; acceso: Acceso };

export class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

function requiereDireccion(c: Ctx) {
  if (!c.acceso) throw new HttpError(401, 'Sin acceso');
  if (c.acceso.rol !== 'DIRECCION') throw new HttpError(403, 'Solo dirección');
}
function requiereLocal(c: Ctx, localId: string) {
  if (!c.acceso) throw new HttpError(401, 'Sin acceso');
  if (c.acceso.rol === 'MANAGER' && c.acceso.local_id !== localId) throw new HttpError(403, 'Este local no es el tuyo');
}
const autor = (c: Ctx) => c.acceso?.nombre ?? 'desconocido';
const corte = (c: Ctx) => (c.query.get('corte') ?? c.query.get('hasta')) ?? undefined;

// ---------- Sesión y usuarios ----------
function rutasSesion(db: DB, c: Ctx, [r0, r1, r2]: string[]) {
  const a = c.acceso!;
  if (r0 === 'yo') return { rol: a.rol, local_id: a.local_id, nombre: a.nombre, email: a.email, debe_cambiar: a.debe_cambiar };
  if (r0 === 'logout' && c.metodo === 'POST') { auth.cerrarSesion(db, a.token); return { ok: true }; }
  if (r0 === 'mi-password' && c.metodo === 'POST') {
    auth.cambiarMiPassword(db, a.email, String(c.body?.actual ?? ''), String(c.body?.nueva ?? ''), a.token);
    return { ok: true };
  }
  if (r0 === 'usuarios') {
    requiereDireccion(c);
    const b = c.body ?? {};
    if (c.metodo === 'GET') return auth.usuarios(db);
    if (c.metodo === 'POST' && !r1) { auth.crearUsuario(db, b, a.email); return { ok: true }; }
    if (c.metodo === 'POST' && r1 && r2 === 'password') { auth.restablecerPassword(db, r1, String(b.password ?? '')); return { ok: true }; }
    if (c.metodo === 'POST' && r1) { auth.actualizarUsuario(db, r1, b, a.email); return { ok: true }; }
    if (c.metodo === 'DELETE' && r1) { auth.borrarUsuario(db, r1, a.email); return { ok: true }; }
  }
  return undefined;
}

// ---------- Lecturas ----------
function rutasLectura(db: DB, c: Ctx, [r0, r1, r2]: string[]) {
  const a = c.acceso!;
  const manager = (localId: string) => repo.managerDeLocal(db, localId)?.nombre ?? null;
  if (r0 === 'modelo') return { kpis: KPIS, pesosBloque: PESOS_BLOQUE, motivos: MOTIVO_NEUTRALIZACION_TEXTO, diasEdicionChecklist: repo.DIAS_EDICION_CHECKLIST };
  if (r0 === 'locales') {
    const ls: Row[] = repo.locales(db).map(l => ({ ...l, manager: manager(l.id) }));
    return a.rol === 'MANAGER' ? ls.filter(l => l.id === a.local_id) : ls;
  }
  if (r0 === 'periodos') return repo.periodos(db);
  if (r0 === 'catalogo') return repo.catalogoLineas(db);
  if (r0 === 'estado' && r1) { requiereDireccion(c); return repo.estadoCarga(db, r1); }
  if (r0 === 'resumen' && r1) {
    requiereDireccion(c);
    return repo.locales(db).map(l => {
      try {
        const x = repo.calcular(db, l.id, r1, corte(c));
        const r = x.resultado;
        return { local: l, ok: true, bloques: r.bloques, logro: r.logroPonderado, llaves: r.llavesCumplidas, pago: r.pago, puertas: r.puertas.superadas, avisos: x.avisos, manager: manager(l.id) };
      } catch (e: any) {
        return { local: l, ok: false, error: e.message, manager: manager(l.id) };
      }
    });
  }
  if (r0 === 'calculo' && r1 && r2) { requiereLocal(c, r1); return repo.calcular(db, r1, r2, corte(c)); }
  if (r0 === 'datos' && r1 && r2) {
    requiereLocal(c, r1);
    const d: Row = repo.datosBrutos(db, r1, r2);
    if (a.rol === 'MANAGER') { delete d.cualitativa; delete d.checklistsDireccion; delete d.historial; }
    return { ...d, configuracion: { ...repo.configCruda(db, r1, r2), localNombre: repo.local(db, r1)?.nombre ?? r1 } };
  }
  return undefined;
}

// ---------- Checklists (Manager y Dirección) ----------
function rutasChecklist(db: DB, c: Ctx, [r0, r1, r2]: string[]) {
  if ((r0 !== 'checklist' && r0 !== 'checklist-dir') || !r1 || !r2 || (c.metodo !== 'POST' && c.metodo !== 'DELETE')) return undefined;
  const tipo: repo.TipoChecklist = r0 === 'checklist-dir' ? 'DIRECCION' : 'MANAGER';
  if (tipo === 'DIRECCION') requiereDireccion(c); else requiereLocal(c, r1);
  const b = c.body ?? {};
  repo.validarChecklist(db, r2, b.semana, b.hoja, c.metodo === 'POST' ? (b.lineas ?? []) : undefined);
  // El Manager solo puede registrar, corregir o borrar una semana hasta 5 días después de que termine. Dirección, siempre.
  if (c.acceso!.rol === 'MANAGER' && !repo.checklistEditablePorManager(b.semana)) {
    throw new HttpError(403, `El checklist de la semana ${b.semana} ya no se puede modificar: el plazo terminó el ${repo.limiteEdicionChecklist(b.semana)}. Si hay que corregirlo, pídeselo a Dirección.`);
  }
  if (c.metodo === 'DELETE') { repo.borrarChecklist(db, r1, r2, b.semana, b.hoja, autor(c), tipo); return { ok: true }; }
  const firmaJefe = tipo === 'DIRECCION' ? null : (b.firma_jefe_cocina ?? null);
  const id = repo.guardarChecklist(db, r1, r2, b.semana, b.hoja, b.firma_manager ?? null, firmaJefe, b.lineas ?? [], tipo, autor(c));
  return { ok: true, id };
}

// ---------- Escrituras de Dirección ----------
function rutasDireccion(db: DB, c: Ctx, [r0, r1, r2, r3]: string[]) {
  requiereDireccion(c);
  if (c.metodo !== 'POST' && c.metodo !== 'DELETE') throw new HttpError(404, 'Ruta desconocida');
  const b = c.body ?? {};
  const borrar = c.metodo === 'DELETE';
  const id = Number(r3 ?? b.id);
  const quien = autor(c);
  switch (r0) {
    case 'config':
      repo.guardarConfig(db, r1, r2, b.config ?? {}, quien);
      if (b.niveles) repo.guardarNiveles(db, r1, r2, b.niveles, quien);
      if (b.puertas) repo.guardarPuertas(db, r1, r2, b.puertas, quien);
      return { ok: true };
    case 'mes': repo.guardarMes(db, r1, r2, b, quien, b.origen ?? 'manual'); return { ok: true };
    case 'uber':
      if (b.csv) {
        const imp = importarCsvUber(b.csv, b.mes);
        for (const f of imp.filas) repo.guardarUberMes(db, r1, r2, f, quien, 'automatico', b.fichero ?? 'csv');
        return { ok: true, importadas: imp.filas.length, columnasNoEncontradas: imp.columnasNoEncontradas };
      }
      repo.guardarUberMes(db, r1, r2, b, quien, 'manual');
      return { ok: true };
    case 'visita':
      if (borrar) { repo.borrarVisita(db, r1, r2, id, quien); return { ok: true }; }
      if (r3) { repo.actualizarVisita(db, r1, r2, id, b, quien); return { ok: true }; }
      return { ok: true, id: repo.guardarVisita(db, r1, r2, b, quien) };
    case 'hallazgo': repo.archivarHallazgo(db, r1, r2, id, quien, b.motivo); return { ok: true };
    case 'ficha':
      if (borrar) { repo.borrarFicha(db, r1, r2, id, quien); return { ok: true }; }
      if (r3) { repo.actualizarFicha(db, r1, r2, id, b, quien); return { ok: true }; }
      repo.guardarFicha(db, r1, r2, b, quien);
      return { ok: true };
    case 'compromiso':
      if (borrar) { repo.borrarCompromiso(db, r1, r2, id, quien); return { ok: true }; }
      repo.guardarCompromiso(db, r1, r2, b, quien);
      return { ok: true };
    case 'cualitativa': repo.guardarCualitativa(db, r1, r2, b, quien); return { ok: true };
    case 'descuentos': repo.guardarDescuentosMes(db, r1, r2, b, quien); return { ok: true };
    case 'coste': repo.guardarCostePersonalMes(db, r1, r2, b, quien); return { ok: true };
    case 'neutralizacion':
      if (borrar) { repo.borrarNeutralizacion(db, r1, r2, id, quien); return { ok: true }; }
      repo.guardarNeutralizacion(db, r1, r2, b, quien);
      return { ok: true };
    case 'liquidar':
      return repo.cerrarLiquidacion(db, r1, r2, b.fecha_extraccion ?? new Date().toISOString().slice(0, 10), quien, !!b.forzar);
    case 'vaciar':
      if (b.confirmar !== r1) throw new HttpError(400, 'Confirmación incorrecta');
      repo.vaciarDatos(db, r1, r2, quien);
      return { ok: true };
  }
  throw new HttpError(404, 'Ruta desconocida');
}

export function api(db: DB, c: Ctx): any {
  const ruta = c.ruta;
  if (ruta[0] === 'login' && c.metodo === 'POST') {
    try { return auth.iniciarSesion(db, String(c.body?.email ?? ''), String(c.body?.password ?? '')); }
    catch (e: any) { throw new HttpError(401, e.message); }
  }
  if (!c.acceso) throw new HttpError(401, 'Sesión no válida o caducada');
  return rutasSesion(db, c, ruta) ?? rutasLectura(db, c, ruta) ?? rutasChecklist(db, c, ruta) ?? rutasDireccion(db, c, ruta);
}
