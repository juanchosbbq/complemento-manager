/**
 * Base de datos: SQLite integrado en Node (node:sqlite), sin dependencias nativas.
 * Un fichero: data/incentivos.db (ruta configurable con INCENTIVOS_DB).
 *
 * Principio del esquema: cada dato lleva local, periodo, origen (manual/automatico), autor y timestamp.
 * Conectar una fuente automática a un bloque hoy manual solo cambia quién escribe la fila, no la fila.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;

export const ESQUEMA = `
CREATE TABLE IF NOT EXISTS locales (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, ciudad TEXT NOT NULL,
  en_modelo INTEGER NOT NULL DEFAULT 1,   -- 0 = excluido del modelo (Valladolid). No es un filtro de UI: el motor no lo carga.
  en_piloto INTEGER NOT NULL DEFAULT 0, orden INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS managers (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, local_id TEXT NOT NULL REFERENCES locales(id),
  fecha_alta_puesto TEXT, activo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS periodos (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, inicio TEXT NOT NULL, fin TEXT NOT NULL,
  meses TEXT NOT NULL,                     -- JSON ['2026-10','2026-11','2026-12']
  estado TEXT NOT NULL DEFAULT 'ABIERTO'   -- ABIERTO | CERRADO
);
CREATE TABLE IF NOT EXISTS config_periodo (
  local_id TEXT NOT NULL, periodo_id TEXT NOT NULL,
  importe_objetivo REAL NOT NULL, perfil_canal TEXT NOT NULL DEFAULT 'MIXTO',
  suelo_nota_resenas REAL NOT NULL, umbral_descuentos_pct REAL NOT NULL DEFAULT 0.3,
  prorrateo REAL NOT NULL DEFAULT 1, baja_voluntaria INTEGER NOT NULL DEFAULT 0,
  fecha_alta TEXT, fecha_baja TEXT, dias_it INTEGER NOT NULL DEFAULT 0, -- situaciones especiales; prorrateo se recalcula a partir de ellas
  productos_estrategicos TEXT, fecha_comunicacion TEXT, fecha_extraccion_prevista TEXT,
  autor TEXT, ts TEXT NOT NULL,
  PRIMARY KEY (local_id, periodo_id)
);
CREATE TABLE IF NOT EXISTS niveles (
  local_id TEXT NOT NULL, periodo_id TEXT NOT NULL, kpi TEXT NOT NULL,
  umbral REAL NOT NULL, objetivo REAL NOT NULL, excelencia REAL NOT NULL,
  llave REAL, -- punto calibrado a mano que corresponde a logro 90%; NULL = se interpola entre umbral y objetivo
  autor TEXT, ts TEXT NOT NULL,
  PRIMARY KEY (local_id, periodo_id, kpi)
);
-- Bloque 1 y parte del 2: dato mensual (Revo y Joombo). Un registro por mes.
CREATE TABLE IF NOT EXISTS meses (
  local_id TEXT NOT NULL, periodo_id TEXT NOT NULL, mes TEXT NOT NULL,
  facturacion_real REAL, ticket_medio REAL, productos_penetracion REAL,
  resenas_volumen INTEGER, resenas_nota_media REAL,
  -- Meta volante opcional: previsión del reparto del trimestre. Solo afecta al seguimiento a fecha.
  prevision_facturacion REAL, prevision_resenas INTEGER,
  origen TEXT NOT NULL DEFAULT 'manual', autor TEXT, ts TEXT NOT NULL,
  PRIMARY KEY (local_id, periodo_id, mes)
);
-- Bloque 3 y KPI 5: métricas de Uber Eats Manager, verbatim, corte por mes.
CREATE TABLE IF NOT EXISTS uber_mes (
  local_id TEXT NOT NULL, periodo_id TEXT NOT NULL, mes TEXT NOT NULL,
  pedidos INTEGER, inaccurate_rate REAL, food_quality_rate REAL, online_rate REAL, rating REAL,
  prep_delay_rate REAL, unfulfilled_rate REAL, -- fuera del modelo; se conservan por si vuelven
  origen TEXT NOT NULL DEFAULT 'automatico', fichero TEXT, autor TEXT, ts TEXT NOT NULL,
  PRIMARY KEY (local_id, periodo_id, mes)
);
-- Bloque 4: checklists semanales (hoja A sala, hoja B cocina), una fila por línea.
CREATE TABLE IF NOT EXISTS checklist_semanas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, local_id TEXT NOT NULL, periodo_id TEXT NOT NULL,
  semana TEXT NOT NULL, hoja TEXT NOT NULL CHECK (hoja IN ('A','B')),
  firma_manager TEXT, firma_jefe_cocina TEXT, ts TEXT NOT NULL,
  UNIQUE (local_id, periodo_id, semana, hoja)
);
CREATE TABLE IF NOT EXISTS checklist_lineas (
  semana_id INTEGER NOT NULL REFERENCES checklist_semanas(id) ON DELETE CASCADE,
  linea_id TEXT NOT NULL, estado TEXT NOT NULL CHECK (estado IN ('CONFORME','NO_CONFORME')),
  aviso_en_24h INTEGER NOT NULL DEFAULT 0, observacion TEXT,
  PRIMARY KEY (semana_id, linea_id)
);
CREATE TABLE IF NOT EXISTS lineas_catalogo (
  hoja TEXT NOT NULL, linea_id TEXT NOT NULL, texto TEXT NOT NULL, orden INTEGER NOT NULL,
  PRIMARY KEY (hoja, linea_id)
);
-- Visitas de dirección y hallazgos (misma taxonomía de líneas que el checklist).
CREATE TABLE IF NOT EXISTS visitas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, local_id TEXT NOT NULL, periodo_id TEXT NOT NULL,
  fecha TEXT NOT NULL, visitante TEXT NOT NULL, notas TEXT, ts TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hallazgos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, visita_id INTEGER NOT NULL REFERENCES visitas(id) ON DELETE CASCADE,
  hoja TEXT NOT NULL, linea_id TEXT NOT NULL, descripcion TEXT,
  reportado_previamente INTEGER NOT NULL DEFAULT 0,  -- el Manager ya lo había avisado: nunca penaliza
  debio_detectarse INTEGER NOT NULL DEFAULT 1,       -- juicio único de la hoja de visita
  cerrado_en_siguiente INTEGER,                       -- NULL = no revisado en la visita siguiente; 1/0 = veredicto en esa visita (es lo que puntúa)
  cerrado_fecha TEXT,                                 -- fecha en que se dio por cerrado, aunque fuera más tarde (seguimiento, no puntúa)
  archivado INTEGER NOT NULL DEFAULT 0                -- se deja de arrastrar en la lista de abiertos; no cambia lo ya puntuado
);
-- KPI 6
CREATE TABLE IF NOT EXISTS fichas_misterioso (
  id INTEGER PRIMARY KEY AUTOINCREMENT, local_id TEXT NOT NULL, periodo_id TEXT NOT NULL,
  fecha TEXT NOT NULL, evaluador TEXT NOT NULL, sala REAL NOT NULL, producto REAL, detalle TEXT, ts TEXT NOT NULL
);
-- Bloque 5
CREATE TABLE IF NOT EXISTS compromisos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, local_id TEXT NOT NULL, periodo_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('INICIATIVA','REPORTE')), descripcion TEXT NOT NULL,
  fecha_limite TEXT NOT NULL, fecha_cumplido TEXT, autor TEXT, ts TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cualitativa (
  local_id TEXT NOT NULL, periodo_id TEXT NOT NULL,
  nota REAL,                 -- 1–10 con un decimal
  justificacion TEXT,        -- obligatoria: en qué se basa la nota
  anticipacion INTEGER, analisis INTEGER, liderazgo INTEGER, equipo INTEGER, ejemplos TEXT, -- rúbrica anterior, sin uso
  evaluador TEXT, ts TEXT NOT NULL,
  PRIMARY KEY (local_id, periodo_id)
);
-- Descuentos (condición de validez residual) y coste de personal (medido, no puntúa)
CREATE TABLE IF NOT EXISTS descuentos_mes (
  local_id TEXT NOT NULL, periodo_id TEXT NOT NULL, mes TEXT NOT NULL,
  ventas REAL NOT NULL, no_tipificados REAL NOT NULL DEFAULT 0,
  cauce_disciplinario_abierto INTEGER NOT NULL DEFAULT 0, -- plano disciplinario: se registra, no se calcula
  autor TEXT, ts TEXT NOT NULL, PRIMARY KEY (local_id, periodo_id, mes)
);
CREATE TABLE IF NOT EXISTS coste_personal_mes (
  local_id TEXT NOT NULL, periodo_id TEXT NOT NULL, mes TEXT NOT NULL,
  coste_sala REAL, ventas REAL, horas_sala REAL, origen TEXT NOT NULL DEFAULT 'manual', autor TEXT, ts TEXT NOT NULL,
  PRIMARY KEY (local_id, periodo_id, mes)
);
CREATE TABLE IF NOT EXISTS puertas (
  local_id TEXT NOT NULL, periodo_id TEXT NOT NULL,
  seguridad_alimentaria INTEGER NOT NULL DEFAULT 1, reporting_semanas_en_plazo INTEGER,
  control_caja INTEGER NOT NULL DEFAULT 1, integridad INTEGER NOT NULL DEFAULT 1,
  notas TEXT, autor TEXT, ts TEXT NOT NULL, PRIMARY KEY (local_id, periodo_id)
);
CREATE TABLE IF NOT EXISTS neutralizaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT, local_id TEXT NOT NULL, periodo_id TEXT NOT NULL,
  kpi TEXT NOT NULL, motivo TEXT NOT NULL, evidencia TEXT, aprobado_por TEXT NOT NULL, ts TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS liquidaciones (
  local_id TEXT NOT NULL, periodo_id TEXT NOT NULL, fecha_extraccion TEXT NOT NULL,
  resultado TEXT NOT NULL, cerrada_por TEXT NOT NULL, ts TEXT NOT NULL, PRIMARY KEY (local_id, periodo_id)
);
-- Rastro de cambios: en un sistema que decide dinero, hay que poder decir qué valía un dato antes.
CREATE TABLE IF NOT EXISTS historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT, local_id TEXT NOT NULL, periodo_id TEXT NOT NULL,
  entidad TEXT NOT NULL, clave TEXT NOT NULL, antes TEXT, despues TEXT, autor TEXT, ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_historial ON historial (local_id, periodo_id, entidad, clave);

CREATE TABLE IF NOT EXISTS accesos (
  token TEXT PRIMARY KEY, rol TEXT NOT NULL CHECK (rol IN ('DIRECCION','MANAGER')),
  local_id TEXT, nombre TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 1
);
`;

export function abrir(ruta = process.env.INCENTIVOS_DB ?? new URL('./incentivos.db', import.meta.url).pathname): DB {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(ESQUEMA);
  // Migraciones para bases creadas con esquemas anteriores (SQLite no tiene ADD COLUMN IF NOT EXISTS).
  for (const sql of [
    'ALTER TABLE niveles ADD COLUMN llave REAL',
    'ALTER TABLE hallazgos ADD COLUMN cerrado_fecha TEXT',
    'ALTER TABLE cualitativa ADD COLUMN nota REAL',
    'ALTER TABLE cualitativa ADD COLUMN justificacion TEXT',
    'ALTER TABLE config_periodo ADD COLUMN fecha_alta TEXT',
    'ALTER TABLE config_periodo ADD COLUMN fecha_baja TEXT',
    'ALTER TABLE config_periodo ADD COLUMN dias_it INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE meses ADD COLUMN ticket_medio REAL',
    'ALTER TABLE meses ADD COLUMN prevision_facturacion REAL',
    'ALTER TABLE meses ADD COLUMN prevision_resenas INTEGER',
    'ALTER TABLE hallazgos ADD COLUMN archivado INTEGER NOT NULL DEFAULT 0',
  ]) { try { db.exec(sql); } catch { /* ya existía */ } }
  return db;
}

export const ahora = () => new Date().toISOString();
