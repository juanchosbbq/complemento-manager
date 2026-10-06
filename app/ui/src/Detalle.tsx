import { useState } from 'react';
import { compacto, eur, num } from './api';

const UNIDAD_EUR = ['K1_FACTURACION', 'K2_TICKET'];
/** Valor en las unidades del KPI, comprimido si es largo (40.395 € → 40,4K€). */
const fmt = (id: string, v: number | null | undefined) => compacto(v, UNIDAD_EUR.includes(id) ? '€' : '');
function valorKpi(k: any) {
  if (k.valor === null) return '—';
  if (k.id === 'K9_DISPONIBILIDAD') return k.valor === 100 ? 'cumple' : 'no cumple';
  return fmt(k.id, k.valor);
}
/** Consejo accionable por indicador: qué hacer en el local para moverlo. */
const CONSEJO: Record<string, string> = {
  K1_FACTURACION: 'Aumentar la facturación general: llenar las franjas flojas, rotar mesas en los picos y empujar las acciones comerciales del mes.',
  K2_TICKET: 'Subir el ticket medio: sugerir entrante para compartir, bebida grande y postre en la toma de comanda.',
  K3_PRODUCTOS: 'Vender más del producto estratégico: recomendarlo al sentar la mesa y meterlo en la primera ronda.',
  K4A_RESENAS_VOLUMEN: 'Conseguir más reseñas: pedirla al cerrar la mesa, con el QR a mano y todo el equipo recordándolo.',
  K4B_RESENAS_NOTA: 'Subir la nota: atacar lo que más se repite en las reseñas malas (tiempos, temperatura, trato) y responderlas.',
  K5_RATING_UBER: 'Mejorar el rating de Uber Eats: revisar los comentarios y corregir lo que se repite (presentación, temperatura, embalaje).',
  K6A_MISTERIOSO_SALA: 'Repasar con el equipo la ficha del cliente misterioso: bienvenida, tiempos, recomendación y despedida.',
  K6B_MISTERIOSO_PRODUCTO: 'Revisar con cocina punto de la carne, montaje y emplatado según la ficha técnica.',
  K7_PRECISION: 'Verificar cada pedido de delivery contra el ticket antes de grapar: extras, salsas y bebidas.',
  K8_COCINA: 'Escalar a cocina con registro cada incidencia de sabor o calidad y revisar el punto y la temperatura de salida.',
  K9_DISPONIBILIDAD: 'Mantener la tienda online todo el horario; si hay que pausar, avisar en 2 horas con el motivo.',
  K10_CHECKLIST: 'Rellenar el checklist todas las semanas y avisar en 24 h de todo lo no conforme: avisar nunca resta.',
  K11_HALLAZGOS: 'Cerrar cada hallazgo de Dirección antes de la visita siguiente, o escalarlo si no depende del local.',
};
/** Color del logro de un KPI según el tramo de la escala alcanzado. */
export function tramo(logro: number): string {
  if (logro >= 120) return 't-exc';
  if (logro >= 100) return 't-obj';
  if (logro >= 90) return 't-llave';
  if (logro >= 50) return 't-umbral';
  return 't-bajo';
}

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
      {parcial && <p className="muted small">Acumulado a fecha: lo que llevas contra la parte del objetivo del trimestre que corresponde a estos meses. Los indicadores que todavía no tienen dato aparecen como pendientes y no cuentan en la nota hasta que se carguen.</p>}

      <div className="no-print" style={{ textAlign: 'right', marginBottom: 8 }}>
        <button className="btn sec peq" onClick={() => window.print()}>Imprimir o guardar en PDF (todas las áreas)</button>
      </div>
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
            <div className="small muted">{num(b.puntos, 2)} puntos de {parcial && b.pendientes > 0 ? num(b.pesoMedido, 2) : b.peso}</div>
            {b.pendientes > 0 && <div className="small muted">{b.pendientes} indicador{b.pendientes > 1 ? 'es' : ''} pendiente{b.pendientes > 1 ? 's' : ''} de cargar{parcial ? ' · fuera de la nota por ahora' : ' · cuenta 0 al cierre'}</div>}
          </button>
        ))}
      </div>

      {(() => {
        const llaves = r.bloques.filter((b: any) => b.esLlave);
        const conMejora = llaves.map((b: any) => ({
          b,
          falta: (calc.faltaLlave ?? []).find((f: any) => f.bloque === b.bloque),
          kpis: r.kpis.filter((k: any) => k.bloque === b.bloque && k.pesoEfectivo > 0 && !k.pendiente && !k.neutralizado && k.logro < 100 && CONSEJO[k.id])
            .sort((x: any, y: any) => x.logro - y.logro).slice(0, 3),
        })).filter((x: any) => x.falta || x.kpis.length);
        if (!conMejora.length) return null;
        return (
          <section className="panel mejora">
            <h2>Qué tienes que hacer en cada llave para mejorar</h2>
            <p className="small muted">Por llave, los indicadores que están por debajo de su objetivo, de peor a mejor, con qué hacer en el local. Si la llave está apagada, primero lo que haría falta para encenderla.</p>
            {conMejora.map(({ b, falta, kpis }: any) => (
              <div key={b.bloque} className={'mejora-llave ' + (b.llaveCumplida ? 'on' : 'off')}>
                <div className="mejora-cab">
                  <h3>{b.nombre}</h3>
                  <span className={'mejora-estado ' + (b.llaveCumplida ? 'on' : 'off')}>{b.llaveCumplida ? 'Llave encendida' : 'Llave apagada'} · {num(b.logro)}%</span>
                </div>
                {falta && (falta.opciones.length
                  ? <p className="mejora-falta">Para encenderla basta con <strong>uno</strong> de estos: {falta.opciones.slice(0, 2).map((o: any, i: number) => (
                      <span key={o.kpi}>{i > 0 ? ' · o ' : ''}{o.nombre.toLowerCase()} de {fmt(o.kpi, o.valorActual)} a <strong>{fmt(o.kpi, o.valorNecesario)}</strong></span>
                    ))}.</p>
                  : <p className="mejora-falta">Ningún indicador la enciende por sí solo: hay que mejorar varios a la vez.</p>)}
                {kpis.map((k: any) => (
                  <div className="mejora-kpi" key={k.id}>
                    <span className={'logro-kpi ' + tramo(k.logro)}>{num(k.logro)} %</span>
                    <div><strong>{k.nombre}</strong><div className="small">{CONSEJO[k.id]}</div></div>
                  </div>
                ))}
              </div>
            ))}
          </section>
        );
      })()}

      {calc.tendencia?.filter((t: any) => t.logro !== null).length > 1 && (
        <section className="panel">
          <h2>Cómo va evolucionando</h2>
          <table><thead><tr><th>Mes</th>{r.bloques.map((b: any) => <th className="n" key={b.bloque}>{b.nombre}</th>)}<th className="n">Nota</th><th className="n">Llaves</th></tr></thead>
            <tbody>{calc.tendencia.filter((t: any) => t.logro !== null).map((t: any) => (
              <tr key={t.mes}><td>{t.mes}</td>{r.bloques.map((b: any) => <td className="n" key={b.bloque}><span className={t.bloques[b.bloque] >= 90 || !b.esLlave ? '' : 'estado rojo'}>{num(t.bloques[b.bloque])}</span></td>)}<td className="n"><strong>{num(t.logro)}%</strong></td><td className="n">{t.llaves}/4</td></tr>
            ))}</tbody></table>
        </section>
      )}

      {r.bloques.map((b: any) => (
        <section className={'panel bloque-detalle' + (b.bloque === abierto ? ' activo' : '')} key={b.bloque}>
          <h2>{NOMBRE_BLOQUE[b.bloque]}</h2>
          {b.notas.map((n: string, i: number) => <div className="aviso" key={i}>{n}</div>)}
          <table>
            <thead>
              <tr className="grupos"><th colSpan={2}></th><th className="n g-actual">Hoy</th><th className="g-niv" colSpan={4}>Escala de la carta</th><th className="g-res" colSpan={2}>Resultado</th></tr>
              <tr><th>Indicador</th><th className="n">Peso</th><th className="n g-actual">Actual</th><th className="n niv g-niv-ini">50%</th><th className="n niv">90%</th><th className="n niv obj">100%</th><th className="n niv g-niv-fin">120%</th><th className="n g-res-ini">Logro</th><th className="n">Puntos</th></tr>
            </thead>
            <tbody>
              {r.kpis.filter((k: any) => k.bloque === b.bloque).map((k: any) => {
                const d = defs[k.id];
                const noComputa = k.pesoEfectivo === 0;
                const pendiente = k.pendiente;
                return (
                  <tr key={k.id} style={noComputa || pendiente ? { opacity: .6 } : undefined}>
                    <td>
                      <div>{k.nombre}</div>
                      <div className="small muted">
                        {d?.fuente && <span className={'chip ' + (d.origen === 'automatico' ? 'auto' : '')}>{d.fuente}</span>}
                        {k.neutralizado && <span className="chip neutral">neutralizado</span>}
                        {noComputa && <span className="chip fuera">no computa</span>}
                        {pendiente && <span className="chip">pendiente de cargar</span>}
                        {d?.unidad}
                      </div>
                      {k.notas.length > 0 && <ul className="notas">{k.notas.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>}
                    </td>
                    <td className="n">{num(k.pesoEfectivo, 2)}{k.pesoEfectivo !== k.pesoBase && <span className="small muted"> ({k.pesoBase})</span>}</td>
                    <td className="n g-actual actual">{pendiente ? <span className="muted">—</span> : valorKpi(k)}</td>
                    {noComputa ? <td className="n niv muted g-niv-ini g-niv-fin" colSpan={4}>—</td>
                      : k.id === 'K9_DISPONIBILIDAD' ? <><td className="n niv muted g-niv-ini">—</td><td className="n niv muted">—</td><td className="n niv obj">100%</td><td className="n niv muted g-niv-fin">—</td></>
                      : <>
                        <td className="n niv g-niv-ini">{fmt(k.id, k.niveles.umbral)}</td>
                        <td className="n niv">{k.niveles.llave !== undefined && k.niveles.llave !== null ? fmt(k.id, k.niveles.llave) : <span className="muted" title="Sin llave calibrada: se interpola entre 50% y 100%">—</span>}</td>
                        <td className="n niv obj">{fmt(k.id, k.niveles.objetivo)}</td>
                        <td className="n niv g-niv-fin">{fmt(k.id, k.niveles.excelencia)}</td>
                      </>}
                    <td className="n g-res-ini">{noComputa || pendiente ? '—' : <span className={'logro-kpi ' + tramo(k.logro)}>{num(k.logro)} %</span>}</td>
                    <td className="n">{pendiente ? '—' : <span className="puntos-kpi" title={`${num(k.puntos, 2)} de ${num(k.pesoEfectivo, 2)} posibles al 100%`}>{num(k.puntos, 1)}</span>}</td>
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
