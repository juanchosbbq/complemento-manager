import { useEffect, useState } from 'react';
import { api, post } from './api';

function semanaActual(): string {
  const d = new Date(); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dia);
  const y = t.getUTCFullYear(); const w = Math.ceil((((t.getTime() - Date.UTC(y, 0, 1)) / 86400000) + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

export function Checklist({ localId, periodoId, catalogo, existentes, nombre, onGuardado }: { localId: string; periodoId: string; catalogo: any[]; existentes: any[]; nombre: string; onGuardado: () => void }) {
  const [hoja, setHoja] = useState<'A' | 'B'>('A');
  const [semana, setSemana] = useState(semanaActual());
  const [lineas, setLineas] = useState<Record<string, { estado: string; aviso: boolean; obs: string }>>({});
  const [firmaM, setFirmaM] = useState(nombre);
  const [firmaJ, setFirmaJ] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const lineasHoja = catalogo.filter(l => l.hoja === hoja);

  useEffect(() => {
    const ex = existentes.find(s => s.semana === semana && s.hoja === hoja);
    const base: typeof lineas = {};
    for (const l of lineasHoja) {
      const e = ex?.lineas?.find((x: any) => x.linea_id === l.linea_id);
      base[l.linea_id] = { estado: e?.estado ?? 'CONFORME', aviso: !!e?.aviso_en_24h, obs: e?.observacion ?? '' };
    }
    setLineas(base); setFirmaM(ex?.firma_manager ?? nombre); setFirmaJ(ex?.firma_jefe_cocina ?? '');
  }, [hoja, semana, existentes, catalogo]);

  async function guardar() {
    setMsg(null);
    try {
      await post(`checklist/${localId}/${periodoId}`, {
        semana, hoja, firma_manager: firmaM, firma_jefe_cocina: hoja === 'B' ? firmaJ : null,
        lineas: Object.entries(lineas).map(([linea_id, v]) => ({ linea_id, estado: v.estado, aviso_en_24h: v.aviso, observacion: v.obs || undefined })),
      });
      setMsg({ tipo: 'ok', texto: `Checklist ${hoja} de la semana ${semana} guardado.` }); onGuardado();
    } catch (e: any) { setMsg({ tipo: 'error', texto: e.message }); }
  }
  const noConformesSinAviso = Object.values(lineas).filter(v => v.estado === 'NO_CONFORME' && !v.aviso).length;

  return (
    <section className="panel">
      <h2>Checklist semanal de mantenimiento</h2>
      <p className="small muted">Cada línea se marca contra el criterio escrito. Una línea no conforme con aviso registrado en 24 h es válida: avisar nunca te va a perjudicar. Lo que resta es lo que dirección encuentra y no estaba reportado.</p>
      <div className="form" style={{ marginBottom: 12 }}>
        <label>Hoja<select value={hoja} onChange={e => setHoja(e.target.value as 'A' | 'B')}><option value="A">A — Sala e instalaciones comunes</option><option value="B">B — Cocina (firma conjunta)</option></select></label>
        <label>Semana<input value={semana} onChange={e => setSemana(e.target.value)} placeholder="2026-W41" /></label>
        <label>Firma del Manager<input value={firmaM} onChange={e => setFirmaM(e.target.value)} /></label>
        {hoja === 'B' && <label>Firma del Jefe de Cocina<input value={firmaJ} onChange={e => setFirmaJ(e.target.value)} placeholder="obligatoria en la hoja B" /></label>}
      </div>
      {lineasHoja.length === 0 && <div className="aviso">No hay líneas en el catálogo de la hoja {hoja}. Dirección tiene que cargarlas.</div>}
      {lineasHoja.map(l => {
        const v = lineas[l.linea_id] ?? { estado: 'CONFORME', aviso: false, obs: '' };
        const set = (p: Partial<typeof v>) => setLineas({ ...lineas, [l.linea_id]: { ...v, ...p } });
        return (
          <div className="fila-check" key={l.linea_id}>
            <div>{l.texto}{v.estado === 'NO_CONFORME' && <input style={{ display: 'block', marginTop: 4, width: '100%' }} placeholder="Qué pasa" value={v.obs} onChange={e => set({ obs: e.target.value })} />}</div>
            <select value={v.estado} onChange={e => set({ estado: e.target.value })} className={v.estado === 'NO_CONFORME' ? 'nc' : ''}><option value="CONFORME">Conforme</option><option value="NO_CONFORME">No conforme</option></select>
            <label className="small" style={{ visibility: v.estado === 'NO_CONFORME' ? 'visible' : 'hidden' }}><input type="checkbox" checked={v.aviso} onChange={e => set({ aviso: e.target.checked })} /> aviso dado en 24 h</label>
          </div>
        );
      })}
      {noConformesSinAviso > 0 && <div className="aviso" style={{ marginTop: 12 }}>{noConformesSinAviso} línea(s) no conforme(s) sin aviso registrado: no serán válidas. Da el aviso y márcalo.</div>}
      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn" onClick={guardar} disabled={lineasHoja.length === 0}>Guardar checklist</button>
        {existentes.some(s => s.semana === semana && s.hoja === hoja) && (
          <button className="btn sec" onClick={async () => {
            if (!confirm(`¿Borrar el checklist ${hoja} de la semana ${semana}?`)) return;
            try { await api(`checklist/${localId}/${periodoId}`, { method: 'DELETE', body: { semana, hoja } }); setMsg({ tipo: 'ok', texto: 'Checklist borrado.' }); onGuardado(); }
            catch (e: any) { setMsg({ tipo: 'error', texto: e.message }); }
          }}>Borrar esta semana</button>
        )}
        {msg && <span className={msg.tipo === 'ok' ? 'estado verde' : 'estado rojo'}>{msg.texto}</span>}
      </div>
    </section>
  );
}
