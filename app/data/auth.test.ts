import { describe, expect, it } from 'vitest';
import { abrir } from './db';
import * as auth from './auth';

const nueva = () => { const db = abrir(':memory:'); db.exec("INSERT INTO locales VALUES ('L1','Local 1','Madrid',1,1,1)"); return db; };

describe('Usuarios y contraseñas', () => {
  it('el primer administrador se crea una sola vez y debe cambiar la contraseña', () => {
    const db = nueva();
    const a = auth.asegurarAdminInicial(db, 'juancho@equipojuanchos.com')!;
    expect(a.email).toBe('juancho@equipojuanchos.com');
    expect(auth.asegurarAdminInicial(db)).toBeNull();
    const s = auth.iniciarSesion(db, 'JUANCHO@equipojuanchos.com ', a.password);
    expect(s.usuario.rol).toBe('DIRECCION');
    expect(s.usuario.debe_cambiar).toBe(true);
  });
  it('la contraseña no se guarda en claro y se exige mínimo', () => {
    const db = nueva();
    auth.crearUsuario(db, { email: 'm1@x.com', nombre: 'M1', rol: 'MANAGER', local_id: 'L1', password: 'clave-segura-1' }, 'test');
    const fila = db.prepare('SELECT hash, sal FROM usuarios WHERE email = ?').get('m1@x.com') as any;
    expect(fila.hash).not.toContain('clave');
    expect(fila.hash.length).toBe(128);
    expect(() => auth.crearUsuario(db, { email: 'm2@x.com', nombre: 'M2', rol: 'MANAGER', local_id: 'L1', password: 'corta1' }, 'test')).toThrow(/al menos 10/);
    expect(() => auth.crearUsuario(db, { email: 'm3@x.com', nombre: 'M3', rol: 'MANAGER', local_id: 'L1', password: 'sinnumerosaqui' }, 'test')).toThrow(/letras y números/);
  });
  it('un Manager necesita local; el mismo correo no se repite', () => {
    const db = nueva();
    expect(() => auth.crearUsuario(db, { email: 'm@x.com', nombre: 'M', rol: 'MANAGER', password: 'clave-segura-1' }, 't')).toThrow(/local/);
    auth.crearUsuario(db, { email: 'm@x.com', nombre: 'M', rol: 'MANAGER', local_id: 'L1', password: 'clave-segura-1' }, 't');
    expect(() => auth.crearUsuario(db, { email: 'M@X.com', nombre: 'M', rol: 'MANAGER', local_id: 'L1', password: 'clave-segura-1' }, 't')).toThrow(/Ya existe/);
  });
});

describe('Sesiones', () => {
  it('login correcto da token; incorrecto no; 5 fallos bloquean', () => {
    const db = nueva();
    auth.crearUsuario(db, { email: 'm@x.com', nombre: 'M', rol: 'MANAGER', local_id: 'L1', password: 'clave-segura-1' }, 't');
    const s = auth.iniciarSesion(db, 'm@x.com', 'clave-segura-1');
    expect(auth.sesion(db, s.token)!.email).toBe('m@x.com');
    expect(auth.sesion(db, 'inventado')).toBeNull();
    for (let i = 0; i < 5; i++) expect(() => auth.iniciarSesion(db, 'm@x.com', 'mal')).toThrow(/incorrectos/);
    expect(() => auth.iniciarSesion(db, 'm@x.com', 'clave-segura-1')).toThrow(/Demasiados intentos/);
  });
  it('quitar el acceso o restablecer la contraseña cierra las sesiones abiertas', () => {
    const db = nueva();
    auth.crearUsuario(db, { email: 'a@x.com', nombre: 'A', rol: 'DIRECCION', password: 'clave-segura-1' }, 't');
    auth.crearUsuario(db, { email: 'q@x.com', nombre: 'M', rol: 'MANAGER', local_id: 'L1', password: 'clave-segura-1' }, 't');
    const s = auth.iniciarSesion(db, 'q@x.com', 'clave-segura-1');
    auth.actualizarUsuario(db, 'q@x.com', { activo: false }, 'a@x.com');
    expect(auth.sesion(db, s.token)).toBeNull();
    expect(() => auth.iniciarSesion(db, 'q@x.com', 'clave-segura-1')).toThrow();
    auth.actualizarUsuario(db, 'q@x.com', { activo: true }, 'a@x.com');
    const s2 = auth.iniciarSesion(db, 'q@x.com', 'clave-segura-1');
    auth.restablecerPassword(db, 'q@x.com', 'otra-clave-22');
    expect(auth.sesion(db, s2.token)).toBeNull();
    expect(auth.iniciarSesion(db, 'q@x.com', 'otra-clave-22').usuario.debe_cambiar).toBe(true);
  });
  it('cambiar mi contraseña mantiene mi sesión y cierra las demás', () => {
    const db = nueva();
    auth.crearUsuario(db, { email: 'c@x.com', nombre: 'M', rol: 'MANAGER', local_id: 'L1', password: 'clave-segura-1' }, 't');
    const s1 = auth.iniciarSesion(db, 'c@x.com', 'clave-segura-1');
    const s2 = auth.iniciarSesion(db, 'c@x.com', 'clave-segura-1');
    expect(() => auth.cambiarMiPassword(db, 'c@x.com', 'mal', 'nueva-clave-99', s1.token)).toThrow(/actual/);
    auth.cambiarMiPassword(db, 'c@x.com', 'clave-segura-1', 'nueva-clave-99', s1.token);
    expect(auth.sesion(db, s1.token)).not.toBeNull();
    expect(auth.sesion(db, s2.token)).toBeNull();
  });
  it('no se puede dejar el sistema sin ningún administrador', () => {
    const db = nueva();
    auth.crearUsuario(db, { email: 'a@x.com', nombre: 'A', rol: 'DIRECCION', password: 'clave-segura-1' }, 't');
    expect(() => auth.borrarUsuario(db, 'a@x.com', 'otro@x.com')).toThrow(/único administrador/);
    expect(() => auth.actualizarUsuario(db, 'a@x.com', { rol: 'MANAGER', local_id: 'L1' }, 'a@x.com')).toThrow(/único administrador/);
    expect(() => auth.borrarUsuario(db, 'a@x.com', 'a@x.com')).toThrow(/propio/);
    auth.crearUsuario(db, { email: 'b@x.com', nombre: 'B', rol: 'DIRECCION', password: 'clave-segura-1' }, 't');
    auth.borrarUsuario(db, 'a@x.com', 'b@x.com'); // ahora sí
  });
});
