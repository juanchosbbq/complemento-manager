import { describe, expect, it } from 'vitest';
import { abrir } from './db';
import { calcular, datosPeriodo, guardarChecklist, guardarConfig, guardarNiveles, guardarVisita, semanaISO } from './repo';
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
