import { describe, expect, it } from 'vitest';
import { abrir } from './db';
import { borrarNeutralizacion, calcular, calcularProrrateo, cerrarLiquidacion, checklistEditablePorManager, config, datosBrutos, datosPeriodo, guardarChecklist, guardarCompromiso, guardarConfig, guardarCualitativa, guardarMes, guardarNeutralizacion, guardarNiveles, guardarVisita, hallazgosAbiertos, historial, limiteEdicionChecklist, lunesDeSemana, rangoCorte, semanaISO, vaciarDatos, validarChecklist } from './repo';
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

describe('Vistas por mes y checklist de Dirección', () => {
  it('rangoCorte: meses aislados, M1+M2 y trimestre', () => {
    const m = ['2026-10', '2026-11', '2026-12'];
    expect(rangoCorte(m, 'M2')).toEqual({ desde: '2026-11', hasta: '2026-11' });
    expect(rangoCorte(m, 'M1+M2')).toEqual({ desde: '2026-10', hasta: '2026-11' });
    expect(rangoCorte(m, 'T')).toEqual({});
  });
  it('Mes 2 solo cuenta noviembre: octubre queda fuera y el objetivo se prorratea a un mes', () => {
    const db = dbPrueba();
    guardarNiveles(db, 'L1', 'Q4-2026', [{ kpi: 'K1_FACTURACION', umbral: 150, llave: 270, objetivo: 300, excelencia: 330 }], 'test');
    guardarMes(db, 'L1', 'Q4-2026', { mes: '2026-10', facturacion_real: 999 }, 'test');
    guardarMes(db, 'L1', 'Q4-2026', { mes: '2026-11', facturacion_real: 100 }, 'test');
    const k1 = (c: any) => c.resultado.kpis.find((k: any) => k.id === 'K1_FACTURACION');
    const m2 = calcular(db, 'L1', 'Q4-2026', 'M2');
    expect(k1(m2).valor).toBe(100);
    expect(k1(m2).niveles.objetivo).toBeCloseTo(100, 6); // 300 / 3 meses
    expect(k1(calcular(db, 'L1', 'Q4-2026', 'M1+M2')).valor).toBe(1099);
  });
  it('el checklist de Dirección se guarda aparte y no toca el KPI 10', () => {
    const db = dbPrueba();
    guardarChecklist(db, 'L1', 'Q4-2026', '2026-W41', 'A', 'Manager', null, [{ linea_id: 'a1', estado: 'CONFORME', aviso_en_24h: false }]);
    guardarChecklist(db, 'L1', 'Q4-2026', '2026-W41', 'A', 'Dirección', null, [{ linea_id: 'a1', estado: 'NO_CONFORME', aviso_en_24h: false }], 'DIRECCION');
    const d = datosBrutos(db, 'L1', 'Q4-2026');
    expect(d.checklists.length).toBe(1);
    expect(d.checklistsDireccion.length).toBe(1);
    expect(calcular(db, 'L1', 'Q4-2026', 'T').agregados.aux.fiabilidadA).toBe(100);
  });
});

describe('Cartas de objetivos precargadas', () => {
  it('se aplican una sola vez y no pisan un cambio posterior hecho desde Configuración', async () => {
    const { aplicarCartas } = await import('./cartas');
    const db = dbPrueba();
    db.exec("INSERT INTO locales VALUES ('L2','Local 2','Madrid',1,1,2), ('L3','Local 3','Madrid',1,1,3)");
    expect(aplicarCartas(db).sort()).toEqual(['carta-q4-2026-L1', 'carta-q4-2026-L2', 'carta-q4-2026-L3']);
    expect(config(db, 'L3', 'Q4-2026')!.niveles.K1_FACTURACION!.objetivo).toBe(138464.25);
    const c1 = config(db, 'L1', 'Q4-2026')!;
    expect(c1.niveles.K2_TICKET).toEqual({ umbral: 31.9, llave: 34.3, objetivo: 37.2, excelencia: 39.2 });
    expect(c1.niveles.K9_DISPONIBILIDAD!.objetivo).toBe(100);
    expect(config(db, 'L2', 'Q4-2026')!.niveles.K1_FACTURACION!.objetivo).toBe(214047.6);
    expect(config(db, 'L2', 'Q4-2026')!.sueloNotaResenas).toBe(4.4);
    guardarNiveles(db, 'L1', 'Q4-2026', [{ kpi: 'K2_TICKET', umbral: 31, objetivo: 37, excelencia: 39 }], 'juancho');
    expect(aplicarCartas(db)).toEqual([]);
    expect(config(db, 'L1', 'Q4-2026')!.niveles.K2_TICKET!.umbral).toBe(31);
  });
});

describe('Semanas del checklist', () => {
  it('no se puede guardar una semana futura', () => {
    const db = dbPrueba();
    const d = new Date(); d.setDate(d.getDate() + 14);
    expect(() => guardarChecklist(db, 'L1', 'Q4-2026', semanaISO(d.toISOString().slice(0, 10)), 'A', 'M', null, [])).toThrow(/futura/);
    expect(() => guardarChecklist(db, 'L1', 'Q4-2026', 'semana 3', 'A', 'M', null, [])).toThrow(/no válida/);
  });
});

describe('Ventana de edición del checklist del Manager (5 días tras el domingo)', () => {
  it('la semana 45 de 2026 (2–8 nov) se puede tocar hasta el viernes 13 incluido', () => {
    expect(lunesDeSemana('2026-W45')).toBe('2026-11-02');
    expect(limiteEdicionChecklist('2026-W45')).toBe('2026-11-13');
    expect(checklistEditablePorManager('2026-W45', '2026-11-13')).toBe(true);
    expect(checklistEditablePorManager('2026-W45', '2026-11-14')).toBe(false);
  });
  it('funciona en el cambio de año ISO', () => {
    expect(lunesDeSemana('2026-W53')).toBe('2026-12-28');
    expect(limiteEdicionChecklist('2026-W53')).toBe('2027-01-08');
  });
});

describe('Validación del checklist que llega por la API', () => {
  const db = dbPrueba();
  db.exec("INSERT INTO lineas_catalogo VALUES ('A','A_clima','Climatización',1), ('B','B_parrilla','Parrilla',1)");
  it('acepta líneas del catálogo de su hoja', () => {
    expect(() => validarChecklist(db, 'Q4-2026', '2026-W41', 'A', [{ linea_id: 'A_clima', estado: 'CONFORME' }])).not.toThrow();
  });
  it('rechaza líneas de otra hoja o inventadas, estados raros y semanas fuera del periodo', () => {
    expect(() => validarChecklist(db, 'Q4-2026', '2026-W41', 'A', [{ linea_id: 'B_parrilla', estado: 'CONFORME' }])).toThrow(/catálogo/);
    expect(() => validarChecklist(db, 'Q4-2026', '2026-W41', 'A', [{ linea_id: 'A_clima', estado: 'REGULAR' }])).toThrow(/Estado/);
    expect(() => validarChecklist(db, 'Q4-2026', '2026-W30', 'A', [])).toThrow(/no pertenece/);
    expect(() => validarChecklist(db, 'Q4-2026', '2026-W41', 'C', [])).toThrow(/Hoja/);
  });
});

describe('Rastro de cambios', () => {
  const entradas = (db: ReturnType<typeof dbPrueba>, entidad: string) => historial(db, 'L1', 'Q4-2026').filter(h => h.entidad === entidad);
  it('guardar y sobrescribir un checklist deja el antes y el después', () => {
    const db = dbPrueba();
    guardarChecklist(db, 'L1', 'Q4-2026', '2026-W41', 'A', 'Manager', null, [{ linea_id: 'a1', estado: 'CONFORME', aviso_en_24h: false }], 'MANAGER', 'Manager 1');
    guardarChecklist(db, 'L1', 'Q4-2026', '2026-W41', 'A', 'Manager', null, [{ linea_id: 'a1', estado: 'NO_CONFORME', aviso_en_24h: true }], 'MANAGER', 'Manager 1');
    const h = entradas(db, 'checklist');
    expect(h).toHaveLength(2);
    expect(JSON.parse(h[0].antes).lineas[0].estado).toBe('CONFORME');
    expect(JSON.parse(h[0].despues).lineas[0].estado).toBe('NO_CONFORME');
    expect(h[0].autor).toBe('Manager 1');
  });
  it('guardar lo mismo otra vez no ensucia el historial', () => {
    const db = dbPrueba();
    guardarConfig(db, 'L1', 'Q4-2026', { importe_objetivo: 2000 }, 'Dir');
    guardarConfig(db, 'L1', 'Q4-2026', { importe_objetivo: 2000 }, 'Dir');
    expect(entradas(db, 'configuracion')).toHaveLength(2); // el alta de dbPrueba y el cambio a 2000; el repetido no cuenta
  });
  it('niveles, cualitativa, compromisos, neutralizaciones y cierre quedan registrados', () => {
    const db = dbPrueba();
    guardarNiveles(db, 'L1', 'Q4-2026', [{ kpi: 'K10_CHECKLIST', umbral: 70, objetivo: 95, excelencia: 100 }], 'Dir');
    guardarCualitativa(db, 'L1', 'Q4-2026', { nota: 7.5, justificacion: 'Bien' }, 'Dir');
    guardarCompromiso(db, 'L1', 'Q4-2026', { tipo: 'REPORTE', descripcion: 'x', fecha_limite: '2026-10-10' }, 'Dir');
    guardarNeutralizacion(db, 'L1', 'Q4-2026', { kpi: 'K9_DISPONIBILIDAD', motivo: 'PARADA_JUSTIFICADA' }, 'Dir');
    cerrarLiquidacion(db, 'L1', 'Q4-2026', '2027-01-10', 'Dir', true);
    for (const e of ['niveles', 'cualitativa', 'compromiso', 'neutralizacion', 'cierre']) expect(entradas(db, e).length, e).toBeGreaterThan(0);
    expect(JSON.parse(entradas(db, 'cierre')[0].despues).forzada).toBe(true);
  });
  it('borrar una neutralización solo funciona en su local y periodo, y deja rastro', () => {
    const db = dbPrueba();
    const id = Number(guardarNeutralizacion(db, 'L1', 'Q4-2026', { kpi: 'K9_DISPONIBILIDAD', motivo: 'PARADA_JUSTIFICADA' }, 'Dir').lastInsertRowid);
    expect(() => borrarNeutralizacion(db, 'L2', 'Q4-2026', id, 'Dir')).toThrow(/no encontrada/);
    borrarNeutralizacion(db, 'L1', 'Q4-2026', id, 'Dir');
    expect(entradas(db, 'neutralizacion').some(h => h.despues === null)).toBe(true);
  });
  it('vaciar los datos conserva el historial y registra el vaciado', () => {
    const db = dbPrueba();
    guardarMes(db, 'L1', 'Q4-2026', { mes: '2026-10', facturacion_real: 1000 }, 'Dir');
    vaciarDatos(db, 'L1', 'Q4-2026', 'Dir');
    expect(entradas(db, 'mes')).toHaveLength(1);
    expect(entradas(db, 'vaciado')).toHaveLength(1);
  });
});
