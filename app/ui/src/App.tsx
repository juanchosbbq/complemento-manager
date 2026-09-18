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
      <h1>Juancho's <b>BBQ</b></h1>
      <p className="muted">Complemento de puesto de Manager · seguimiento</p>
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
        <span className="marca">Juancho's <b>BBQ</b> · Complemento de Manager</span>
        <span className="sep" />
        {periodos.length > 1 && <select value={periodoId} onChange={e => setPeriodoId(e.target.value)}>{periodos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>}
        {periodo && <select value={hasta} onChange={e => setHasta(e.target.value)} aria-label="Corte">{periodo.meses.map((m: string) => <option key={m} value={m}>hasta {nombreMes(m)}</option>)}<option value="">trimestre completo</option></select>}
        <span>{yo.nombre}</span>
        <button onClick={salir}>Salir</button>
      </header>
      <main className="contenido">
        {periodo && yo.rol === 'DIRECCION' && !localId && <><Resumen periodoId={periodoId} hasta={hasta} onLocal={setLocalId} /><EstadoCarga periodoId={periodoId} onLocal={setLocalId} /></>}
        {periodo && localId && <Local yo={yo} localId={localId} periodo={periodo} hasta={hasta} modelo={modelo} catalogo={catalogo} locales={locales} volver={yo.rol === 'DIRECCION' ? () => setLocalId('') : undefined} />}
      </main>
    </>
  );
}

const COLOR_SEMAFORO: Record<string, string> = { verde: 'var(--verde)', ambar: 'var(--ambar)', rojo: 'var(--rojo)' };

/** Símbolo de cada bloque troncal: euro (ventas), estrella (reseñas y trato), bolsa de pedido (canal), llave inglesa (mantenimiento). */
function Simbolo({ bloque }: { bloque: string }) {
  const c = { fill: 'none', stroke: '#fff', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (bloque) {
    case 'VENTAS':
      return <text x="12" y="17.5" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" fontFamily="Roboto, sans-serif">€</text>;
    case 'ATENCION':
      return <path d="M12 5.8l1.95 3.95 4.35.63-3.15 3.07.74 4.33L12 15.72 8.11 17.78l.74-4.33L5.7 10.38l4.35-.63z" fill="#fff" stroke="none" />;
    case 'OPERACIONES': // bolsa de pedido: el punto de control del Manager es la bolsa antes de grapar
      return <g {...c}><path d="M6.8 9.2h10.4l-.9 9.3H7.7z" /><path d="M9.6 9.2a2.4 2.4 0 014.8 0" /></g>;
    case 'MANTENIMIENTO': // llave inglesa
      return <g {...c}><path d="M16.4 7.1a3.4 3.4 0 00-4.5 4.3l-4.9 4.9 1.7 1.7 4.9-4.9a3.4 3.4 0 004.3-4.5l-2 2-1.5-1.5z" /></g>;
    default: return null;
  }
}

function IconoBloque({ bloque, nombre, logro, semaforo, esLlave }: { bloque: string; nombre: string; logro: number; semaforo: string | null; esLlave: boolean }) {
  const color = esLlave ? (COLOR_SEMAFORO[semaforo ?? 'rojo'] ?? 'var(--rojo)') : 'var(--azul)';
  return (
    <svg className="icono-bloque" viewBox="0 0 24 24" width="30" height="30" role="img"
      aria-label={`${nombre}: ${num(logro)} %`}><title>{`${nombre}: ${num(logro)} %`}</title>
      <rect x="0" y="0" width="24" height="24" rx="4" fill={color} />
      {esLlave ? <Simbolo bloque={bloque} /> : <text x="12" y="16.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" fontFamily="Roboto, sans-serif">{Math.round(logro)}</text>}
    </svg>
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
      <p className="muted">Un icono por bloque: euro (ventas), estrella (atención), bolsa (operaciones) y llave inglesa (mantenimiento) son las cuatro llaves — rojo es una llave rota hoy, ámbar cumple sin margen. El quinto, en azul, es Dirección con su nota: puntúa, pero no es llave. Pulsa un local para ver el desglose y cargar datos.</p>
      <section className="panel">
        <table className="resumen-locales">
          <thead><tr><th>Local</th><th>Manager</th><th>Llaves</th><th className="n">Ventas</th><th className="n">Atención</th><th className="n">Operaciones</th><th className="n">Mantenim.</th><th className="n">Dirección</th><th className="n">Nota</th><th className="n">Complemento</th></tr></thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.local.id} className="fila-local" onClick={() => onLocal(f.local.id)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && onLocal(f.local.id)}>
                <td><strong>{f.local.nombre}</strong>{!f.local.en_piloto && <span className="chip"> se mide, no se paga</span>}</td>
                <td>{f.manager ?? <span className="muted">—</span>}</td>
                {f.ok ? (<>
                  <td><span className="llaves">{f.bloques.map((b: any) => <IconoBloque key={b.bloque} bloque={b.bloque} nombre={b.nombre} logro={b.logro} semaforo={b.llaveCumplida ? b.semaforo : 'rojo'} esLlave={b.esLlave} />)}</span></td>
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

function EstadoCarga({ periodoId, onLocal }: { periodoId: string; onLocal: (id: string) => void }) {
  const [filas, setFilas] = useState<any[] | null>(null);
  useEffect(() => { api(`estado/${periodoId}`).then(setFilas).catch(() => setFilas([])); }, [periodoId]);
  if (!filas || filas.length === 0) return null;
  const pendiente = filas.some(f => f.meses.some((m: any) => m.vencido && m.falta.length));
  return (
    <section className="panel">
      <h2>Qué falta por cargar</h2>
      <p className="small muted">Meses ya vencidos con datos sin cargar. Lo que aparezca aquí en enero es lo que retrasa la liquidación.</p>
      <table>
        <thead><tr><th>Local</th><th>Meses</th><th className="n">Checklists</th><th className="n">Visitas</th><th className="n">Fichas</th><th>Valoración</th></tr></thead>
        <tbody>{filas.map(f => (
          <tr key={f.local.id} className="fila-local" onClick={() => onLocal(f.local.id)}>
            <td><strong>{f.local.nombre}</strong></td>
            <td>{f.meses.map((m: any) => (
              <div key={m.mes} className="small">{nombreMes(m.mes)}: {m.falta.length === 0 ? <span className="estado verde">completo</span> : <span className={m.vencido ? 'estado rojo' : 'muted'}>falta {m.falta.join(', ')}</span>}</div>
            ))}</td>
            <td className="n">{f.semanas}</td>
            <td className="n">{f.visitas}</td>
            <td className="n"><span className={f.fichas < 2 ? 'estado ambar' : ''}>{f.fichas}</span>{f.fichas < 2 && <div className="small muted">mín. 2</div>}</td>
            <td>{f.cualitativa === null ? <span className="muted small">pendiente</span> : f.cualitativa}</td>
          </tr>
        ))}</tbody>
      </table>
      {!pendiente && <p className="small estado verde">No falta nada de los meses ya cerrados.</p>}
    </section>
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
        <div><button className="btn" onClick={async () => { try { const r = await post(`liquidar/${localId}/${periodoId}`, { fecha_extraccion: fecha }); setMsg(`Cerrado: ${eur(r.resultado.pago)}.`); onCambio(); } catch (e: any) { setMsg(e.message); if (/Faltan datos/.test(e.message) && confirm(`${e.message}\n\n¿Cerrar de todas formas, con esos indicadores a 0?`)) { try { const r = await post(`liquidar/${localId}/${periodoId}`, { fecha_extraccion: fecha, forzar: true }); setMsg(`Cerrado forzando: ${eur(r.resultado.pago)}.`); onCambio(); } catch (e2: any) { setMsg(e2.message); } } } }}>{liq ? 'Volver a cerrar (sustituye la foto)' : 'Cerrar liquidación'}</button></div>
      </div>
      {msg && <p>{msg}</p>}
    </section>
  );
}
