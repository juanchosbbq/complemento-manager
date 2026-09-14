/**
 * Motor de liquidación. Puro: sin base de datos, sin interfaz.
 * Entrada: valores ya agregados del trimestre (ver agregar.ts) + configuración del local/periodo.
 * Salida: resultado explicable KPI a KPI, bloque a bloque.
 */
import {
  BLOQUES, BLOQUES_LLAVE, Bloque, COEF_LLAVES, CORTE_LLAVE, ESCALA, KPIS, KPI_POR_ID, KpiId,
  MOTIVO_NEUTRALIZACION_TEXTO, MotivoNeutralizacion, NOMBRE_BLOQUE, PESOS_BLOQUE, PerfilCanal, Sentido,
} from './modelo';

export interface Niveles { umbral: number; objetivo: number; excelencia: number }

export interface ValorKpi {
  /** valor agregado del trimestre; null = sin dato */
  valor: number | null;
  niveles: Niveles;
  neutralizacion?: { motivo: MotivoNeutralizacion; evidencia?: string };
  /** texto libre de cómo se obtuvo (para el desglose) */
  detalle?: string;
}

export interface Puertas {
  seguridadAlimentaria: boolean; // sin no conformidad crítica abierta y no escalada
  reporting: boolean;            // ≥11 de 13 semanas
  controlCaja: boolean;          // sin descuadres no justificados
  integridad: boolean;           // sin expediente firme
}

export interface EntradaLiquidacion {
  importeObjetivo: number;
  perfilCanal: PerfilCanal;
  kpis: Partial<Record<KpiId, ValorKpi>>;
  condiciones: {
    /** algún mes con descuentos no tipificados > umbral → llave de Ventas apagada (decisión 5) */
    descuentosExcedidos: boolean;
    /** nº de fichas de cliente misterioso en el trimestre (<2 → KPI 6 reparte a 4 y 5) */
    fichasMisterioso: number;
    /** alguna ficha con consumición; si no, el 1% de producto pasa a sala */
    hayConsumicion: boolean;
    /** nota media del trimestre bajo el suelo → el 6% de volumen pasa a nota (decisión 3) */
    notaBajoSuelo: boolean;
  };
  puertas: Puertas;
  /** fracción de días efectivos del periodo (altas, cambios de local, IT > 30 días). 1 = trimestre completo */
  prorrateo: number;
  bajaVoluntaria: boolean;
}

export interface ResultadoKpi {
  id: KpiId; nombre: string; bloque: Bloque; sentido: Sentido;
  pesoBase: number; pesoEfectivo: number;
  valor: number | null; niveles: Niveles;
  logro: number;   // 0–120
  puntos: number;  // logro × pesoEfectivo / 100
  neutralizado: boolean;
  notas: string[];
}

export interface ResultadoBloque {
  bloque: Bloque; nombre: string; peso: number; logro: number; puntos: number;
  esLlave: boolean; llaveCumplida: boolean | null; semaforo: 'verde' | 'ambar' | 'rojo' | null;
  notas: string[];
}

export interface ResultadoLiquidacion {
  modelo: string;
  kpis: ResultadoKpi[];
  bloques: ResultadoBloque[];
  logroPonderado: number;
  llavesCumplidas: number;
  coefLlaves: number;
  puertas: Puertas & { superadas: boolean };
  importeObjetivo: number;
  importeAntesProrrateo: number;
  prorrateo: number;
  pago: number;
  explicacion: string[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Escala §2.3 con interpolación lineal. Soporta sentido 'mayor' y 'menor'. */
export function logroKpi(valor: number, n: Niveles, sentido: Sentido): number {
  const mejor = (a: number, b: number) => (sentido === 'mayor' ? a >= b : a <= b);
  const frac = (v: number, a: number, b: number) => (b === a ? 1 : (v - a) / (b - a));
  if (mejor(valor, n.excelencia)) return ESCALA.excelencia;
  if (mejor(valor, n.objetivo)) return ESCALA.objetivo + (ESCALA.excelencia - ESCALA.objetivo) * frac(valor, n.objetivo, n.excelencia);
  if (mejor(valor, n.umbral)) return ESCALA.umbral + (ESCALA.objetivo - ESCALA.umbral) * frac(valor, n.umbral, n.objetivo);
  return 0;
}

export function semaforo(logro: number): 'verde' | 'ambar' | 'rojo' {
  if (logro >= 95) return 'verde';
  if (logro >= CORTE_LLAVE) return 'ambar';
  return 'rojo';
}

/** Pesos efectivos de los KPIs tras perfil de canal y redistribuciones condicionales. */
export function pesosEfectivos(e: EntradaLiquidacion): { pesos: Record<KpiId, number>; notas: Partial<Record<KpiId, string[]>> } {
  const pesosBloque = PESOS_BLOQUE[e.perfilCanal];
  const pesos = {} as Record<KpiId, number>;
  const notas: Partial<Record<KpiId, string[]>> = {};
  const nota = (id: KpiId, t: string) => (notas[id] ??= []).push(t);

  for (const k of KPIS) {
    const base = PESOS_BLOQUE.MIXTO[k.bloque];
    pesos[k.id] = (k.peso * pesosBloque[k.bloque]) / base;
  }
  // Cliente misterioso: producto sin consumición → su peso pasa a sala
  if (!e.condiciones.hayConsumicion && pesos.K6B_MISTERIOSO_PRODUCTO > 0) {
    pesos.K6A_MISTERIOSO_SALA += pesos.K6B_MISTERIOSO_PRODUCTO;
    pesos.K6B_MISTERIOSO_PRODUCTO = 0;
    nota('K6B_MISTERIOSO_PRODUCTO', 'Sin consumición en ninguna ficha: su peso pasa a sala');
    nota('K6A_MISTERIOSO_SALA', 'Recibe el peso del bloque de producto (sin consumición)');
  }
  // Cliente misterioso: menos de dos fichas → no computa, reparte entre KPI 4 y 5 proporcionalmente
  if (e.condiciones.fichasMisterioso < 2) {
    const liberado = pesos.K6A_MISTERIOSO_SALA + pesos.K6B_MISTERIOSO_PRODUCTO;
    const destinos: KpiId[] = ['K4A_RESENAS_VOLUMEN', 'K4B_RESENAS_NOTA', 'K5_RATING_UBER'];
    const total = destinos.reduce((s, d) => s + pesos[d], 0);
    for (const d of destinos) {
      pesos[d] += (liberado * pesos[d]) / total;
      nota(d, 'Recibe parte del peso del cliente misterioso (menos de dos fichas)');
    }
    pesos.K6A_MISTERIOSO_SALA = 0; pesos.K6B_MISTERIOSO_PRODUCTO = 0;
    nota('K6A_MISTERIOSO_SALA', `Solo ${e.condiciones.fichasMisterioso} ficha(s) en el trimestre: no computa`);
  }
  // Salvaguarda de reseñas: nota bajo suelo → el volumen no computa, su peso pasa a nota (decisión 3, lectura B)
  if (e.condiciones.notaBajoSuelo && pesos.K4A_RESENAS_VOLUMEN > 0) {
    pesos.K4B_RESENAS_NOTA += pesos.K4A_RESENAS_VOLUMEN;
    pesos.K4A_RESENAS_VOLUMEN = 0;
    nota('K4A_RESENAS_VOLUMEN', 'Nota media del trimestre por debajo del suelo: el volumen no computa y su peso pasa a la nota');
    nota('K4B_RESENAS_NOTA', 'Recibe el peso del volumen (nota bajo suelo)');
  }
  return { pesos, notas };
}

export function liquidar(e: EntradaLiquidacion): ResultadoLiquidacion {
  const explicacion: string[] = [];
  const { pesos, notas: notasPeso } = pesosEfectivos(e);
  const pesosBloque = PESOS_BLOQUE[e.perfilCanal];
  if (e.perfilCanal !== 'MIXTO') explicacion.push(`Perfil de pesos ${e.perfilCanal}: Atención ${pesosBloque.ATENCION} · Operaciones ${pesosBloque.OPERACIONES}`);

  const kpis: ResultadoKpi[] = KPIS.map(def => {
    const v = e.kpis[def.id];
    const notas = [...(notasPeso[def.id] ?? [])];
    const pesoEfectivo = r2(pesos[def.id]);
    let logro = 0;
    let neutralizado = false;
    const niveles = v?.niveles ?? { umbral: 0, objetivo: 0, excelencia: 0 };
    if (pesoEfectivo === 0) {
      logro = 0;
    } else if (v?.neutralizacion) {
      neutralizado = true; logro = ESCALA.objetivo;
      notas.push(`Neutralizado al 100%: ${MOTIVO_NEUTRALIZACION_TEXTO[v.neutralizacion.motivo]}`);
      if (v.neutralizacion.evidencia) notas.push(`Evidencia: ${v.neutralizacion.evidencia}`);
    } else if (!v || v.valor === null) {
      logro = 0;
      notas.push('Sin dato en el periodo: computa 0');
    } else {
      logro = logroKpi(v.valor, v.niveles, def.sentido);
    }
    if (v?.detalle) notas.push(v.detalle);
    return {
      id: def.id, nombre: def.nombre, bloque: def.bloque, sentido: def.sentido,
      pesoBase: def.peso, pesoEfectivo, valor: v?.valor ?? null, niveles,
      logro: r1(logro), puntos: r2((logro * pesoEfectivo) / 100), neutralizado, notas,
    };
  });

  const bloques: ResultadoBloque[] = BLOQUES.map(b => {
    const ks = kpis.filter(k => k.bloque === b);
    const peso = pesosBloque[b];
    const puntos = ks.reduce((s, k) => s + (k.logro * k.pesoEfectivo) / 100, 0);
    const logro = (puntos / peso) * 100;
    const esLlave = BLOQUES_LLAVE.includes(b);
    const notas: string[] = [];
    let llaveCumplida: boolean | null = null;
    if (esLlave) {
      llaveCumplida = logro >= CORTE_LLAVE;
      if (b === 'VENTAS' && e.condiciones.descuentosExcedidos) {
        llaveCumplida = false;
        notas.push('Descuentos no tipificados por encima del umbral en algún mes: el bloque puntúa pero no cuenta como llave cumplida');
      }
    }
    return { bloque: b, nombre: NOMBRE_BLOQUE[b], peso, logro: r1(logro), puntos: r2(puntos), esLlave, llaveCumplida, semaforo: esLlave ? semaforo(logro) : null, notas };
  });

  const logroPonderado = bloques.reduce((s, b) => s + b.puntos, 0);
  const llavesCumplidas = bloques.filter(b => b.esLlave && b.llaveCumplida).length;
  const coefLlaves = COEF_LLAVES[llavesCumplidas] ?? 0;
  const superadas = e.puertas.seguridadAlimentaria && e.puertas.reporting && e.puertas.controlCaja && e.puertas.integridad;

  for (const b of bloques.filter(b => b.esLlave && !b.llaveCumplida)) explicacion.push(`Llave de ${b.bloque} no cumplida (${b.logro}% < ${CORTE_LLAVE}%)`);
  explicacion.push(`Llaves cumplidas: ${llavesCumplidas} de 4 → coeficiente × ${coefLlaves.toFixed(2)}`);
  if (!superadas) {
    const f = Object.entries(e.puertas).filter(([, v]) => !v).map(([k]) => k).join(', ');
    explicacion.push(`Puerta de acceso no superada (${f}): el complemento del trimestre es 0`);
  }
  if (e.bajaVoluntaria) explicacion.push('Baja voluntaria en el periodo: se pierde el complemento del trimestre');
  if (e.prorrateo < 1) explicacion.push(`Prorrateo por días efectivos: × ${e.prorrateo.toFixed(3)}`);

  const importeAntesProrrateo = superadas && !e.bajaVoluntaria ? e.importeObjetivo * (logroPonderado / 100) * coefLlaves : 0;
  const pago = r2(importeAntesProrrateo * e.prorrateo);
  explicacion.push(`Pago: ${e.importeObjetivo} € × ${r1(logroPonderado)}% × ${coefLlaves.toFixed(2)}${superadas ? '' : ' × 0'}${e.prorrateo < 1 ? ` × ${e.prorrateo.toFixed(3)}` : ''} = ${pago} € brutos`);

  return {
    modelo: 'v7.1', kpis, bloques, logroPonderado: r1(logroPonderado), llavesCumplidas, coefLlaves,
    puertas: { ...e.puertas, superadas }, importeObjetivo: e.importeObjetivo,
    importeAntesProrrateo: r2(importeAntesProrrateo), prorrateo: e.prorrateo, pago, explicacion,
  };
}
