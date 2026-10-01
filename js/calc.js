import { EMPRESAS, IVA_TASA } from './empresas.js';

export const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const importe = (it) => (it.nota ? 0 : r2(num(it.cantidad) * num(it.precio)));

export function calcular(cot) {
  const emp = EMPRESAS[cot.empresa];
  const items = cot.datos?.items || [];
  const porSeccion = {};
  for (const s of emp.secciones) porSeccion[s.id] = 0;
  for (const it of items) porSeccion[it.seccion] = r2((porSeccion[it.seccion] || 0) + importe(it));
  const suma = r2(Object.values(porSeccion).reduce((a, b) => a + b, 0));

  const d = cot.datos?.descuento || {};
  let descuento = 0;
  if (num(d.valor) > 0) descuento = d.tipo === '%' ? r2((suma * num(d.valor)) / 100) : r2(num(d.valor));
  descuento = Math.min(descuento, suma);

  const base = r2(suma - descuento);
  const iva = cot.datos?.iva ? r2(base * IVA_TASA) : 0;
  return { porSeccion, suma, descuento, base, iva, total: r2(base + iva) };
}

const fmt = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dinero = (n) => (n < 0 ? '-$' : '$') + fmt.format(Math.abs(num(n)));

export function fechaLarga(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
