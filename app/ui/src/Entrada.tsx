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
  const tabs: [string, string][] = [['ventas', 'Ventas y reseñas'], ['uber', 'Uber Eats'], ['visita', 'Visita de dirección'], ['ficha', 'Cliente misterioso'], ['direccion', 'Dirección'], ['puertas', 'Puertas y situaciones especiales'], ['config', 'Configuración']];
  return (
    <>
      <div className="pestanas">{tabs.map(([k, t]) => <button key={k} className={tab === k ? 'activa' : ''} onClick={() => setTab(k)}>{t}</button>)}</div>
      {tab === 'ventas' && <Meses {...p} />}
      {tab === 'uber' && <Uber {...p} />}
      {tab === 'visita' && <Visita {...p} />}
      {tab === 'ficha' && <Ficha {...p} />}
      {tab === 'direccion' && <Direccion {...p} />}
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
  const reales: [string, string, string][] = [
    ['facturacion_real', 'Facturación neta del mes (€)', 'Revo, sin IVA. Se suma para el KPI 1 y sirve de numerador del ticket medio.'],
    ['tickets', 'Nº de tickets del mes', 'Número de comandas/tickets cerrados en Revo. Solo sirve para calcular el ticket medio (facturación ÷ tickets).'],
    ['productos_penetracion', 'Productos estratégicos (% de la facturación)', 'Peso de la categoría estratégica sobre la facturación del mes.'],
    ['resenas_volumen', 'Reseñas recibidas en el mes (nº)', 'Joombo. Se suman para el KPI 4a.'],
    ['resenas_nota_media', 'Nota media de las reseñas del mes', 'Joombo. Se pondera por el nº de reseñas para la nota del trimestre.'],
  ];
  const reparto: [string, string, string][] = [
    ['facturacion_objetivo', 'Facturación prevista del mes (€)', 'Solo para el seguimiento a fecha: reparte el objetivo del trimestre entre los meses según estacionalidad. No cambia los umbrales de la carta.'],
    ['resenas_objetivo', 'Reseñas previstas del mes (nº)', 'Ídem para las reseñas.'],
  ];
  const Campo = ([k, t, ayuda]: [string, string, string]) => (
    <label key={k} title={ayuda}>{t}<input type="number" step="any" value={v[k] ?? ''} onChange={e => set(k, n(e.target.value))} /><span className="small muted">{ayuda}</span></label>
  );
  return (
    <section className="panel">
      <h2>Ventas y reseñas — dato mensual</h2>
      <p className="small muted">Los umbrales de facturación, ticket y reseñas están en Configuración, en valor absoluto para el trimestre. Aquí solo se cargan los datos reales de cada mes al cerrarlo. {ex.origen && <span className="chip">{ex.origen}</span>}{ex.autor && <span className="chip">{ex.autor}</span>}</p>
      <div className="form" style={{ marginBottom: 12 }}>
        <label>Mes<select value={mes} onChange={e => { setMes(e.target.value); setF(null); }}>{meses.map(m => <option key={m} value={m}>{nombreMes(m)} {m.slice(0, 4)}</option>)}</select></label>
      </div>
      <h3>Datos reales del mes (al cierre del mes)</h3>
      <div className="form" style={{ marginBottom: 16 }}>{reales.map(Campo)}</div>
      <h3>Reparto mensual del objetivo (se fija a T−15, solo para el seguimiento a fecha)</h3>
      <p className="small muted">Con esto la vista «hasta octubre» compara lo acumulado contra la parte del trimestre que tocaba haber hecho, en vez de contra el trimestre entero. Si se deja vacío, se reparte a partes iguales por meses.</p>
      <div className="form">
        {reparto.map(Campo)}
        <div className="ancho"><button className="btn" onClick={() => enviar(`mes/${localId}/${periodoId}`, { ...v, mes })}>Guardar {nombreMes(mes)}</button></div>
      </div>
      <Msg />
    </section>
  );
}

function Uber({ localId, periodoId, meses, datos, onCambio }: Props) {
  const { enviar, Msg } = useEnvio(onCambio);
  const [mes, setMes] = useState(meses[0]);
  const ex = datos.uber.find((m: any) => m.mes === mes) ?? {};
  const [f, setF] = useState<any>(null);
  const v = f ?? ex; const set = (k: string, val: any) => setF({ ...v, [k]: val });
  const campos: [string, string, string][] = [
    ['pedidos', 'Pedidos del mes', 'Para ponderar los meses entre sí.'],
    ['inaccurate_rate', 'Inaccurate Orders Rate (%)', 'KPI 7 · Precisión del pedido.'],
    ['food_quality_rate', 'Food Taste or Quality Issues (%)', 'KPI 8 · se suma con el siguiente.'],
    ['prep_delay_rate', 'Order Preparation Delays (%)', 'KPI 8 · se suma con el anterior.'],
    ['online_rate', 'Online Rate (%)', 'KPI 9 · binario: ≥ objetivo cumple, si no, 0 (salvo parada justificada).'],
    ['rating', 'Rating del periodo (1–5)', 'KPI 5 · Feedback → Overview, no Operations.'],
  ];
  return (
    <section className="panel">
      <h2>Uber Eats Manager — corte por mes</h2>
      <p className="small muted">Performance → Operations, tienda y rango del mes (máximo 31 días por descarga). Nunca la cifra del panel de Operational Excellence, que es una media móvil. Los valores se teclean tal cual salen.</p>
      <div className="form">
        <label>Mes<select value={mes} onChange={e => { setMes(e.target.value); setF(null); }}>{meses.map(m => <option key={m} value={m}>{nombreMes(m)} {m.slice(0, 4)}</option>)}</select></label>
        {campos.map(([k, t, ayuda]) => <label key={k}>{t}<input type="number" step="any" value={v[k] ?? ''} onChange={e => set(k, n(e.target.value))} /><span className="small muted">{ayuda}</span></label>)}
        <div className="ancho"><button className="btn" onClick={() => enviar(`uber/${localId}/${periodoId}`, { ...v, mes })}>Guardar {nombreMes(mes)}</button> {ex.autor && <span className="small muted">último: {ex.origen} · {ex.autor}</span>}</div>
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
  const abiertos: any[] = datos.hallazgosAbiertos ?? [];
  const texto = (h: any) => catalogo.find(c => c.linea_id === h.linea_id)?.texto ?? h.linea_id;
  return (
    <section className="panel">
      <h2>Visita de dirección</h2>
      <p className="small muted">Misma taxonomía que el checklist. Un solo juicio por hallazgo: ¿debió detectarse en el último checklist? Lo que el Manager ya había reportado no penaliza nunca. Para el KPI 11 solo cuenta si se cierra en la visita inmediatamente siguiente; cerrarlo más tarde queda registrado, pero ya no puntúa.</p>
      <div className="form">
        <label>Fecha<input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label>
        <label>Visitante<input value={visitante} onChange={e => setVisitante(e.target.value)} /></label>
        <label className="ancho">Notas de la visita<textarea rows={2} value={notas} onChange={e => setNotas(e.target.value)} /></label>
      </div>
      {abiertos.length > 0 && (
        <>
          <h3 style={{ marginTop: 14 }}>Hallazgos abiertos — ¿siguen abiertos hoy?</h3>
          {abiertos.map((h: any) => (
            <div className="fila-check" key={h.id}>
              <div>{texto(h)} <span className="muted">· detectado el {h.fecha_deteccion} por {h.visitante}</span>{h.descripcion && <div className="small muted">{h.descripcion}</div>}{h.cerrado_en_siguiente === 0 && <span className="chip fuera">no se cerró en la visita siguiente</span>}</div>
              <label className="small"><input type="radio" name={'c' + h.id} checked={cierres[h.id] === true} onChange={() => setCierres({ ...cierres, [h.id]: true })} /> cerrado</label>
              <label className="small"><input type="radio" name={'c' + h.id} checked={cierres[h.id] === false} onChange={() => setCierres({ ...cierres, [h.id]: false })} /> sigue abierto</label>
            </div>
          ))}
        </>
      )}
      <h3 style={{ marginTop: 14 }}>Hallazgos nuevos de hoy</h3>
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
        <button className="btn" onClick={() => enviar(`visita/${localId}/${periodoId}`, { fecha, visitante, notas, hallazgos, cierres: Object.entries(cierres).map(([id, c]) => ({ hallazgo_id: Number(id), cerrado: c })) }, 'Visita registrada.').then(() => { setHallazgos([]); setCierres({}); setNotas(''); })}>Registrar visita</button>
      </div>
      <Msg />
      {datos.visitas.length > 0 && <table style={{ marginTop: 14 }}><thead><tr><th>Fecha</th><th>Visitante</th><th>Notas</th><th>Hallazgos</th></tr></thead><tbody>{[...datos.visitas].reverse().map((v: any) => <tr key={v.id}><td>{v.fecha}</td><td>{v.visitante}</td><td className="small">{v.notas || <span className="muted">—</span>}</td><td>{v.hallazgos.length === 0 ? <span className="muted">ninguno</span> : v.hallazgos.map((h: any) => <div key={h.id} className="small">{texto(h)}{h.descripcion ? ` — ${h.descripcion}` : ''}{h.reportado_previamente ? ' · reportado' : ''}{!h.debio_detectarse ? ' · posterior al checklist' : ''}{h.cerrado_fecha ? ` · cerrado el ${h.cerrado_fecha}${h.cerrado_en_siguiente === 1 ? ' (en la visita siguiente)' : ''}` : ' · abierto'}</div>)}</td></tr>)}</tbody></table>}
    </section>
  );
}

function Ficha({ localId, periodoId, datos, onCambio }: Props) {
  const { enviar, Msg } = useEnvio(onCambio);
  const [f, setF] = useState<any>({ fecha: new Date().toISOString().slice(0, 10), evaluador: '', sala: '', producto: '', detalle: '' });
  const ok = (x: string) => x === '' || (Number(x) >= 1 && Number(x) <= 10);
  return (
    <section className="panel">
      <h2>Cliente misterioso interno</h2>
      <p className="small muted">Ficha cerrada e idéntica para todos, rellenada antes de identificarse. Notas de 1 a 10 con un decimal. Producto solo si hubo consumición. Mínimo dos fichas por trimestre para que compute.</p>
      <div className="form">
        <label>Fecha<input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></label>
        <label>Evaluador<input value={f.evaluador} onChange={e => setF({ ...f, evaluador: e.target.value })} placeholder="dirección o conocido" /></label>
        <label>Sala y experiencia (1–10)<input type="number" min={1} max={10} step={0.1} value={f.sala} onChange={e => setF({ ...f, sala: e.target.value })} /></label>
        <label>Producto (1–10, vacío si no hubo consumición)<input type="number" min={1} max={10} step={0.1} value={f.producto} onChange={e => setF({ ...f, producto: e.target.value })} /></label>
        <label className="ancho">Detalle<textarea rows={2} value={f.detalle} onChange={e => setF({ ...f, detalle: e.target.value })} placeholder="qué se vio, qué falló, qué destacó" /></label>
        <div className="ancho"><button className="btn" disabled={f.sala === '' || !ok(f.sala) || !ok(f.producto)} onClick={() => enviar(`ficha/${localId}/${periodoId}`, { ...f, sala: Math.round(Number(f.sala) * 10) / 10, producto: f.producto === '' ? null : Math.round(Number(f.producto) * 10) / 10 }, 'Ficha registrada.').then(() => setF({ ...f, sala: '', producto: '', detalle: '' }))}>Registrar ficha</button>{(!ok(f.sala) || !ok(f.producto)) && <span className="estado rojo small"> Las notas van de 1 a 10.</span>}</div>
      </div>
      <Msg />
      {datos.fichas.length > 0 && <table style={{ marginTop: 14 }}><thead><tr><th>Fecha</th><th>Evaluador</th><th className="n">Sala</th><th className="n">Producto</th><th>Detalle</th></tr></thead><tbody>{datos.fichas.map((x: any) => <tr key={x.id}><td>{x.fecha}</td><td>{x.evaluador}</td><td className="n">{x.sala}</td><td className="n">{x.producto ?? '—'}</td><td className="small">{x.detalle || <span className="muted">—</span>}</td></tr>)}</tbody></table>}
    </section>
  );
}

function Direccion({ localId, periodoId, datos, onCambio }: Props) {
  const { enviar, Msg } = useEnvio(onCambio);
  const vacio = { tipo: 'REPORTE', descripcion: '', fecha_limite: '', fecha_cumplido: '' };
  const [c, setC] = useState<any>(vacio);
  const q = datos.cualitativa ?? {};
  const [nota, setNota] = useState<string>(q.nota ?? '');
  const [just, setJust] = useState<string>(q.justificacion ?? '');
  const notaOk = nota === '' || (Number(nota) >= 1 && Number(nota) <= 10);
  return (
    <>
      <section className="panel">
        <h2>Compromisos con dirección</h2>
        <p className="small muted">Iniciativas corporativas (KPI 12a) y reportes (KPI 12b), cada uno con su fecha límite. Está en plazo si la fecha de cumplimiento no supera la límite. Las iniciativas se van acordando mes a mes durante el trimestre.</p>
        <div className="form">
          <label>Tipo<select value={c.tipo} onChange={e => setC({ ...c, tipo: e.target.value })}><option value="REPORTE">Reporte</option><option value="INICIATIVA">Iniciativa corporativa</option></select></label>
          <label>Descripción<input value={c.descripcion} onChange={e => setC({ ...c, descripcion: e.target.value })} /></label>
          <label>Fecha límite<input type="date" value={c.fecha_limite} onChange={e => setC({ ...c, fecha_limite: e.target.value })} /></label>
          <label>Cumplido el<input type="date" value={c.fecha_cumplido} onChange={e => setC({ ...c, fecha_cumplido: e.target.value })} /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={!c.descripcion || !c.fecha_limite} onClick={() => enviar(`compromiso/${localId}/${periodoId}`, { ...c, fecha_cumplido: c.fecha_cumplido || null }, c.id ? 'Compromiso actualizado.' : 'Compromiso guardado.').then(() => setC(vacio))}>{c.id ? 'Guardar cambios' : 'Añadir'}</button>
            {c.id && <button className="btn sec" onClick={() => setC(vacio)}>Cancelar</button>}
          </div>
        </div>
        <Msg />
        {datos.compromisos.length > 0 && <table style={{ marginTop: 14 }}><thead><tr><th>Tipo</th><th>Descripción</th><th>Límite</th><th>Cumplido</th><th></th></tr></thead><tbody>{datos.compromisos.map((x: any) => <tr key={x.id}><td>{x.tipo === 'REPORTE' ? 'Reporte' : 'Iniciativa'}</td><td>{x.descripcion}</td><td>{x.fecha_limite}</td><td>{x.fecha_cumplido ? <span className={x.fecha_cumplido <= x.fecha_limite ? 'estado verde' : 'estado rojo'}>{x.fecha_cumplido}</span> : <span className="muted">pendiente</span>}</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn sec peq" onClick={() => setC({ id: x.id, tipo: x.tipo, descripcion: x.descripcion, fecha_limite: x.fecha_limite, fecha_cumplido: x.fecha_cumplido ?? '' })}>Editar</button> <button className="btn sec peq" onClick={() => { if (confirm('¿Borrar este compromiso?')) enviar(`compromiso/${localId}/${periodoId}/${x.id}`, {}, 'Compromiso borrado.', 'DELETE'); }}>Borrar</button></td></tr>)}</tbody></table>}
      </section>
      <section className="panel">
        <h2>Valoración cualitativa de dirección (KPI 13)</h2>
        <p className="small muted">Nota de 1 a 10 con un decimal, igual que el cliente misterioso, con los mismos niveles que están en Configuración (por defecto 6 · 7 · 8 · 10). Se da por escrito al cierre del trimestre, con la justificación: anticipación, calidad del análisis, liderazgo del local completo, equipo y planificación. Hasta que se cargue, el KPI cuenta 0 y la vista lo marca como pendiente. Se puede reclamar como cualquier otro indicador.</p>
        <div className="form">
          <label>Nota (1–10)<input type="number" min={1} max={10} step={0.1} value={nota} onChange={e => setNota(e.target.value)} /></label>
          <label className="ancho">Justificación (obligatoria)<textarea rows={4} value={just} onChange={e => setJust(e.target.value)} placeholder="En qué se basa la nota, con ejemplos concretos del trimestre" /></label>
          <div className="ancho"><button className="btn" disabled={nota === '' || !notaOk || !just.trim()} onClick={() => enviar(`cualitativa/${localId}/${periodoId}`, { nota: Number(nota), justificacion: just }, 'Valoración guardada.')}>Guardar valoración</button>{!notaOk && <span className="estado rojo small"> La nota va de 1 a 10.</span>}{q.evaluador && <span className="small muted"> · última: {q.nota} por {q.evaluador} el {String(q.ts).slice(0, 10)}</span>}</div>
        </div>
      </section>
    </>
  );
}

function Puertas({ localId, periodoId, datos, modelo, onCambio }: Props) {
  const { enviar, Msg } = useEnvio(onCambio);
  const p = datos.puertas ?? {};
  const cfg = datos.configuracion.config ?? {};
  const [f, setF] = useState<any>({ seguridad_alimentaria: p.seguridad_alimentaria ?? 1, reporting_semanas_en_plazo: p.reporting_semanas_en_plazo ?? '', control_caja: p.control_caja ?? 1, integridad: p.integridad ?? 1, notas: p.notas ?? '' });
  const [sit, setSit] = useState<any>({ baja_voluntaria: !!cfg.baja_voluntaria, fecha_alta: cfg.fecha_alta ?? '', fecha_baja: cfg.fecha_baja ?? '', dias_it: cfg.dias_it ?? 0 });
  const [nz, setNz] = useState<any>({ kpi: 'K8_COCINA', motivo: 'ESCALADO_SIN_RESOLUCION', evidencia: '' });
  return (
    <>
      <section className="panel">
        <h2>Puertas de acceso</h2>
        <p className="small muted">Si alguna falla, el trimestre es cero con independencia de la nota y de las llaves.</p>
        <div className="form">
          <label><span><input type="checkbox" checked={!!f.seguridad_alimentaria} onChange={e => setF({ ...f, seguridad_alimentaria: e.target.checked ? 1 : 0 })} /> Seguridad alimentaria: sin no conformidad crítica abierta y no escalada</span></label>
          <label>Reporting: semanas con cierre e inventario en plazo (de 13; ≥11 supera)<input type="number" value={f.reporting_semanas_en_plazo} onChange={e => setF({ ...f, reporting_semanas_en_plazo: e.target.value })} /></label>
          <label><span><input type="checkbox" checked={!!f.control_caja} onChange={e => setF({ ...f, control_caja: e.target.checked ? 1 : 0 })} /> Control de caja: sin descuadres no justificados</span></label>
          <label><span><input type="checkbox" checked={!!f.integridad} onChange={e => setF({ ...f, integridad: e.target.checked ? 1 : 0 })} /> Integridad: sin expediente firme por falta grave</span></label>
          <label className="ancho">Notas<input value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} /></label>
          <div><button className="btn" onClick={() => enviar(`config/${localId}/${periodoId}`, { config: {}, puertas: { ...f, reporting_semanas_en_plazo: n(f.reporting_semanas_en_plazo) } }, 'Puertas guardadas.')}>Guardar puertas</button></div>
        </div>
        <Msg />
      </section>
      <section className="panel">
        <h2>Situaciones especiales (carta §9)</h2>
        <p className="small muted">Baja voluntaria: pierde el complemento entero del trimestre. Incapacidad temporal de más de 15 días: prorrateo por tiempo efectivo. Alta o baja dentro del periodo: prorrateo por días. Cubrir otro local no cambia nada: los objetivos siguen siendo los de esta carta.</p>
        <div className="form">
          <label><span><input type="checkbox" checked={sit.baja_voluntaria} onChange={e => setSit({ ...sit, baja_voluntaria: e.target.checked })} /> Baja voluntaria en el periodo (complemento 0)</span></label>
          <label>Días de incapacidad temporal en el trimestre<input type="number" min={0} value={sit.dias_it} onChange={e => setSit({ ...sit, dias_it: e.target.value })} /><span className="small muted">Solo prorratea si son más de 15.</span></label>
          <label>Fecha de alta en el puesto (si es dentro del trimestre)<input type="date" value={sit.fecha_alta} onChange={e => setSit({ ...sit, fecha_alta: e.target.value })} /></label>
          <label>Fecha de baja (si es dentro del trimestre)<input type="date" value={sit.fecha_baja} onChange={e => setSit({ ...sit, fecha_baja: e.target.value })} /></label>
          <div className="ancho"><button className="btn" onClick={() => enviar(`config/${localId}/${periodoId}`, { config: { baja_voluntaria: sit.baja_voluntaria ? 1 : 0, dias_it: Number(sit.dias_it) || 0, fecha_alta: sit.fecha_alta || null, fecha_baja: sit.fecha_baja || null } }, 'Situaciones guardadas. El prorrateo se ha recalculado.')}>Guardar situaciones</button> <span className="small muted">Prorrateo actual: × {Number(cfg.prorrateo ?? 1).toFixed(3)}</span></div>
        </div>
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
  const [c, setC] = useState<any>({ importe_objetivo: cfg.importe_objetivo ?? 1500, perfil_canal: cfg.perfil_canal ?? 'MIXTO', suelo_nota_resenas: cfg.suelo_nota_resenas ?? 4, umbral_descuentos_pct: cfg.umbral_descuentos_pct ?? 0.3, productos_estrategicos: cfg.productos_estrategicos ?? '', fecha_comunicacion: cfg.fecha_comunicacion ?? '', fecha_extraccion_prevista: cfg.fecha_extraccion_prevista ?? '' });
  const kpis: any[] = modelo?.kpis ?? [];
  const [niv, setNiv] = useState<Record<string, any>>(Object.fromEntries(kpis.map(k => { const e = datos.configuracion.niveles.find((x: any) => x.kpi === k.id); return [k.id, { umbral: e?.umbral ?? '', llave: e?.llave ?? '', objetivo: e?.objetivo ?? '', excelencia: e?.excelencia ?? '' }]; })));
  const guardar = () => enviar(`config/${localId}/${periodoId}`, { config: c, niveles: kpis.filter(k => k.id === 'K9_DISPONIBILIDAD' ? niv[k.id].objetivo !== '' : (niv[k.id].umbral !== '' && niv[k.id].objetivo !== '' && niv[k.id].excelencia !== '')).map(k => k.id === 'K9_DISPONIBILIDAD'
    ? { kpi: k.id, umbral: 0, objetivo: Number(niv[k.id].objetivo), excelencia: Number(niv[k.id].objetivo) }
    : { kpi: k.id, umbral: Number(niv[k.id].umbral), llave: niv[k.id].llave === '' ? undefined : Number(niv[k.id].llave), objetivo: Number(niv[k.id].objetivo), excelencia: Number(niv[k.id].excelencia) }) }, 'Configuración guardada.');
  let bloqueAnterior = '';
  return (
    <section className="panel">
      <h2>Configuración del periodo — carta de objetivos</h2>
      <p className="small muted">Los pesos se fijan por fórmula (perfil de canal); los umbrales, por local, en las unidades de cada indicador. Todo esto se comunica por escrito a T−15. {cfg.autor && <span className="chip">{cfg.autor}</span>}</p>
      <div className="form">
        <label>Importe objetivo (€)<input type="number" value={c.importe_objetivo} onChange={e => setC({ ...c, importe_objetivo: Number(e.target.value) })} /></label>
        <label>Perfil de pesos<select value={c.perfil_canal} onChange={e => setC({ ...c, perfil_canal: e.target.value })}><option>SALA</option><option>MIXTO</option><option>DELIVERY</option></select></label>
        <label>Suelo de nota de reseñas<input type="number" step="0.1" value={c.suelo_nota_resenas} onChange={e => setC({ ...c, suelo_nota_resenas: Number(e.target.value) })} /><span className="small muted">Bajo este valor el volumen de reseñas no computa (su peso pasa a la nota).</span></label>
        <label>Umbral descuentos no tipificados (% ventas del mes)<input type="number" step="0.01" value={c.umbral_descuentos_pct} onChange={e => setC({ ...c, umbral_descuentos_pct: Number(e.target.value) })} /></label>
        <label>Producto o categoría estratégica<input value={c.productos_estrategicos} onChange={e => setC({ ...c, productos_estrategicos: e.target.value })} placeholder="p. ej. Entrantes y para compartir" /></label>
        <label>Fecha de comunicación<input type="date" value={c.fecha_comunicacion ?? ''} onChange={e => setC({ ...c, fecha_comunicacion: e.target.value })} /></label>
        <label>Fecha prevista de extracción<input type="date" value={c.fecha_extraccion_prevista ?? ''} onChange={e => setC({ ...c, fecha_extraccion_prevista: e.target.value })} /></label>
      </div>
      <h3 style={{ marginTop: 16 }}>Umbrales por KPI</h3>
      <p className="small muted">Cuatro puntos por indicador: Umbral (paga 50%), Llave (90%: lo que hay que sostener para no romper la llave del bloque), Objetivo (100%) y Excelencia (120%, tope). La Llave se calibra a mano; si se deja vacía se interpola entre Umbral y Objetivo. En los KPIs donde menos es mejor (precisión, incidencias) el Umbral es el valor más alto. Disponibilidad es binaria: solo tiene Objetivo.</p>
      <table><thead><tr><th>KPI</th><th className="n">Umbral (50%)</th><th className="n">Llave (90%)</th><th className="n">Objetivo (100%)</th><th className="n">Excelencia (120%)</th></tr></thead><tbody>
        {kpis.map(k => {
          const cab = k.bloque !== bloqueAnterior ? <tr key={'b' + k.bloque}><td colSpan={5} className="small muted" style={{ paddingTop: 12 }}><strong>{{ VENTAS: 'Ventas', ATENCION: 'Atención al cliente', OPERACIONES: 'Operaciones de canal', MANTENIMIENTO: 'Mantenimiento', DIRECCION: 'Dirección' }[k.bloque as string]}</strong></td></tr> : null;
          bloqueAnterior = k.bloque;
          const binario = k.id === 'K9_DISPONIBILIDAD';
          return [cab, (
            <tr key={k.id}><td>{k.nombre} <span className="small muted">· {k.peso}% · {k.unidad}</span></td>
              {(['umbral', 'llave', 'objetivo', 'excelencia'] as const).map(col => <td className="n" key={col}>{binario && col !== 'objetivo' ? <span className="muted">—</span> : <input type="number" step="any" style={{ width: 96 }} value={niv[k.id][col]} onChange={e => setNiv({ ...niv, [k.id]: { ...niv[k.id], [col]: e.target.value } })} />}</td>)}
            </tr>
          )];
        })}
      </tbody></table>
      <div style={{ marginTop: 12 }}><button className="btn" onClick={guardar}>Guardar configuración</button></div>
      <Msg />
      <h3 style={{ marginTop: 24 }}>Vaciar datos del periodo</h3>
      <p className="small muted">Borra meses, Uber, checklists, visitas, fichas, compromisos, valoración, neutralizaciones y cierre de este local en este periodo. Conserva la configuración y los umbrales. Sirve para quitar los datos de ejemplo del sembrado antes de empezar de verdad.</p>
      <button className="btn sec" onClick={() => { const t = prompt(`Escribe ${localId} para confirmar el borrado de los datos de ${periodoId}`); if (t === localId) enviar(`vaciar/${localId}/${periodoId}`, { confirmar: t }, 'Datos vaciados.'); }}>Vaciar datos operativos…</button>
    </section>
  );
}
