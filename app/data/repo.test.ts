import { describe, expect, it } from 'vitest';
import { abrir } from './db';
import { calcular, calcularProrrateo, config, datosPeriodo, guardarChecklist, guardarConfig, guardarNiveles, guardarVisita, hallazgosAbiertos, semanaISO } from './repo';
import { importarCsvUber } from '../server/integraciones/ubereats';

function dbPrueba() {
  const db = abrir(':memory:');
  db.exec(`INSERT INTO locales VALUES ('L1','Local 1','Madrid',1,1,1), ('VLL','Valladolid','Valladolid',0,0,9);
           INSERT INTO periodos VALUES ('Q4-2026','Q4 2026','2026-10-01','2026-12-31','["2026-10","2026-11","2026-12"]','ABIERTO');`);
  guardarConfig(db, 'L1', 'Q4-2026', {}, 'test');
  guardarNiveles(db, 'L1', 'Q4-2026', [{ kpi: 'K10_CHECKLIST', umbral: 80, objetivo: 95, excelencia: 100 }, { kpi: 'K11_HALLAZGOS', umbral: 60, objetivo: 85, excelencia: 100 }], 'test');
  return db;
}

describe('Semana ISO', () => {
  it('calcula la semana', () => { expect(semanaISO('2026-10-05')).toBe('2026-W41'); expect(semanaISO('2026-12-31')).toBe('2026-W53'); });
});

describe('Exclusión de Valladolid en el modelo de datos', () => {
  it('calcular() rechaza un local con en_modelo = 0', () => {
    const db = dbPrueba();
    expect(() => calcular(db, 'VLL', 'Q4-2026')).toThrow(/no incluido/);
  });
});

describe('Cruce visita ↔ checklist', () => {
  it('un hallazgo no reportado invalida la última línea del checklist anterior; uno reportado no', () => {
    const db = dbPrueba();
    const lineas = ['b1', 'b2', 'b3', 'b4'].map(id => ({ linea_id: id, estado: 'CONFORME', aviso_en_24h: false }));
    guardarChecklist(db, 'L1', 'Q4-2026', '2026-W41', 'B', 'Manager', 'Jefe', lineas);
    guardarChecklist(db, 'L1', 'Q4-2026', '2026-W41', 'A', 'Manager', null, [{ linea_id: 'a1', estado: 'CONFORME', aviso_en_24h: false }]);
    guardarVisita(db, 'L1', 'Q4-2026', { fecha: '2026-10-09', visitante: 'Dir', hallazgos: [
      { hoja: 'B', linea_id: 'b1', reportado_previamente: 0, debio_detectarse: true },
      { hoja: 'B', linea_id: 'b2', reportado_previamente: 1, debio_detectarse: true },
      { hoja: 'B', linea_id: 'b3', reportado_previamente: 0, debio_detectarse: false },
    ] });
    const d = datosPeriodo(db, 'L1', 'Q4-2026');
    expect(d.checklist.find(l => l.lineaId === 'b1')!.hallazgoNoReportado).toBe(true);
    expect(d.checklist.find(l => l.lineaId === 'b2')!.hallazgoNoReportado).toBe(false);
    expect(d.checklist.find(l => l.lineaId === 'b3')!.hallazgoNoReportado).toBe(false);
    expect(d.hallazgos.every(h => h.cerradoEnVisitaSiguiente === null)).toBe(true); // sin visita siguiente
    const c = calcular(db, 'L1', 'Q4-2026');
    expect(c.agregados.aux.fiabilidadB).toBe(75);
    expect(c.agregados.valores.K11_HALLAZGOS.valor).toBe(100);
  });
  it('la hoja B exige firma conjunta', () => {
    const db = dbPrueba();
    expect(() => guardarChecklist(db, 'L1', 'Q4-2026', '2026-W41', 'B', 'Manager', null, [])).toThrow(/Jefe de Cocina/);
  });
  it('el cierre se registra en la visita siguiente', () => {
    const db = dbPrueba();
    const v1 = guardarVisita(db, 'L1', 'Q4-2026', { fecha: '2026-10-09', visitante: 'Dir', hallazgos: [{ hoja: 'A', linea_id: 'a1', reportado_previamente: 1 }, { hoja: 'A', linea_id: 'a2', reportado_previamente: 1 }] });
    const ids = (db.prepare('SELECT id FROM hallazgos WHERE visita_id = ?').all(v1) as any[]).map(r => r.id);
    guardarVisita(db, 'L1', 'Q4-2026', { fecha: '2026-10-16', visitante: 'Dir2', hallazgos: [], cierres: [{ hallazgo_id: ids[0], cerrado: true }, { hallazgo_id: ids[1], cerrado: false }] });
    const c = calcular(db, 'L1', 'Q4-2026');
    expect(c.agregados.valores.K11_HALLAZGOS.valor).toBe(50);
  });
  it('acumulado hasta octubre ignora lo posterior', () => {
    const db = dbPrueba();
    guardarVisita(db, 'L1', 'Q4-2026', { fecha: '2026-11-09', visitante: 'Dir', hallazgos: [{ hoja: 'A', linea_id: 'a1', reportado_previamente: 0 }] });
    expect(datosPeriodo(db, 'L1', 'Q4-2026', '2026-10').hallazgos.length).toBe(0);
    expect(datosPeriodo(db, 'L1', 'Q4-2026').hallazgos.length).toBe(1);
  });
});

describe('Importación CSV de Uber Eats', () => {
  it('lee las columnas por alias y tolera porcentajes', () => {
    const csv = 'Date,Orders,Inaccurate Orders Rate,Food Taste or Quality Issues,Order Preparation Delays,Online Rate,Unfulfilled Order Rate,Rating\n2026-10-01,1200,1.8%,0.4%,0.3%,98.2%,0.9%,4.6\n';
    const r = importarCsvUber(csv);
    expect(r.columnasNoEncontradas).toEqual([]);
    expect(r.filas[0]).toMatchObject({ mes: '2026-10', pedidos: 1200, inaccurate_rate: 1.8, online_rate: 98.2, rating: 4.6 });
  });
  it('avisa de columnas ausentes', () => {
    const r = importarCsvUber('Date,Orders\n2026-10-01,5\n');
    expect(r.columnasNoEncontradas).toContain('inaccurate_rate');
  });
});

describe('Situaciones especiales (carta §9): prorrateo por días efectivos', () => {
  const p = { inicio: '2026-10-01', fin: '2026-12-31' }; // 92 días
  it('sin incidencias → 1', () => expect(calcularProrrateo(p, {}).prorrateo).toBe(1));
  it('IT de 15 días o menos no prorratea; de más de 15, sí, por los días completos', () => {
    expect(calcularProrrateo(p, { dias_it: 15 }).prorrateo).toBe(1);
    expect(calcularProrrateo(p, { dias_it: 23 }).prorrateo).toBe(0.75); // 69/92
  });
  it('alta a mitad de trimestre: solo cuentan los días desde el alta', () => {
    expect(calcularProrrateo(p, { fecha_alta: '2026-11-01' }).diasEfectivos).toBe(61);
    expect(calcularProrrateo(p, { fecha_alta: '2026-11-01' }).prorrateo).toBe(0.663);
  });
  it('guardarConfig recalcula el prorrateo y conserva lo que no se envía', () => {
    const db = dbPrueba();
    guardarConfig(db, 'L1', 'Q4-2026', { importe_objetivo: 1500, dias_it: 30 }, 'test');
    expect(config(db, 'L1', 'Q4-2026')!.prorrateo).toBe(0.674); // 62/92
    guardarConfig(db, 'L1', 'Q4-2026', { productos_estrategicos: 'Entrantes' }, 'test');
    const c = config(db, 'L1', 'Q4-2026')!;
    expect(c.prorrateo).toBe(0.674);
    expect(c.importeObjetivo).toBe(1500);
  });
});

describe('Cierre de hallazgos en visitas posteriores', () => {
  it('cerrar en la visita inmediata puntúa; cerrar más tarde se registra pero no puntúa', () => {
    const db = dbPrueba();
    const v1 = guardarVisita(db, 'L1', 'Q4-2026', { fecha: '2026-10-05', visitante: 'A', hallazgos: [{ hoja: 'A', linea_id: 'a1', reportado_previamente: 1 }, { hoja: 'A', linea_id: 'a2', reportado_previamente: 1 }] });
    const [h1, h2] = (db.prepare('SELECT id FROM hallazgos WHERE visita_id = ? ORDER BY id').all(v1) as any[]).map(r => r.id);
    // visita 2: h1 cerrado, h2 sigue abierto
    guardarVisita(db, 'L1', 'Q4-2026', { fecha: '2026-10-12', visitante: 'B', hallazgos: [], cierres: [{ hallazgo_id: h1, cerrado: true }, { hallazgo_id: h2, cerrado: false }] });
    // visita 3: h2 se cierra por fin
    guardarVisita(db, 'L1', 'Q4-2026', { fecha: '2026-10-19', visitante: 'C', hallazgos: [], cierres: [{ hallazgo_id: h2, cerrado: true }] });
    const rows = db.prepare('SELECT id, cerrado_en_siguiente, cerrado_fecha FROM hallazgos ORDER BY id').all() as any[];
    expect(rows[0]).toMatchObject({ cerrado_en_siguiente: 1, cerrado_fecha: '2026-10-12' });
    expect(rows[1]).toMatchObject({ cerrado_en_siguiente: 0, cerrado_fecha: '2026-10-19' });
    expect(hallazgosAbiertos(db, 'L1', 'Q4-2026').length).toBe(0);
    expect(calcular(db, 'L1', 'Q4-2026').agregados.valores.K11_HALLAZGOS.valor).toBe(50);
  });
});
