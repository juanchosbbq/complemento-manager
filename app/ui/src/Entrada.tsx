import { useState } from 'react';
import { api, nombreMes, post } from './api';

type Props = { localId: string; periodoId: string; meses: string[]; datos: any; modelo: any; catalogo: any[]; nombre: string; onCambio: () => void };

function useEnvio(onCambio: () => void) {
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const enviar = async (ruta: string, body: any, ok = 'Guardado.', method = 'POST') => {
    setMsg(null);
    try { const r = await api(ruta, { method, body }); setMsg({ tipo: 'ok', texto: typeof r?.importadas === 'number' ? `${ok} ${r.importadas} mes(es) importado(s).${r.columnasNoEncontradas?.length ? ' Columnas no encontradas: ' + r.columnasNoEncontradas.join(', ') : ''}` : ok }); onCambio(); }
    catch (e: any) { setMsg({ tipo: 'error', texto: e.message }); }
  };
  const Msg = () => (msg ? <div className={msg.tipo}>{msg.texto}</div> : null);
  return { enviar, Msg };
}

const n = (v: string) => (v === '' ? null : Number(v));

export function Entrada(p: Props) {
  const [tab, setTab] = useState('ventas');
  const tabs: [string, string][] = [['ventas', 'Ventas y reseñas'], ['uber', 'Uber Eats'], ['visita', 'Visita de dirección'], ['ficha', 'Cliente misterioso'], ['direccion', 'Dirección'], ['medido', 'Descuentos y coste'], ['puertas', 'Puertas y neutralizaciones'], ['config', 'Configuración']];
  return (
    <>
      <div className="pestanas">{tabs.map(([k, t]) => <button key={k} className={tab === k ? 'activa' : ''} onClick={() => setTab(k)}>{t}</button>)}</div>
      {tab === 'ventas' && <Meses {...p} />}
      {tab === 'uber' && <Uber {...p} />}
      {tab === 'visita' && <Visita {...p} />}
      {tab === 'ficha' && <Ficha {...p} />}
      {tab === 'direccion' && <Direccion {...p} />}
      {tab === 'medido' && <Medido {...p} />}
      {tab === 'puertas' && <Puertas {...p} />}
      {tab === 'config' && <Config {...p} />}
    </>
  );
}

function Meses({ localId, periodoId, meses, datos, onCambio }: Props) {
  const { enviar, Msg } = useEnvio(onCambio);
  const [mes, setMes] = useState(meses[0]);
  const ex = datos.meses.find((m: any) => m.mes === mes) ?? {};
  const [f, setF] = useState<any>(null);
  const v = f ?? ex; const set = (k: string, val: any) => setF({ ...v, [k]: val });
  const campos: [string, string][] = [['facturacion_objetivo', 'Objetivo de facturación neta (€)'], ['facturacion_real', 'Facturación neta real (€)'], ['tickets_previstos', 'Tickets previstos'], ['tickets', 'Tickets reales'], ['ticket_medio_objetivo', 'Ticket medio objetivo (€)'], ['productos_penetracion', 'Penetración productos estratégicos (% tickets)'], ['resenas_objetivo', 'Objetivo de reseñas (nº)'], ['resenas_volumen', 'Reseñas recibidas (nº)'], ['resenas_nota_media', 'Nota media de las reseñas del mes']];
  return (
    <section className="panel">
      <h2>Ventas y reseñas — dato mensual</h2>
      <p className="small muted">Revo (export manual) y Joombo. Los objetivos mensuales se comunican a T−15 y forman parte de la carta; los reales se cargan al cierre de cada mes. {ex.origen && <span className="chip">{ex.origen}</span>}{ex.autor && <span className="chip">{ex.autor}</span>}</p>
      <div className="form">
        <label>Mes<select value={mes} onChange={e => { setMes(e.target.value); setF(null); }}>{meses.map(m => <option key={m} value={m}>{nombreMes(m)} {m.slice(0, 4)}</option>)}</select></label>
        {campos.map(([k, t]) => <label key={k}>{t}<input type="number" step="any" value={v[k] ?? ''} onChange={e => set(k, n(e.target.value))} /></label>)}
        <div className="ancho"><button className="btn" onClick={() => enviar(`mes/${localId}/${periodoId}`, { ...v, mes })}>Guardar {nombreMes(mes)}</button></div>
      </div>
      <Msg />
    </section>
  );
}

function Uber({ localId, periodoId, meses, datos, onCambio }: Props) {
  const { enviar, Msg } = useEnvio(onCambio);
  const [mes, setMes] = useState(meses[0]);
  const [csv, setCsv] = useState('');
  const ex = datos.uber.find((m: any) => m.mes === mes) ?? {};
  const [f, setF] = useState<any>(null);
  const v = f ?? ex; const set = (k: string, val: any) => setF({ ...v, [k]: val });
  const campos: [string, string][] = [['pedidos', 'Pedidos'], ['inaccurate_rate', 'Inaccurate Orders Rate (%)'], ['food_quality_rate', 'Food Taste or Quality Issues (%)'], ['prep_delay_rate', 'Order Preparation Delays (%)'], ['online_rate', 'Online Rate (%)'], ['unfulfilled_rate', 'Unfulfilled Order Rate (%)'], ['rating', 'Rating del periodo']];
  return (
    <section className="panel">
      <h2>Uber Eats Manager — corte por periodo</h2>
      <p className="small muted">Performance → Operations, tienda y rango del mes. Nunca la cifra del panel de Operational Excellence (media móvil de 84 días). Pega el CSV exportado o teclea los valores tal cual salen.</p>
      <div className="form">
        <label>Mes<select value={mes} onChange={e => { setMes(e.target.value); setF(null); }}>{meses.map(m => <option key={m} value={m}>{nombreMes(m)} {m.slice(0, 4)}</option>)}</select></label>
        <label className="ancho">CSV del export (opcional)<textarea rows={4} value={csv} onChange={e => setCsv(e.target.value)} placeholder="Pega aquí el contenido del CSV" /></label>
        {csv && <div className="ancho"><button className="btn" onClick={() => enviar(`uber/${localId}/${periodoId}`, { csv, mes, fichero: 'pegado' }, 'CSV importado.')}>Importar CSV en {nombreMes(mes)}</button></div>}
        {campos.map(([k, t]) => <label key={k}>{t}<input type="number" step="any" value={v[k] ?? ''} onChange={e => set(k, n(e.target.value))} /></label>)}
        <div className="ancho"><button className="btn sec" onClick={() => enviar(`uber/${localId}/${periodoId}`, { ...v, mes })}>Guardar valores tecleados</button> {ex.fichero && <span className="small muted">último origen: {ex.origen} · {ex.fichero} · {ex.autor}</span>}</div>
      </div>
      <Msg />
    </section>
  );
}

function Visita({ localId, periodoId, datos, catalogo, nombre, onCambio }: Props) {
  const { enviar, Msg } = useEnvio(onCambio);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [visitante, setVisitante] = useState(nombre);
  const [notas, setNotas] = useState('');
  const [hallazgos, setHallazgos] = useState<any[]>([]);
  const [cierres, setCierres] = useState<Record<number, boolean>>({});
  const ultima = datos.visitas[datos.visitas.length - 1];
  const pendientes = ultima?.hallazgos ?? [];
  return (
    <section className="panel">
      <h2>Visita de dirección</h2>
      <p className="small muted">Misma taxonomía que el checklist. Un solo juicio por hallazgo: ¿debió detectarse en el último checklist? Lo que el Manager ya había reportado no penaliza nunca.</p>
      <div className="form">
        <label>Fecha<input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label>
        <label>Visitante<input value={visitante} onChange={e => setVisitante(e.target.value)} /></label>
        <label className="ancho">Notas<input value={notas} onChange={e => setNotas(e.target.value)} /></label>
      </div>
      {pendientes.length > 0 && (
        <>
          <h3 style={{ marginTop: 14 }}>Hallazgos de la visita anterior ({ultima.fecha}) — ¿cerrados?</h3>
          {pendientes.map((h: any) => (
            <div className="fila-check" key={h.id}>
              <div>{catalogo.find(c => c.linea_id === h.linea_id)?.texto ?? h.linea_id} {h.descripcion && <span className="muted">· {h.descripcion}</span>}{h.cerrado_en_siguiente !== null && <span className="chip">ya revisado: {h.cerrado_en_siguiente ? 'cerrado' : 'abierto'}</span>}</div>
              <label className="small"><input type="radio" name={'c' + h.id} checked={cierres[h.id] === true} onChange={() => setCierres({ ...cierres, [h.id]: true })} /> cerrado</label>
              <label className="small"><input type="radio" name={'c' + h.id} checked={cierres[h.id] === false} onChange={() => setCierres({ ...cierres, [h.id]: false })} /> sigue abierto</label>
            </div>
          ))}
        </>
      )}
      <h3 style={{ marginTop: 14 }}>Hallazgos de hoy</h3>
      {hallazgos.map((h, i) => (
        <div className="form" key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--linea)' }}>
          <label>Línea<select value={h.hoja + ':' + h.linea_id} onChange={e => { const [hoja, linea_id] = e.target.value.split(':'); setHallazgos(hallazgos.map((x, j) => j === i ? { ...x, hoja, linea_id } : x)); }}>{catalogo.map(c => <option key={c.hoja + c.linea_id} value={c.hoja + ':' + c.linea_id}>{c.hoja} · {c.texto}</option>)}</select></label>
          <label>Descripción<input value={h.descripcion} onChange={e => setHallazgos(hallazgos.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))} /></label>
          <label><span><input type="checkbox" checked={h.reportado_previamente} onChange={e => setHallazgos(hallazgos.map((x, j) => j === i ? { ...x, reportado_previamente: e.target.checked } : x))} /> el Manager ya lo había reportado</span></label>
          <label><span><input type="checkbox" checked={h.debio_detectarse} onChange={e => setHallazgos(hallazgos.map((x, j) => j === i ? { ...x, debio_detectarse: e.target.checked } : x))} /> debió detectarse en el último checklist</span></label>
          <button className="btn sec peq" onClick={() => setHallazgos(hallazgos.filter((_, j) => j !== i))}>Quitar</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button className="btn sec" onClick={() => setHallazgos([...hallazgos, { hoja: catalogo[0]?.hoja ?? 'A', linea_id: catalogo[0]?.linea_id ?? '', descripcion: '', reportado_previamente: false, debio_detectarse: true }])}>Añadir hallazgo</button>
        <button className="btn" onClick={() => enviar(`visita/${localId}/${periodoId}`, { fecha, visitante, notas, hallazgos, cierres: Object.entries(cierres).map(([id, c]) => ({ hallazgo_id: Number(id), cerrado: c })) }, 'Visita registrada.').then(() => { setHallazgos([]); setCierres({}); })}>Registrar visita</button>
      </div>
      <Msg />
      {datos.visitas.length > 0 && <table style={{ marginTop: 14 }}><thead><tr><th>Fecha</th><th>Visitante</th><th>Hallazgos</th></tr></thead><tbody>{datos.visitas.map((v: any) => <tr key={v.id}><td>{v.fecha}</td><td>{v.visitante}</td><td>{v.hallazgos.length === 0 ? <span className="muted">ninguno</span> : v.hallazgos.map((h: any) => <div key={h.id} className="small">{catalogo.find(c => c.linea_id === h.linea_id)?.texto ?? h.linea_id}{h.reportado_previamente ? ' · reportado' : ''}{!h.debio_detectarse ? ' · posterior al checklist' : ''}{h.cerrado_en_siguiente === null ? ' · sin revisar' : h.cerrado_en_siguiente ? ' · cerrado' : ' · abierto'}</div>)}</td></tr>)}</tbody></table>}
    </section>
  );
}

function Ficha({ localId, periodoId, datos, nombre, onCambio }: Props) {
  const { enviar, Msg } = useEnvio(onCambio);
  const [f, setF] = useState<any>({ fecha: new Date().toISOString().slice(0, 10), evaluador: '', sala: '', producto: '', detalle: '' });
  return (
    <section className="panel">
      <h2>Cliente misterioso interno</h2>
      <p className="small muted">Ficha cerrada e idéntica para todos, rellenada antes de identificarse. Producto solo si hubo consumición. Mínimo dos fichas por trimestre para que compute.</p>
      <div className="form">
        <label>Fecha<input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></label>
        <label>Evaluador<input value={f.evaluador} onChange={e => setF({ ...f, evaluador: e.target.value })} placeholder="dirección o conocido" /></label>
        <label>Sala y experiencia (0–100)<input type="number" value={f.sala} onChange={e => setF({ ...f, sala: e.target.value })} /></label>
        <label>Producto (0–100, vacío si no hubo consumición)<input type="number" value={f.producto} onChange={e => setF({ ...f, producto: e.target.value })} /></label>
        <label className="ancho">Detalle<input value={f.detalle} onChange={e => setF({ ...f, detalle: e.target.value })} /></label>
        <div className="ancho"><button className="btn" onClick={() => enviar(`ficha/${localId}/${periodoId}`, { ...f, sala: Number(f.sala), producto: n(f.producto) }, 'Ficha registrada.')}>Registrar ficha</button></div>
      </div>
      <Msg />
      {datos.fichas.length > 0 && <table style={{ marginTop: 14 }}><thead><tr><th>Fecha</th><th>Evaluador</th><th className="n">Sala</th><th className="n">Producto</th></tr></thead><tbody>{datos.fichas.map((x: any) => <tr key={x.id}><td>{x.fecha}</td><td>{x.evaluador}</td><td className="n">{x.sala}</td><td className="n">{x.producto ?? '—'}</td></tr>)}</tbody></table>}
    </section>
  );
}

function Direccion({ localId, periodoId, datos, nombre, onCambio }: Props) {
  const { enviar, Msg } = useEnvio(onCambio);
  const [c, setC] = useState<any>({ tipo: 'REPORTE', descripcion: '', fecha_limite: '', fecha_cumplido: '' });
  const q = datos.cualitativa ?? {};
  const [r, setR] = useState<any>({ anticipacion: q.anticipacion ?? '', analisis: q.analisis ?? '', liderazgo: q.liderazgo ?? '', equipo: q.equipo ?? '', ejemplos: q.ejemplos ? JSON.parse(q.ejemplos) : {} });
  const criterios: [string, string, string, string][] = [['anticipacion', 'Anticipación', 'Dirección se entera por los números', 'Avisa antes de que el problema se vea'], ['analisis', 'Calidad del análisis', 'Reporta datos sin lectura', 'Aporta diagnóstico y propuesta'], ['liderazgo', 'Liderazgo del local', 'Trata a cocina como un departamento ajeno', 'Es el faro del local completo'], ['equipo', 'Equipo y planificación', 'Rotación alta, turnos descubiertos', 'Plantilla estable, cuadrantes cerrados, formación al día']];
  return (
    <>
      <section className="panel">
        <h2>Compromisos con dirección</h2>
        <p className="small muted">Iniciativas corporativas y reportes, cada uno con fecha límite. Está en plazo si la fecha de cumplimiento no supera la límite.</p>
        <div className="form">
          <label>Tipo<select value={c.tipo} onChange={e => setC({ ...c, tipo: e.target.value })}><option value="REPORTE">Reporte</option><option value="INICIATIVA">Iniciativa corporativa</option></select></label>
          <label>Descripción<input value={c.descripcion} onChange={e => setC({ ...c, descripcion: e.target.value })} /></label>
          <label>Fecha límite<input type="date" value={c.fecha_limite} onChange={e => setC({ ...c, fecha_limite: e.target.value })} /></label>
          <label>Cumplido el<input type="date" value={c.fecha_cumplido} onChange={e => setC({ ...c, fecha_cumplido: e.target.value })} /></label>
          <div><button className="btn" onClick={() => enviar(`compromiso/${localId}/${periodoId}`, { ...c, fecha_cumplido: c.fecha_cumplido || null }, 'Compromiso guardado.')}>Guardar</button></div>
        </div>
        <Msg />
        {datos.compromisos.length > 0 && <table style={{ marginTop: 14 }}><thead><tr><th>Tipo</th><th>Descripción</th><th>Límite</th><th>Cumplido</th><th></th></tr></thead><tbody>{datos.compromisos.map((x: any) => <tr key={x.id}><td>{x.tipo === 'REPORTE' ? 'Reporte' : 'Iniciativa'}</td><td>{x.descripcion}</td><td>{x.fecha_limite}</td><td>{x.fecha_cumplido ?? <span className="muted">pendiente</span>}</td><td><button className="btn sec peq" onClick={() => setC({ id: x.id, tipo: x.tipo, descripcion: x.descripcion, fecha_limite: x.fecha_limite, fecha_cumplido: x.fecha_cumplido ?? '' })}>Editar</button></td></tr>)}</tbody></table>}
      </section>
      <section className="panel">
        <h2>Valoración cualitativa — rúbrica</h2>
        <p className="small muted">Cuatro criterios de 0 a 2 con ejemplo escrito obligatorio. Se entrega por escrito en la revisión trimestral. Umbral 4 · objetivo 6 · excelencia 8.</p>
        {criterios.map(([k, t, c0, c2]) => (
          <div className="form" key={k} style={{ marginBottom: 10 }}>
            <label>{t}<select value={r[k]} onChange={e => setR({ ...r, [k]: e.target.value })}><option value="">—</option><option value="0">0 · {c0}</option><option value="1">1 · intermedio</option><option value="2">2 · {c2}</option></select></label>
            <label className="ancho">Ejemplo documentado<input value={r.ejemplos[k] ?? ''} onChange={e => setR({ ...r, ejemplos: { ...r.ejemplos, [k]: e.target.value } })} /></label>
          </div>
        ))}
        <button className="btn" onClick={() => enviar(`cualitativa/${localId}/${periodoId}`, { anticipacion: n(r.anticipacion), analisis: n(r.analisis), liderazgo: n(r.liderazgo), equipo: n(r.equipo), ejemplos: r.ejemplos }, 'Valoración guardada.')}>Guardar valoración</button>
      </section>
    </>
  );
}

function Medido({ localId, periodoId, meses, datos, onCambio }: Props) {
  const { enviar, Msg } = useEnvio(onCambio);
  const [mes, setMes] = useState(meses[0]);
  const d = datos.descuentos.find((x: any) => x.mes === mes) ?? {}; const c = datos.costePersonal.find((x: any) => x.mes === mes) ?? {};
  const [fd, setFd] = useState<any>(null); const [fc, setFc] = useState<any>(null);
  const vd = fd ?? d; const vc = fc ?? c;
  return (
    <section className="panel">
      <h2>Descuentos y coste de personal de sala</h2>
      <p className="small muted">Descuentos: control preventivo en Revo; aquí se registra el residual. Superar el umbral en cualquier mes apaga la llave de Ventas del trimestre. El cauce disciplinario es independiente. Coste de personal: se mide, no puntúa.</p>
      <div className="form">
        <label>Mes<select value={mes} onChange={e => { setMes(e.target.value); setFd(null); setFc(null); }}>{meses.map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}</select></label>
        <label>Ventas del mes (€)<input type="number" value={vd.ventas ?? ''} onChange={e => setFd({ ...vd, ventas: n(e.target.value) })} /></label>
        <label>Descuentos no tipificados (€)<input type="number" value={vd.no_tipificados ?? ''} onChange={e => setFd({ ...vd, no_tipificados: n(e.target.value) })} /></label>
        <label><span><input type="checkbox" checked={!!vd.cauce_disciplinario_abierto} onChange={e => setFd({ ...vd, cauce_disciplinario_abierto: e.target.checked })} /> cauce disciplinario abierto</span></label>
        <div><button className="btn" onClick={() => enviar(`descuentos/${localId}/${periodoId}`, { ...vd, mes })}>Guardar descuentos</button></div>
        <label>Coste de personal de sala (€)<input type="number" value={vc.coste_sala ?? ''} onChange={e => setFc({ ...vc, coste_sala: n(e.target.value) })} /></label>
        <label>Ventas (€)<input type="number" value={vc.ventas ?? ''} onChange={e => setFc({ ...vc, ventas: n(e.target.value) })} /></label>
        <label>Horas de sala<input type="number" value={vc.horas_sala ?? ''} onChange={e => setFc({ ...vc, horas_sala: n(e.target.value) })} /></label>
        <div><button className="btn" onClick={() => enviar(`coste/${localId}/${periodoId}`, { ...vc, mes })}>Guardar coste</button></div>
      </div>
      <Msg />
    </section>
  );
}

function Puertas({ localId, periodoId, datos, modelo, onCambio }: Props) {
  const { enviar, Msg } = useEnvio(onCambio);
  const p = datos.puertas ?? {};
  const [f, setF] = useState<any>({ seguridad_alimentaria: p.seguridad_alimentaria ?? 1, reporting_semanas_en_plazo: p.reporting_semanas_en_plazo ?? '', control_caja: p.control_caja ?? 1, integridad: p.integridad ?? 1, notas: p.notas ?? '' });
  const [nz, setNz] = useState<any>({ kpi: 'K8_COCINA', motivo: 'ESCALADO_SIN_RESOLUCION', evidencia: '' });
  return (
    <>
      <section className="panel">
        <h2>Puertas de acceso</h2>
        <div className="form">
          <label><span><input type="checkbox" checked={!!f.seguridad_alimentaria} onChange={e => setF({ ...f, seguridad_alimentaria: e.target.checked ? 1 : 0 })} /> Seguridad alimentaria: sin no conformidad crítica abierta y no escalada</span></label>
          <label>Reporting: semanas con cierre e inventario en plazo (de 13; ≥11 supera)<input type="number" value={f.reporting_semanas_en_plazo} onChange={e => setF({ ...f, reporting_semanas_en_plazo: e.target.value })} /></label>
          <label><span><input type="checkbox" checked={!!f.control_caja} onChange={e => setF({ ...f, control_caja: e.target.checked ? 1 : 0 })} /> Control de caja: sin descuadres no justificados</span></label>
          <label><span><input type="checkbox" checked={!!f.integridad} onChange={e => setF({ ...f, integridad: e.target.checked ? 1 : 0 })} /> Integridad: sin expediente firme por falta grave</span></label>
          <label className="ancho">Notas<input value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} /></label>
          <div><button className="btn" onClick={() => enviar(`config/${localId}/${periodoId}`, { config: datos.configuracion.config ?? {}, puertas: { ...f, reporting_semanas_en_plazo: n(f.reporting_semanas_en_plazo) } }, 'Puertas guardadas.')}>Guardar puertas</button></div>
        </div>
        <Msg />
      </section>
      <section className="panel">
        <h2>Neutralizaciones</h2>
        <p className="small muted">Solo por causa tasada. El KPI computa al 100%. Queda registrado quién la aprueba y con qué evidencia.</p>
        <div className="form">
          <label>KPI<select value={nz.kpi} onChange={e => setNz({ ...nz, kpi: e.target.value })}>{(modelo?.kpis ?? []).map((k: any) => <option key={k.id} value={k.id}>{k.nombre}</option>)}</select></label>
          <label>Motivo<select value={nz.motivo} onChange={e => setNz({ ...nz, motivo: e.target.value })}>{Object.entries(modelo?.motivos ?? {}).map(([k, t]) => <option key={k} value={k}>{t as string}</option>)}</select></label>
          <label className="ancho">Evidencia<input value={nz.evidencia} onChange={e => setNz({ ...nz, evidencia: e.target.value })} placeholder="registro, ticket, correo, fecha…" /></label>
          <div><button className="btn" onClick={() => enviar(`neutralizacion/${localId}/${periodoId}`, nz, 'Neutralización registrada.')}>Registrar</button></div>
        </div>
        {datos.neutralizaciones.length > 0 && <table style={{ marginTop: 12 }}><thead><tr><th>KPI</th><th>Motivo</th><th>Evidencia</th><th>Aprobada por</th><th></th></tr></thead><tbody>{datos.neutralizaciones.map((x: any) => <tr key={x.id}><td>{x.kpi}</td><td>{modelo?.motivos?.[x.motivo] ?? x.motivo}</td><td>{x.evidencia}</td><td>{x.aprobado_por}</td><td><button className="btn sec peq" onClick={() => enviar(`neutralizacion/${localId}/${periodoId}/${x.id}`, {}, 'Neutralización retirada.', 'DELETE')}>Retirar</button></td></tr>)}</tbody></table>}
      </section>
    </>
  );
}

function Config({ localId, periodoId, datos, modelo, onCambio }: Props) {
  const { enviar, Msg } = useEnvio(onCambio);
  const cfg = datos.configuracion.config ?? {};
  const [c, setC] = useState<any>({ importe_objetivo: cfg.importe_objetivo ?? 1500, perfil_canal: cfg.perfil_canal ?? 'MIXTO', suelo_nota_resenas: cfg.suelo_nota_resenas ?? 4.2, umbral_descuentos_pct: cfg.umbral_descuentos_pct ?? 0.3, prorrateo: cfg.prorrateo ?? 1, baja_voluntaria: !!cfg.baja_voluntaria, productos_estrategicos: cfg.productos_estrategicos ?? '', fecha_comunicacion: cfg.fecha_comunicacion ?? '', fecha_extraccion_prevista: cfg.fecha_extraccion_prevista ?? '' });
  const ids: [string, string][] = [...(modelo?.kpis ?? []).filter((k: any) => k.id !== 'K9_DISPONIBILIDAD' && k.id !== 'K13_CUALITATIVA').map((k: any) => [k.id, k.nombre + ' (' + k.unidad + ')']), ['K9_ONLINE', 'Online Rate (%) — mayor mejor'], ['K9_UNFULFILLED', 'Unfulfilled Order Rate (%) — menor mejor']];
  const [niv, setNiv] = useState<Record<string, any>>(Object.fromEntries(ids.map(([id]) => { const e = datos.configuracion.niveles.find((x: any) => x.kpi === id); return [id, { umbral: e?.umbral ?? '', llave: e?.llave ?? '', objetivo: e?.objetivo ?? '', excelencia: e?.excelencia ?? '' }]; })));
  const guardar = () => enviar(`config/${localId}/${periodoId}`, { config: c, niveles: ids.filter(([id]) => niv[id].umbral !== '' && niv[id].objetivo !== '' && niv[id].excelencia !== '').map(([id]) => ({ kpi: id, umbral: Number(niv[id].umbral), llave: niv[id].llave === '' ? undefined : Number(niv[id].llave), objetivo: Number(niv[id].objetivo), excelencia: Number(niv[id].excelencia) })) }, 'Configuración guardada.');
  return (
    <section className="panel">
      <h2>Configuración del periodo — carta de objetivos</h2>
      <p className="small muted">Los pesos se fijan por fórmula (perfil de canal); los umbrales, por local. Todo esto se comunica por escrito a T−15: sin comunicación previa, el KPI se liquida al 100%. {cfg.autor && <span className="chip">{cfg.autor}</span>}</p>
      <div className="form">
        <label>Importe objetivo (€)<input type="number" value={c.importe_objetivo} onChange={e => setC({ ...c, importe_objetivo: Number(e.target.value) })} /></label>
        <label>Perfil de pesos<select value={c.perfil_canal} onChange={e => setC({ ...c, perfil_canal: e.target.value })}><option>SALA</option><option>MIXTO</option><option>DELIVERY</option></select></label>
        <label>Suelo de nota de reseñas<input type="number" step="0.1" value={c.suelo_nota_resenas} onChange={e => setC({ ...c, suelo_nota_resenas: Number(e.target.value) })} /></label>
        <label>Umbral descuentos no tipificados (% ventas mes)<input type="number" step="0.01" value={c.umbral_descuentos_pct} onChange={e => setC({ ...c, umbral_descuentos_pct: Number(e.target.value) })} /></label>
        <label>Prorrateo por días efectivos (1 = trimestre completo)<input type="number" step="0.001" value={c.prorrateo} onChange={e => setC({ ...c, prorrateo: Number(e.target.value) })} /></label>
        <label><span><input type="checkbox" checked={c.baja_voluntaria} onChange={e => setC({ ...c, baja_voluntaria: e.target.checked })} /> baja voluntaria en el periodo</span></label>
        <label>Productos estratégicos (máx. 3)<input value={c.productos_estrategicos} onChange={e => setC({ ...c, productos_estrategicos: e.target.value })} /></label>
        <label>Fecha de comunicación<input type="date" value={c.fecha_comunicacion ?? ''} onChange={e => setC({ ...c, fecha_comunicacion: e.target.value })} /></label>
        <label>Fecha prevista de extracción<input type="date" value={c.fecha_extraccion_prevista ?? ''} onChange={e => setC({ ...c, fecha_extraccion_prevista: e.target.value })} /></label>
      </div>
      <h3 style={{ marginTop: 16 }}>Umbrales por KPI</h3>
      <p className="small muted">Llave (90%) se calibra a mano por KPI — no tiene por qué ser el punto medio entre Umbral y Objetivo. Déjala en blanco para que se interpole automáticamente entre los dos.</p>
      <table><thead><tr><th>KPI</th><th className="n">Umbral (50%)</th><th className="n">Llave (90%)</th><th className="n">Objetivo (100%)</th><th className="n">Excelencia (120%)</th></tr></thead><tbody>
        {ids.map(([id, t]) => <tr key={id}><td>{t}</td>{(['umbral', 'llave', 'objetivo', 'excelencia'] as const).map(k => <td className="n" key={k}><input type="number" step="any" style={{ width: 90 }} value={niv[id][k]} onChange={e => setNiv({ ...niv, [id]: { ...niv[id], [k]: e.target.value } })} /></td>)}</tr>)}
      </tbody></table>
      <div style={{ marginTop: 12 }}><button className="btn" onClick={guardar}>Guardar configuración</button></div>
      <Msg />
    </section>
  );
}
