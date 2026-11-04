/**
 * Google Drive con una cuenta de servicio, sin dependencias: firma JWT con node:crypto y llamadas REST con fetch.
 *
 * Configuración (variables del servicio en Railway):
 *   GOOGLE_SERVICE_ACCOUNT  el JSON completo de la clave de la cuenta de servicio
 *   DRIVE_FOLDER_ID         el id de la carpeta de destino, dentro de una unidad compartida
 *
 * La cuenta de servicio solo ve lo que se comparte con ella. Tiene que ser una unidad compartida
 * (o una carpeta dentro de una): Google no deja que una cuenta de servicio guarde ficheros en "Mi unidad".
 */
import { createSign } from 'node:crypto';

export interface Credenciales {
  client_email: string;
  private_key: string;
  token_uri?: string;
}
export interface ConfigDrive {
  credenciales: Credenciales;
  carpetaId: string;
  /** Solo para tests: sustituye las URLs de Google. */
  urls?: { token: string; api: string; subida: string };
}
export interface FicheroDrive {
  id: string;
  name: string;
  createdTime: string;
}

const URLS = {
  token: 'https://oauth2.googleapis.com/token',
  api: 'https://www.googleapis.com/drive/v3',
  subida: 'https://www.googleapis.com/upload/drive/v3',
};

/** Lee la configuración del entorno. Devuelve null si no está puesta; lanza si está mal puesta. */
export function configDesdeEntorno(env: NodeJS.ProcessEnv = process.env): ConfigDrive | null {
  const json = env.GOOGLE_SERVICE_ACCOUNT?.trim();
  const carpetaId = env.DRIVE_FOLDER_ID?.trim();
  if (!json && !carpetaId) return null;
  if (!json) throw new Error('Falta la variable GOOGLE_SERVICE_ACCOUNT');
  if (!carpetaId) throw new Error('Falta la variable DRIVE_FOLDER_ID');
  let c: any;
  try {
    c = JSON.parse(json);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT no es un JSON válido: hay que pegar el fichero de la clave entero');
  }
  if (!c?.client_email || !c?.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT no tiene client_email y private_key');
  return { credenciales: { client_email: c.client_email, private_key: c.private_key, token_uri: c.token_uri }, carpetaId };
}

const urls = (cfg: ConfigDrive) => cfg.urls ?? { ...URLS, token: cfg.credenciales.token_uri ?? URLS.token };
const b64 = (x: string) => Buffer.from(x).toString('base64url');

async function fallo(r: Response, que: string): Promise<never> {
  const txt = (await r.text().catch(() => '')).slice(0, 300);
  let msg = txt;
  try {
    msg = JSON.parse(txt)?.error?.message ?? JSON.parse(txt)?.error_description ?? txt;
  } catch {
    /* no era JSON */
  }
  throw new Error(`${que} (${r.status}): ${msg}`);
}

export async function obtenerToken(cfg: ConfigDrive): Promise<string> {
  const { token } = urls(cfg);
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const carga = b64(
    JSON.stringify({
      iss: cfg.credenciales.client_email,
      scope: 'https://www.googleapis.com/auth/drive',
      aud: token,
      iat: ahora,
      exp: ahora + 3600,
    }),
  );
  const firma = createSign('RSA-SHA256').update(`${cabecera}.${carga}`).sign(cfg.credenciales.private_key).toString('base64url');
  const r = await fetch(token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cabecera}.${carga}.${firma}` }),
  });
  if (!r.ok) await fallo(r, 'Google rechazó la cuenta de servicio');
  return (await r.json()).access_token;
}

export async function subir(cfg: ConfigDrive, token: string, nombre: string, datos: Buffer): Promise<FicheroDrive> {
  const limite = 'copia' + Date.now().toString(36);
  const meta = JSON.stringify({ name: nombre, parents: [cfg.carpetaId], mimeType: 'application/x-sqlite3' });
  const cuerpo = Buffer.concat([
    Buffer.from(
      `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${limite}\r\nContent-Type: application/x-sqlite3\r\n\r\n`,
    ),
    datos,
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  const r = await fetch(`${urls(cfg).subida}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,createdTime`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${limite}` },
    body: cuerpo,
  });
  if (!r.ok) await fallo(r, 'No se pudo subir la copia a Drive');
  return r.json();
}

/** Ficheros de la carpeta cuyo nombre empieza por `prefijo`, del más reciente al más antiguo. */
export async function listar(cfg: ConfigDrive, token: string, prefijo: string): Promise<FicheroDrive[]> {
  const q = `'${cfg.carpetaId.replace(/'/g, "\\'")}' in parents and name contains '${prefijo.replace(/'/g, "\\'")}' and trashed = false`;
  const p = new URLSearchParams({
    q,
    orderBy: 'createdTime desc',
    fields: 'files(id,name,createdTime)',
    pageSize: '200',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  const r = await fetch(`${urls(cfg).api}/files?${p}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) await fallo(r, 'No se pudo listar la carpeta de Drive');
  return ((await r.json()).files as FicheroDrive[]).filter(f => f.name.startsWith(prefijo));
}

export async function borrar(cfg: ConfigDrive, token: string, id: string): Promise<void> {
  const r = await fetch(`${urls(cfg).api}/files/${encodeURIComponent(id)}?supportsAllDrives=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok && r.status !== 404) await fallo(r, 'No se pudo borrar una copia antigua de Drive');
}
