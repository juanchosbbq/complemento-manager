/**
 * Agregación: convierte los registros brutos de un local en un periodo (meses, semanas, visitas, fichas)
 * en los valores agregados que consume liquidar(). También puro.
 *
 * Reglas de la sesión del 14-sep-2026:
 *  - Facturación, ticket medio y reseñas se comparan en valor absoluto contra los niveles del trimestre (€, €, nº).
 *    Para el acumulado a fecha, los niveles de facturación y reseñas se prorratean con el reparto mensual del objetivo
 *    (o, si no hay reparto, por meses transcurridos). El ticket medio y la nota son ratios: no se prorratean.
 *  - Nota de reseñas: media de todas las reseñas del periodo (no media de medias).
 *  - Fiabilidad del checklist: líneas válidas / totales por hoja, computa la peor hoja.
 *  - KPI 11: sin hallazgos → 100%; hallazgo sin visita siguiente dentro del periodo → no cuenta.
 */
import { KpiId, MotivoNeutralizacion, NIVELES_CUALITATIVA, PerfilCanal } from './modelo';
import { EntradaLiquidacion, Niveles, Puertas, ValorKpi } from './liquidar';

export interface MesDatos {
  mes: string;                         // 'YYYY-MM'
  facturacionReal: number | null;      // € netos
  facturacionObjetivo: number;         // € netos: reparto mensual del objetivo, solo para prorratear el seguimiento a fecha
  tickets: number | null;              // nº de tickets/comandas del mes, para el ticket medio
  productosPenetracion: number | null; // % de tickets con producto estratégico
  resenasVolumen: number | null;
  resenasObjetivo: number;             // reparto mensual, solo para prorratear el seguimiento a fecha
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
  niveles: Partial<Record<KpiId, Niveles>>;
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
  /** fracción del trimestre que representan los meses con dato; se aplica a los niveles absolutos de K1 y K4a */
  escalaNiveles: Partial<Record<KpiId, number>>;
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
  const nMeses = d.meses.length || 1;
  /** fracción del trimestre cubierta por los meses con dato, según el reparto mensual del objetivo (o por meses si no hay reparto) */
  const fraccion = (obj: (m: MesDatos) => number, conDato: MesDatos[]) => {
    const total = sum(d.meses.map(obj));
    return total > 0 ? sum(conDato.map(obj)) / total : conDato.length / nMeses;
  };
  // KPI 1: facturación acumulada (€) contra niveles del trimestre prorrateados a fecha
  const k1 = conDato.length ? sum(conDato.map(m => m.facturacionReal)) : null;
  const f1 = fraccion(m => m.facturacionObjetivo, conDato);
  // KPI 2: ticket medio real del trimestre (€); es un ratio, no se prorratea
  const mesesTicket = d.meses.filter(m => m.facturacionReal !== null && m.tickets !== null && m.tickets > 0);
  const ticketReal = mesesTicket.length ? sum(mesesTicket.map(m => m.facturacionReal)) / sum(mesesTicket.map(m => m.tickets)) : null;
  const k2 = ticketReal;
  // KPI 3 (ponderado por tickets)
  const k3 = mediaPonderada(d.meses.map(m => [m.productosPenetracion, m.tickets]));
  // KPI 4
  const mesesRes = d.meses.filter(m => m.resenasVolumen !== null);
  const k4a = mesesRes.length ? sum(mesesRes.map(m => m.resenasVolumen)) : null;
  const f4 = fraccion(m => m.resenasObjetivo, mesesRes);
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
  // KPI 9 binario: Online Rate del periodo ≥ objetivo → 100; si no → 0 (salvo neutralización por parada justificada)
  const online = uberPond(u => u.onlineRate);
  const objetivoOnline = cfg.niveles.K9_DISPONIBILIDAD?.objetivo ?? 100;
  const k9 = online === null ? null : (online >= objetivoOnline ? 100 : 0);
  const k9detalle = online === null ? 'Sin dato de Online Rate' : `Online Rate ${r2(online)}% · objetivo ${objetivoOnline}% → ${online >= objetivoOnline ? 'cumple' : 'no cumple (0)'}`;
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
    K1_FACTURACION: { valor: r2(k1), detalle: `${conDato.length} de ${nMeses} meses con dato${f1 < 1 ? ` · niveles prorrateados al ${Math.round(f1 * 100)}% del trimestre` : ''}` },
    K2_TICKET: { valor: r2(k2), detalle: `Facturación acumulada / tickets acumulados (${sum(mesesTicket.map(m => m.tickets))} tickets)` },
    K3_PRODUCTOS: { valor: r1(k3), detalle: 'Penetración ponderada por tickets del periodo' },
    K4A_RESENAS_VOLUMEN: { valor: k4a, detalle: `${mesesRes.length} de ${nMeses} meses con dato${f4 < 1 ? ` · niveles prorrateados al ${Math.round(f4 * 100)}% del trimestre` : ''}` },
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
    K13_CUALITATIVA: { valor: d.cualitativa, detalle: 'Nota 1–10 de dirección con justificación escrita, al cierre del trimestre' },
  };

  return {
    valores,
    escalaNiveles: { K1_FACTURACION: f1, K4A_RESENAS_VOLUMEN: f4 },
    condiciones: {
      descuentosExcedidos: descuentosPorMes.some(x => x.excedido),
      fichasMisterioso: d.fichas.length,
      hayConsumicion: conProducto.length > 0,
      notaBajoSuelo,
    },
    aux: {
      ticketMedioReal: r2(ticketReal), ticketMedioObjetivo: null, notaMediaTrimestre: r2(k4b),
      fiabilidadA: r1(fA), fiabilidadB: r1(fB), descuentosPorMes,
      hallazgosEvaluables: evaluables.length, hallazgosCerrados: cerrados,
    },
  };
}

/** Niveles por defecto para KPIs cuya escala es fija por construcción. */
export const NIVELES_FIJOS: Partial<Record<KpiId, Niveles>> = {
  K13_CUALITATIVA: NIVELES_CUALITATIVA,
};
/** K9 es binario: el valor agregado ya es 0 o 100, se pasa por una escala identidad. */
const NIVELES_K9_IDENTIDAD: Niveles = { umbral: 50, objetivo: 100, excelencia: 120 };

export function construirEntrada(d: DatosPeriodo, cfg: ConfigPeriodo): { entrada: EntradaLiquidacion; agregados: Agregados } {
  const ag = agregar(d, cfg);
  const kpis: Partial<Record<KpiId, ValorKpi>> = {};
  for (const id of Object.keys(ag.valores) as KpiId[]) {
    let niveles = id === 'K9_DISPONIBILIDAD' ? NIVELES_K9_IDENTIDAD : (cfg.niveles[id] ?? NIVELES_FIJOS[id]);
    const f = ag.escalaNiveles[id];
    if (niveles && f !== undefined && f < 1) {
      niveles = { umbral: niveles.umbral * f, objetivo: niveles.objetivo * f, excelencia: niveles.excelencia * f, llave: niveles.llave !== undefined ? niveles.llave * f : undefined };
    }
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
