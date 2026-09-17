import { useState } from 'react';
import { eur, num } from './api';

const NOMBRE_BLOQUE: Record<string, string> = { VENTAS: 'Ventas', ATENCION: 'Atención al cliente', OPERACIONES: 'Operaciones de canal', MANTENIMIENTO: 'Mantenimiento', DIRECCION: 'Dirección' };

export function Detalle({ calc, modelo, rol }: { calc: any; modelo: any; rol: string }) {
  const r = calc.resultado;
  const [abierto, setAbierto] = useState<string>('VENTAS');
  const parcial = !!calc.hastaMes;
  const esCierre = !parcial;
  const defs: Record<string, any> = Object.fromEntries((modelo?.kpis ?? []).map((k: any) => [k.id, k]));
  const claseCoef = r.coefLlaves === 1 ? '' : r.coefLlaves === 0.7 ? 'ambar' : 'rojo';

  return (
    <>
      {calc.avisos?.length > 0 && rol === 'DIRECCION' && <div className="aviso">{calc.avisos.join(' · ')}</div>}
      {parcial && <p className="muted small">Acumulado a fecha: lo que llevas contra el objetivo acumulado hasta este mes. Los indicadores que se puntúan al cierre (valoración cualitativa, cliente misterioso con menos de dos fichas) aparecen como pendientes.</p>}

      <section className="formula" aria-label="Cómo se calcula el complemento">
        <div className="term"><div className="v">{eur(r.importeObjetivo)}</div><div className="l">importe objetivo</div></div>
        <div className="term"><div className="v">× {num(r.logroPonderado)} %</div><div className="l">tu nota (media ponderada de los cinco bloques)</div></div>
        <div className={'term ' + claseCoef}><div className="v">× {r.coefLlaves.toFixed(2)}</div><div className="l">{r.llavesCumplidas} de 4 llaves cumplidas</div></div>
        <div className={'term ' + (r.puertas.superadas ? '' : 'rojo')}><div className="v">× {r.puertas.superadas ? '1' : '0'}</div><div className="l">puertas de acceso {r.puertas.superadas ? 'superadas' : 'no superadas'}</div></div>
        {r.prorrateo < 1 && <div className="term"><div className="v">× {r.prorrateo.toFixed(3)}</div><div className="l">prorrateo por días efectivos</div></div>}
        <div className="term pago"><div className="v">= {eur(r.pago)}</div><div className="l">{esCierre ? 'complemento del trimestre, brutos' : 'si el trimestre cerrase hoy'}</div></div>
      </section>

      <div className="bloques">
        {r.bloques.map((b: any) => (
          <button key={b.bloque} className={'bloque ' + (b.esLlave ? b.semaforo : 'nollave') + (abierto === b.bloque ? ' activo' : '')} onClick={() => setAbierto(b.bloque)} aria-expanded={abierto === b.bloque}>
            <div className="nombre">{NOMBRE_BLOQUE[b.bloque]} · {b.peso} %</div>
            <div className="logro">{num(b.logro)} %</div>
            <div className={'estado ' + (b.esLlave ? b.semaforo : '')}>
              {b.esLlave ? (b.llaveCumplida ? (b.semaforo === 'verde' ? 'Llave cumplida, con holgura' : 'Llave cumplida, sin margen') : 'Llave rota hoy') : 'Puntúa, no es llave'}
            </div>
            <div className="small muted">{num(b.puntos, 2)} puntos de {b.peso}</div>
            {(() => { const pend = r.kpis.filter((k: any) => k.bloque === b.bloque && k.valor === null && !k.neutralizado && k.pesoEfectivo > 0).length; return pend > 0 ? <div className="small estado ambar">{pend} indicador{pend > 1 ? 'es' : ''} sin dato: cuenta{pend > 1 ? 'n' : ''} 0 hasta que se cargue</div> : null; })()}
          </button>
        ))}
      </div>

      {r.bloques.filter((b: any) => b.bloque === abierto).map((b: any) => (
        <section className="panel" key={b.bloque}>
          <h2>{NOMBRE_BLOQUE[b.bloque]}</h2>
          {b.notas.map((n: string, i: number) => <div className="aviso" key={i}>{n}</div>)}
          <table>
            <thead><tr><th>Indicador</th><th className="n">Peso</th><th className="n">Valor</th><th>Umbral · objetivo · excelencia</th><th className="n">Logro</th><th className="n">Puntos</th></tr></thead>
            <tbody>
              {r.kpis.filter((k: any) => k.bloque === b.bloque).map((k: any) => {
                const d = defs[k.id];
                const noComputa = k.pesoEfectivo === 0;
                const pendiente = k.valor === null && !k.neutralizado;
                return (
                  <tr key={k.id} style={noComputa ? { opacity: .55 } : undefined}>
                    <td>
                      <div>{k.nombre}</div>
                      <div className="small muted">
                        {d?.fuente && <span className={'chip ' + (d.origen === 'automatico' ? 'auto' : '')}>{d.fuente}</span>}
                        {k.neutralizado && <span className="chip neutral">neutralizado</span>}
                        {noComputa && <span className="chip fuera">no computa</span>}
                        {d?.unidad}
                      </div>
                      {k.notas.length > 0 && <ul className="notas">{k.notas.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>}
                    </td>
                    <td className="n">{num(k.pesoEfectivo, 2)}{k.pesoEfectivo !== k.pesoBase && <span className="small muted"> ({k.pesoBase})</span>}</td>
                    <td className="n">{pendiente ? <span className="muted">pendiente</span> : num(k.valor, 2)}</td>
                    <td className="small">{noComputa ? '—' : <>{num(k.niveles.umbral, 2)} · {k.niveles.llave !== undefined && k.niveles.llave !== null ? `${num(k.niveles.llave, 2)} · ` : ''}{num(k.niveles.objetivo, 2)} · {num(k.niveles.excelencia, 2)}<Barra logro={k.logro} /></>}</td>
                    <td className="n">{noComputa ? '—' : `${num(k.logro)} %`}</td>
                    <td className="n">{num(k.puntos, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      <section className="panel">
        <h3>Por qué sale este importe</h3>
        <ul className="explicacion">{r.explicacion.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
        <h3 style={{ marginTop: 14 }}>Puertas de acceso</h3>
        <table><tbody>
          {[['seguridadAlimentaria', 'Seguridad alimentaria: sin no conformidad crítica abierta y no escalada'], ['reporting', 'Reporting: cierre de caja e inventario en plazo en 11 de 13 semanas'], ['controlCaja', 'Control de caja: sin descuadres no justificados'], ['integridad', 'Integridad: sin expediente disciplinario firme']].map(([k, t]) => (
            <tr key={k}><td>{t}</td><td className="n">{r.puertas[k] ? <span className="estado verde">superada</span> : <span className="estado rojo">no superada</span>}</td></tr>
          ))}
        </tbody></table>
      </section>

      {(calc.costePersonal?.length > 0 || calc.descuentos?.length > 0) && (
        <section className="panel">
          <h3>Se mide, no puntúa</h3>
          <table>
            <thead><tr><th>Mes</th><th className="n">Coste de personal de sala</th><th className="n">% sobre ventas</th><th className="n">Descuentos no tipificados</th><th className="n">% sobre ventas (umbral {num(calc.config.umbralDescuentosPct, 2)} %)</th></tr></thead>
            <tbody>
              {Array.from(new Set([...(calc.costePersonal ?? []).map((c: any) => c.mes), ...(calc.descuentos ?? []).map((d: any) => d.mes)])).sort().map((mes: any) => {
                const c = calc.costePersonal.find((x: any) => x.mes === mes); const d = calc.agregados.aux.descuentosPorMes.find((x: any) => x.mes === mes); const dd = calc.descuentos.find((x: any) => x.mes === mes);
                return <tr key={mes}><td>{mes}</td><td className="n">{c?.coste !== null && c?.coste !== undefined ? eur(c.coste) : '—'}</td><td className="n">{num(c?.pct)} %</td><td className="n">{dd ? eur(dd.no_tipificados) : '—'}</td><td className="n">{d ? <span className={d.excedido ? 'estado rojo' : ''}>{num(d.pct, 2)} %{d.excedido ? ' · apaga la llave de Ventas' : ''}</span> : '—'}{dd?.cauce_disciplinario_abierto ? <div className="small muted">cauce disciplinario abierto (aparte del complemento)</div> : null}</td></tr>;
              })}
            </tbody>
          </table>
          <p className="small muted">El coste de personal de sala se reporta con la misma calidad que un KPI retribuido, pero no entra en el cálculo durante el piloto. Se decide en enero.</p>
        </section>
      )}
    </>
  );
}

function Barra({ logro }: { logro: number }) {
  return <div className="barra" title={`${logro} %`}><i style={{ width: `${Math.min(100, logro / 1.2)}%` }} /><b style={{ left: `${90 / 1.2}%` }} /></div>;
}
