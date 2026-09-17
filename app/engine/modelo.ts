/**
 * Definición estática del modelo v7 (con las decisiones de la sesión del 14-sep-2026).
 * Cambiar un peso o un KPI empieza aquí y en los tests.
 */
export const MODELO_VERSION = 'v7.1';

export type Bloque = 'VENTAS' | 'ATENCION' | 'OPERACIONES' | 'MANTENIMIENTO' | 'DIRECCION';
export type PerfilCanal = 'SALA' | 'MIXTO' | 'DELIVERY';
export type TipoControl = 'D' | 'P' | 'C' | 'OBJ' | 'JUICIO';
export type Sentido = 'mayor' | 'menor';

export const BLOQUES: Bloque[] = ['VENTAS', 'ATENCION', 'OPERACIONES', 'MANTENIMIENTO', 'DIRECCION'];
export const BLOQUES_LLAVE: Bloque[] = ['VENTAS', 'ATENCION', 'OPERACIONES', 'MANTENIMIENTO'];

export const NOMBRE_BLOQUE: Record<Bloque, string> = {
  VENTAS: 'Ventas', ATENCION: 'Atención al cliente', OPERACIONES: 'Operaciones de canal',
  MANTENIMIENTO: 'Mantenimiento', DIRECCION: 'Dirección',
};

/** §9.1 v5 / §10 v7: perfil de pesos por mix de delivery. El piloto arranca en MIXTO. */
export const PESOS_BLOQUE: Record<PerfilCanal, Record<Bloque, number>> = {
  SALA:     { VENTAS: 30, ATENCION: 25, OPERACIONES: 15, MANTENIMIENTO: 10, DIRECCION: 20 },
  MIXTO:    { VENTAS: 30, ATENCION: 20, OPERACIONES: 20, MANTENIMIENTO: 10, DIRECCION: 20 },
  DELIVERY: { VENTAS: 30, ATENCION: 15, OPERACIONES: 25, MANTENIMIENTO: 10, DIRECCION: 20 },
};

/** Escala común (§2.3) */
export const ESCALA = { umbral: 50, objetivo: 100, excelencia: 120 } as const;
/** Llaves (§2.2) */
export const CORTE_LLAVE = 90;
export const COEF_LLAVES: Record<number, number> = { 4: 1.0, 3: 0.7, 2: 0, 1: 0, 0: 0 };
/** Semáforo mensual (guía §6) */
export const SEMAFORO = { verde: 95, ambar: 90 } as const;

export type KpiId =
  | 'K1_FACTURACION' | 'K2_TICKET' | 'K3_PRODUCTOS'
  | 'K4A_RESENAS_VOLUMEN' | 'K4B_RESENAS_NOTA' | 'K5_RATING_UBER' | 'K6A_MISTERIOSO_SALA' | 'K6B_MISTERIOSO_PRODUCTO'
  | 'K7_PRECISION' | 'K8_COCINA' | 'K9_DISPONIBILIDAD'
  | 'K10_CHECKLIST' | 'K11_HALLAZGOS'
  | 'K12A_INICIATIVAS' | 'K12B_REPORTES' | 'K13_CUALITATIVA';

export interface KpiDef {
  id: KpiId; bloque: Bloque; nombre: string; tipo: TipoControl;
  /** peso sobre 100 en perfil MIXTO; escala con el bloque en otros perfiles */
  peso: number;
  sentido: Sentido;
  unidad: string;
  fuente: string;
  origen: 'manual' | 'automatico';
  mensualizado?: boolean;
}

export const KPIS: KpiDef[] = [
  { id: 'K1_FACTURACION', bloque: 'VENTAS', nombre: 'Facturación neta', tipo: 'P', peso: 15, sentido: 'mayor', unidad: '€ del trimestre', fuente: 'Revo', origen: 'manual', mensualizado: true },
  { id: 'K2_TICKET', bloque: 'VENTAS', nombre: 'Ticket medio', tipo: 'D', peso: 8, sentido: 'mayor', unidad: '€', fuente: 'Revo', origen: 'manual' },
  { id: 'K3_PRODUCTOS', bloque: 'VENTAS', nombre: 'Penetración de productos estratégicos', tipo: 'D', peso: 7, sentido: 'mayor', unidad: '% de tickets', fuente: 'Revo', origen: 'manual' },
  { id: 'K4A_RESENAS_VOLUMEN', bloque: 'ATENCION', nombre: 'Reseñas del periodo: volumen', tipo: 'P', peso: 6, sentido: 'mayor', unidad: 'reseñas del trimestre', fuente: 'Joombo', origen: 'manual', mensualizado: true },
  { id: 'K4B_RESENAS_NOTA', bloque: 'ATENCION', nombre: 'Reseñas del periodo: nota media', tipo: 'P', peso: 4, sentido: 'mayor', unidad: 'nota 1–5', fuente: 'Joombo', origen: 'manual' },
  { id: 'K5_RATING_UBER', bloque: 'ATENCION', nombre: 'Rating de Uber Eats del periodo', tipo: 'P', peso: 5, sentido: 'mayor', unidad: 'nota 1–5', fuente: 'Uber Eats', origen: 'automatico' },
  { id: 'K6A_MISTERIOSO_SALA', bloque: 'ATENCION', nombre: 'Cliente misterioso: sala y experiencia', tipo: 'P', peso: 4, sentido: 'mayor', unidad: 'nota 1–10', fuente: 'Ficha propia', origen: 'manual' },
  { id: 'K6B_MISTERIOSO_PRODUCTO', bloque: 'ATENCION', nombre: 'Cliente misterioso: producto', tipo: 'P', peso: 1, sentido: 'mayor', unidad: 'nota 1–10', fuente: 'Ficha propia', origen: 'manual' },
  { id: 'K7_PRECISION', bloque: 'OPERACIONES', nombre: 'Precisión del pedido (Inaccurate Orders Rate)', tipo: 'D', peso: 15, sentido: 'menor', unidad: '% de pedidos', fuente: 'Uber Eats', origen: 'automatico' },
  { id: 'K8_COCINA', bloque: 'OPERACIONES', nombre: 'Incidencias imputables a cocina', tipo: 'C', peso: 3, sentido: 'menor', unidad: '% de pedidos', fuente: 'Uber Eats', origen: 'automatico' },
  { id: 'K9_DISPONIBILIDAD', bloque: 'OPERACIONES', nombre: 'Disponibilidad del canal (Online Rate)', tipo: 'D', peso: 2, sentido: 'mayor', unidad: 'binario: Online Rate ≥ objetivo', fuente: 'Uber Eats', origen: 'automatico' },
  { id: 'K10_CHECKLIST', bloque: 'MANTENIMIENTO', nombre: 'Fiabilidad del checklist semanal', tipo: 'D', peso: 6, sentido: 'mayor', unidad: '% líneas válidas (peor hoja)', fuente: 'Hojas A y B', origen: 'manual' },
  { id: 'K11_HALLAZGOS', bloque: 'MANTENIMIENTO', nombre: 'Hallazgos cerrados en la visita siguiente', tipo: 'D', peso: 4, sentido: 'mayor', unidad: '% de hallazgos', fuente: 'Hoja de visita', origen: 'manual' },
  { id: 'K12A_INICIATIVAS', bloque: 'DIRECCION', nombre: 'Iniciativas corporativas implantadas en plazo', tipo: 'OBJ', peso: 10, sentido: 'mayor', unidad: '% en plazo', fuente: 'Registro', origen: 'manual' },
  { id: 'K12B_REPORTES', bloque: 'DIRECCION', nombre: 'Reportes entregados en fecha', tipo: 'OBJ', peso: 5, sentido: 'mayor', unidad: '% en fecha', fuente: 'Registro', origen: 'manual' },
  { id: 'K13_CUALITATIVA', bloque: 'DIRECCION', nombre: 'Valoración cualitativa de dirección', tipo: 'JUICIO', peso: 5, sentido: 'mayor', unidad: 'nota 1–10', fuente: 'Valoración escrita', origen: 'manual' },
];

export const KPI_POR_ID: Record<KpiId, KpiDef> = Object.fromEntries(KPIS.map(k => [k.id, k])) as any;

/** Causas tasadas de neutralización (decisión 6 de la sesión). Efecto: el KPI computa al 100%. */
export type MotivoNeutralizacion =
  | 'ESCALADO_SIN_RESOLUCION'   // KPI C: escalado en plazo con registro y sin resolución aguas arriba
  | 'PARADA_JUSTIFICADA'        // KPI 9: parada justificada y notificada en 2 h
  | 'CAMBIO_METRICA_TERCERO'    // Uber modifica o discontinúa la métrica en el periodo
  | 'NO_COMUNICADO_T15';        // KPI no comunicado por escrito a T−15

export const MOTIVO_NEUTRALIZACION_TEXTO: Record<MotivoNeutralizacion, string> = {
  ESCALADO_SIN_RESOLUCION: 'Incidencia escalada en plazo, con registro, sin resolución aguas arriba',
  PARADA_JUSTIFICADA: 'Parada del canal justificada y notificada en dos horas',
  CAMBIO_METRICA_TERCERO: 'Uber Eats modificó o discontinuó la métrica durante el periodo',
  NO_COMUNICADO_T15: 'Objetivo no comunicado por escrito antes del inicio del periodo',
};

/** Valoración cualitativa: nota 1–10 con un decimal y justificación escrita. Niveles por defecto (carta Q4-2026): 6 · 7 · 8 · 10. */
export const NIVELES_CUALITATIVA = { umbral: 6, llave: 7, objetivo: 8, excelencia: 10 } as const;
