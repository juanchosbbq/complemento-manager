/**
 * Cartas de objetivos Q4 2026, transcritas de las hojas de Drive
 * "Objetivos Q4 2026 - Gabriel Lobo" (Local 1), "Objetivos Q4 2026 - Embajadores" (Local 2) y
 * "Objetivos Q4 2026 - Las Tablas" (Local 3), leídas el 28-sep-2026.
 * Se aplican UNA sola vez por carta (tabla `migraciones`): si después se cambia algo desde Configuración, un redespliegue no lo pisa.
 * Para corregir una carta ya aplicada, cambiar el id de la migración (p. ej. 'carta-q4-2026-L1-v2').
 */
import { DB, ahora } from './db';
import * as repo from './repo';

type N = [string, number, number | null, number, number]; // kpi, umbral, llave, objetivo, excelencia
const n = (filas: N[]) => filas.map(([kpi, umbral, llave, objetivo, excelencia]) => ({ kpi, umbral, llave: llave ?? undefined, objetivo, excelencia }));

const COMUNES: N[] = [
  ['K6A_MISTERIOSO_SALA', 6, 7, 8, 10], ['K6B_MISTERIOSO_PRODUCTO', 6, 7, 8, 10],
  ['K9_DISPONIBILIDAD', 0, null, 100, 100],
  ['K10_CHECKLIST', 60, 75, 85, 100], ['K11_HALLAZGOS', 60, 75, 85, 100],
  ['K12A_INICIATIVAS', 75, 90, 100, 110], ['K12B_REPORTES', 75, 90, 100, 110],
  ['K13_CUALITATIVA', 6, 7, 8, 10],
];

export const CARTAS: { id: string; local: string; periodo: string; config: Record<string, any>; niveles: ReturnType<typeof n> }[] = [
  {
    id: 'carta-q4-2026-L1', local: 'L1', periodo: 'Q4-2026',
    config: { importe_objetivo: 1500, perfil_canal: 'MIXTO', suelo_nota_resenas: 4.0, umbral_descuentos_pct: 0.3, productos_estrategicos: 'Entrantes (% sobre facturación)' },
    niveles: n([
      ['K1_FACTURACION', 166631.89, 235147.71, 277719.81, 305491.79],
      ['K2_TICKET', 31.90, 34.30, 37.20, 39.20],
      ['K3_PRODUCTOS', 7.00, 10.50, 14, 18],
      ['K4A_RESENAS_VOLUMEN', 125, 200, 250, 325],
      ['K4B_RESENAS_NOTA', 4.0, 4.5, 4.75, 4.9],
      ['K5_RATING_UBER', 4.3, 4.4, 4.5, 4.7],
      ['K7_PRECISION', 2.4, 1.9, 1.0, 0.6],
      ['K8_COCINA', 0.30, 0.20, 0.10, 0],
      ...COMUNES,
    ]),
  },
  {
    id: 'carta-q4-2026-L2', local: 'L2', periodo: 'Q4-2026',
    config: { importe_objetivo: 1500, perfil_canal: 'MIXTO', suelo_nota_resenas: 4.4, umbral_descuentos_pct: 0.3 },
    niveles: n([
      ['K1_FACTURACION', 128428.56, 201290.22, 214047.60, 235452.36],
      ['K2_TICKET', 34.89, 38.50, 43.24, 45.24],
      ['K3_PRODUCTOS', 8.00, 11.65, 15, 18],
      ['K4A_RESENAS_VOLUMEN', 150, 250, 300, 375],
      ['K4B_RESENAS_NOTA', 4.4, 4.6, 4.8, 4.9],
      ['K5_RATING_UBER', 3.9, 4.1, 4.2, 4.4],
      ['K7_PRECISION', 2.0, 1.3, 1.0, 0.6],
      ['K8_COCINA', 0.30, 0.15, 0.10, 0],
      ...COMUNES,
    ]),
  },
  {
    id: 'carta-q4-2026-L3', local: 'L3', periodo: 'Q4-2026',
    config: { importe_objetivo: 1500, perfil_canal: 'MIXTO', suelo_nota_resenas: 4.4, umbral_descuentos_pct: 0.3 },
    niveles: n([
      ['K1_FACTURACION', 83078.55, 125876.59, 138464.25, 152310.67],
      ['K2_TICKET', 37.83, 40.41, 44.59, 46.59],
      ['K3_PRODUCTOS', 7.98, 12.38, 16, 19],
      ['K4A_RESENAS_VOLUMEN', 70, 120, 150, 200],
      ['K4B_RESENAS_NOTA', 4.4, 4.6, 4.8, 4.9],
      ['K5_RATING_UBER', 4.0, 4.1, 4.2, 4.4],
      ['K7_PRECISION', 1.8, 1.5, 1.2, 1.0],
      ['K8_COCINA', 0.30, 0.20, 0.15, 0.10],
      ...COMUNES,
    ]),
  },
];

/** Aplica las cartas pendientes. Devuelve los ids aplicados en esta llamada. */
export function aplicarCartas(db: DB): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS migraciones (id TEXT PRIMARY KEY, ts TEXT NOT NULL)');
  const hechas = new Set((db.prepare('SELECT id FROM migraciones').all() as any[]).map(r => r.id));
  const aplicadas: string[] = [];
  for (const c of CARTAS) {
    if (hechas.has(c.id)) continue;
    if (!repo.local(db, c.local) || !repo.periodo(db, c.periodo)) continue; // aún no existen el local o el periodo
    repo.guardarConfig(db, c.local, c.periodo, c.config, 'carta Drive');
    repo.guardarNiveles(db, c.local, c.periodo, c.niveles, 'carta Drive');
    db.prepare('INSERT INTO migraciones (id, ts) VALUES (?, ?)').run(c.id, ahora());
    aplicadas.push(c.id);
  }
  return aplicadas;
}
