/**
 * Integración Uber Eats — módulo aislado y sustituible.
 * Hoy: parser del CSV que se descarga de Uber Eats Manager (Performance → Operations, corte por periodo).
 * Mañana: el mismo contrato (UberMesImportado) puede alimentarse desde una API sin tocar el resto.
 *
 * Los nombres de columna del export de Uber cambian: MAPEO_COLUMNAS es lo único que hay que ajustar.
 * Verificar contra un export real antes del 1 de octubre (ver PENDIENTE.md).
 */
export interface UberMesImportado {
  mes: string; pedidos: number | null; inaccurate_rate: number | null; food_quality_rate: number | null;
  prep_delay_rate: number | null; online_rate: number | null; unfulfilled_rate: number | null; rating: number | null;
}

export const MAPEO_COLUMNAS: Record<keyof Omit<UberMesImportado, 'mes'>, string[]> = {
  pedidos: ['Orders', 'Total Orders', 'Completed Orders'],
  inaccurate_rate: ['Inaccurate Orders Rate', 'Inaccurate Order Rate', 'Order Accuracy Issues Rate'],
  food_quality_rate: ['Food Taste or Quality Issues', 'Food Taste or Quality Issues Rate'],
  prep_delay_rate: ['Order Preparation Delays', 'Order Preparation Delay Rate', 'Preparation Delays'],
  online_rate: ['Online Rate', 'Store Online Rate'],
  unfulfilled_rate: ['Unfulfilled Order Rate', 'Unfulfilled Orders Rate'],
  rating: ['Rating', 'Average Rating', 'Customer Rating'],
};

function parsearCsv(texto: string): Record<string, string>[] {
  const lineas = texto.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim().length);
  if (!lineas.length) return [];
  const sep = lineas[0].includes(';') && !lineas[0].includes(',') ? ';' : ',';
  const split = (l: string) => {
    const out: string[] = []; let cur = ''; let q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === sep && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out.map(s => s.trim());
  };
  const cab = split(lineas[0]);
  return lineas.slice(1).map(l => Object.fromEntries(split(l).map((v, i) => [cab[i] ?? `col${i}`, v])));
}

const num = (s: string | undefined): number | null => {
  if (s === undefined || s === '' || s === '-' || s === '—') return null;
  const n = parseFloat(s.replace('%', '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Devuelve una fila por mes. `mes` se toma de una columna de fecha o se fija con `mesFijo` cuando el export es de un solo periodo. */
export function importarCsvUber(texto: string, mesFijo?: string): { filas: UberMesImportado[]; columnasNoEncontradas: string[] } {
  const filas = parsearCsv(texto);
  const cabeceras = filas.length ? Object.keys(filas[0]) : [];
  const busca = (aliases: string[]) => cabeceras.find(c => aliases.some(a => a.toLowerCase() === c.toLowerCase()));
  const cols = Object.fromEntries(Object.entries(MAPEO_COLUMNAS).map(([k, a]) => [k, busca(a)])) as Record<string, string | undefined>;
  const colFecha = cabeceras.find(c => /^(date|period|month|start date|fecha)$/i.test(c));
  const columnasNoEncontradas = Object.entries(cols).filter(([, v]) => !v).map(([k]) => k);
  const out: UberMesImportado[] = filas.map(f => ({
    mes: mesFijo ?? (colFecha ? (f[colFecha] ?? '').slice(0, 7) : ''),
    pedidos: num(cols.pedidos && f[cols.pedidos]), inaccurate_rate: num(cols.inaccurate_rate && f[cols.inaccurate_rate]),
    food_quality_rate: num(cols.food_quality_rate && f[cols.food_quality_rate]), prep_delay_rate: num(cols.prep_delay_rate && f[cols.prep_delay_rate]),
    online_rate: num(cols.online_rate && f[cols.online_rate]), unfulfilled_rate: num(cols.unfulfilled_rate && f[cols.unfulfilled_rate]), rating: num(cols.rating && f[cols.rating]),
  })).filter(f => /^\d{4}-\d{2}$/.test(f.mes));
  return { filas: out, columnasNoEncontradas };
}
