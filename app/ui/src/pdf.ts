/**
 * PDF de registros (checklists y visitas) generado en el navegador, y "compartir con Drive":
 * en móvil abre la hoja de compartir del sistema (donde aparece Drive con la cuenta de cada uno);
 * en escritorio descarga el PDF y abre Drive en otra pestaña para arrastrarlo.
 */
type Fila = (string | number)[];
interface Tabla { titulo?: string; cabecera: string[]; filas: Fila[] }
interface Doc { titulo: string; subtitulo: string; meta: [string, string][]; cabecera: string[]; filas: Fila[]; notas?: string; archivo: string; tablas?: Tabla[]; horizontal?: boolean }

/** Las fuentes estándar de jsPDF solo tienen el juego WinAnsi: los caracteres fuera de él salen como basura. */
const limpiar = (t: unknown) => String(t ?? '').replace(/→/g, '->').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/[^\x00-\xFF€…–—‘’“”•·×]/g, '?');

async function construir(d: Doc): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: d.horizontal ? 'landscape' : 'portrait' });
  const ancho = pdf.internal.pageSize.getWidth(); const alto = pdf.internal.pageSize.getHeight();
  pdf.setFillColor(27, 26, 23); pdf.rect(0, 0, ancho, 16, 'F');
  pdf.setTextColor(255, 253, 232); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12);
  pdf.text("JUANCHO'S", 12, 10.5); pdf.setTextColor(182, 24, 41); pdf.text('BBQ', 36, 10.5);
  pdf.setTextColor(255, 253, 232); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text('Complemento de Manager', ancho - 12, 10.5, { align: 'right' });
  pdf.setFillColor(182, 24, 41); pdf.rect(0, 16, ancho, 1.2, 'F');
  pdf.setTextColor(27, 26, 23); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); pdf.text(limpiar(d.titulo), 12, 28);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(107, 103, 92); pdf.text(limpiar(d.subtitulo), 12, 34);
  let y = 42; pdf.setFontSize(9.5);
  for (const [k, v] of d.meta) { pdf.setTextColor(107, 103, 92); pdf.text(k, 12, y); pdf.setTextColor(27, 26, 23); pdf.text(limpiar(v || '—'), 52, y); y += 5.5; }
  const tabla = (t: Tabla, inicio: number) => {
    let startY = inicio;
    if (t.titulo) {
      if (startY > alto - 40) { pdf.addPage(); startY = 20; }
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(27, 26, 23); pdf.text(limpiar(t.titulo), 12, startY); pdf.setFont('helvetica', 'normal');
      startY += 3;
    }
    autoTable(pdf, {
      startY, head: [t.cabecera.map(limpiar)], body: t.filas.map(f => f.map(limpiar)), theme: 'grid', margin: { left: 12, right: 12 },
      styles: { fontSize: 9, cellPadding: 2, lineColor: [228, 223, 200], textColor: [27, 26, 23] },
      headStyles: { fillColor: [27, 26, 23], textColor: [255, 253, 232], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [255, 253, 232] },
      didParseCell: (c: any) => { if (c.section === 'body' && /no conforme|abierto|sin aviso|no superada|apagada/i.test(String(c.cell.raw))) c.cell.styles.textColor = [182, 24, 41]; },
    });
    return (pdf as any).lastAutoTable.finalY as number;
  };
  let fy = tabla({ cabecera: d.cabecera, filas: d.filas }, y + 3);
  for (const t of d.tablas ?? []) fy = tabla(t, fy + 10);
  if (d.notas) {
    const lineas = pdf.splitTextToSize(limpiar(d.notas), ancho - 24) as string[];
    fy += 8; if (fy + 5 + lineas.length * 4.2 > alto - 14) { pdf.addPage(); fy = 20; }
    pdf.setFontSize(9.5); pdf.setTextColor(107, 103, 92); pdf.text('Notas', 12, fy); pdf.setTextColor(27, 26, 23); pdf.text(lineas, 12, fy + 5);
  }
  const paginas = pdf.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) { pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(107, 103, 92); pdf.text(`Generado el ${new Date().toLocaleString('es-ES')} · página ${i} de ${paginas}`, 12, alto - 7); }
  return pdf.output('blob');
}

function descargar(blob: Blob, archivo: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = archivo; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function descargarPdf(d: Doc) { descargar(await construir(d), d.archivo); }

export async function compartirDrive(d: Doc) {
  const blob = await construir(d);
  const file = new File([blob], d.archivo, { type: 'application/pdf' });
  const nav: any = navigator;
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try { await nav.share({ files: [file], title: d.titulo }); return; } catch (e: any) { if (e?.name === 'AbortError') return; }
  }
  descargar(blob, d.archivo);
  window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener');
}

// ---- Documentos concretos ----
export function docChecklist(s: any, catalogo: any[], local: string, tipo: 'MANAGER' | 'DIRECCION'): Doc {
  const texto = (id: string) => catalogo.find(c => c.hoja === s.hoja && c.linea_id === id)?.texto ?? id;
  const orden = (id: string) => catalogo.find(c => c.hoja === s.hoja && c.linea_id === id)?.orden ?? 999;
  const lineas = [...(s.lineas ?? [])].sort((a, b) => orden(a.linea_id) - orden(b.linea_id));
  const nc = lineas.filter(l => l.estado === 'NO_CONFORME').length;
  return {
    titulo: `${tipo === 'DIRECCION' ? 'Checklist de Dirección' : 'Checklist semanal'} · Hoja ${s.hoja} (${s.hoja === 'A' ? 'sala' : 'cocina'})`,
    subtitulo: `${local} · semana ${s.semana}`,
    meta: [['Firma', s.firma_manager ?? ''], ...(s.hoja === 'B' && tipo === 'MANAGER' ? [['Jefe de Cocina', s.firma_jefe_cocina ?? ''] as [string, string]] : []), ['No conformes', `${nc} de ${lineas.length}`], ['Registrado', String(s.ts ?? '').slice(0, 16).replace('T', ' ')]],
    cabecera: ['Elemento', 'Estado', 'Aviso en 24 h', 'Observación'],
    filas: lineas.map(l => [texto(l.linea_id), l.estado === 'CONFORME' ? 'Conforme' : 'No conforme', l.estado === 'CONFORME' ? '—' : (l.aviso_en_24h ? 'Sí' : 'Sin aviso'), l.observacion ?? '']),
    archivo: `checklist-${tipo === 'DIRECCION' ? 'direccion-' : ''}${local.replace(/\s+/g, '')}-${s.semana}-${s.hoja}.pdf`,
  };
}

export function docVisita(v: any, catalogo: any[], local: string): Doc {
  const texto = (h: any) => catalogo.find(c => c.hoja === h.hoja && c.linea_id === h.linea_id)?.texto ?? h.linea_id;
  const estado = (h: any) => h.archivado ? 'Archivado' : h.cerrado_fecha ? `Cerrado el ${h.cerrado_fecha}${h.cerrado_en_siguiente === 1 ? ' (visita siguiente)' : ''}` : 'Abierto';
  return {
    titulo: 'Hallazgos de visita', subtitulo: `${local} · ${v.fecha}`,
    meta: [['Visitante', v.visitante], ['Hallazgos', String(v.hallazgos?.length ?? 0)]],
    cabecera: ['Hoja', 'Elemento', 'Descripción', 'Reportado antes', 'Debió detectarse', 'Estado'],
    filas: (v.hallazgos ?? []).map((h: any) => [h.hoja, texto(h), h.descripcion ?? '', h.reportado_previamente ? 'Sí' : 'No', h.debio_detectarse ? 'Sí' : 'No', estado(h)]),
    notas: v.notas || undefined,
    archivo: `visita-${local.replace(/\s+/g, '')}-${v.fecha}.pdf`,
  };
}

const fmt = (v: number | null | undefined, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
const euros = (v: number) => v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const NOMBRE_BLOQUE: Record<string, string> = { VENTAS: 'Ventas', ATENCION: 'Atención', OPERACIONES: 'Operaciones', MANTENIMIENTO: 'Mantenimiento', DIRECCION: 'Dirección' };

/**
 * PDF de la liquidación cerrada: la foto guardada al cerrar el trimestre, que es lo que se paga.
 * El seguimiento mensual es solo una meta volante; este documento recoge la consecución del trimestre.
 */
export function docLiquidacion(liq: any, local: string, periodo: string, kpis: any[] = []): Doc {
  const r = liq.resultado;
  const unidad = (id: string) => kpis.find(k => k.id === id)?.unidad ?? '';
  const nombreBloque = (b: any) => b.nombre ?? NOMBRE_BLOQUE[b.bloque] ?? b.bloque;
  const puertas: [string, boolean][] = [['Seguridad alimentaria', r.puertas.seguridadAlimentaria], ['Reporting', r.puertas.reporting], ['Control de caja', r.puertas.controlCaja], ['Integridad', r.puertas.integridad]];
  return {
    titulo: 'Liquidación del trimestre', subtitulo: `${local} · ${periodo}`, horizontal: true,
    meta: [
      ['Cerrada', `${String(liq.ts ?? '').slice(0, 10)} por ${liq.cerrada_por}`],
      ['Extracción de datos', liq.fecha_extraccion],
      ['Logro ponderado', `${fmt(r.logroPonderado, 1)} %`],
      ['Llaves', `${r.llavesCumplidas} de 4 → coeficiente × ${Number(r.coefLlaves).toFixed(2)}`],
      ['Puertas', r.puertas.superadas ? 'Superadas' : `No superadas (${puertas.filter(([, ok]) => !ok).map(([n]) => n).join(', ')})`],
      ['Importe objetivo', `${euros(r.importeObjetivo)}${r.prorrateo !== 1 ? ` · prorrateo ${fmt(r.prorrateo * 100, 1)} %` : ''}`],
      ['Complemento', `${euros(r.pago)} brutos`],
    ],
    cabecera: ['Bloque', 'Peso', 'Logro', 'Llave', 'Puntos'],
    filas: r.bloques.map((b: any) => [nombreBloque(b), `${fmt(b.peso, 1)} %`, `${fmt(b.logro, 1)} %`, b.esLlave ? (b.llaveCumplida ? 'Encendida' : 'Apagada') : 'No es llave', fmt(b.puntos, 2)]),
    tablas: [{
      titulo: 'Indicadores',
      cabecera: ['Bloque', 'Indicador', 'Resultado', 'Unidad', 'Umbral (50)', 'Llave (90)', 'Objetivo (100)', 'Excelencia (120)', 'Logro', 'Peso', 'Puntos', 'Observaciones'],
      filas: r.kpis.map((k: any) => [
        NOMBRE_BLOQUE[k.bloque] ?? k.bloque, k.nombre, fmt(k.valor), unidad(k.id),
        fmt(k.niveles?.umbral), fmt(k.niveles?.llave), fmt(k.niveles?.objetivo), fmt(k.niveles?.excelencia),
        `${fmt(k.logro, 1)} %`, `${fmt(k.pesoEfectivo, 2)} %`, fmt(k.puntos, 2),
        [k.neutralizado ? 'Neutralizado' : '', k.pendiente ? 'Sin dato: computa 0' : '', ...(k.notas ?? [])].filter(Boolean).join(' · '),
      ]),
    }],
    notas: (r.explicacion ?? []).join('\n') || undefined,
    archivo: `liquidacion-${local.replace(/\s+/g, '')}-${periodo.replace(/\s+/g, '')}.pdf`,
  };
}
