import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrir } from '../data/db';
import { COPIAS_DIARIAS_A_CONSERVAR, copiaADrive, estadoCopias, tocaCopiaDiaria } from './copias';
import { configDesdeEntorno, type ConfigDrive } from './integraciones/drive';

/** Un Drive falso en local: comprueba la firma del JWT y guarda los ficheros en memoria. */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ficheros: { id: string; name: string; createdTime: string; datos: Buffer; parents: string[] }[] = [];
let jwtValido = false;
let servidor: http.Server;
let cfg: ConfigDrive;

beforeAll(async () => {
  servidor = http.createServer(async (req, res) => {
    const trozos: Buffer[] = [];
    for await (const t of req) trozos.push(t as Buffer);
    const cuerpo = Buffer.concat(trozos);
    const url = new URL(req.url!, 'http://x');
    const fin = (st: number, j: unknown) => {
      res.writeHead(st, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(j));
    };
    if (url.pathname === '/token') {
      const [c, p, f] = new URLSearchParams(cuerpo.toString()).get('assertion')!.split('.');
      jwtValido = createVerify('RSA-SHA256').update(`${c}.${p}`).verify(publicKey, Buffer.from(f, 'base64url'));
      const carga = JSON.parse(Buffer.from(p, 'base64url').toString());
      return jwtValido && carga.iss === 'copias@proyecto.iam.gserviceaccount.com'
        ? fin(200, { access_token: 'tok' })
        : fin(400, { error_description: 'firma' });
    }
    if (req.headers.authorization !== 'Bearer tok') return fin(401, { error: { message: 'sin token' } });
    if (req.method === 'POST' && url.pathname === '/subida/files') {
      const limite = /boundary=(.+)$/.exec(req.headers['content-type']!)![1];
      const partes = cuerpo.toString('latin1').split(`--${limite}`);
      const meta = JSON.parse(partes[1].split('\r\n\r\n')[1]);
      const datos = Buffer.from(partes[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1');
      const f = {
        id: 'f' + (ficheros.length + 1),
        name: meta.name,
        createdTime: new Date(Date.now() + ficheros.length).toISOString(),
        datos,
        parents: meta.parents,
      };
      ficheros.push(f);
      return fin(200, { id: f.id, name: f.name, createdTime: f.createdTime });
    }
    if (req.method === 'GET' && url.pathname === '/api/files') {
      const pref = /name contains '([^']+)'/.exec(url.searchParams.get('q')!)![1];
      const fs = ficheros.filter(f => f.name.includes(pref)).sort((a, b) => b.createdTime.localeCompare(a.createdTime));
      return fin(200, { files: fs.map(({ id, name, createdTime }) => ({ id, name, createdTime })) });
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/files/')) {
      const i = ficheros.findIndex(f => f.id === url.pathname.split('/').pop());
      if (i >= 0) ficheros.splice(i, 1);
      res.writeHead(204);
      return res.end();
    }
    fin(404, {});
  });
  await new Promise<void>(ok => servidor.listen(0, ok));
  const base = `http://127.0.0.1:${(servidor.address() as any).port}`;
  cfg = {
    credenciales: {
      client_email: 'copias@proyecto.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    },
    carpetaId: 'carpeta1',
    urls: { token: `${base}/token`, api: `${base}/api`, subida: `${base}/subida` },
  };
});
afterAll(() => servidor.close());

describe('Copias de seguridad a Google Drive', () => {
  it('sube una copia completa y legible de la base, firmada correctamente', async () => {
    const db = abrir(':memory:');
    db.exec("INSERT INTO locales (id, nombre, ciudad) VALUES ('L1','Local 1','Madrid')");
    const r = await copiaADrive(db, 'manual', { cfg, autor: 'Dir' });
    expect(jwtValido).toBe(true);
    const f = ficheros.find(x => x.name === r.nombre)!;
    expect(f.parents).toEqual(['carpeta1']);
    const dir = mkdtempSync(join(tmpdir(), 'prueba-'));
    writeFileSync(join(dir, 'c.db'), f.datos);
    const copia = new DatabaseSync(join(dir, 'c.db'));
    expect((copia.prepare('SELECT nombre FROM locales').get() as any).nombre).toBe('Local 1');
    copia.close();
    rmSync(dir, { recursive: true });
    expect(estadoCopias(db).ultimas[0]).toMatchObject({ ok: 1, motivo: 'manual', autor: 'Dir' });
  });

  it(`conserva las últimas ${COPIAS_DIARIAS_A_CONSERVAR} diarias y nunca borra las de cierre`, async () => {
    const db = abrir(':memory:');
    await copiaADrive(db, 'cierre', { cfg, etiqueta: 'L1-Q4-2026' });
    for (let i = 0; i < COPIAS_DIARIAS_A_CONSERVAR + 3; i++) await copiaADrive(db, 'diaria', { cfg });
    expect(ficheros.filter(f => f.name.startsWith('incentivos-diaria-'))).toHaveLength(COPIAS_DIARIAS_A_CONSERVAR);
    expect(ficheros.filter(f => f.name.startsWith('incentivos-cierre-L1-Q4-2026-'))).toHaveLength(1);
  });

  it('un fallo queda registrado con el motivo', async () => {
    const db = abrir(':memory:');
    const malo = { ...cfg, credenciales: { ...cfg.credenciales, client_email: 'otra@x.com' } };
    await expect(copiaADrive(db, 'diaria', { cfg: malo })).rejects.toThrow(/rechazó/);
    expect(estadoCopias(db).ultimas[0]).toMatchObject({ ok: 0, motivo: 'diaria' });
    await expect(copiaADrive(db, 'manual', { cfg: null })).rejects.toThrow(/no están configuradas/);
  });

  it('la diaria toca una vez al día a partir de las 3, y reintenta un fallo cada hora', () => {
    const db = abrir(':memory:');
    const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
    expect(tocaCopiaDiaria(db, hoy, 2)).toBe(false);
    expect(tocaCopiaDiaria(db, hoy, 3)).toBe(true);
    db.prepare("INSERT INTO copias_drive (ts, motivo, ok) VALUES (?, 'diaria', 0)").run(new Date().toISOString());
    expect(tocaCopiaDiaria(db, hoy, 4)).toBe(false);
    expect(tocaCopiaDiaria(db, hoy, 5, Date.now() + 3600_000)).toBe(true);
    db.prepare("INSERT INTO copias_drive (ts, motivo, ok) VALUES (?, 'diaria', 1)").run(new Date().toISOString());
    expect(tocaCopiaDiaria(db, hoy, 5, Date.now() + 3600_000)).toBe(false);
  });

  it('lee y valida la configuración del entorno', () => {
    expect(configDesdeEntorno({})).toBeNull();
    expect(() => configDesdeEntorno({ DRIVE_FOLDER_ID: 'x' })).toThrow(/GOOGLE_SERVICE_ACCOUNT/);
    expect(() => configDesdeEntorno({ GOOGLE_SERVICE_ACCOUNT: 'no es json', DRIVE_FOLDER_ID: 'x' })).toThrow(/JSON/);
    const c = configDesdeEntorno({
      GOOGLE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'a@b', private_key: 'k' }),
      DRIVE_FOLDER_ID: ' x ',
    });
    expect(c).toMatchObject({ carpetaId: 'x', credenciales: { client_email: 'a@b' } });
  });
});
