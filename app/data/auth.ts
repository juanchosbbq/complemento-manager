/**
 * Autenticación: correo + contraseña, gestionados por un usuario de Dirección.
 * - Hash scrypt con sal aleatoria por usuario (node:crypto, sin dependencias).
 * - Sesiones con token aleatorio de 32 bytes y caducidad; cerrar sesión las borra.
 * - Bloqueo temporal tras varios intentos fallidos por correo.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DB, ahora } from './db';

type Row = Record<string, any>;
const get = (db: DB, sql: string, ...p: any[]) => db.prepare(sql).get(...p) as Row | undefined;
const all = (db: DB, sql: string, ...p: any[]) => db.prepare(sql).all(...p) as Row[];
const run = (db: DB, sql: string, ...p: any[]) => db.prepare(sql).run(...p);

export const DIAS_SESION = 30;
export const MIN_PASSWORD = 10;
const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 15;

const normalizar = (email: string) => String(email ?? '').trim().toLowerCase();
export const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function hashear(password: string, sal?: string) {
  const s = sal ?? randomBytes(16).toString('hex');
  return { sal: s, hash: scryptSync(password, s, 64).toString('hex') };
}
function coincide(password: string, sal: string, hash: string) {
  const h = scryptSync(password, sal, 64);
  const esperado = Buffer.from(hash, 'hex');
  return h.length === esperado.length && timingSafeEqual(h, esperado);
}
export function validarPassword(p: string) {
  if (typeof p !== 'string' || p.length < MIN_PASSWORD) throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
  if (!/[a-zA-Z]/.test(p) || !/[0-9]/.test(p)) throw new Error('La contraseña debe mezclar letras y números');
}

// ---- intentos fallidos (en memoria; un reinicio los limpia, que es aceptable) ----
const intentos = new Map<string, { n: number; hasta: number }>();
function comprobarBloqueo(email: string) {
  const i = intentos.get(email);
  if (i && i.n >= MAX_INTENTOS && Date.now() < i.hasta) throw new Error(`Demasiados intentos. Vuelve a probar en ${Math.ceil((i.hasta - Date.now()) / 60000)} min`);
}
function registrarFallo(email: string) {
  const i = intentos.get(email) ?? { n: 0, hasta: 0 };
  i.n += 1; if (i.n >= MAX_INTENTOS) i.hasta = Date.now() + BLOQUEO_MIN * 60000;
  intentos.set(email, i);
}

// ---- usuarios ----
export const usuarios = (db: DB) => all(db, 'SELECT email, nombre, rol, local_id, activo, debe_cambiar, creado_por, ts, ultimo_acceso FROM usuarios ORDER BY rol, nombre');
export const hayUsuarios = (db: DB) => ((get(db, 'SELECT COUNT(*) AS n FROM usuarios') as any).n as number) > 0;

export function crearUsuario(db: DB, u: { email: string; nombre: string; rol: 'DIRECCION' | 'MANAGER'; local_id?: string | null; password: string; debe_cambiar?: boolean }, creadoPor: string) {
  const email = normalizar(u.email);
  if (!emailValido(email)) throw new Error('Correo no válido');
  if (!u.nombre?.trim()) throw new Error('Falta el nombre');
  if (u.rol === 'MANAGER' && !u.local_id) throw new Error('Un Manager necesita un local asignado');
  if (get(db, 'SELECT 1 FROM usuarios WHERE email = ?', email)) throw new Error('Ya existe un usuario con ese correo');
  validarPassword(u.password);
  const { sal, hash } = hashear(u.password);
  run(db, 'INSERT INTO usuarios (email, nombre, rol, local_id, hash, sal, activo, debe_cambiar, creado_por, ts) VALUES (?,?,?,?,?,?,1,?,?,?)',
    email, u.nombre.trim(), u.rol, u.rol === 'MANAGER' ? u.local_id : null, hash, sal, u.debe_cambiar ? 1 : 0, creadoPor, ahora());
}

export function actualizarUsuario(db: DB, email: string, c: { nombre?: string; rol?: 'DIRECCION' | 'MANAGER'; local_id?: string | null; activo?: boolean }, porQuien: string) {
  email = normalizar(email);
  const u = get(db, 'SELECT * FROM usuarios WHERE email = ?', email);
  if (!u) throw new Error('Usuario no encontrado');
  const rol = c.rol ?? u.rol;
  const local = rol === 'MANAGER' ? (c.local_id === undefined ? u.local_id : c.local_id) : null;
  if (rol === 'MANAGER' && !local) throw new Error('Un Manager necesita un local asignado');
  const activo = c.activo === undefined ? !!u.activo : c.activo;
  if ((rol !== 'DIRECCION' || !activo) && esUltimoAdmin(db, email)) throw new Error('No puedes quitar el acceso de Dirección al único administrador');
  run(db, 'UPDATE usuarios SET nombre = ?, rol = ?, local_id = ?, activo = ? WHERE email = ?', c.nombre?.trim() || u.nombre, rol, local, activo ? 1 : 0, email);
  if (!activo) run(db, 'DELETE FROM sesiones WHERE email = ?', email);
}

export function borrarUsuario(db: DB, email: string, porQuien: string) {
  email = normalizar(email);
  if (email === normalizar(porQuien)) throw new Error('No puedes borrar tu propio usuario');
  if (esUltimoAdmin(db, email)) throw new Error('No puedes borrar al único administrador');
  run(db, 'DELETE FROM sesiones WHERE email = ?', email);
  run(db, 'DELETE FROM usuarios WHERE email = ?', email);
}

export function restablecerPassword(db: DB, email: string, password: string, obligarCambio = true) {
  email = normalizar(email);
  if (!get(db, 'SELECT 1 FROM usuarios WHERE email = ?', email)) throw new Error('Usuario no encontrado');
  validarPassword(password);
  const { sal, hash } = hashear(password);
  run(db, 'UPDATE usuarios SET hash = ?, sal = ?, debe_cambiar = ? WHERE email = ?', hash, sal, obligarCambio ? 1 : 0, email);
  run(db, 'DELETE FROM sesiones WHERE email = ?', email); // las sesiones abiertas dejan de valer
}

export function cambiarMiPassword(db: DB, email: string, actual: string, nueva: string, tokenActual: string) {
  email = normalizar(email);
  const u = get(db, 'SELECT * FROM usuarios WHERE email = ?', email);
  if (!u || !coincide(actual, u.sal, u.hash)) throw new Error('La contraseña actual no es correcta');
  validarPassword(nueva);
  const { sal, hash } = hashear(nueva);
  run(db, 'UPDATE usuarios SET hash = ?, sal = ?, debe_cambiar = 0 WHERE email = ?', hash, sal, email);
  run(db, 'DELETE FROM sesiones WHERE email = ? AND token <> ?', email, tokenActual); // cierra las demás sesiones, mantiene esta
}

function esUltimoAdmin(db: DB, email: string) {
  const u = get(db, 'SELECT rol, activo FROM usuarios WHERE email = ?', email);
  if (!u || u.rol !== 'DIRECCION' || !u.activo) return false;
  return ((get(db, "SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'DIRECCION' AND activo = 1") as any).n as number) <= 1;
}

// ---- sesiones ----
export function iniciarSesion(db: DB, email: string, password: string) {
  email = normalizar(email);
  comprobarBloqueo(email);
  const u = get(db, 'SELECT * FROM usuarios WHERE email = ?', email);
  if (!u || !u.activo || !coincide(password ?? '', u.sal, u.hash)) { registrarFallo(email); throw new Error('Correo o contraseña incorrectos'); }
  intentos.delete(email);
  const token = randomBytes(32).toString('base64url');
  const caduca = new Date(Date.now() + DIAS_SESION * 86400000).toISOString();
  run(db, 'INSERT INTO sesiones (token, email, creada, caduca) VALUES (?,?,?,?)', token, email, ahora(), caduca);
  run(db, 'UPDATE usuarios SET ultimo_acceso = ? WHERE email = ?', ahora(), email);
  return { token, usuario: perfil(u) };
}

export function sesion(db: DB, token: string | undefined) {
  if (!token) return null;
  const s = get(db, 'SELECT s.token, s.caduca, u.* FROM sesiones s JOIN usuarios u ON u.email = s.email WHERE s.token = ?', token);
  if (!s) return null;
  if (s.caduca < ahora() || !s.activo) { run(db, 'DELETE FROM sesiones WHERE token = ?', token); return null; }
  return { ...perfil(s), token };
}
export const cerrarSesion = (db: DB, token: string) => run(db, 'DELETE FROM sesiones WHERE token = ?', token);
export const limpiarSesionesCaducadas = (db: DB) => run(db, 'DELETE FROM sesiones WHERE caduca < ?', ahora());

const perfil = (u: Row) => ({ email: u.email, nombre: u.nombre, rol: u.rol as 'DIRECCION' | 'MANAGER', local_id: u.local_id ?? null, debe_cambiar: !!u.debe_cambiar });

/** Crea el primer administrador si no hay ningún usuario. La contraseña sale de ADMIN_PASSWORD o, si no está, se genera y se imprime UNA vez. */
export function asegurarAdminInicial(db: DB, email = process.env.ADMIN_EMAIL ?? 'juancho@equipojuanchos.com') {
  if (hayUsuarios(db)) return null;
  const password = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url') + 'a1';
  crearUsuario(db, { email, nombre: 'Dirección', rol: 'DIRECCION', password, debe_cambiar: true }, 'sistema');
  return { email, password, generada: !process.env.ADMIN_PASSWORD };
}
