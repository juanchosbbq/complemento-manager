/**
 * Agregación: convierte los registros brutos de un local en un periodo (meses, semanas, visitas, fichas)
 * en los valores agregados que consume liquidar(). También puro.
 *
 * Reglas de la sesión del 14-sep-2026:
 *  - KPIs mensualizados (1, 2, 4a): objetivos por mes, logro sobre agregados del trimestre.
 *  - Nota de reseñas: media de todas las reseñas del periodo (no media de medias).
 *  - Fiabilidad del checklist: líneas válidas / totales por hoja, computa la peor hoja.
 *  - KPI 11: sin hallazgos → 100%; hallazgo sin visita siguiente dentro del periodo → no cuenta.
 */
import { KpiId, MotivoNeutralizacion, NIVELES_CUALITATIVA, PerfilCanal } from './modelo';
import { EntradaLiquidacion, Niveles, Puertas, ValorKpi, logroKpi } from './liquidar';

export interface MesDatos {
  mes: string;                         // 'YYYY-MM'
  facturacionReal: number | null;      // € netos
  facturacionObjetivo: number;         // € netos, comunicado a T−15
  tickets: number | null;
  ticketsPrevistos: number;
  ticketMedioObjetivo: number;         // €
  productosPenetracion: number | null; // % de tickets con producto estratégico
  resenasVolumen: number | null;
  resenasObjetivo: number;
  resenasNotaMedia: number | null;     // 1–5, media del mes
}

export interface UberMes {
  mes: string; pedidos: number | null;
  inaccurateRate: number | null;       // %
  foodQualityRate: number | null;      // % (Food Taste or Quality Issues)
  prepDelayRate: number | null;        // % (Order Preparation Delays)
  onlineRate: number | null;           // %
  unfulfilledRate: number | null;      // %
  rating: number | null;               // 1–5 del periodo
}

export interface LineaChecklist {
  semana: string;            // 'YYYY-Www'
  hoja: 'A' | 'B';
  lineaId: string;
  estado: 'CONFORME' | 'NO_CONFORME';
  avisoEn24h: boolean;       // solo relevante si NO_CONFORME
  /** dirección lo encontró NO CONFORME en visita y juzgó que debió verse en el último checklist */
  hallazgoNoReportado: boolean;
}

export interface Hallazgo {
  visitaFecha: string;
  lineaId: string;
  /** null si no hubo visita siguiente dentro del periodo */
  cerradoEnVisitaSiguiente: boolean | null;
}

export interface FichaMisterioso {
  fecha: string;
  sala: number;               // 0–100
  producto: number | null;    // 0–100, null si no hubo consumición
}

export interface Compromisos {
  iniciativasTotal: number; iniciativasEnPlazo: number;
  reportesTotal: number; reportesEnFecha: number;
}

export interface DescuentoMes { mes: string; ventas: number; noTipificados: number }

export interface Neutralizacion { kpi: KpiId; motivo: MotivoNeutralizacion; evidencia?: string }

export interface DatosPeriodo {
  meses: MesDatos[];
  uber: UberMes[];
  checklist: LineaChecklist[];
  hallazgos: Hallazgo[];
  fichas: FichaMisterioso[];
  compromisos: Compromisos;
  cualitativa: number | null;  // 0–8
  descuentos: DescuentoMes[];
  neutralizaciones: Neutralizacion[];
}

export interface ConfigPeriodo {
  importeObjetivo: number;
  perfilCanal: PerfilCanal;
  niveles: Partial<Record<KpiId, Niveles>> & {
    K9_ONLINE?: Niveles;      // Online Rate (mayor mejor)
    K9_UNFULFILLED?: Niveles; // Unfulfilled Order Rate (menor mejor)
  };
  sueloNotaResenas: number;
  umbralDescuentosPct: number;    // 0,3
  puertas: Puertas;
  prorrateo: number;
  bajaVoluntaria: boolean;
}

const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);
const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);
const r1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);
const r2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);

function mediaPonderada(pares: [number | null, number | null][]): number | null {
  const v = pares.filter(([x, w]) => x !== null && w !== null && w! > 0) as [number, number][];
  if (!v.length) return null;
  const W = sum(v.map(([, w]) => w));
  return W > 0 ? sum(v.map(([x, w]) => x * w)) / W : null;
}

export interface Agregados {
  valores: Record<KpiId, { valor: number | null; detalle: string }>;
  condiciones: EntradaLiquidacion['condiciones'];
  aux: {
    ticketMedioReal: number | null; ticketMedioObjetivo: number | null;
    notaMediaTrimestre: number | null;
    fiabilidadA: number | null; fiabilidadB: number | null;
    descuentosPorMes: { mes: string; pct: number | null; excedido: boolean }[];
    hallazgosEvaluables: number; hallazgosCerrados: number;
  };
}

export function agregar(d: DatosPeriodo, cfg: ConfigPeriodo): Agregados {
  const conDato = d.meses.filter(m => m.facturacionReal !== null);
  // KPI 1
  const factReal = sum(conDato.map(m => m.facturacionReal));
  const factObj = sum(conDato.map(m => m.facturacionObjetivo));
  const k1 = pct(factReal, factObj);
  // KPI 2
  const mesesTicket = d.meses.filter(m => m.facturacionReal !== null && m.tickets !== null && m.tickets > 0);
  const ticketReal = mesesTicket.length ? sum(mesesTicket.map(m => m.facturacionReal)) / sum(mesesTicket.map(m => m.tickets)) : null;
  const ticketObj = mediaPonderada(mesesTicket.map(m => [m.ticketMedioObjetivo, m.ticketsPrevistos]));
  const k2 = ticketReal !== null && ticketObj ? (ticketReal / ticketObj) * 100 : null;
  // KPI 3 (ponderado por tickets)
  const k3 = mediaPonderada(d.meses.map(m => [m.productosPenetracion, m.tickets]));
  // KPI 4
  const mesesRes = d.meses.filter(m => m.resenasVolumen !== null);
  const k4a = pct(sum(mesesRes.map(m => m.resenasVolumen)), sum(mesesRes.map(m => m.resenasObjetivo)));
  const k4b = mediaPonderada(mesesRes.map(m => [m.resenasNotaMedia, m.resenasVolumen]));
  const notaBajoSuelo = k4b !== null && k4b < cfg.sueloNotaResenas;
  // Uber (ponderado por pedidos; si no hay pedidos, media simple)
  const uberPond = (f: (u: UberMes) => number | null) => {
    const conPedidos = d.uber.filter(u => u.pedidos !== null && u.pedidos > 0 && f(u) !== null);
    if (conPedidos.length) return mediaPonderada(conPedidos.map(u => [f(u), u.pedidos]));
    const simples = d.uber.map(f).filter((x): x is number => x !== null);
    return simples.length ? sum(simples) / simples.length : null;
  };
  const k5 = uberPond(u => u.rating);
  const k7 = uberPond(u => u.inaccurateRate);
  const k8 = uberPond(u => (u.foodQualityRate === null && u.prepDelayRate === null ? null : (u.foodQualityRate ?? 0) + (u.prepDelayRate ?? 0)));
  const online = uberPond(u => u.onlineRate);
  const unfulfilled = uberPond(u => u.unfulfilledRate);
  let k9: number | null = null;
  let k9detalle = 'Sin dato de Online Rate ni Unfulfilled Order Rate';
  if (online !== null || unfulfilled !== null) {
    const lo = online !== null && cfg.niveles.K9_ONLINE ? logroKpi(online, cfg.niveles.K9_ONLINE, 'mayor') : null;
    const lu = unfulfilled !== null && cfg.niveles.K9_UNFULFILLED ? logroKpi(unfulfilled, cfg.niveles.K9_UNFULFILLED, 'menor') : null;
    const ls = [lo, lu].filter((x): x is number => x !== null);
    k9 = ls.length ? Math.min(...ls) : null;
    k9detalle = `Online Rate ${r1(online) ?? '—'}% (logro ${r1(lo) ?? '—'}) · Unfulfilled ${r2(unfulfilled) ?? '—'}% (logro ${r1(lu) ?? '—'}) → computa el peor`;
  }
  // KPI 6
  const k6a = d.fichas.length ? sum(d.fichas.map(f => f.sala)) / d.fichas.length : null;
  const conProducto = d.fichas.filter(f => f.producto !== null);
  const k6b = conProducto.length ? sum(conProducto.map(f => f.producto)) / conProducto.length : null;
  // KPI 10
  const fiab = (hoja: 'A' | 'B') => {
    const ls = d.checklist.filter(l => l.hoja === hoja);
    if (!ls.length) return null;
    const validas = ls.filter(l => !l.hallazgoNoReportado && (l.estado === 'CONFORME' || l.avisoEn24h)).length;
    return (validas / ls.length) * 100;
  };
  const fA = fiab('A'), fB = fiab('B');
  const k10 = fA === null || fB === null ? (fA ?? fB) : Math.min(fA, fB);
  // KPI 11
  const evaluables = d.hallazgos.filter(h => h.cerradoEnVisitaSiguiente !== null);
  const cerrados = evaluables.filter(h => h.cerradoEnVisitaSiguiente).length;
  const k11 = evaluables.length ? (cerrados / evaluables.length) * 100 : 100;
  // KPI 12
  const c = d.compromisos;
  const k12a = c.iniciativasTotal > 0 ? (c.iniciativasEnPlazo / c.iniciativasTotal) * 100 : 100;
  const k12b = c.reportesTotal > 0 ? (c.reportesEnFecha / c.reportesTotal) * 100 : 100;
  // Descuentos
  const descuentosPorMes = d.descuentos.map(x => {
    const p = pct(x.noTipificados, x.ventas);
    return { mes: x.mes, pct: r2(p), excedido: p !== null && p > cfg.umbralDescuentosPct };
  });

  const valores: Agregados['valores'] = {
    K1_FACTURACION: { valor: r1(k1), detalle: `${Math.round(factReal)} € reales sobre ${Math.round(factObj)} € de objetivo acumulado (${conDato.length} mes/es)` },
    K2_TICKET: { valor: r1(k2), detalle: `Ticket medio real ${r2(ticketReal) ?? '—'} € sobre objetivo ponderado ${r2(ticketObj) ?? '—'} €` },
    K3_PRODUCTOS: { valor: r1(k3), detalle: 'Penetración ponderada por tickets del periodo' },
    K4A_RESENAS_VOLUMEN: { valor: r1(k4a), detalle: `${sum(mesesRes.map(m => m.resenasVolumen))} reseñas sobre ${sum(mesesRes.map(m => m.resenasObjetivo))} de objetivo acumulado` },
    K4B_RESENAS_NOTA: { valor: r2(k4b), detalle: `Media de todas las reseñas del periodo · suelo ${cfg.sueloNotaResenas}` },
    K5_RATING_UBER: { valor: r2(k5), detalle: 'Rating del periodo ponderado por pedidos' },
    K6A_MISTERIOSO_SALA: { valor: r1(k6a), detalle: `${d.fichas.length} ficha(s) en el trimestre` },
    K6B_MISTERIOSO_PRODUCTO: { valor: r1(k6b), detalle: `${conProducto.length} ficha(s) con consumición` },
    K7_PRECISION: { valor: r2(k7), detalle: 'Inaccurate Orders Rate ponderado por pedidos' },
    K8_COCINA: { valor: r2(k8), detalle: 'Food Taste or Quality Issues + Order Preparation Delays' },
    K9_DISPONIBILIDAD: { valor: r1(k9), detalle: k9detalle },
    K10_CHECKLIST: { valor: r1(k10), detalle: `Hoja A ${r1(fA) ?? '—'}% · Hoja B ${r1(fB) ?? '—'}% → computa la peor` },
    K11_HALLAZGOS: { valor: r1(k11), detalle: evaluables.length ? `${cerrados} de ${evaluables.length} hallazgos cerrados en la visita siguiente` : 'Sin hallazgos evaluables en el periodo: 100%' },
    K12A_INICIATIVAS: { valor: r1(k12a), detalle: `${c.iniciativasEnPlazo} de ${c.iniciativasTotal} iniciativas en plazo` },
    K12B_REPORTES: { valor: r1(k12b), detalle: `${c.reportesEnFecha} de ${c.reportesTotal} reportes en fecha` },
    K13_CUALITATIVA: { valor: d.cualitativa, detalle: 'Rúbrica de cuatro criterios, 0–2 cada uno' },
  };

  return {
    valores,
    condiciones: {
      descuentosExcedidos: descuentosPorMes.some(x => x.excedido),
      fichasMisterioso: d.fichas.length,
      hayConsumicion: conProducto.length > 0,
      notaBajoSuelo,
    },
    aux: {
      ticketMedioReal: r2(ticketReal), ticketMedioObjetivo: r2(ticketObj), notaMediaTrimestre: r2(k4b),
      fiabilidadA: r1(fA), fiabilidadB: r1(fB), descuentosPorMes,
      hallazgosEvaluables: evaluables.length, hallazgosCerrados: cerrados,
    },
  };
}

/** Niveles por defecto para KPIs cuya escala es fija por construcción. */
export const NIVELES_FIJOS: Partial<Record<KpiId, Niveles>> = {
  K9_DISPONIBILIDAD: { umbral: 50, objetivo: 100, excelencia: 120 }, // el valor ya es un logro
  K13_CUALITATIVA: NIVELES_CUALITATIVA,
};

export function construirEntrada(d: DatosPeriodo, cfg: ConfigPeriodo): { entrada: EntradaLiquidacion; agregados: Agregados } {
  const ag = agregar(d, cfg);
  const kpis: Partial<Record<KpiId, ValorKpi>> = {};
  for (const id of Object.keys(ag.valores) as KpiId[]) {
    const niveles = cfg.niveles[id] ?? NIVELES_FIJOS[id];
    const n = d.neutralizaciones.find(x => x.kpi === id);
    kpis[id] = {
      valor: ag.valores[id].valor,
      niveles: niveles ?? { umbral: 0, objetivo: 0, excelencia: 0 },
      detalle: niveles ? ag.valores[id].detalle : `${ag.valores[id].detalle} · SIN NIVELES CONFIGURADOS`,
      neutralizacion: n ? { motivo: n.motivo, evidencia: n.evidencia } : undefined,
    };
  }
  return {
    entrada: {
      importeObjetivo: cfg.importeObjetivo, perfilCanal: cfg.perfilCanal, kpis,
      condiciones: ag.condiciones, puertas: cfg.puertas, prorrateo: cfg.prorrateo, bajaVoluntaria: cfg.bajaVoluntaria,
    },
    agregados: ag,
  };
}
