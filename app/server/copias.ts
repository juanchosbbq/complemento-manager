/**
 * Copias de seguridad de la base de datos: descarga manual y copia automática a Google Drive.
 *
 * - Diaria: a partir de las 03:00 (Madrid), una al día. Se conservan las últimas COPIAS_DIARIAS_A_CONSERVAR.
 * - Cierre: al cerrar la liquidación de un local. No se borran nunca.
 * - Manual: botón "Copiar a Drive ahora". Se conservan las últimas COPIAS_DIARIAS_A_CONSERVAR.
 * Cada intento, bien o mal, queda en la tabla copias_drive.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DB, ahora } from '../data/db';
import * as drive from './integraciones/drive';

export const COPIAS_DIARIAS_A_CONSERVAR = 30;
const HORA_COPIA_DIARIA = 3;
export type Motivo = 'diaria' | 'cierre' | 'manual';

/** Copia completa y coherente (VACUUM INTO funciona aunque haya escrituras a la vez). */
export function crearCopia(db: DB): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'copia-'));
  const fichero = join(dir, 'incentivos.db');
  try {
    db.exec(`VACUUM INTO '${fichero.replace(/'/g, "''")}'`);
    return readFileSync(fichero);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const sello = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
export const nombreCopia = (motivo: Motivo, etiqueta?: string) => `incentivos-${motivo}-${etiqueta ? etiqueta + '-' : ''}${sello()}.db`;

function registrar(db: DB, motivo: Motivo, nombre: string | null, ok: boolean, detalle: string, autor: string) {
  db.prepare('INSERT INTO copias_drive (ts, motivo, nombre, ok, detalle, autor) VALUES (?,?,?,?,?,?)').run(
    ahora(),
    motivo,
    nombre,
    ok ? 1 : 0,
    detalle,
    autor,
  );
}

let enCurso: Promise<unknown> | null = null;

/** Sube una copia a Drive. Lanza si Drive no está configurado o si falla; en ambos casos queda registrado. */
export async function copiaADrive(
  db: DB,
  motivo: Motivo,
  { etiqueta, autor = 'sistema', cfg }: { etiqueta?: string; autor?: string; cfg?: drive.ConfigDrive | null } = {},
) {
  // Una sola copia a la vez: si llega otra mientras tanto, espera a que termine la anterior.
  while (enCurso) await enCurso.catch(() => {});
  const trabajo = (async () => {
    const nombre = nombreCopia(motivo, etiqueta);
    try {
      const config = cfg === undefined ? drive.configDesdeEntorno() : cfg;
      if (!config) throw new Error('Las copias a Drive no están configuradas (faltan GOOGLE_SERVICE_ACCOUNT y DRIVE_FOLDER_ID)');
      const datos = crearCopia(db);
      const token = await drive.obtenerToken(config);
      const f = await drive.subir(config, token, nombre, datos);
      let borradas = 0;
      if (motivo !== 'cierre') {
        const prefijo = `incentivos-${motivo}-`;
        const antiguas = (await drive.listar(config, token, prefijo)).slice(COPIAS_DIARIAS_A_CONSERVAR);
        for (const a of antiguas) await drive.borrar(config, token, a.id);
        borradas = antiguas.length;
      }
      const detalle = `${(datos.length / 1024).toFixed(0)} KB${borradas ? ` · ${borradas} copia(s) antigua(s) borrada(s)` : ''}`;
      registrar(db, motivo, f.name, true, detalle, autor);
      return { ok: true, nombre: f.name, detalle };
    } catch (e: any) {
      // fetch solo dice "fetch failed" cuando no llega a Google: se explica con la causa real.
      const error =
        e?.message === 'fetch failed'
          ? new Error(`No se pudo conectar con Google (${e.cause?.code ?? e.cause?.message ?? 'sin respuesta'})`)
          : e;
      registrar(db, motivo, nombre, false, String(error?.message ?? error).slice(0, 500), autor);
      throw error;
    }
  })();
  enCurso = trabajo;
  try {
    return await trabajo;
  } finally {
    enCurso = null;
  }
}

export function estadoCopias(db: DB) {
  let configurado = false;
  let cuenta: string | null = null;
  let error: string | null = null;
  try {
    const c = drive.configDesdeEntorno();
    configurado = !!c;
    cuenta = c?.credenciales.client_email ?? null;
  } catch (e: any) {
    error = e.message;
  }
  return {
    configurado,
    cuenta,
    error,
    conservadas: COPIAS_DIARIAS_A_CONSERVAR,
    ultimas: db.prepare('SELECT * FROM copias_drive ORDER BY id DESC LIMIT 15').all(),
  };
}

const hoyMadrid = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const horaMadrid = () => Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }));

/** ¿Toca hacer la copia diaria? Una al día, a partir de las 03:00 de Madrid; un intento fallido se reintenta cada hora. */
export function tocaCopiaDiaria(db: DB, hoy = hoyMadrid(), hora = horaMadrid(), ahoraMs = Date.now()): boolean {
  if (hora < HORA_COPIA_DIARIA) return false;
  const filas = db.prepare("SELECT ts, ok FROM copias_drive WHERE motivo = 'diaria' ORDER BY id DESC LIMIT 50").all() as {
    ts: string;
    ok: number;
  }[];
  const deHoy = filas.filter(f => new Date(f.ts).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }) === hoy);
  if (deHoy.some(f => f.ok)) return false;
  const ultimoFallo = deHoy[0];
  return !ultimoFallo || ahoraMs - Date.parse(ultimoFallo.ts) >= 3600_000;
}

/** Comprueba cada 10 minutos si toca la copia diaria. No hace nada si Drive no está configurado. */
export function programarCopiaDiaria(db: DB) {
  const comprobar = () => {
    let cfg: drive.ConfigDrive | null;
    try {
      cfg = drive.configDesdeEntorno();
    } catch (e: any) {
      return console.error(`Copias a Drive: ${e.message}`);
    }
    if (!cfg || !tocaCopiaDiaria(db)) return;
    copiaADrive(db, 'diaria', { cfg })
      .then(r => console.log(`Copia diaria en Drive: ${r.nombre} (${r.detalle})`))
      .catch(e => console.error(`Copia diaria a Drive fallida: ${e.message}`));
  };
  setTimeout(comprobar, 30_000).unref();
  setInterval(comprobar, 10 * 60_000).unref();
}
