/**
 * Sembrado inicial. Ejecutar: npm run seed
 *   - Maestros reales: locales del piloto (sin nombre real), Valladolid excluido, periodo Q4 2026, catálogo de líneas de checklist.
 *   - Configuración base (importe, perfil, suelo, umbral de descuentos). Los umbrales por KPI se cargan desde la carta de cada local.
 *   - Con --ejemplo, además datos de EJEMPLO en Local 1 (autor 'ILUSTRATIVO') para ver la herramienta funcionando.
 */
import { abrir } from './db';
import * as repo from './repo';
import { asegurarAdminInicial } from './auth';

/**
 * Catálogo de checklist — hojas A (sala) y B (cocina). Pendiente de normalizar del todo con
 * operaciones (ver PENDIENTE.md); esta es la lista de trabajo, actualizada el 18-sep-2026.
 *
 * El id de cada línea es FIJO y no se deriva de la posición en el array: así, insertar una línea
 * nueva en medio de la lista (como "Iluminación sala") nunca cambia el significado de un id que ya
 * pueda estar guardado en un checklist real de un local. Para añadir una línea, se añade una fila
 * nueva con un id propio; para quitar una, se borra su fila (el histórico que la use sigue
 * mostrando su texto tal cual, por el id). Nunca reordenar ni reutilizar un id ya usado.
 */
const A: [string, string][] = [
  ['A_clima', 'Climatización'],
  ['A_ilum_sala', 'Iluminación sala'],
  ['A_ilum_ext', 'Iluminación exterior'],
  ['A_leds', 'LEDs murales'],
  ['A_musica', 'Música'],
  ['A_wifi', 'WiFi'],
  ['A_tpv', 'TPV y datáfono'],
  ['A_aseos', 'Aseos'],
  ['A_mobiliario', 'Mobiliario y terraza'],
  ['A_accesos', 'Accesos y puertas'],
  ['A_rotulos', 'Rótulos'],
  ['A_extintores', 'Extintores y señalización'],
  ['A_barra_camaras', 'Barra — Cámaras'],
  ['A_barra_hielo', 'Barra — Máquina de hielo'],
  ['A_barra_fregadero', 'Barra — Fregadero'],
  ['A_barra_grifo', 'Barra — Grifo de cerveza'],
  ['A_barra_lavavajillas', 'Barra — Lavavajillas'],
];
const B: [string, string][] = [
  ['B_campana', 'Extracción y filtros de campana'],
  ['B_extincion', 'Sistema de extinción'],
  ['B_parrilla', 'Parrilla'],
  ['B_tostadora', 'Tostadora'],
  ['B_camara_positivo', 'Cámara de positivo'],
  ['B_camara_congelacion', 'Cámara de congelación'],
  ['B_mesas_frias', 'Mesas frías'],
  ['B_abatidor', 'Abatidor'],
  ['B_freidoras', 'Freidoras y termostatos'],
  ['B_lavavajillas', 'Lavavajillas'],
  ['B_arqueta', 'Arqueta de grasas'],
  ['B_desagues', 'Desagües'],
];

const db = abrir();
const ILU = 'ILUSTRATIVO';

/**
 * El catálogo de checklist se resincroniza SIEMPRE, en cada arranque (esté la base vacía o ya
 * en producción), para que un cambio de nombre o una línea nueva en este fichero baste con hacer
 * commit + push — sin --forzar y sin tocar configuración, umbrales, ni ningún otro dato ya cargado.
 * Va antes de decidir si hace falta el resto del sembrado, precisamente para que corra siempre.
 */
function sincronizarCatalogo() {
  db.exec('DELETE FROM lineas_catalogo');
  const st = db.prepare('INSERT INTO lineas_catalogo (hoja, linea_id, texto, orden) VALUES (?,?,?,?)');
  A.forEach(([id, t], i) => st.run('A', id, t, i + 1));
  B.forEach(([id, t], i) => st.run('B', id, t, i + 1));
  console.log(`Catálogo de checklist sincronizado: ${A.length} líneas en A, ${B.length} en B.`);
}

function asegurarAdmin() {
  const a = asegurarAdminInicial(db);
  if (a) console.log(a.generada
    ? `\n>>> PRIMER ADMINISTRADOR creado: ${a.email}\n>>> Contraseña temporal (solo se muestra esta vez, cámbiala al entrar): ${a.password}\n`
    : `Primer administrador creado: ${a.email} (contraseña de ADMIN_PASSWORD; se pedirá cambiarla al entrar).`);
}

const sinDatos = (db.prepare('SELECT COUNT(*) AS n FROM locales').get() as any).n === 0;
if (!sinDatos && !process.argv.includes('--forzar')) {
  sincronizarCatalogo();
  asegurarAdmin();
  console.log('Resto de la base ya tenía datos: sin tocar. (Usa --forzar para resembrar todo lo demás desde cero — borra configuración y datos.)');
  process.exit(0);
}
db.exec(`DELETE FROM liquidaciones; DELETE FROM neutralizaciones; DELETE FROM puertas; DELETE FROM coste_personal_mes; DELETE FROM descuentos_mes; DELETE FROM cualitativa;
  DELETE FROM compromisos; DELETE FROM fichas_misterioso; DELETE FROM hallazgos; DELETE FROM visitas; DELETE FROM checklist_lineas; DELETE FROM checklist_semanas;
  DELETE FROM uber_mes; DELETE FROM meses; DELETE FROM niveles; DELETE FROM config_periodo; DELETE FROM lineas_catalogo; DELETE FROM managers; DELETE FROM accesos; DELETE FROM sesiones; DELETE FROM usuarios; DELETE FROM periodos; DELETE FROM locales;`);

// ---- Maestros ----
db.exec(`INSERT INTO locales (id, nombre, ciudad, en_modelo, en_piloto, orden) VALUES
  ('L1','Local 1','Madrid',1,1,1), ('L2','Local 2','Madrid',1,1,2), ('L3','Local 3','Madrid',1,1,3),
  ('VLL','Valladolid','Valladolid',0,0,99);
  INSERT INTO managers (id, nombre, local_id, fecha_alta_puesto) VALUES ('M1','Manager Local 1','L1',NULL), ('M2','Manager Local 2','L2','2026-10-01'), ('M3','Manager Local 3','L3',NULL);
  INSERT INTO periodos (id, nombre, inicio, fin, meses) VALUES ('Q4-2026','Q4 2026','2026-10-01','2026-12-31','["2026-10","2026-11","2026-12"]');
  DELETE FROM accesos;`);
asegurarAdmin();

sincronizarCatalogo();

// ---- Configuración base por local: importe y parámetros ya decididos; los umbrales se cargan desde la carta de cada local ----
for (const l of ['L1', 'L2', 'L3']) {
  repo.guardarConfig(db, l, 'Q4-2026', { importe_objetivo: 1500, perfil_canal: 'MIXTO', suelo_nota_resenas: 4, umbral_descuentos_pct: 0.3 }, 'seed');
  repo.guardarPuertas(db, l, 'Q4-2026', { seguridad_alimentaria: 1, reporting_semanas_en_plazo: null, control_caja: 1, integridad: 1 }, 'seed');
}

// ---- Datos de EJEMPLO, solo con --ejemplo: para ver la herramienta funcionando en Local 1 ----
if (process.argv.includes('--ejemplo')) {
  repo.guardarNiveles(db, 'L1', 'Q4-2026', [
    { kpi: 'K1_FACTURACION', umbral: 166631.89, llave: 235147.71, objetivo: 277719.81, excelencia: 305491.79 },
    { kpi: 'K2_TICKET', umbral: 31.9, llave: 34.3, objetivo: 37.2, excelencia: 39.2 },
    { kpi: 'K3_PRODUCTOS', umbral: 7, llave: 10.5, objetivo: 14, excelencia: 18 },
    { kpi: 'K4A_RESENAS_VOLUMEN', umbral: 125, llave: 200, objetivo: 250, excelencia: 325 },
    { kpi: 'K4B_RESENAS_NOTA', umbral: 4, llave: 4.5, objetivo: 4.75, excelencia: 4.9 },
    { kpi: 'K5_RATING_UBER', umbral: 4.3, llave: 4.4, objetivo: 4.5, excelencia: 4.7 },
    { kpi: 'K6A_MISTERIOSO_SALA', umbral: 6, llave: 7, objetivo: 8, excelencia: 10 },
    { kpi: 'K6B_MISTERIOSO_PRODUCTO', umbral: 6, llave: 7, objetivo: 8, excelencia: 10 },
    { kpi: 'K7_PRECISION', umbral: 2.4, llave: 1.9, objetivo: 1.0, excelencia: 0.6 },
    { kpi: 'K8_COCINA', umbral: 0.3, llave: 0.2, objetivo: 0.1, excelencia: 0 },
    { kpi: 'K9_DISPONIBILIDAD', umbral: 0, objetivo: 100, excelencia: 100 },
    { kpi: 'K10_CHECKLIST', umbral: 60, llave: 75, objetivo: 85, excelencia: 100 },
    { kpi: 'K11_HALLAZGOS', umbral: 60, llave: 75, objetivo: 85, excelencia: 100 },
    { kpi: 'K12A_INICIATIVAS', umbral: 75, llave: 90, objetivo: 100, excelencia: 110 },
    { kpi: 'K12B_REPORTES', umbral: 75, llave: 90, objetivo: 100, excelencia: 110 },
    { kpi: 'K13_CUALITATIVA', umbral: 6, llave: 7, objetivo: 8, excelencia: 10 },
  ], ILU);
  ['2026-10', '2026-11', '2026-12'].forEach((mes, i) => repo.guardarMes(db, 'L1', 'Q4-2026', { mes, prevision_facturacion: [85000, 88000, 105000][i], prevision_resenas: [75, 80, 95][i] }, ILU));
  repo.guardarMes(db, 'L1', 'Q4-2026', { mes: '2026-10', facturacion_real: 87500, ticket_medio: 35.7, productos_penetracion: 11.2, resenas_volumen: 78, resenas_nota_media: 4.6, prevision_facturacion: 85000, prevision_resenas: 75 }, ILU);
  repo.guardarUberMes(db, 'L1', 'Q4-2026', { mes: '2026-10', pedidos: 2100, inaccurate_rate: 1.9, food_quality_rate: 0.12, online_rate: 100, rating: 4.5 }, ILU, 'automatico', 'ILUSTRATIVO');
  const semanas = ['2026-W41', '2026-W42', '2026-W43', '2026-W44'];
  for (const s of semanas) {
    repo.guardarChecklist(db, 'L1', 'Q4-2026', s, 'A', 'Manager Local 1', null, A.map(([id]) => ({ linea_id: id, estado: 'CONFORME', aviso_en_24h: false })));
    repo.guardarChecklist(db, 'L1', 'Q4-2026', s, 'B', 'Manager Local 1', 'Jefe de Cocina 1',
      B.map(([id], i) => ({ linea_id: id, estado: s === '2026-W42' && i === 4 ? 'NO_CONFORME' : 'CONFORME', aviso_en_24h: s === '2026-W42' && i === 4 })));
  }
  const v1 = repo.guardarVisita(db, 'L1', 'Q4-2026', { fecha: '2026-10-08', visitante: 'Dirección A', notas: 'Visita de ejemplo', hallazgos: [{ hoja: 'B', linea_id: 'B_arqueta', descripcion: 'Arqueta con rebosamiento', reportado_previamente: 0, debio_detectarse: true }] });
  const h1 = (db.prepare('SELECT id FROM hallazgos WHERE visita_id = ?').get(v1) as any).id;
  repo.guardarVisita(db, 'L1', 'Q4-2026', { fecha: '2026-10-15', visitante: 'Dirección B', hallazgos: [], cierres: [{ hallazgo_id: h1, cerrado: true }] });
  repo.guardarFicha(db, 'L1', 'Q4-2026', { fecha: '2026-10-18', evaluador: 'Conocido 1', sala: 8.5, producto: 8.2, detalle: 'Ficha de ejemplo' });
  repo.guardarFicha(db, 'L1', 'Q4-2026', { fecha: '2026-11-06', evaluador: 'Dirección', sala: 8.1, producto: null, detalle: 'Visita fuera de servicio' });
  repo.guardarCompromiso(db, 'L1', 'Q4-2026', { tipo: 'REPORTE', descripcion: 'Cierre semana 41', fecha_limite: '2026-10-13', fecha_cumplido: '2026-10-13' }, ILU);
  repo.guardarCompromiso(db, 'L1', 'Q4-2026', { tipo: 'INICIATIVA', descripcion: 'Carta de otoño en sala', fecha_limite: '2026-10-15', fecha_cumplido: '2026-10-14' }, ILU);
}

console.log('Sembrado. Los usuarios se gestionan desde Dirección → Usuarios. Los umbrales se cargan desde la carta de cada local (Configuración).' + (process.argv.includes('--ejemplo') ? ' Local 1 lleva datos de EJEMPLO.' : ''));
