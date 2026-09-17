import { DB, ahora } from './db';
import { ConfigPeriodo, DatosPeriodo, Hallazgo, LineaChecklist, construirEntrada } from '../engine/agregar';
import { ResultadoLiquidacion, liquidar } from '../engine/liquidar';
import { KPIS, KpiId, MotivoNeutralizacion, PerfilCanal } from '../engine/modelo';

type Row = Record<string, any>;
const all = (db: DB, sql: string, ...p: any[]) => db.prepare(sql).all(...p) as Row[];
const get = (db: DB, sql: string, ...p: any[]) => db.prepare(sql).get(...p) as Row | undefined;
const run = (db: DB, sql: string, ...p: any[]) => db.prepare(sql).run(...p);

/** Semana ISO 'YYYY-Www' de una fecha 'YYYY-MM-DD' */
export function semanaISO(fecha: string): string {
  const d = new Date(fecha + 'T00:00:00Z');
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const y = d.getUTCFullYear();
  const inicio = new Date(Date.UTC(y, 0, 1));
  const w = Math.ceil((((d.getTime() - inicio.getTime()) / 86400000) + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

// ---------- Lectura de maestros ----------
export const locales = (db: DB, soloModelo = true): Row[] =>
  all(db, `SELECT * FROM locales ${soloModelo ? 'WHERE en_modelo = 1' : ''} ORDER BY orden, nombre`);
export const local = (db: DB, id: string) => get(db, 'SELECT * FROM locales WHERE id = ? AND en_modelo = 1', id);
export const periodos = (db: DB) => all(db, 'SELECT * FROM periodos ORDER BY inicio DESC').map(p => ({ ...p, meses: JSON.parse(p.meses) }));
export const periodo = (db: DB, id: string): (Row & { meses: string[]; inicio: string; fin: string }) | undefined => { const p = get(db, 'SELECT * FROM periodos WHERE id = ?', id); return p ? { ...p, meses: JSON.parse(p.meses) as string[], inicio: p.inicio as string, fin: p.fin as string } : undefined; };
export const managerDeLocal = (db: DB, localId: string) => get(db, 'SELECT * FROM managers WHERE local_id = ? AND activo = 1', localId);
export const catalogoLineas = (db: DB) => all(db, 'SELECT * FROM lineas_catalogo ORDER BY hoja, orden');

// ---------- Configuración ----------
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) + 1;

/** Prorrateo por días efectivos (carta §9): alta o baja dentro del periodo e incapacidad temporal de más de 15 días. */
export function calcularProrrateo(p: { inicio: string; fin: string }, c: { fecha_alta?: string | null; fecha_baja?: string | null; dias_it?: number | null }): { prorrateo: number; diasPeriodo: number; diasEfectivos: number; diasIt: number } {
  const diasPeriodo = diasEntre(p.inicio, p.fin);
  const desde = c.fecha_alta && c.fecha_alta > p.inicio ? c.fecha_alta : p.inicio;
  const hasta = c.fecha_baja && c.fecha_baja < p.fin ? c.fecha_baja : p.fin;
  const diasIt = (c.dias_it ?? 0) > 15 ? (c.dias_it ?? 0) : 0;
  const diasEfectivos = Math.max(0, (hasta >= desde ? diasEntre(desde, hasta) : 0) - diasIt);
  return { prorrateo: Math.round((diasEfectivos / diasPeriodo) * 1000) / 1000, diasPeriodo, diasEfectivos, diasIt };
}

export function config(db: DB, localId: string, periodoId: string): ConfigPeriodo | null {
  const c = get(db, 'SELECT * FROM config_periodo WHERE local_id = ? AND periodo_id = ?', localId, periodoId);
  if (!c) return null;
  const niveles: ConfigPeriodo['niveles'] = {};
  for (const n of all(db, 'SELECT * FROM niveles WHERE local_id = ? AND periodo_id = ?', localId, periodoId))
    (niveles as any)[n.kpi] = { umbral: n.umbral, objetivo: n.objetivo, excelencia: n.excelencia, llave: n.llave ?? undefined };
  const p = get(db, 'SELECT * FROM puertas WHERE local_id = ? AND periodo_id = ?', localId, periodoId);
  return {
    importeObjetivo: c.importe_objetivo, perfilCanal: c.perfil_canal as PerfilCanal, niveles,
    sueloNotaResenas: c.suelo_nota_resenas, umbralDescuentosPct: c.umbral_descuentos_pct,
    prorrateo: c.prorrateo, bajaVoluntaria: !!c.baja_voluntaria,
    puertas: {
      seguridadAlimentaria: p ? !!p.seguridad_alimentaria : true,
      reporting: p ? (p.reporting_semanas_en_plazo === null ? true : p.reporting_semanas_en_plazo >= 11) : true,
      controlCaja: p ? !!p.control_caja : true,
      integridad: p ? !!p.integridad : true,
    },
  };
}

export function configCruda(db: DB, localId: string, periodoId: string) {
  return {
    config: get(db, 'SELECT * FROM config_periodo WHERE local_id = ? AND periodo_id = ?', localId, periodoId) ?? null,
    niveles: all(db, 'SELECT kpi, umbral, objetivo, excelencia, llave FROM niveles WHERE local_id = ? AND periodo_id = ?', localId, periodoId),
    puertas: get(db, 'SELECT * FROM puertas WHERE local_id = ? AND periodo_id = ?', localId, periodoId) ?? null,
  };
}

/** Guarda la configuración del periodo. Los campos que no vengan en `c` conservan su valor actual. El prorrateo se recalcula siempre. */
export function guardarConfig(db: DB, localId: string, periodoId: string, c: Row, autor: string) {
  const p = periodo(db, periodoId);
  if (!p) throw new Error('Periodo desconocido');
  const prev = get(db, 'SELECT * FROM config_periodo WHERE local_id = ? AND periodo_id = ?', localId, periodoId) ?? {};
  const v = (k: string, def: any) => (c[k] !== undefined ? c[k] : (prev[k] !== undefined && prev[k] !== null ? prev[k] : def));
  const sit = { fecha_alta: v('fecha_alta', null) || null, fecha_baja: v('fecha_baja', null) || null, dias_it: Number(v('dias_it', 0)) || 0 };
  const { prorrateo } = calcularProrrateo(p, sit);
  run(db, `INSERT INTO config_periodo (local_id, periodo_id, importe_objetivo, perfil_canal, suelo_nota_resenas, umbral_descuentos_pct, prorrateo, baja_voluntaria, fecha_alta, fecha_baja, dias_it, productos_estrategicos, fecha_comunicacion, fecha_extraccion_prevista, autor, ts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(local_id, periodo_id) DO UPDATE SET
    importe_objetivo=excluded.importe_objetivo, perfil_canal=excluded.perfil_canal, suelo_nota_resenas=excluded.suelo_nota_resenas,
    umbral_descuentos_pct=excluded.umbral_descuentos_pct, prorrateo=excluded.prorrateo, baja_voluntaria=excluded.baja_voluntaria,
    fecha_alta=excluded.fecha_alta, fecha_baja=excluded.fecha_baja, dias_it=excluded.dias_it,
    productos_estrategicos=excluded.productos_estrategicos, fecha_comunicacion=excluded.fecha_comunicacion,
    fecha_extraccion_prevista=excluded.fecha_extraccion_prevista, autor=excluded.autor, ts=excluded.ts`,
    localId, periodoId, v('importe_objetivo', 1500), v('perfil_canal', 'MIXTO'), v('suelo_nota_resenas', 4), v('umbral_descuentos_pct', 0.3),
    prorrateo, v('baja_voluntaria', 0) ? 1 : 0, sit.fecha_alta, sit.fecha_baja, sit.dias_it,
    v('productos_estrategicos', null) || null, v('fecha_comunicacion', null) || null, v('fecha_extraccion_prevista', null) || null, autor, ahora());
}

export function guardarNiveles(db: DB, localId: string, periodoId: string, niveles: { kpi: string; umbral: number; objetivo: number; excelencia: number; llave?: number }[], autor: string) {
  const st = db.prepare(`INSERT INTO niveles (local_id, periodo_id, kpi, umbral, objetivo, excelencia, llave, autor, ts) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(local_id, periodo_id, kpi) DO UPDATE SET umbral=excluded.umbral, objetivo=excluded.objetivo, excelencia=excluded.excelencia, llave=excluded.llave, autor=excluded.autor, ts=excluded.ts`);
  for (const n of niveles) st.run(localId, periodoId, n.kpi, n.umbral, n.objetivo, n.excelencia, n.llave ?? null, autor, ahora());
}

export function guardarPuertas(db: DB, localId: string, periodoId: string, p: Row, autor: string) {
  run(db, `INSERT INTO puertas (local_id, periodo_id, seguridad_alimentaria, reporting_semanas_en_plazo, control_caja, integridad, notas, autor, ts) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(local_id, periodo_id) DO UPDATE SET seguridad_alimentaria=excluded.seguridad_alimentaria, reporting_semanas_en_plazo=excluded.reporting_semanas_en_plazo,
    control_caja=excluded.control_caja, integridad=excluded.integridad, notas=excluded.notas, autor=excluded.autor, ts=excluded.ts`,
    localId, periodoId, p.seguridad_alimentaria ? 1 : 0, p.reporting_semanas_en_plazo ?? null, p.control_caja ? 1 : 0, p.integridad ? 1 : 0, p.notas ?? null, autor, ahora());
}

// ---------- Datos ----------
export function guardarMes(db: DB, localId: string, periodoId: string, m: Row, autor: string, origen = 'manual') {
  run(db, `INSERT INTO meses (local_id, periodo_id, mes, facturacion_real, facturacion_objetivo, tickets, tickets_previstos, ticket_medio_objetivo, productos_penetracion, resenas_volumen, resenas_objetivo, resenas_nota_media, origen, autor, ts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(local_id, periodo_id, mes) DO UPDATE SET
    facturacion_real=excluded.facturacion_real, facturacion_objetivo=excluded.facturacion_objetivo, tickets=excluded.tickets, tickets_previstos=excluded.tickets_previstos,
    ticket_medio_objetivo=excluded.ticket_medio_objetivo, productos_penetracion=excluded.productos_penetracion, resenas_volumen=excluded.resenas_volumen,
    resenas_objetivo=excluded.resenas_objetivo, resenas_nota_media=excluded.resenas_nota_media, origen=excluded.origen, autor=excluded.autor, ts=excluded.ts`,
    localId, periodoId, m.mes, m.facturacion_real ?? null, m.facturacion_objetivo ?? 0, m.tickets ?? null, m.tickets_previstos ?? 0, m.ticket_medio_objetivo ?? 0,
    m.productos_penetracion ?? null, m.resenas_volumen ?? null, m.resenas_objetivo ?? 0, m.resenas_nota_media ?? null, origen, autor, ahora());
}

export function guardarUberMes(db: DB, localId: string, periodoId: string, u: Row, autor: string, origen = 'automatico', fichero: string | null = null) {
  run(db, `INSERT INTO uber_mes (local_id, periodo_id, mes, pedidos, inaccurate_rate, food_quality_rate, prep_delay_rate, online_rate, unfulfilled_rate, rating, origen, fichero, autor, ts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(local_id, periodo_id, mes) DO UPDATE SET pedidos=excluded.pedidos, inaccurate_rate=excluded.inaccurate_rate,
    food_quality_rate=excluded.food_quality_rate, prep_delay_rate=excluded.prep_delay_rate, online_rate=excluded.online_rate, unfulfilled_rate=excluded.unfulfilled_rate,
    rating=excluded.rating, origen=excluded.origen, fichero=excluded.fichero, autor=excluded.autor, ts=excluded.ts`,
    localId, periodoId, u.mes, u.pedidos ?? null, u.inaccurate_rate ?? null, u.food_quality_rate ?? null, u.prep_delay_rate ?? null, u.online_rate ?? null, u.unfulfilled_rate ?? null, u.rating ?? null, origen, fichero, autor, ahora());
}

export function guardarChecklist(db: DB, localId: string, periodoId: string, semana: string, hoja: 'A' | 'B', firmaManager: string | null, firmaJefe: string | null, lineas: { linea_id: string; estado: string; aviso_en_24h: boolean; observacion?: string }[]) {
  if (hoja === 'B' && (!firmaManager || !firmaJefe)) throw new Error('La hoja B requiere firma del Manager y del Jefe de Cocina');
  if (hoja === 'A' && !firmaManager) throw new Error('La hoja A requiere firma del Manager');
  run(db, `INSERT INTO checklist_semanas (local_id, periodo_id, semana, hoja, firma_manager, firma_jefe_cocina, ts) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(local_id, periodo_id, semana, hoja) DO UPDATE SET firma_manager=excluded.firma_manager, firma_jefe_cocina=excluded.firma_jefe_cocina, ts=excluded.ts`,
    localId, periodoId, semana, hoja, firmaManager, hoja === 'B' ? firmaJefe : null, ahora());
  const id = get(db, 'SELECT id FROM checklist_semanas WHERE local_id=? AND periodo_id=? AND semana=? AND hoja=?', localId, periodoId, semana, hoja)!.id;
  run(db, 'DELETE FROM checklist_lineas WHERE semana_id = ?', id);
  const st = db.prepare('INSERT INTO checklist_lineas (semana_id, linea_id, estado, aviso_en_24h, observacion) VALUES (?,?,?,?,?)');
  for (const l of lineas) st.run(id, l.linea_id, l.estado, l.aviso_en_24h ? 1 : 0, l.observacion ?? null);
  return id;
}

export function guardarVisita(db: DB, localId: string, periodoId: string, v: { fecha: string; visitante: string; notas?: string; hallazgos: Row[]; cierres?: { hallazgo_id: number; cerrado: boolean }[] }) {
  const r = run(db, 'INSERT INTO visitas (local_id, periodo_id, fecha, visitante, notas, ts) VALUES (?,?,?,?,?,?)', localId, periodoId, v.fecha, v.visitante, v.notas ?? null, ahora());
  const id = Number(r.lastInsertRowid);
  const st = db.prepare('INSERT INTO hallazgos (visita_id, hoja, linea_id, descripcion, reportado_previamente, debio_detectarse) VALUES (?,?,?,?,?,?)');
  for (const h of v.hallazgos) st.run(id, h.hoja, h.linea_id, h.descripcion ?? null, h.reportado_previamente ? 1 : 0, h.debio_detectarse === false ? 0 : 1);
  // Cierres: cada hallazgo abierto puede darse por cerrado (o seguir abierto) en esta visita.
  // Solo puntúa el veredicto dado en la visita inmediatamente siguiente a la que lo detectó (cerrado_en_siguiente);
  // un cierre posterior se registra en cerrado_fecha para el seguimiento, pero ya no cuenta como "cerrado en la visita siguiente".
  for (const c of v.cierres ?? []) {
    const h = get(db, 'SELECT h.*, vi.fecha AS fecha_deteccion, vi.local_id, vi.periodo_id FROM hallazgos h JOIN visitas vi ON vi.id = h.visita_id WHERE h.id = ?', c.hallazgo_id);
    if (!h) continue;
    const esSiguiente = !get(db, 'SELECT 1 FROM visitas WHERE local_id = ? AND periodo_id = ? AND fecha > ? AND fecha < ? AND id <> ?', h.local_id, h.periodo_id, h.fecha_deteccion, v.fecha, id)
      && !get(db, 'SELECT 1 FROM visitas WHERE local_id = ? AND periodo_id = ? AND fecha = ? AND id > ? AND id <> ?', h.local_id, h.periodo_id, h.fecha_deteccion, h.visita_id, id);
    if (esSiguiente && h.cerrado_en_siguiente === null) run(db, 'UPDATE hallazgos SET cerrado_en_siguiente = ? WHERE id = ?', c.cerrado ? 1 : 0, c.hallazgo_id);
    if (c.cerrado && !h.cerrado_fecha) run(db, 'UPDATE hallazgos SET cerrado_fecha = ? WHERE id = ?', v.fecha, c.hallazgo_id);
  }
  return id;
}

/** Hallazgos sin fecha de cierre, con la visita que los detectó. */
export const hallazgosAbiertos = (db: DB, localId: string, periodoId: string) =>
  all(db, `SELECT h.*, v.fecha AS fecha_deteccion, v.visitante FROM hallazgos h JOIN visitas v ON v.id = h.visita_id
           WHERE v.local_id = ? AND v.periodo_id = ? AND h.cerrado_fecha IS NULL ORDER BY v.fecha, h.id`, localId, periodoId);

export const guardarFicha = (db: DB, localId: string, periodoId: string, f: Row) =>
  run(db, 'INSERT INTO fichas_misterioso (local_id, periodo_id, fecha, evaluador, sala, producto, detalle, ts) VALUES (?,?,?,?,?,?,?,?)', localId, periodoId, f.fecha, f.evaluador, f.sala, f.producto ?? null, f.detalle ?? null, ahora());

export const guardarCompromiso = (db: DB, localId: string, periodoId: string, c: Row, autor: string) =>
  c.id ? run(db, 'UPDATE compromisos SET descripcion=?, fecha_limite=?, fecha_cumplido=?, autor=?, ts=? WHERE id=?', c.descripcion, c.fecha_limite, c.fecha_cumplido ?? null, autor, ahora(), c.id)
       : run(db, 'INSERT INTO compromisos (local_id, periodo_id, tipo, descripcion, fecha_limite, fecha_cumplido, autor, ts) VALUES (?,?,?,?,?,?,?,?)', localId, periodoId, c.tipo, c.descripcion, c.fecha_limite, c.fecha_cumplido ?? null, autor, ahora());

export const borrarCompromiso = (db: DB, localId: string, periodoId: string, id: number) =>
  run(db, 'DELETE FROM compromisos WHERE id = ? AND local_id = ? AND periodo_id = ?', id, localId, periodoId);

export const guardarCualitativa = (db: DB, localId: string, periodoId: string, q: Row, evaluador: string) => {
  const nota = q.nota === null || q.nota === undefined || q.nota === '' ? null : Number(q.nota);
  if (nota !== null && (nota < 1 || nota > 10)) throw new Error('La nota debe estar entre 1 y 10');
  if (nota !== null && !String(q.justificacion ?? '').trim()) throw new Error('La valoración necesita una justificación escrita');
  return run(db, `INSERT INTO cualitativa (local_id, periodo_id, nota, justificacion, evaluador, ts) VALUES (?,?,?,?,?,?)
    ON CONFLICT(local_id, periodo_id) DO UPDATE SET nota=excluded.nota, justificacion=excluded.justificacion, evaluador=excluded.evaluador, ts=excluded.ts`,
    localId, periodoId, nota === null ? null : Math.round(nota * 10) / 10, q.justificacion ?? null, evaluador, ahora());
};

export const guardarDescuentosMes = (db: DB, localId: string, periodoId: string, d: Row, autor: string) =>
  run(db, `INSERT INTO descuentos_mes (local_id, periodo_id, mes, ventas, no_tipificados, cauce_disciplinario_abierto, autor, ts) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(local_id, periodo_id, mes) DO UPDATE SET ventas=excluded.ventas, no_tipificados=excluded.no_tipificados, cauce_disciplinario_abierto=excluded.cauce_disciplinario_abierto, autor=excluded.autor, ts=excluded.ts`,
    localId, periodoId, d.mes, d.ventas, d.no_tipificados ?? 0, d.cauce_disciplinario_abierto ? 1 : 0, autor, ahora());

export const guardarCostePersonalMes = (db: DB, localId: string, periodoId: string, c: Row, autor: string) =>
  run(db, `INSERT INTO coste_personal_mes (local_id, periodo_id, mes, coste_sala, ventas, horas_sala, origen, autor, ts) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(local_id, periodo_id, mes) DO UPDATE SET coste_sala=excluded.coste_sala, ventas=excluded.ventas, horas_sala=excluded.horas_sala, origen=excluded.origen, autor=excluded.autor, ts=excluded.ts`,
    localId, periodoId, c.mes, c.coste_sala ?? null, c.ventas ?? null, c.horas_sala ?? null, c.origen ?? 'manual', autor, ahora());

export const guardarNeutralizacion = (db: DB, localId: string, periodoId: string, n: Row, aprobadoPor: string) => {
  if (!KPIS.some(k => k.id === n.kpi)) throw new Error('KPI desconocido');
  return run(db, 'INSERT INTO neutralizaciones (local_id, periodo_id, kpi, motivo, evidencia, aprobado_por, ts) VALUES (?,?,?,?,?,?,?)', localId, periodoId, n.kpi, n.motivo, n.evidencia ?? null, aprobadoPor, ahora());
};
export const borrarNeutralizacion = (db: DB, id: number) => run(db, 'DELETE FROM neutralizaciones WHERE id = ?', id);

// ---------- Lectura para cálculo ----------
/** Construye DatosPeriodo de un local. `hastaMes` limita al acumulado a fecha (scorecard mensual). */
export function datosPeriodo(db: DB, localId: string, periodoId: string, hastaMes?: string): DatosPeriodo {
  const p = periodo(db, periodoId);
  if (!p) throw new Error('Periodo desconocido');
  const enRango = (mes: string) => !hastaMes || mes <= hastaMes;
  const fechaTope = hastaMes ? `${hastaMes}-31` : p.fin;

  // Se devuelven todos los meses del periodo (el reparto mensual del objetivo hace falta entero para prorratear),
  // pero los datos reales de los meses posteriores al corte van a null.
  const filasMes = all(db, 'SELECT * FROM meses WHERE local_id=? AND periodo_id=? ORDER BY mes', localId, periodoId);
  const meses = (p.meses as string[]).map(mes => {
    const m = filasMes.find(x => x.mes === mes);
    const real = enRango(mes);
    return {
      mes, facturacionReal: real ? (m?.facturacion_real ?? null) : null, facturacionObjetivo: m?.facturacion_objetivo ?? 0,
      tickets: real ? (m?.tickets ?? null) : null,
      productosPenetracion: real ? (m?.productos_penetracion ?? null) : null, resenasVolumen: real ? (m?.resenas_volumen ?? null) : null,
      resenasObjetivo: m?.resenas_objetivo ?? 0, resenasNotaMedia: real ? (m?.resenas_nota_media ?? null) : null,
    };
  });
  const uber = all(db, 'SELECT * FROM uber_mes WHERE local_id=? AND periodo_id=? ORDER BY mes', localId, periodoId).filter(u => enRango(u.mes)).map(u => ({
    mes: u.mes, pedidos: u.pedidos, inaccurateRate: u.inaccurate_rate, foodQualityRate: u.food_quality_rate, prepDelayRate: u.prep_delay_rate,
    onlineRate: u.online_rate, unfulfilledRate: u.unfulfilled_rate, rating: u.rating,
  }));

  // Checklist + hallazgos de dirección (cruce por linea_id)
  const semanas = all(db, 'SELECT * FROM checklist_semanas WHERE local_id=? AND periodo_id=? ORDER BY semana', localId, periodoId)
    .filter(s => s.semana <= semanaISO(fechaTope));
  const checklist: LineaChecklist[] = [];
  for (const s of semanas) {
    for (const l of all(db, 'SELECT * FROM checklist_lineas WHERE semana_id = ?', s.id)) {
      checklist.push({ semana: s.semana, hoja: s.hoja, lineaId: l.linea_id, estado: l.estado, avisoEn24h: !!l.aviso_en_24h, hallazgoNoReportado: false });
    }
  }
  const visitas = all(db, 'SELECT * FROM visitas WHERE local_id=? AND periodo_id=? ORDER BY fecha, id', localId, periodoId).filter(v => v.fecha <= fechaTope);
  const hallazgos: Hallazgo[] = [];
  visitas.forEach((v, i) => {
    const siguiente = visitas[i + 1];
    for (const h of all(db, 'SELECT * FROM hallazgos WHERE visita_id = ?', v.id)) {
      // KPI 10: hallazgo no reportado que debió verse → invalida la última línea del checklist anterior a la visita
      if (!h.reportado_previamente && h.debio_detectarse) {
        const semanaVisita = semanaISO(v.fecha);
        const candidatas = checklist.filter(l => l.hoja === h.hoja && l.lineaId === h.linea_id && l.semana <= semanaVisita);
        const ultima = candidatas.sort((a, b) => (a.semana < b.semana ? 1 : -1))[0];
        if (ultima) ultima.hallazgoNoReportado = true;
        else checklist.push({ semana: semanaVisita, hoja: h.hoja, lineaId: h.linea_id, estado: 'NO_CONFORME', avisoEn24h: false, hallazgoNoReportado: true });
      }
      // KPI 11: ¿se cerró en la visita siguiente? Sin visita siguiente en el periodo → no cuenta.
      hallazgos.push({ visitaFecha: v.fecha, lineaId: h.linea_id, cerradoEnVisitaSiguiente: siguiente ? (h.cerrado_en_siguiente === null ? null : !!h.cerrado_en_siguiente) : null });
    }
  });

  const fichas = all(db, 'SELECT * FROM fichas_misterioso WHERE local_id=? AND periodo_id=? ORDER BY fecha', localId, periodoId).filter(f => f.fecha <= fechaTope)
    .map(f => ({ fecha: f.fecha, sala: f.sala, producto: f.producto }));
  const comps = all(db, 'SELECT * FROM compromisos WHERE local_id=? AND periodo_id=?', localId, periodoId).filter(c => c.fecha_limite <= fechaTope);
  const enPlazo = (c: Row) => c.fecha_cumplido !== null && c.fecha_cumplido <= c.fecha_limite;
  const compromisos = {
    iniciativasTotal: comps.filter(c => c.tipo === 'INICIATIVA').length, iniciativasEnPlazo: comps.filter(c => c.tipo === 'INICIATIVA' && enPlazo(c)).length,
    reportesTotal: comps.filter(c => c.tipo === 'REPORTE').length, reportesEnFecha: comps.filter(c => c.tipo === 'REPORTE' && enPlazo(c)).length,
  };
  const q = get(db, 'SELECT * FROM cualitativa WHERE local_id=? AND periodo_id=?', localId, periodoId);
  const cualitativa = q && q.nota !== null && q.nota !== undefined ? q.nota : null;
  const descuentos = all(db, 'SELECT * FROM descuentos_mes WHERE local_id=? AND periodo_id=?', localId, periodoId).filter(d => enRango(d.mes)).map(d => ({ mes: d.mes, ventas: d.ventas, noTipificados: d.no_tipificados }));
  const neutralizaciones = all(db, 'SELECT * FROM neutralizaciones WHERE local_id=? AND periodo_id=?', localId, periodoId).map(n => ({ kpi: n.kpi as KpiId, motivo: n.motivo as MotivoNeutralizacion, evidencia: n.evidencia ?? undefined }));

  return { meses, uber, checklist, hallazgos, fichas, compromisos, cualitativa, descuentos, neutralizaciones };
}

export interface Calculo {
  local: Row; periodo: Row; hastaMes: string | null; config: ConfigPeriodo; resultado: ResultadoLiquidacion;
  agregados: ReturnType<typeof construirEntrada>['agregados'];
  costePersonal: { mes: string; pct: number | null; coste: number | null; ventas: number | null; horas: number | null }[];
  descuentos: Row[]; neutralizaciones: Row[]; avisos: string[];
}

/** Cálculo completo de un local en un periodo (o acumulado hasta un mes). Es lo que ven Dirección y el Manager. */
export function calcular(db: DB, localId: string, periodoId: string, hastaMes?: string): Calculo {
  const l = local(db, localId);
  if (!l) throw new Error('Local no incluido en el modelo');
  const p = periodo(db, periodoId);
  if (!p) throw new Error('Periodo desconocido');
  const cfg = config(db, localId, periodoId);
  if (!cfg) throw new Error('Sin configuración del periodo para este local (importe, niveles, puertas)');
  const datos = datosPeriodo(db, localId, periodoId, hastaMes);
  const { entrada, agregados } = construirEntrada(datos, cfg);
  const resultado = liquidar(entrada);
  const avisos: string[] = [];
  const sinNiveles = KPIS.filter(k => !cfg.niveles[k.id] && k.id !== 'K9_DISPONIBILIDAD').map(k => k.id);
  if (sinNiveles.length) avisos.push(`Sin niveles configurados: ${sinNiveles.join(', ')}`);
  if (!cfg.niveles.K9_DISPONIBILIDAD) avisos.push('KPI 9 sin objetivo de Online Rate configurado: se usa 100%');
  const pendientesCierre = datos.hallazgos.filter(h => h.cerradoEnVisitaSiguiente === null).length;
  if (pendientesCierre) avisos.push(`${pendientesCierre} hallazgo(s) sin revisar en visita siguiente`);
  const costePersonal = all(db, 'SELECT * FROM coste_personal_mes WHERE local_id=? AND periodo_id=? ORDER BY mes', localId, periodoId).map(c => ({
    mes: c.mes, coste: c.coste_sala, ventas: c.ventas, horas: c.horas_sala, pct: c.coste_sala !== null && c.ventas ? Math.round((c.coste_sala / c.ventas) * 1000) / 10 : null,
  }));
  return {
    local: l, periodo: p, hastaMes: hastaMes ?? null, config: cfg, resultado, agregados, costePersonal,
    descuentos: all(db, 'SELECT * FROM descuentos_mes WHERE local_id=? AND periodo_id=? ORDER BY mes', localId, periodoId),
    neutralizaciones: all(db, 'SELECT * FROM neutralizaciones WHERE local_id=? AND periodo_id=? ORDER BY ts', localId, periodoId),
    avisos,
  };
}

export function cerrarLiquidacion(db: DB, localId: string, periodoId: string, fechaExtraccion: string, cerradaPor: string) {
  const c = calcular(db, localId, periodoId);
  run(db, `INSERT INTO liquidaciones (local_id, periodo_id, fecha_extraccion, resultado, cerrada_por, ts) VALUES (?,?,?,?,?,?)
    ON CONFLICT(local_id, periodo_id) DO UPDATE SET fecha_extraccion=excluded.fecha_extraccion, resultado=excluded.resultado, cerrada_por=excluded.cerrada_por, ts=excluded.ts`,
    localId, periodoId, fechaExtraccion, JSON.stringify(c.resultado), cerradaPor, ahora());
  return c;
}
export const liquidacionCerrada = (db: DB, localId: string, periodoId: string) => {
  const r = get(db, 'SELECT * FROM liquidaciones WHERE local_id=? AND periodo_id=?', localId, periodoId);
  return r ? { ...r, resultado: JSON.parse(r.resultado) } : null;
};

/** Borra los datos operativos de un local en un periodo (meses, Uber, checklists, visitas, fichas, compromisos, cualitativa, neutralizaciones, cierres). Conserva configuración, niveles y puertas. */
export function vaciarDatos(db: DB, localId: string, periodoId: string) {
  for (const t of ['meses', 'uber_mes', 'fichas_misterioso', 'compromisos', 'cualitativa', 'descuentos_mes', 'coste_personal_mes', 'neutralizaciones', 'liquidaciones'])
    run(db, `DELETE FROM ${t} WHERE local_id = ? AND periodo_id = ?`, localId, periodoId);
  run(db, 'DELETE FROM hallazgos WHERE visita_id IN (SELECT id FROM visitas WHERE local_id = ? AND periodo_id = ?)', localId, periodoId);
  run(db, 'DELETE FROM visitas WHERE local_id = ? AND periodo_id = ?', localId, periodoId);
  run(db, 'DELETE FROM checklist_lineas WHERE semana_id IN (SELECT id FROM checklist_semanas WHERE local_id = ? AND periodo_id = ?)', localId, periodoId);
  run(db, 'DELETE FROM checklist_semanas WHERE local_id = ? AND periodo_id = ?', localId, periodoId);
}

export const acceso = (db: DB, token: string) => get(db, 'SELECT * FROM accesos WHERE token = ? AND activo = 1', token);

/** Datos brutos de un local/periodo para la vista de entrada. */
export function datosBrutos(db: DB, localId: string, periodoId: string) {
  return {
    meses: all(db, 'SELECT * FROM meses WHERE local_id=? AND periodo_id=? ORDER BY mes', localId, periodoId),
    uber: all(db, 'SELECT * FROM uber_mes WHERE local_id=? AND periodo_id=? ORDER BY mes', localId, periodoId),
    checklists: all(db, 'SELECT * FROM checklist_semanas WHERE local_id=? AND periodo_id=? ORDER BY semana, hoja', localId, periodoId).map(s => ({ ...s, lineas: all(db, 'SELECT * FROM checklist_lineas WHERE semana_id=?', s.id) })),
    visitas: all(db, 'SELECT * FROM visitas WHERE local_id=? AND periodo_id=? ORDER BY fecha, id', localId, periodoId).map(v => ({ ...v, hallazgos: all(db, 'SELECT * FROM hallazgos WHERE visita_id=?', v.id) })),
    hallazgosAbiertos: hallazgosAbiertos(db, localId, periodoId),
    fichas: all(db, 'SELECT * FROM fichas_misterioso WHERE local_id=? AND periodo_id=? ORDER BY fecha', localId, periodoId),
    compromisos: all(db, 'SELECT * FROM compromisos WHERE local_id=? AND periodo_id=? ORDER BY fecha_limite', localId, periodoId),
    cualitativa: get(db, 'SELECT * FROM cualitativa WHERE local_id=? AND periodo_id=?', localId, periodoId) ?? null,
    descuentos: all(db, 'SELECT * FROM descuentos_mes WHERE local_id=? AND periodo_id=? ORDER BY mes', localId, periodoId),
    costePersonal: all(db, 'SELECT * FROM coste_personal_mes WHERE local_id=? AND periodo_id=? ORDER BY mes', localId, periodoId),
    puertas: get(db, 'SELECT * FROM puertas WHERE local_id=? AND periodo_id=?', localId, periodoId) ?? null,
    neutralizaciones: all(db, 'SELECT * FROM neutralizaciones WHERE local_id=? AND periodo_id=? ORDER BY ts', localId, periodoId),
    liquidacion: liquidacionCerrada(db, localId, periodoId),
  };
}
