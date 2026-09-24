import { useEffect, useState } from 'react';
import { api, post } from './api';
import { compartirDrive, descargarPdf, docChecklist } from './pdf';

function semanaActual(): string {
  const d = new Date(); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dia);
  const y = t.getUTCFullYear(); const w = Math.ceil((((t.getTime() - Date.UTC(y, 0, 1)) / 86400000) + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

type Props = {
  localId: string; localNombre: string; periodoId: string; catalogo: any[]; existentes: any[]; nombre: string;
  onGuardado: () => void; tipo?: 'MANAGER' | 'DIRECCION';
};

export function Checklist({ localId, localNombre, periodoId, catalogo, existentes, nombre, onGuardado, tipo = 'MANAGER' }: Props) {
  const esDir = tipo === 'DIRECCION';
  const ruta = `${esDir ? 'checklist-dir' : 'checklist'}/${localId}/${periodoId}`;
  const [hoja, setHoja] = useState<'A' | 'B'>('A');
  const [semana, setSemana] = useState(semanaActual());
  const [lineas, setLineas] = useState<Record<string, { estado: string; aviso: boolean; obs: string }>>({});
  const [firmaM, setFirmaM] = useState(nombre);
  const [firmaJ, setFirmaJ] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const lineasHoja = catalogo.filter(l => l.hoja === hoja);
  const existe = existentes.find(s => s.semana === semana && s.hoja === hoja);

  useEffect(() => {
    const base: typeof lineas = {};
    for (const l of lineasHoja) {
      const e = existe?.lineas?.find((x: any) => x.linea_id === l.linea_id);
      base[l.linea_id] = { estado: e?.estado ?? 'CONFORME', aviso: !!e?.aviso_en_24h, obs: e?.observacion ?? '' };
    }
    setLineas(base); setFirmaM(existe?.firma_manager ?? nombre); setFirmaJ(existe?.firma_jefe_cocina ?? '');
  }, [hoja, semana, existentes, catalogo]);

  async function guardar() {
    setMsg(null);
    try {
      await post(ruta, {
        semana, hoja, firma_manager: firmaM, firma_jefe_cocina: hoja === 'B' && !esDir ? firmaJ : null,
        lineas: Object.entries(lineas).map(([linea_id, v]) => ({ linea_id, estado: v.estado, aviso_en_24h: v.aviso, observacion: v.obs || undefined })),
      });
      setMsg({ tipo: 'ok', texto: `Checklist ${hoja} de la semana ${semana} guardado.` }); onGuardado();
    } catch (e: any) { setMsg({ tipo: 'error', texto: e.message }); }
  }
  async function borrar(s: any) {
    if (!confirm(`¿Borrar el checklist ${s.hoja} de la semana ${s.semana}?`)) return;
    try { await api(ruta, { method: 'DELETE', body: { semana: s.semana, hoja: s.hoja } }); setMsg({ tipo: 'ok', texto: 'Checklist borrado.' }); onGuardado(); }
    catch (e: any) { setMsg({ tipo: 'error', texto: e.message }); }
  }
  const editar = (s: any) => { setSemana(s.semana); setHoja(s.hoja); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const noConformesSinAviso = Object.values(lineas).filter(v => v.estado === 'NO_CONFORME' && !v.aviso).length;
  const historico = [...existentes].sort((a, b) => (a.semana === b.semana ? a.hoja.localeCompare(b.hoja) : b.semana.localeCompare(a.semana)));

  return (
    <>
      <section className="panel">
        <h2>{esDir ? 'Checklist de Dirección' : 'Checklist semanal de mantenimiento'}</h2>
        <p className="small muted">{esDir
          ? 'Revisión de Dirección con las mismas líneas. Queda registrada aparte y no cuenta en los indicadores del Manager.'
          : 'Cada línea se marca contra el criterio escrito. Una línea no conforme con aviso registrado en 24 h es válida: avisar nunca te va a perjudicar. Lo que resta es lo que Dirección encuentra y no estaba reportado.'}</p>
        <div className="form" style={{ marginBottom: 12 }}>
          <label>Hoja<select value={hoja} onChange={e => setHoja(e.target.value as 'A' | 'B')}><option value="A">A — Sala e instalaciones</option><option value="B">B — Cocina{esDir ? '' : ' (firma conjunta)'}</option></select></label>
          <label>Semana<input value={semana} onChange={e => setSemana(e.target.value)} placeholder="2026-W41" /></label>
          <label>{esDir ? 'Firma de quien revisa' : 'Firma del Manager'}<input value={firmaM} onChange={e => setFirmaM(e.target.value)} /></label>
          {hoja === 'B' && !esDir && <label>Firma del Jefe de Cocina<input value={firmaJ} onChange={e => setFirmaJ(e.target.value)} placeholder="obligatoria en la hoja B" /></label>}
        </div>
        {existe && <div className="aviso">Estás editando el checklist ya guardado de esta semana y hoja.</div>}
        {lineasHoja.length === 0 && <div className="aviso">No hay líneas en el catálogo de la hoja {hoja}.</div>}
        {lineasHoja.map(l => {
          const v = lineas[l.linea_id] ?? { estado: 'CONFORME', aviso: false, obs: '' };
          const set = (p: Partial<typeof v>) => setLineas({ ...lineas, [l.linea_id]: { ...v, ...p } });
          return (
            <div className="fila-check" key={l.linea_id}>
              <div className="fila-check-texto">{l.texto}</div>
              <select value={v.estado} onChange={e => set({ estado: e.target.value })} className={'fila-check-estado' + (v.estado === 'NO_CONFORME' ? ' nc' : '')}>
                <option value="CONFORME">Conforme</option><option value="NO_CONFORME">No conforme</option>
              </select>
              {v.estado === 'NO_CONFORME' && (
                <div className="fila-check-extra">
                  <input placeholder="Qué pasa" value={v.obs} onChange={e => set({ obs: e.target.value })} />
                  {!esDir && <label className="check"><input type="checkbox" checked={v.aviso} onChange={e => set({ aviso: e.target.checked })} /> Aviso dado en 24 h</label>}
                </div>
              )}
            </div>
          );
        })}
        {!esDir && noConformesSinAviso > 0 && <div className="aviso" style={{ marginTop: 12 }}>{noConformesSinAviso} línea(s) no conforme(s) sin aviso registrado: no serán válidas. Da el aviso y márcalo.</div>}
        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" onClick={guardar} disabled={lineasHoja.length === 0}>{existe ? 'Guardar cambios' : 'Guardar checklist'}</button>
          {msg && <span className={msg.tipo === 'ok' ? 'estado verde' : 'estado rojo'}>{msg.texto}</span>}
        </div>
      </section>

      {historico.length > 0 && (
        <section className="panel">
          <h3>Registrados</h3>
          <table>
            <thead><tr><th>Semana</th><th>Hoja</th><th>Firmas</th><th className="n">No conf.</th>{!esDir && <th className="n">Sin aviso</th>}<th></th></tr></thead>
            <tbody>{historico.map(s => (
              <tr key={s.id}>
                <td>{s.semana}</td><td>{s.hoja}</td>
                <td className="small">{s.firma_manager}{s.firma_jefe_cocina ? ' · ' + s.firma_jefe_cocina : ''}</td>
                <td className="n">{s.lineas.filter((l: any) => l.estado === 'NO_CONFORME').length}</td>
                {!esDir && <td className="n">{s.lineas.filter((l: any) => l.estado === 'NO_CONFORME' && !l.aviso_en_24h).length}</td>}
                <td className="acciones">
                  <button className="btn sec peq" onClick={() => editar(s)}>Editar</button>
                  <button className="btn sec peq" onClick={() => descargarPdf(docChecklist(s, catalogo, localNombre, tipo))}>PDF</button>
                  <button className="btn sec peq" onClick={() => compartirDrive(docChecklist(s, catalogo, localNombre, tipo))}>Drive</button>
                  <button className="btn sec peq" onClick={() => borrar(s)}>Borrar</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </>
  );
}
