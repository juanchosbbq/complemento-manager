import { describe, expect, it } from 'vitest';
import { EntradaLiquidacion, ValorKpi, liquidar, logroKpi, semaforo } from './liquidar';
import { KPIS, KpiId, PESOS_BLOQUE } from './modelo';

/** Niveles identidad: el valor ES el logro. Útil para probar la mecánica sin pasar por la escala. */
const ID = { umbral: 50, objetivo: 100, excelencia: 120 };
const ID_MENOR = { umbral: 150, objetivo: 100, excelencia: 80 };
const L = (logro: number, id?: KpiId): ValorKpi =>
  id && KPIS.find(k => k.id === id)!.sentido === 'menor' ? { valor: 200 - logro, niveles: ID_MENOR } : { valor: logro, niveles: ID };

function base(over: Partial<EntradaLiquidacion> = {}): EntradaLiquidacion {
  const kpis: Partial<Record<KpiId, ValorKpi>> = {};
  for (const k of KPIS) kpis[k.id] = L(100, k.id);
  return {
    importeObjetivo: 1500, perfilCanal: 'MIXTO', kpis,
    condiciones: { descuentosExcedidos: false, fichasMisterioso: 2, hayConsumicion: true, notaBajoSuelo: false },
    puertas: { seguridadAlimentaria: true, reporting: true, controlCaja: true, integridad: true },
    prorrateo: 1, bajaVoluntaria: false, ...over,
  };
}
const conLogros = (l: Partial<Record<KpiId, number>>, over: Partial<EntradaLiquidacion> = {}) => {
  const e = base(over);
  for (const [id, v] of Object.entries(l)) e.kpis[id as KpiId] = L(v, id as KpiId);
  return e;
};
const bloque = (r: ReturnType<typeof liquidar>, b: string) => r.bloques.find(x => x.bloque === b)!;
const kpi = (r: ReturnType<typeof liquidar>, id: KpiId) => r.kpis.find(x => x.id === id)!;

describe('Escala de cada KPI (§2.3)', () => {
  const n = { umbral: 90, objetivo: 100, excelencia: 110 };
  it('por debajo del umbral paga 0', () => expect(logroKpi(89.9, n, 'mayor')).toBe(0));
  it('umbral paga 50', () => expect(logroKpi(90, n, 'mayor')).toBe(50));
  it('interpola lineal entre umbral y objetivo', () => expect(logroKpi(95, n, 'mayor')).toBe(75));
  it('objetivo paga 100', () => expect(logroKpi(100, n, 'mayor')).toBe(100));
  it('interpola lineal entre objetivo y excelencia', () => expect(logroKpi(105, n, 'mayor')).toBe(110));
  it('excelencia paga 120 y es tope', () => {
    expect(logroKpi(110, n, 'mayor')).toBe(120);
    expect(logroKpi(150, n, 'mayor')).toBe(120);
  });
  it('sentido menor-mejor (p. ej. Inaccurate Orders Rate)', () => {
    const m = { umbral: 3, objetivo: 2, excelencia: 1 };
    expect(logroKpi(3.1, m, 'menor')).toBe(0);
    expect(logroKpi(3, m, 'menor')).toBe(50);
    expect(logroKpi(2, m, 'menor')).toBe(100);
    expect(logroKpi(1.5, m, 'menor')).toBe(110);
    expect(logroKpi(0.5, m, 'menor')).toBe(120);
  });
  it('rúbrica cualitativa: 7/8 → 110% (ejemplo §13 v7)', () => expect(logroKpi(7, { umbral: 4, objetivo: 6, excelencia: 8 }, 'mayor')).toBe(110));
});

describe('Llave calibrada a mano (no es el punto medio entre umbral y objetivo)', () => {
  // Ticket medio de Gabriel Lobo: umbral 31,90 · llave 34,30 · objetivo 37,20 · excelencia 39,20
  const n = { umbral: 31.90, llave: 34.30, objetivo: 37.20, excelencia: 39.20 };
  it('en la llave da exactamente 90', () => expect(logroKpi(34.30, n, 'mayor')).toBe(90));
  it('en el umbral da 50, en el objetivo 100, en la excelencia 120', () => {
    expect(logroKpi(31.90, n, 'mayor')).toBe(50);
    expect(logroKpi(37.20, n, 'mayor')).toBe(100);
    expect(logroKpi(39.20, n, 'mayor')).toBe(120);
  });
  it('interpola distinto a un lado y otro de la llave (los tramos no son simétricos)', () => {
    // tramo umbral→llave es más corto (2,40€) que llave→objetivo (2,90€): la misma distancia en € vale más logro en el primer tramo
    const puntoMedioTramo1 = logroKpi(31.90 + 1.20, n, 'mayor'); // mitad de umbral→llave
    const puntoMedioTramo2 = logroKpi(34.30 + 1.45, n, 'mayor'); // mitad de llave→objetivo
    expect(puntoMedioTramo1).toBeCloseTo(70, 9); // 50 + (90-50)/2
    expect(puntoMedioTramo2).toBeCloseTo(95, 9); // 90 + (100-90)/2
  });
  it('sin llave calibrada, se interpola linealmente entre umbral y objetivo como antes (compatibilidad)', () => {
    const sinLlave = { umbral: 90, objetivo: 100, excelencia: 110 };
    expect(logroKpi(95, sinLlave, 'mayor')).toBe(75); // igual que el primer test del bloque de escala
  });
  it('funciona igual con sentido menor-mejor', () => {
    // Precisión del pedido de Gabriel Lobo: umbral 2,4% · llave 1,9% · objetivo 1,0% · excelencia 0,6%
    const m = { umbral: 2.4, llave: 1.9, objetivo: 1.0, excelencia: 0.6 };
    expect(logroKpi(1.9, m, 'menor')).toBe(90);
    expect(logroKpi(2.4, m, 'menor')).toBe(50);
    expect(logroKpi(3, m, 'menor')).toBe(0);
  });
});

describe('Pesos del modelo', () => {
  it('los pesos de los 16 sub-KPIs suman 100 en MIXTO y cada bloque suma su peso', () => {
    expect(KPIS.reduce((s, k) => s + k.peso, 0)).toBe(100);
    for (const b of Object.keys(PESOS_BLOQUE.MIXTO) as (keyof typeof PESOS_BLOQUE.MIXTO)[]) {
      expect(KPIS.filter(k => k.bloque === b).reduce((s, k) => s + k.peso, 0)).toBe(PESOS_BLOQUE.MIXTO[b]);
    }
  });
  it('sin guardia en días libres: Dirección es 10 + 5 + 5', () => {
    expect(KPIS.find(k => k.id === 'K12A_INICIATIVAS')!.peso).toBe(10);
    expect(KPIS.find(k => k.id === 'K12B_REPORTES')!.peso).toBe(5);
    expect(KPIS.some(k => k.id.includes('GUARDIA'))).toBe(false);
  });
  it('Operaciones reasignado: Precisión 15% / Incidencias de cocina 3% (el Manager no controla la cocina)', () => {
    expect(KPIS.find(k => k.id === 'K7_PRECISION')!.peso).toBe(15);
    expect(KPIS.find(k => k.id === 'K8_COCINA')!.peso).toBe(3);
  });
  it('perfil DELIVERY: Atención 15 / Operaciones 25 y los KPIs escalan proporcionalmente', () => {
    const r = liquidar(base({ perfilCanal: 'DELIVERY' }));
    expect(bloque(r, 'ATENCION').peso).toBe(15);
    expect(bloque(r, 'OPERACIONES').peso).toBe(25);
    expect(kpi(r, 'K7_PRECISION').pesoEfectivo).toBe(18.75);
    expect(kpi(r, 'K4A_RESENAS_VOLUMEN').pesoEfectivo).toBe(4.5);
    expect(r.kpis.reduce((s, k) => s + k.pesoEfectivo, 0)).toBeCloseTo(100, 5);
  });
});

describe('Ejemplo de liquidación §13 v7 (Malasaña, Q4) — bloques troncales', () => {
  const logros: Partial<Record<KpiId, number>> = {
    K1_FACTURACION: 104, K2_TICKET: 106, K3_PRODUCTOS: 95,
    K4A_RESENAS_VOLUMEN: 110, K4B_RESENAS_NOTA: 98, K5_RATING_UBER: 96, K6A_MISTERIOSO_SALA: 88, K6B_MISTERIOSO_PRODUCTO: 88,
    K7_PRECISION: 106, K8_COCINA: 72, K9_DISPONIBILIDAD: 100,
    K10_CHECKLIST: 65, K11_HALLAZGOS: 100,
    K12A_INICIATIVAS: 100, K12B_REPORTES: 92, K13_CUALITATIVA: 110,
  };
  it('reproduce los logros de bloque del documento (sin el redondeo intermedio del PDF: 102,4 / 98,6 / 96,9)', () => {
    // El documento redondea los puntos de cada KPI a una décima antes de sumar (30,8 → 102,7). El motor no redondea hasta el final.
    const r = liquidar(conLogros(logros));
    expect(bloque(r, 'VENTAS').logro).toBe(102.4);
    expect(bloque(r, 'ATENCION').logro).toBe(98.6);
    expect(bloque(r, 'OPERACIONES').logro).toBe(100.3);
    expect(bloque(r, 'MANTENIMIENTO').logro).toBe(79);
    expect(r.llavesCumplidas).toBe(3);
    expect(r.coefLlaves).toBe(0.7);
  });
  it('Operaciones y Dirección cambian respecto al documento por la guardia (12c) y el reparto 15/3/2, 10/5/5: 100,3 y 100,5 en lugar de 96,9 y 102,0', () => {
    const r = liquidar(conLogros(logros));
    expect(bloque(r, 'OPERACIONES').logro).toBe(100.3);
    expect(bloque(r, 'DIRECCION').logro).toBe(100.5);
    expect(r.logroPonderado).toBe(98.5);
    expect(r.pago).toBe(1034.36); // 1.500 × 98,5% × 0,70 aprox (con decimales exactos del motor)
  });
  it('§13.1: checklist de cocina al 95% → KPI 10 al 100%, 4 de 4 llaves, ×1,00', () => {
    const r = liquidar(conLogros({ ...logros, K10_CHECKLIST: 100 }));
    expect(bloque(r, 'MANTENIMIENTO').logro).toBe(100);
    expect(r.llavesCumplidas).toBe(4);
    expect(r.coefLlaves).toBe(1);
    expect(r.logroPonderado).toBe(100.6);
    expect(r.pago).toBe(1509.15);
  });
});

describe('Sistema de llaves (§2.2) — sin media llave', () => {
  it('un bloque exactamente al 90% cumple la llave', () => {
    const r = liquidar(conLogros({ K1_FACTURACION: 90, K2_TICKET: 90, K3_PRODUCTOS: 90 }));
    expect(bloque(r, 'VENTAS').logro).toBe(90);
    expect(bloque(r, 'VENTAS').llaveCumplida).toBe(true);
    expect(r.coefLlaves).toBe(1);
  });
  it('un bloque al 89,9% no cumple', () => {
    const r = liquidar(conLogros({ K1_FACTURACION: 89.9, K2_TICKET: 89.9, K3_PRODUCTOS: 89.9 }));
    expect(bloque(r, 'VENTAS').llaveCumplida).toBe(false);
    expect(r.coefLlaves).toBe(0.7);
  });
  it('4/4 → 1,00 · 3/4 → 0,70 · 2/4 → 0 · 1/4 → 0 · 0/4 → 0', () => {
    const rompe = (bs: string[]) => {
      const l: Partial<Record<KpiId, number>> = {};
      for (const k of KPIS) if (bs.includes(k.bloque)) l[k.id] = 80;
      return liquidar(conLogros(l));
    };
    expect(rompe([]).coefLlaves).toBe(1);
    expect(rompe(['MANTENIMIENTO']).coefLlaves).toBe(0.7);
    expect(rompe(['MANTENIMIENTO', 'OPERACIONES']).coefLlaves).toBe(0);
    expect(rompe(['MANTENIMIENTO', 'OPERACIONES', 'ATENCION']).coefLlaves).toBe(0);
    expect(rompe(['MANTENIMIENTO', 'OPERACIONES', 'ATENCION', 'VENTAS']).coefLlaves).toBe(0);
    expect(rompe(['MANTENIMIENTO', 'OPERACIONES']).pago).toBe(0);
  });
  it('un bloque entre 80 y 90 NO cuenta como media llave', () => {
    const r = liquidar(conLogros({ K10_CHECKLIST: 85, K11_HALLAZGOS: 85, K7_PRECISION: 85, K8_COCINA: 85, K9_DISPONIBILIDAD: 85 }));
    expect(r.llavesCumplidas).toBe(2);
    expect(r.coefLlaves).toBe(0);
  });
  it('Dirección no es llave: a 0 no toca el coeficiente', () => {
    const r = liquidar(conLogros({ K12A_INICIATIVAS: 0, K12B_REPORTES: 0, K13_CUALITATIVA: 0 }));
    expect(bloque(r, 'DIRECCION').llaveCumplida).toBeNull();
    expect(r.llavesCumplidas).toBe(4);
    expect(r.coefLlaves).toBe(1);
    expect(r.logroPonderado).toBe(80);
  });
  it('la llave multiplica al ponderado, no lo sustituye: nota 98 con 3/4 → 1.500 × 0,98 × 0,70', () => {
    const r = liquidar(conLogros({ K1_FACTURACION: 98, K2_TICKET: 98, K3_PRODUCTOS: 98, K10_CHECKLIST: 80, K11_HALLAZGOS: 80 }));
    expect(r.logroPonderado).toBe(97.4);
    expect(r.pago).toBe(1022.7);
  });
});

describe('Cap de excelencia (§2.3)', () => {
  it('todo al 120 → 1.800 €', () => {
    const l: Partial<Record<KpiId, number>> = {};
    for (const k of KPIS) l[k.id] = 120;
    const r = liquidar(conLogros(l));
    expect(r.logroPonderado).toBe(120);
    expect(r.pago).toBe(1800);
  });
  it('el cap es por KPI: un valor muy por encima de excelencia no supera 120', () => {
    const e = base();
    e.kpis.K1_FACTURACION = { valor: 500, niveles: { umbral: 90, objetivo: 100, excelencia: 110 } };
    expect(kpi(liquidar(e), 'K1_FACTURACION').logro).toBe(120);
  });
});

describe('Puertas de acceso (§9)', () => {
  it('cualquier puerta fallida → 0 aunque la nota sea 120 y 4/4', () => {
    for (const p of ['seguridadAlimentaria', 'reporting', 'controlCaja', 'integridad'] as const) {
      const e = base(); e.puertas[p] = false;
      const r = liquidar(e);
      expect(r.puertas.superadas).toBe(false);
      expect(r.pago).toBe(0);
      expect(r.logroPonderado).toBe(100); // la nota se sigue calculando y mostrando
    }
  });
});

describe('Descuentos no tipificados (decisión 5)', () => {
  it('excedidos en algún mes: Ventas puntúa pero no cuenta como llave', () => {
    const e = base(); e.condiciones.descuentosExcedidos = true;
    const r = liquidar(e);
    expect(bloque(r, 'VENTAS').logro).toBe(100);
    expect(bloque(r, 'VENTAS').llaveCumplida).toBe(false);
    expect(r.llavesCumplidas).toBe(3);
    expect(r.coefLlaves).toBe(0.7);
    expect(bloque(r, 'VENTAS').notas[0]).toMatch(/Descuentos/);
  });
});

describe('Neutralizaciones (decisión 6)', () => {
  it('un KPI neutralizado computa al 100% sea cual sea su valor', () => {
    const e = base();
    e.kpis.K8_COCINA = { valor: 99, niveles: ID_MENOR, neutralizacion: { motivo: 'ESCALADO_SIN_RESOLUCION', evidencia: 'Ticket 123' } };
    e.kpis.K9_DISPONIBILIDAD = { valor: 0, niveles: ID, neutralizacion: { motivo: 'PARADA_JUSTIFICADA' } };
    const r = liquidar(e);
    expect(kpi(r, 'K8_COCINA').logro).toBe(100);
    expect(kpi(r, 'K8_COCINA').neutralizado).toBe(true);
    expect(kpi(r, 'K8_COCINA').notas.join(' ')).toMatch(/Ticket 123/);
    expect(kpi(r, 'K9_DISPONIBILIDAD').logro).toBe(100);
  });
  it('sin dato y sin neutralización computa 0', () => {
    const e = base(); e.kpis.K5_RATING_UBER = { valor: null, niveles: ID };
    expect(kpi(liquidar(e), 'K5_RATING_UBER').logro).toBe(0);
  });
});

describe('Redistribuciones de peso condicionales', () => {
  it('nota bajo suelo: el 6% de volumen pasa a nota (lectura B)', () => {
    const e = base(); e.condiciones.notaBajoSuelo = true;
    e.kpis.K4A_RESENAS_VOLUMEN = L(120); e.kpis.K4B_RESENAS_NOTA = L(0);
    const r = liquidar(e);
    expect(kpi(r, 'K4A_RESENAS_VOLUMEN').pesoEfectivo).toBe(0);
    expect(kpi(r, 'K4B_RESENAS_NOTA').pesoEfectivo).toBe(10);
    expect(bloque(r, 'ATENCION').logro).toBe(50); // 10 de 20 puntos: Uber y misterioso al 100
    expect(bloque(r, 'ATENCION').peso).toBe(20);
  });
  it('menos de dos fichas de cliente misterioso: su 5% se reparte entre 4 y 5 proporcionalmente', () => {
    const e = base(); e.condiciones.fichasMisterioso = 1;
    const r = liquidar(e);
    expect(kpi(r, 'K6A_MISTERIOSO_SALA').pesoEfectivo).toBe(0);
    expect(kpi(r, 'K6B_MISTERIOSO_PRODUCTO').pesoEfectivo).toBe(0);
    expect(kpi(r, 'K4A_RESENAS_VOLUMEN').pesoEfectivo).toBe(8);
    expect(kpi(r, 'K4B_RESENAS_NOTA').pesoEfectivo).toBe(5.33);
    expect(kpi(r, 'K5_RATING_UBER').pesoEfectivo).toBe(6.67);
    expect(r.kpis.filter(k => k.bloque === 'ATENCION').reduce((s, k) => s + k.pesoEfectivo, 0)).toBeCloseTo(20, 1);
  });
  it('sin consumición en ninguna ficha: el 1% de producto pasa a sala', () => {
    const e = base(); e.condiciones.hayConsumicion = false;
    const r = liquidar(e);
    expect(kpi(r, 'K6A_MISTERIOSO_SALA').pesoEfectivo).toBe(5);
    expect(kpi(r, 'K6B_MISTERIOSO_PRODUCTO').pesoEfectivo).toBe(0);
  });
});

describe('Situaciones especiales (§12)', () => {
  it('prorrateo por días efectivos', () => {
    const r = liquidar(base({ prorrateo: 0.5 }));
    expect(r.importeAntesProrrateo).toBe(1500);
    expect(r.pago).toBe(750);
  });
  it('baja voluntaria pierde el trimestre', () => expect(liquidar(base({ bajaVoluntaria: true })).pago).toBe(0));
  it('no existe suelo garantizado: un Manager nuevo con 2/4 cobra 0 (decisión 4)', () => {
    const r = liquidar(conLogros({ K10_CHECKLIST: 80, K11_HALLAZGOS: 80, K7_PRECISION: 80, K8_COCINA: 80, K9_DISPONIBILIDAD: 80 }));
    expect(r.pago).toBe(0);
    expect(JSON.stringify(r)).not.toMatch(/suelo/i);
  });
});

describe('Semáforo mensual (guía §6)', () => {
  it('verde ≥95 · ámbar 90–95 · rojo <90', () => {
    expect(semaforo(95)).toBe('verde');
    expect(semaforo(94.9)).toBe('ambar');
    expect(semaforo(90)).toBe('ambar');
    expect(semaforo(89.9)).toBe('rojo');
  });
});

describe('Explicabilidad', () => {
  it('el resultado lleva la fórmula del pago y los motivos de cada llave rota', () => {
    const r = liquidar(conLogros({ K10_CHECKLIST: 60, K11_HALLAZGOS: 60 }));
    expect(r.explicacion.join('\n')).toMatch(/Llave de MANTENIMIENTO no cumplida \(60% < 90%\)/);
    expect(r.explicacion.join('\n')).toMatch(/1500 € × 96% × 0.70 = 1008 € brutos/);
  });
});
