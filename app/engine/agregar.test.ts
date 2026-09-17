import { describe, expect, it } from 'vitest';
import { ConfigPeriodo, DatosPeriodo, MesDatos, agregar, construirEntrada } from './agregar';
import { liquidar } from './liquidar';

const mes = (m: string, o: Partial<MesDatos> = {}): MesDatos => ({
  mes: m, facturacionReal: 100000, facturacionObjetivo: 100000, tickets: 5000,
  productosPenetracion: 30, resenasVolumen: 40, resenasObjetivo: 40, resenasNotaMedia: 4.6, ...o,
});
const vacio = (): DatosPeriodo => ({
  meses: [], uber: [], checklist: [], hallazgos: [], fichas: [], compromisos: { iniciativasTotal: 0, iniciativasEnPlazo: 0, reportesTotal: 0, reportesEnFecha: 0 },
  cualitativa: 8, descuentos: [], neutralizaciones: [],
});
const cfg = (o: Partial<ConfigPeriodo> = {}): ConfigPeriodo => ({
  importeObjetivo: 1500, perfilCanal: 'MIXTO',
  niveles: {
    K1_FACTURACION: { umbral: 240000, llave: 285000, objetivo: 300000, excelencia: 330000 }, // € del trimestre
    K2_TICKET: { umbral: 18, llave: 19.5, objetivo: 20, excelencia: 21 },                        // €
    K3_PRODUCTOS: { umbral: 25, objetivo: 30, excelencia: 35 },
    K4A_RESENAS_VOLUMEN: { umbral: 90, llave: 110, objetivo: 120, excelencia: 150 }, // reseñas del trimestre
    K4B_RESENAS_NOTA: { umbral: 4.3, objetivo: 4.5, excelencia: 4.7 },
    K5_RATING_UBER: { umbral: 4.3, objetivo: 4.5, excelencia: 4.7 },
    K6A_MISTERIOSO_SALA: { umbral: 6, llave: 7, objetivo: 8, excelencia: 10 },
    K6B_MISTERIOSO_PRODUCTO: { umbral: 6, llave: 7, objetivo: 8, excelencia: 10 },
    K7_PRECISION: { umbral: 3, objetivo: 2, excelencia: 1.2 },
    K8_COCINA: { umbral: 2, objetivo: 1.2, excelencia: 0.6 },
    K9_DISPONIBILIDAD: { umbral: 0, objetivo: 100, excelencia: 100 },
    K10_CHECKLIST: { umbral: 80, objetivo: 95, excelencia: 100 },
    K11_HALLAZGOS: { umbral: 60, objetivo: 85, excelencia: 100 },
    K12A_INICIATIVAS: { umbral: 70, objetivo: 90, excelencia: 100 },
    K12B_REPORTES: { umbral: 80, objetivo: 95, excelencia: 100 },
  },
  sueloNotaResenas: 4.2, umbralDescuentosPct: 0.3,
  puertas: { seguridadAlimentaria: true, reporting: true, controlCaja: true, integridad: true },
  prorrateo: 1, bajaVoluntaria: false, ...o,
});

describe('Facturación, ticket y reseñas en valor absoluto contra niveles del trimestre', () => {
  it('facturación: suma de los meses con dato, en €', () => {
    const d = vacio();
    d.meses = [mes('2026-10', { facturacionReal: 80000 }), mes('2026-11', { facturacionReal: 100000 }), mes('2026-12', { facturacionReal: 150000 })];
    const a = agregar(d, cfg());
    expect(a.valores.K1_FACTURACION.valor).toBe(330000);
    expect(a.escalaNiveles.K1_FACTURACION).toBe(1);
  });
  it('acumulado a fecha: los niveles se prorratean con el reparto mensual del objetivo, no a partes iguales', () => {
    const d = vacio();
    // reparto 25 / 25 / 50: con solo octubre cargado, los niveles se escalan al 25%
    d.meses = [mes('2026-10', { facturacionReal: 70000, facturacionObjetivo: 75000 }), mes('2026-11', { facturacionReal: null, tickets: null, facturacionObjetivo: 75000 }), mes('2026-12', { facturacionReal: null, tickets: null, facturacionObjetivo: 150000 })];
    const { entrada, agregados } = construirEntrada(d, cfg());
    expect(agregados.escalaNiveles.K1_FACTURACION).toBe(0.25);
    expect(entrada.kpis.K1_FACTURACION!.niveles).toEqual({ umbral: 60000, llave: 71250, objetivo: 75000, excelencia: 82500 });
    const r = liquidar(entrada);
    expect(r.kpis.find(k => k.id === 'K1_FACTURACION')!.logro).toBeCloseTo(50 + 40 * (10000 / 11250), 0);
  });
  it('sin reparto mensual, se prorratea por meses transcurridos', () => {
    const d = vacio();
    d.meses = [mes('2026-10', { facturacionObjetivo: 0 }), mes('2026-11', { facturacionReal: null, tickets: null, facturacionObjetivo: 0 }), mes('2026-12', { facturacionReal: null, tickets: null, facturacionObjetivo: 0 })];
    expect(agregar(d, cfg()).escalaNiveles.K1_FACTURACION).toBeCloseTo(1 / 3, 6);
  });
  it('ticket medio: facturación acumulada entre tickets acumulados, sin prorrateo', () => {
    const d = vacio();
    d.meses = [mes('2026-10', { facturacionReal: 90000, tickets: 5000 }), mes('2026-12', { facturacionReal: 220000, tickets: 10000 })];
    const a = agregar(d, cfg());
    expect(a.valores.K2_TICKET.valor).toBeCloseTo(20.67, 2); // 310000 / 15000
    expect(a.escalaNiveles.K2_TICKET).toBeUndefined();
  });
  it('reseñas: volumen acumulado y nota media de todas las reseñas, no media de medias', () => {
    const d = vacio();
    d.meses = [mes('2026-10', { resenasVolumen: 10, resenasNotaMedia: 3 }), mes('2026-11', { resenasVolumen: 90, resenasNotaMedia: 5 })];
    const a = agregar(d, cfg());
    expect(a.valores.K4A_RESENAS_VOLUMEN.valor).toBe(100);
    expect(a.valores.K4B_RESENAS_NOTA.valor).toBe(4.8); // (10×3 + 90×5)/100, no 4,0
    expect(a.condiciones.notaBajoSuelo).toBe(false);
  });
  it('salvaguarda: nota del trimestre bajo el suelo → condición activa', () => {
    const d = vacio();
    d.meses = [mes('2026-10', { resenasNotaMedia: 4.1 })];
    expect(agregar(d, cfg()).condiciones.notaBajoSuelo).toBe(true);
  });
});

describe('Checklist de mantenimiento (decisión 7)', () => {
  const linea = (hoja: 'A' | 'B', id: string, o: Partial<DatosPeriodo['checklist'][0]> = {}) => ({
    semana: '2026-W41', hoja, lineaId: id, estado: 'CONFORME' as const, avisoEn24h: false, hallazgoNoReportado: false, ...o,
  });
  it('NO CONFORME con aviso en 24 h es válida; sin aviso, no; hallazgo no reportado, no', () => {
    const d = vacio();
    d.checklist = [
      linea('A', 'a1'), linea('A', 'a2', { estado: 'NO_CONFORME', avisoEn24h: true }),
      linea('A', 'a3', { estado: 'NO_CONFORME', avisoEn24h: false }), linea('A', 'a4', { hallazgoNoReportado: true }),
      linea('B', 'b1'), linea('B', 'b2'),
    ];
    const a = agregar(d, cfg());
    expect(a.aux.fiabilidadA).toBe(50);
    expect(a.aux.fiabilidadB).toBe(100);
  });
  it('computa la peor hoja: sala 100 y cocina 60 → 60', () => {
    const d = vacio();
    d.checklist = [linea('A', 'a1'), linea('A', 'a2'), ...[1, 2, 3, 4, 5].map(i => linea('B', 'b' + i, i > 3 ? { estado: 'NO_CONFORME' } : {}))];
    expect(agregar(d, cfg()).valores.K10_CHECKLIST.valor).toBe(60);
  });
});

describe('Hallazgos cerrados en la visita siguiente (decisión 8)', () => {
  it('sin hallazgos → 100%', () => expect(agregar(vacio(), cfg()).valores.K11_HALLAZGOS.valor).toBe(100));
  it('hallazgo sin visita siguiente en el periodo no cuenta', () => {
    const d = vacio();
    d.hallazgos = [
      { visitaFecha: '2026-10-05', lineaId: 'b1', cerradoEnVisitaSiguiente: true },
      { visitaFecha: '2026-11-05', lineaId: 'b2', cerradoEnVisitaSiguiente: false },
      { visitaFecha: '2026-12-29', lineaId: 'b3', cerradoEnVisitaSiguiente: null },
    ];
    const a = agregar(d, cfg());
    expect(a.valores.K11_HALLAZGOS.valor).toBe(50);
    expect(a.aux.hallazgosEvaluables).toBe(2);
  });
});

describe('Uber Eats', () => {
  it('métricas ponderadas por pedidos', () => {
    const d = vacio();
    d.uber = [
      { mes: '2026-10', pedidos: 1000, inaccurateRate: 1, foodQualityRate: 0.5, prepDelayRate: 0.5, onlineRate: 99, unfulfilledRate: 0.5, rating: 4.4 },
      { mes: '2026-11', pedidos: 3000, inaccurateRate: 3, foodQualityRate: 1, prepDelayRate: 1, onlineRate: 97, unfulfilledRate: 1.5, rating: 4.8 },
    ];
    const a = agregar(d, cfg());
    expect(a.valores.K7_PRECISION.valor).toBe(2.5);
    expect(a.valores.K8_COCINA.valor).toBe(1.75);
    expect(a.valores.K5_RATING_UBER.valor).toBe(4.7);
  });
  it('disponibilidad es binaria: Online Rate ≥ objetivo → 100, si no → 0', () => {
    const d = vacio();
    d.uber = [{ mes: '2026-10', pedidos: 100, inaccurateRate: 1, foodQualityRate: 0, prepDelayRate: 0, onlineRate: 99.5, unfulfilledRate: null, rating: 4.5 }];
    expect(agregar(d, cfg()).valores.K9_DISPONIBILIDAD.valor).toBe(0);
    d.uber[0].onlineRate = 100;
    expect(agregar(d, cfg()).valores.K9_DISPONIBILIDAD.valor).toBe(100);
    const { entrada } = construirEntrada(d, cfg());
    expect(liquidar(entrada).kpis.find(k => k.id === 'K9_DISPONIBILIDAD')!.logro).toBe(100);
  });
});

describe('Descuentos y compromisos', () => {
  it('0,31% excede; 0,30% no', () => {
    const d = vacio();
    d.descuentos = [{ mes: '2026-10', ventas: 100000, noTipificados: 300 }, { mes: '2026-11', ventas: 100000, noTipificados: 310 }];
    const a = agregar(d, cfg());
    expect(a.aux.descuentosPorMes[0].excedido).toBe(false);
    expect(a.aux.descuentosPorMes[1].excedido).toBe(true);
    expect(a.condiciones.descuentosExcedidos).toBe(true);
  });
  it('sin iniciativas ni reportes exigidos → 100%', () => {
    const a = agregar(vacio(), cfg());
    expect(a.valores.K12A_INICIATIVAS.valor).toBe(100);
    expect(a.valores.K12B_REPORTES.valor).toBe(100);
  });
});

describe('Cliente misterioso', () => {
  it('cuenta fichas y consumición', () => {
    const d = vacio();
    d.fichas = [{ fecha: '2026-10-10', sala: 9, producto: null }, { fecha: '2026-11-10', sala: 8, producto: 7 }];
    const a = agregar(d, cfg());
    expect(a.valores.K6A_MISTERIOSO_SALA.valor).toBe(8.5);
    expect(a.valores.K6B_MISTERIOSO_PRODUCTO.valor).toBe(7);
    expect(a.condiciones.fichasMisterioso).toBe(2);
    expect(a.condiciones.hayConsumicion).toBe(true);
  });
});

describe('Extremo a extremo: datos brutos → liquidación', () => {
  it('un trimestre completo se liquida y es explicable', () => {
    const d = vacio();
    d.meses = ['2026-10', '2026-11', '2026-12'].map(m => mes(m));
    d.uber = ['2026-10', '2026-11', '2026-12'].map(m => ({ mes: m, pedidos: 1000, inaccurateRate: 2, foodQualityRate: 0.6, prepDelayRate: 0.6, onlineRate: 98, unfulfilledRate: 1, rating: 4.5 }));
    d.checklist = ['A', 'B'].flatMap(h => [1, 2, 3, 4, 5].map(i => ({ semana: '2026-W41', hoja: h as 'A' | 'B', lineaId: h + i, estado: 'CONFORME' as const, avisoEn24h: false, hallazgoNoReportado: false })));
    d.fichas = [{ fecha: '2026-10-10', sala: 8, producto: 8 }, { fecha: '2026-11-10', sala: 8, producto: null }];
    d.compromisos = { iniciativasTotal: 2, iniciativasEnPlazo: 2, reportesTotal: 13, reportesEnFecha: 13 };
    d.descuentos = [{ mes: '2026-10', ventas: 100000, noTipificados: 0 }];
    const { entrada } = construirEntrada(d, cfg());
    const r = liquidar(entrada);
    expect(r.llavesCumplidas).toBe(4);
    expect(r.logroPonderado).toBeGreaterThan(100); // checklist al 100 = excelencia, reportes al 100 = excelencia
    expect(r.pago).toBeGreaterThan(1500);
    expect(r.kpis.find(k => k.id === 'K1_FACTURACION')!.valor).toBe(300000);
  });
});
