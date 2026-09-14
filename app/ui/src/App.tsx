import { useCallback, useEffect, useState } from 'react';
import { api, eur, getToken, nombreMes, num, post, setToken } from './api';
import { Detalle } from './Detalle';
import { Checklist } from './Checklist';
import { Entrada } from './Entrada';

type Yo = { rol: 'DIRECCION' | 'MANAGER'; local_id: string | null; nombre: string };

export function App() {
  const [yo, setYo] = useState<Yo | null>(null);
  const [cargando, setCargando] = useState(!!getToken());
  useEffect(() => { if (getToken()) api<Yo>('yo').then(setYo).catch(() => setToken('')).finally(() => setCargando(false)); }, []);
  if (cargando) return null;
  if (!yo) return <Login onOk={setYo} />;
  return <Shell yo={yo} salir={() => { setToken(''); setYo(null); }} />;
}

function Login({ onOk }: { onOk: (y: Yo) => void }) {
  const [t, setT] = useState(''); const [err, setErr] = useState('');
  const entrar = async () => { try { setToken(t); onOk(await post<Yo>('login', { token: t })); } catch (e: any) { setToken(''); setErr(e.message); } };
  return (
    <div className="login">
      <h1>Complemento de Manager</h1>
      <p className="muted">Juancho's BBQ · seguimiento del complemento de puesto</p>
      <input placeholder="Código de acceso" value={t} onChange={e => setT(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()} autoFocus />
      {err && <div className="error">{err}</div>}
      <button className="btn" onClick={entrar}>Entrar</button>
    </div>
  );
}

function Shell({ yo, salir }: { yo: Yo; salir: () => void }) {
  const [periodos, setPeriodos] = useState<any[]>([]);
  const [periodoId, setPeriodoId] = useState('');
  const [locales, setLocales] = useState<any[]>([]);
  const [localId, setLocalId] = useState(yo.local_id ?? '');
  const [hasta, setHasta] = useState<string>('');
  const [modelo, setModelo] = useState<any>(null);
  const [catalogo, setCatalogo] = useState<any[]>([]);
  useEffect(() => {
    Promise.all([api('periodos'), api('locales'), api('modelo'), api('catalogo')]).then(([p, l, m, c]) => {
      setPeriodos(p); setLocales(l); setModelo(m); setCatalogo(c);
      const per = p[0]; setPeriodoId(per?.id ?? '');
      const hoy = new Date().toISOString().slice(0, 7);
      const mesesP: string[] = per?.meses ?? [];
      setHasta(mesesP.includes(hoy) ? hoy : (hoy < mesesP[0] ? mesesP[0] : ''));
    });
  }, []);
  const periodo = periodos.find(p => p.id === periodoId);
  return (
    <>
      <header className="cabecera">
        <span className="marca">Juancho's BBQ · Complemento de Manager</span>
        <span className="sep" />
        {periodos.length > 1 && <select value={periodoId} onChange={e => setPeriodoId(e.target.value)}>{periodos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>}
        {periodo && <select value={hasta} onChange={e => setHasta(e.target.value)} aria-label="Corte">{periodo.meses.map((m: string) => <option key={m} value={m}>hasta {nombreMes(m)}</option>)}<option value="">trimestre completo</option></select>}
        <span>{yo.nombre}</span>
        <button onClick={salir}>Salir</button>
      </header>
      <main className="contenido">
        {periodo && yo.rol === 'DIRECCION' && !localId && <Resumen periodoId={periodoId} hasta={hasta} onLocal={setLocalId} />}
        {periodo && localId && <Local yo={yo} localId={localId} periodo={periodo} hasta={hasta} modelo={modelo} catalogo={catalogo} locales={locales} volver={yo.rol === 'DIRECCION' ? () => setLocalId('') : undefined} />}
      </main>
    </>
  );
}

function Resumen({ periodoId, hasta, onLocal }: { periodoId: string; hasta: string; onLocal: (id: string) => void }) {
  const [filas, setFilas] = useState<any[] | null>(null);
  useEffect(() => { setFilas(null); api(`resumen/${periodoId}${hasta ? '?hasta=' + hasta : ''}`).then(setFilas); }, [periodoId, hasta]);
  if (!filas) return <p className="muted">Calculando…</p>;
  const total = filas.filter(f => f.ok).reduce((s, f) => s + f.pago, 0);
  return (
    <>
      <h1>Los locales del modelo{hasta ? ` · acumulado hasta ${nombreMes(hasta)}` : ' · trimestre completo'}</h1>
      <p className="muted">Cuatro cuadrados por local son las cuatro llaves. Rojo es una llave rota hoy; ámbar cumple sin margen. Pulsa un local para ver el desglose y cargar datos.</p>
      <section className="panel">
        <table className="resumen-locales">
          <thead><tr><th>Local</th><th>Manager</th><th>Llaves</th><th className="n">Ventas</th><th className="n">Atención</th><th className="n">Operaciones</th><th className="n">Mantenim.</th><th className="n">Dirección</th><th className="n">Nota</th><th className="n">Complemento</th></tr></thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.local.id} className="fila-local" onClick={() => onLocal(f.local.id)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && onLocal(f.local.id)}>
                <td><strong>{f.local.nombre}</strong>{!f.local.en_piloto && <span className="chip"> se mide, no se paga</span>}</td>
                <td>{f.manager ?? <span className="muted">—</span>}</td>
                {f.ok ? (<>
                  <td><span className="llaves">{f.bloques.filter((b: any) => b.esLlave).map((b: any) => <span key={b.bloque} className={'llave ' + (b.llaveCumplida ? b.semaforo : 'rojo')} title={`${b.nombre}: ${b.logro} %`} />)}</span></td>
                  {f.bloques.map((b: any) => <td className="n" key={b.bloque}>{num(b.logro)} %</td>)}
                  <td className="n"><strong>{num(f.logro)} %</strong></td>
                  <td className="n"><strong>{eur(f.pago)}</strong>{!f.puertas && <div className="estado rojo small">puerta no superada</div>}{f.llaves < 4 && f.puertas && <div className="estado ambar small">{f.llaves} de 4 llaves</div>}</td>
                </>) : <td colSpan={8} className="muted">{f.error}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={9} className="muted">Total estimado</td><td className="n"><strong>{eur(total)}</strong></td></tr></tfoot>
        </table>
      </section>
    </>
  );
}

function Local({ yo, localId, periodo, hasta, modelo, catalogo, locales, volver }: { yo: Yo; localId: string; periodo: any; hasta: string; modelo: any; catalogo: any[]; locales: any[]; volver?: () => void }) {
  const [calc, setCalc] = useState<any>(null);
  const [datos, setDatos] = useState<any>(null);
  const [err, setErr] = useState('');
  const [vista, setVista] = useState<'seguimiento' | 'checklist' | 'datos' | 'cierre'>('seguimiento');
  const local = locales.find(l => l.id === localId);
  const cargar = useCallback(() => {
    setErr('');
    api(`calculo/${localId}/${periodo.id}${hasta ? '?hasta=' + hasta : ''}`).then(setCalc).catch(e => { setCalc(null); setErr(e.message); });
    api(`datos/${localId}/${periodo.id}`).then(setDatos).catch(() => setDatos(null));
  }, [localId, periodo.id, hasta]);
  useEffect(cargar, [cargar]);
  const ilustrativo = datos && [datos.meses, datos.uber, datos.configuracion?.niveles].some((xs: any[]) => xs?.some?.((x: any) => x?.autor === 'ILUSTRATIVO')) || datos?.configuracion?.config?.autor === 'ILUSTRATIVO';
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        {volver && <button className="btn sec peq" onClick={volver}>← Todos los locales</button>}
        <h1>{local?.nombre ?? localId}{local?.manager ? <span className="muted"> · {local.manager}</span> : null}</h1>
        <span className="muted">{periodo.nombre}{hasta ? ` · hasta ${nombreMes(hasta)}` : ' · trimestre completo'}</span>
      </div>
      <div className="pestanas">
        <button className={vista === 'seguimiento' ? 'activa' : ''} onClick={() => setVista('seguimiento')}>Seguimiento</button>
        <button className={vista === 'checklist' ? 'activa' : ''} onClick={() => setVista('checklist')}>Checklist semanal</button>
        {yo.rol === 'DIRECCION' && <button className={vista === 'datos' ? 'activa' : ''} onClick={() => setVista('datos')}>Cargar datos y configurar</button>}
        {yo.rol === 'DIRECCION' && <button className={vista === 'cierre' ? 'activa' : ''} onClick={() => setVista('cierre')}>Cierre del trimestre</button>}
      </div>
      {ilustrativo && <div className="aviso">Este local tiene datos o umbrales marcados como ilustrativos (sembrado de ejemplo). No son cifras de la empresa: sustitúyelos por los de la carta de objetivos y los reales.</div>}
      {err && <div className="error">{err}{yo.rol === 'DIRECCION' && ' — completa la configuración en «Cargar datos y configurar».'}</div>}
      {vista === 'seguimiento' && calc && <Detalle calc={calc} modelo={modelo} rol={yo.rol} />}
      {vista === 'checklist' && datos && <Checklist localId={localId} periodoId={periodo.id} catalogo={catalogo} existentes={datos.checklists} nombre={yo.nombre} onGuardado={cargar} />}
      {vista === 'checklist' && datos && datos.checklists.length > 0 && (
        <section className="panel"><h3>Semanas registradas</h3><table><thead><tr><th>Semana</th><th>Hoja</th><th>Firmas</th><th className="n">No conformes</th><th className="n">Sin aviso</th></tr></thead><tbody>
          {datos.checklists.map((s: any) => <tr key={s.id}><td>{s.semana}</td><td>{s.hoja}</td><td>{s.firma_manager}{s.firma_jefe_cocina ? ' · ' + s.firma_jefe_cocina : ''}</td><td className="n">{s.lineas.filter((l: any) => l.estado === 'NO_CONFORME').length}</td><td className="n">{s.lineas.filter((l: any) => l.estado === 'NO_CONFORME' && !l.aviso_en_24h).length}</td></tr>)}
        </tbody></table></section>
      )}
      {vista === 'datos' && datos && yo.rol === 'DIRECCION' && <Entrada localId={localId} periodoId={periodo.id} meses={periodo.meses} datos={datos} modelo={modelo} catalogo={catalogo} nombre={yo.nombre} onCambio={cargar} />}
      {vista === 'cierre' && datos && yo.rol === 'DIRECCION' && <Cierre localId={localId} periodoId={periodo.id} datos={datos} onCambio={cargar} />}
    </>
  );
}

function Cierre({ localId, periodoId, datos, onCambio }: { localId: string; periodoId: string; datos: any; onCambio: () => void }) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState('');
  const liq = datos.liquidacion;
  return (
    <section className="panel">
      <h2>Cierre del trimestre</h2>
      <p className="small muted">T+15: extracción con fecha documentada, neutralizaciones y cálculo definitivo. El cierre guarda una foto del resultado con la fecha de extracción; lo que se pague sale de esa foto, no del cálculo en vivo. Se puede repetir si hay reclamación estimada.</p>
      {liq && <div className="ok">Liquidación cerrada el {liq.ts.slice(0, 10)} por {liq.cerrada_por} con extracción del {liq.fecha_extraccion}: <strong>{eur(liq.resultado.pago)}</strong> ({num(liq.resultado.logroPonderado)} % · {liq.resultado.llavesCumplidas} de 4 llaves).</div>}
      <div className="form">
        <label>Fecha de extracción de datos<input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label>
        <div><button className="btn" onClick={async () => { try { const r = await post(`liquidar/${localId}/${periodoId}`, { fecha_extraccion: fecha }); setMsg(`Cerrado: ${eur(r.resultado.pago)}.`); onCambio(); } catch (e: any) { setMsg(e.message); } }}>{liq ? 'Volver a cerrar (sustituye la foto)' : 'Cerrar liquidación'}</button></div>
      </div>
      {msg && <p>{msg}</p>}
    </section>
  );
}
