/**
 * Sembrado inicial. Ejecutar: npm run seed
 *   - Maestros reales: locales del piloto (sin nombre real), Valladolid excluido, periodo Q4 2026, catálogo de líneas de checklist.
 *   - TODO LO DEMÁS ES ILUSTRATIVO (autor 'ILUSTRATIVO'): niveles y datos de octubre para ver la herramienta funcionando.
 *     Sustituir por los umbrales de las cartas de objetivos y por los datos reales antes del 1 de octubre.
 */
import { abrir } from './db';
import * as repo from './repo';

const db = abrir();
const ILU = 'ILUSTRATIVO';
const sinDatos = (db.prepare('SELECT COUNT(*) AS n FROM locales').get() as any).n === 0;
if (!sinDatos && !process.argv.includes('--forzar')) {
  console.log('La base ya tiene datos. Usa --forzar para resembrar (borra todo).'); process.exit(0);
}
db.exec(`DELETE FROM liquidaciones; DELETE FROM neutralizaciones; DELETE FROM puertas; DELETE FROM coste_personal_mes; DELETE FROM descuentos_mes; DELETE FROM cualitativa;
  DELETE FROM compromisos; DELETE FROM fichas_misterioso; DELETE FROM hallazgos; DELETE FROM visitas; DELETE FROM checklist_lineas; DELETE FROM checklist_semanas;
  DELETE FROM uber_mes; DELETE FROM meses; DELETE FROM niveles; DELETE FROM config_periodo; DELETE FROM lineas_catalogo; DELETE FROM managers; DELETE FROM accesos; DELETE FROM periodos; DELETE FROM locales;`);

// ---- Maestros ----
db.exec(`INSERT INTO locales (id, nombre, ciudad, en_modelo, en_piloto, orden) VALUES
  ('L1','Local 1','Madrid',1,1,1), ('L2','Local 2','Madrid',1,1,2), ('L3','Local 3','Madrid',1,1,3),
  ('VLL','Valladolid','Valladolid',0,0,99);
  INSERT INTO managers (id, nombre, local_id, fecha_alta_puesto) VALUES ('M1','Manager Local 1','L1',NULL), ('M2','Manager Local 2','L2','2026-10-01'), ('M3','Manager Local 3','L3',NULL);
  INSERT INTO periodos (id, nombre, inicio, fin, meses) VALUES ('Q4-2026','Q4 2026','2026-10-01','2026-12-31','["2026-10","2026-11","2026-12"]');
  INSERT INTO accesos (token, rol, local_id, nombre) VALUES ('direccion','DIRECCION',NULL,'Dirección'),
    ('local1','MANAGER','L1','Manager Local 1'), ('local2','MANAGER','L2','Manager Local 2'), ('local3','MANAGER','L3','Manager Local 3');`);

// Catálogo de líneas (elementos tipo del §7.1 v7). Ajustar cuando se cierren las hojas A y B.
const A = ['Climatización', 'Aseos', 'Iluminación', 'TPV y datáfono', 'Mobiliario y terraza', 'Accesos y puertas', 'Rótulos', 'Extintores y señalización'];
const B = ['Extracción y filtros de campana', 'Sistema de extinción', 'Cámaras y abatidor', 'Ahumador y parrilla', 'Freidoras y termostatos', 'Lavavajillas', 'Arqueta de grasas', 'Desagües'];
const st = db.prepare('INSERT INTO lineas_catalogo (hoja, linea_id, texto, orden) VALUES (?,?,?,?)');
A.forEach((t, i) => st.run('A', `A${i + 1}`, t, i + 1));
B.forEach((t, i) => st.run('B', `B${i + 1}`, t, i + 1));

// ---- Configuración ILUSTRATIVA por local ----
const nivelesBase = [
  { kpi: 'K1_FACTURACION', umbral: 92, objetivo: 100, excelencia: 108 },
  { kpi: 'K2_TICKET', umbral: 95, objetivo: 100, excelencia: 105 },
  { kpi: 'K3_PRODUCTOS', umbral: 25, objetivo: 30, excelencia: 36 },
  { kpi: 'K4A_RESENAS_VOLUMEN', umbral: 80, objetivo: 100, excelencia: 130 },
  { kpi: 'K4B_RESENAS_NOTA', umbral: 4.3, objetivo: 4.5, excelencia: 4.7 },
  { kpi: 'K5_RATING_UBER', umbral: 4.2, objetivo: 4.4, excelencia: 4.6 },
  { kpi: 'K6A_MISTERIOSO_SALA', umbral: 70, objetivo: 85, excelencia: 95 },
  { kpi: 'K6B_MISTERIOSO_PRODUCTO', umbral: 70, objetivo: 85, excelencia: 95 },
  { kpi: 'K7_PRECISION', umbral: 3.0, objetivo: 2.0, excelencia: 1.2 },
  { kpi: 'K8_COCINA', umbral: 2.0, objetivo: 1.2, excelencia: 0.6 },
  { kpi: 'K9_ONLINE', umbral: 95, objetivo: 98, excelencia: 99.5 },
  { kpi: 'K9_UNFULFILLED', umbral: 2.0, objetivo: 1.0, excelencia: 0.5 },
  { kpi: 'K10_CHECKLIST', umbral: 80, objetivo: 95, excelencia: 100 },
  { kpi: 'K11_HALLAZGOS', umbral: 60, objetivo: 85, excelencia: 100 },
  { kpi: 'K12A_INICIATIVAS', umbral: 70, objetivo: 90, excelencia: 100 },
  { kpi: 'K12B_REPORTES', umbral: 80, objetivo: 95, excelencia: 100 },
];
for (const l of ['L1', 'L2', 'L3']) {
  repo.guardarConfig(db, l, 'Q4-2026', { importe_objetivo: 1500, perfil_canal: 'MIXTO', suelo_nota_resenas: 4.2, umbral_descuentos_pct: 0.3, productos_estrategicos: 'Pendiente de fijar (máx. 3 SKUs)' }, ILU);
  repo.guardarNiveles(db, l, 'Q4-2026', nivelesBase, ILU);
  repo.guardarPuertas(db, l, 'Q4-2026', { seguridad_alimentaria: 1, reporting_semanas_en_plazo: null, control_caja: 1, integridad: 1 }, ILU);
  // Objetivos mensualizados ILUSTRATIVOS (los reales salen de los baselines y la estacionalidad)
  const obj: Record<string, [number, number, number]> = { L1: [200000, 205000, 240000], L2: [140000, 145000, 175000], L3: [120000, 125000, 150000] };
  ['2026-10', '2026-11', '2026-12'].forEach((mes, i) => {
    repo.guardarMes(db, l, 'Q4-2026', { mes, facturacion_objetivo: obj[l][i], tickets_previstos: Math.round(obj[l][i] / 21), ticket_medio_objetivo: 21, resenas_objetivo: 45 }, ILU);
  });
}

// ---- Datos ILUSTRATIVOS de octubre en Local 1, para ver la herramienta funcionando ----
repo.guardarMes(db, 'L1', 'Q4-2026', { mes: '2026-10', facturacion_real: 206500, facturacion_objetivo: 200000, tickets: 9700, tickets_previstos: 9524, ticket_medio_objetivo: 21, productos_penetracion: 31.5, resenas_volumen: 52, resenas_objetivo: 45, resenas_nota_media: 4.6 }, ILU);
repo.guardarUberMes(db, 'L1', 'Q4-2026', { mes: '2026-10', pedidos: 2100, inaccurate_rate: 1.9, food_quality_rate: 0.5, prep_delay_rate: 0.4, online_rate: 98.6, unfulfilled_rate: 0.8, rating: 4.5 }, ILU, 'automatico', 'ILUSTRATIVO');
repo.guardarDescuentosMes(db, 'L1', 'Q4-2026', { mes: '2026-10', ventas: 206500, no_tipificados: 120 }, ILU);
repo.guardarCostePersonalMes(db, 'L1', 'Q4-2026', { mes: '2026-10', coste_sala: 39200, ventas: 206500, horas_sala: 1840 }, ILU);
const semanas = ['2026-W41', '2026-W42', '2026-W43', '2026-W44'];
for (const s of semanas) {
  repo.guardarChecklist(db, 'L1', 'Q4-2026', s, 'A', 'Manager Local 1', null, A.map((_, i) => ({ linea_id: `A${i + 1}`, estado: 'CONFORME', aviso_en_24h: false })));
  repo.guardarChecklist(db, 'L1', 'Q4-2026', s, 'B', 'Manager Local 1', 'Jefe de Cocina 1',
    B.map((_, i) => ({ linea_id: `B${i + 1}`, estado: s === '2026-W42' && i === 4 ? 'NO_CONFORME' : 'CONFORME', aviso_en_24h: s === '2026-W42' && i === 4 })));
}
const v1 = repo.guardarVisita(db, 'L1', 'Q4-2026', { fecha: '2026-10-08', visitante: 'Dirección A', hallazgos: [{ hoja: 'B', linea_id: 'B7', descripcion: 'Arqueta con rebosamiento', reportado_previamente: 0, debio_detectarse: true }] });
const h1 = (db.prepare('SELECT id FROM hallazgos WHERE visita_id = ?').get(v1) as any).id;
repo.guardarVisita(db, 'L1', 'Q4-2026', { fecha: '2026-10-15', visitante: 'Dirección B', hallazgos: [], cierres: [{ hallazgo_id: h1, cerrado: true }] });
repo.guardarVisita(db, 'L1', 'Q4-2026', { fecha: '2026-10-22', visitante: 'Dirección C', hallazgos: [{ hoja: 'A', linea_id: 'A3', descripcion: 'Dos focos fundidos en sala', reportado_previamente: 1, debio_detectarse: true }] });
repo.guardarFicha(db, 'L1', 'Q4-2026', { fecha: '2026-10-18', evaluador: 'Conocido 1', sala: 88, producto: 82 });
repo.guardarCompromiso(db, 'L1', 'Q4-2026', { tipo: 'REPORTE', descripcion: 'Cierre semana 41', fecha_limite: '2026-10-13', fecha_cumplido: '2026-10-13' }, ILU);
repo.guardarCompromiso(db, 'L1', 'Q4-2026', { tipo: 'REPORTE', descripcion: 'Cierre semana 42', fecha_limite: '2026-10-20', fecha_cumplido: '2026-10-21' }, ILU);
repo.guardarCompromiso(db, 'L1', 'Q4-2026', { tipo: 'REPORTE', descripcion: 'Cierre semana 43', fecha_limite: '2026-10-27', fecha_cumplido: '2026-10-27' }, ILU);
repo.guardarCompromiso(db, 'L1', 'Q4-2026', { tipo: 'INICIATIVA', descripcion: 'Carta de otoño en sala', fecha_limite: '2026-10-15', fecha_cumplido: '2026-10-14' }, ILU);

console.log('Sembrado. Accesos: direccion · local1 · local2 · local3. Los datos y niveles son ILUSTRATIVOS.');
