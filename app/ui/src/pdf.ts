/**
 * PDF de registros (checklists y visitas) generado en el navegador, y "compartir con Drive":
 * en móvil abre la hoja de compartir del sistema (donde aparece Drive con la cuenta de cada uno);
 * en escritorio descarga el PDF y abre Drive en otra pestaña para arrastrarlo.
 */
type Fila = (string | number)[];
interface Doc { titulo: string; subtitulo: string; meta: [string, string][]; cabecera: string[]; filas: Fila[]; notas?: string; archivo: string }

async function construir(d: Doc): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.setFillColor(27, 26, 23); pdf.rect(0, 0, 210, 16, 'F');
  pdf.setTextColor(255, 253, 232); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12);
  pdf.text("JUANCHO'S", 12, 10.5); pdf.setTextColor(182, 24, 41); pdf.text('BBQ', 36, 10.5);
  pdf.setTextColor(255, 253, 232); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text('Complemento de Manager', 198, 10.5, { align: 'right' });
  pdf.setFillColor(182, 24, 41); pdf.rect(0, 16, 210, 1.2, 'F');
  pdf.setTextColor(27, 26, 23); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); pdf.text(d.titulo, 12, 28);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(107, 103, 92); pdf.text(d.subtitulo, 12, 34);
  let y = 42; pdf.setFontSize(9.5);
  for (const [k, v] of d.meta) { pdf.setTextColor(107, 103, 92); pdf.text(k, 12, y); pdf.setTextColor(27, 26, 23); pdf.text(String(v || '—'), 52, y); y += 5.5; }
  autoTable(pdf, {
    startY: y + 3, head: [d.cabecera], body: d.filas.map(f => f.map(String)), theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2, lineColor: [228, 223, 200], textColor: [27, 26, 23] },
    headStyles: { fillColor: [27, 26, 23], textColor: [255, 253, 232], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [255, 253, 232] },
    didParseCell: (c: any) => { if (c.section === 'body' && /no conforme|abierto|sin aviso/i.test(String(c.cell.raw))) c.cell.styles.textColor = [182, 24, 41]; },
  });
  if (d.notas) { const fy = (pdf as any).lastAutoTable.finalY + 8; pdf.setFontSize(9.5); pdf.setTextColor(107, 103, 92); pdf.text('Notas', 12, fy); pdf.setTextColor(27, 26, 23); pdf.text(pdf.splitTextToSize(d.notas, 186), 12, fy + 5); }
  const paginas = pdf.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) { pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(107, 103, 92); pdf.text(`Generado el ${new Date().toLocaleString('es-ES')} · página ${i} de ${paginas}`, 12, 290); }
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
