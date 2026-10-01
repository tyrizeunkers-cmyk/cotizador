// Generación de PDF con el diseño de cada negocio (usa pdf-lib, incluido en /vendor).
import { EMPRESAS, IVA_TASA } from './empresas.js';
import { calcular, importe, dinero, fechaLarga, num } from './calc.js';

const { PDFDocument, StandardFonts, rgb } = window.PDFLib;

const W = 612; // Carta, en puntos
const H = 792;
const M = 40;  // margen
const CW = W - M * 2;

const hex = (h) => {
  const v = h.replace('#', '');
  return rgb(parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255);
};
const C = {
  blanco: hex('#FFFFFF'), negro: hex('#080808'), gris: hex('#666666'), grisTxt: hex('#262626'),
  grisClaro: hex('#F3F3F3'), grisF2: hex('#F2F2F2'), linea: hex('#D9D9D9'),
};

const cacheBytes = {};
async function bytes(url) {
  if (!cacheBytes[url]) cacheBytes[url] = fetch(url).then((r) => r.arrayBuffer());
  return cacheBytes[url];
}

// ---------------------------------------------------------------------
// Lienzo: coordenadas de arriba hacia abajo y saltos de página automáticos
// ---------------------------------------------------------------------
class Lienzo {
  constructor(doc, fuentes, { alNuevaPagina, margenInferior = 60 }) {
    this.doc = doc;
    this.f = fuentes;
    this.alNuevaPagina = alNuevaPagina;
    this.margenInferior = margenInferior;
    this.paginas = [];
    this.nuevaPagina(true);
  }
  nuevaPagina(primera = false) {
    this.page = this.doc.addPage([W, H]);
    this.paginas.push(this.page);
    this.y = M;
    this.alNuevaPagina?.(this, primera);
  }
  cabe(alto) { return this.y + alto <= H - this.margenInferior; }
  asegurar(alto, despues) {
    if (!this.cabe(alto)) { this.nuevaPagina(); despues?.(); return true; }
    return false;
  }
  rect(x, y, w, h, color, borde) {
    this.page.drawRectangle({
      x, y: H - y - h, width: w, height: h,
      ...(color ? { color } : {}),
      ...(borde ? { borderColor: borde.color, borderWidth: borde.ancho || 0.5 } : {}),
    });
  }
  linea(x1, y1, x2, y2, color = C.linea, grosor = 0.5) {
    this.page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, color, thickness: grosor });
  }
  // y = línea base
  texto(str, x, y, { size = 9, font = this.f.reg, color = C.negro, align = 'left', ancho = 0 } = {}) {
    const s = limpiar(str, font);
    if (!s) return;
    const w = font.widthOfTextAtSize(s, size);
    let px = x;
    if (align === 'right') px = x + ancho - w;
    else if (align === 'center') px = x + (ancho - w) / 2;
    this.page.drawText(s, { x: px, y: H - y, size, font, color });
  }
  imagen(img, x, y, w, h) { this.page.drawImage(img, { x, y: H - y - h, width: w, height: h }); }
}

// Quita caracteres que la fuente estándar no puede dibujar (emojis, etc.)
const okChar = new Map();
function limpiar(str, font) {
  if (str == null) return '';
  let out = '';
  for (const ch of String(str).replace(/\t/g, ' ')) {
    const k = font.name + ch;
    if (!okChar.has(k)) {
      try { font.encodeText(ch); okChar.set(k, true); } catch { okChar.set(k, false); }
    }
    out += okChar.get(k) ? ch : '';
  }
  return out;
}

function partir(str, font, size, ancho) {
  const lineas = [];
  for (const parrafo of String(str ?? '').split('\n')) {
    const palabras = limpiar(parrafo, font).split(/\s+/).filter(Boolean);
    if (!palabras.length) { lineas.push(''); continue; }
    let actual = '';
    for (let p of palabras) {
      // palabra más ancha que la columna: cortarla
      while (font.widthOfTextAtSize(p, size) > ancho) {
        let i = p.length;
        while (i > 1 && font.widthOfTextAtSize(p.slice(0, i), size) > ancho) i--;
        if (actual) { lineas.push(actual); actual = ''; }
        lineas.push(p.slice(0, i));
        p = p.slice(i);
      }
      const prueba = actual ? actual + ' ' + p : p;
      if (font.widthOfTextAtSize(prueba, size) <= ancho) actual = prueba;
      else { if (actual) lineas.push(actual); actual = p; }
    }
    if (actual) lineas.push(actual);
  }
  return lineas;
}

// ---------------------------------------------------------------------
// Tabla genérica con saltos de página
// cols: [{titulo, w (0 = flexible), align, valor(it), fuente(it), fondo(it, i)}]
// ---------------------------------------------------------------------
function tabla(lz, { cols, filas, encabezado, size = 9, pad = 5, interlinea = 11.5, filaMin = 18, separador }) {
  const fijo = cols.reduce((a, c) => a + (c.w || 0), 0);
  const flex = cols.filter((c) => !c.w).length;
  cols.forEach((c) => { c.ancho = c.w || (CW - fijo) / flex; });

  const dibujarEncabezado = () => {
    const h = encabezado.alto || 20;
    lz.rect(M, lz.y, CW, h, encabezado.fondo);
    let x = M;
    for (const c of cols) {
      lz.texto(c.titulo, x + pad, lz.y + h / 2 + 3, {
        size: encabezado.size || 8.5, font: lz.f.bold, color: encabezado.color, align: c.alignTitulo || 'center', ancho: c.ancho - pad * 2,
      });
      x += c.ancho;
    }
    lz.y += h;
  };

  lz.asegurar((encabezado.alto || 20) + filaMin);
  dibujarEncabezado();

  filas.forEach((it, i) => {
    // calcular alto de la fila
    const celdas = cols.map((c) => {
      const font = c.fuente?.(it, lz.f) || lz.f.reg;
      const txt = c.valor(it) ?? '';
      const lineas = c.multilinea ? partir(txt, font, size, c.anchoTexto?.(it, cols) ?? c.ancho - pad * 2) : [limpiar(txt, font)];
      return { font, lineas };
    });
    const nLineas = Math.max(...celdas.map((c) => c.lineas.length), 1);
    const alto = Math.max(filaMin, nLineas * interlinea + pad * 2 - (interlinea - size) + 2);

    lz.asegurar(alto, dibujarEncabezado);

    let x = M;
    cols.forEach((c, j) => {
      const fondo = c.fondo?.(it, i);
      const anchoCelda = c.ocupaHasta ? c.ocupaHasta(it, cols) ?? c.ancho : c.ancho;
      if (c.oculta?.(it)) { x += c.ancho; return; }
      if (fondo) lz.rect(x, lz.y, anchoCelda, alto, fondo);
      const { font, lineas } = celdas[j];
      const bloque = lineas.length * interlinea - (interlinea - size);
      let by = lz.y + (alto - bloque) / 2 + size - 1;
      for (const ln of lineas) {
        lz.texto(ln, x + pad, by, { size, font, color: c.color?.(it) || C.negro, align: c.align || 'left', ancho: anchoCelda - pad * 2 });
        by += interlinea;
      }
      x += c.ancho;
    });
    if (separador) separador(lz.y + alto);
    lz.y += alto;
  });
}

// =====================================================================
// KM MOTORS
// =====================================================================
async function pdfKM(doc, f, cot) {
  const emp = EMPRESAS.km;
  const P = hex(emp.colores.primario);
  const suave = hex(emp.colores.suave);
  const logo = await doc.embedPng(await bytes(emp.logo));
  const d = cot.datos || {};
  const t = calcular(cot);

  const lz = new Lienzo(doc, f, {
    margenInferior: 64,
    alNuevaPagina: (lz, primera) => {
      // barra superior vino + negro
      const corte = M + CW * 0.42;
      lz.rect(M, 30, corte - M, 9, P);
      lz.rect(corte, 30, M + CW - corte, 9, C.negro);
      // barra inferior
      lz.rect(M, H - 44, CW, 5, P);
      lz.y = 48;
      if (!primera) {
        lz.texto(`COTIZACIÓN ${cot.folio || ''}  (continuación)`, M, lz.y + 10, { size: 9, font: f.bold, color: P });
        lz.y += 22;
      }
    },
  });

  // ---- Encabezado ----
  const top = lz.y;
  const lw = 220, lh = (lw * logo.height) / logo.width;
  lz.imagen(logo, M, top, lw, lh);

  const xd = M + lw + 20, wd = M + CW - xd;
  lz.texto('COTIZACIÓN', xd, top + 20, { size: 20, font: f.bold, color: C.negro, align: 'right', ancho: wd });
  let yy = top + 34;
  if (d.titulo) {
    for (const ln of partir(String(d.titulo).toUpperCase(), f.bold, 9.5, wd)) {
      lz.texto(ln, xd, yy, { size: 9.5, font: f.bold, color: P, align: 'right', ancho: wd });
      yy += 12;
    }
  }
  yy += 4;
  const info = [
    ['Cotización', cot.folio || '(sin guardar)'],
    ['Fecha', fechaLarga(cot.fecha)],
    ['Cliente', cot.cliente],
    ['Vehículo', d.vehiculo],
    ['Teléfono', d.telefono],
  ].filter(([, v]) => v);
  const xl = xd, wl = 70, xv = xd + wl + 8, wv = M + CW - xv;
  for (const [lab, val] of info) {
    const lineas = partir(val, f.reg, 9, wv - 10);
    const h = Math.max(15, lineas.length * 11 + 4);
    lz.texto(lab, xl, yy + 10.5, { size: 8, font: f.bold, color: C.gris, align: 'right', ancho: wl });
    lz.rect(xv, yy, wv, h, C.grisClaro);
    let ly = yy + 10.5;
    for (const ln of lineas) { lz.texto(ln, xv, ly, { size: 9, align: 'center', ancho: wv }); ly += 11; }
    yy += h + 2;
  }
  lz.y = Math.max(top + lh, yy) + 6;
  lz.rect(M, lz.y, CW, 1.5, P);
  lz.y += 18;

  // ---- Secciones ----
  const tieneNumeros = (it) => !it.nota;
  const sinCosto = (it, v) => (num(it.precio) === 0 ? 'SIN COSTO' : dinero(v));
  for (const sec of emp.secciones) {
    const filas = (d.items || []).filter((it) => it.seccion === sec.id && (it.descripcion || num(it.precio)));
    if (!filas.length) continue;
    lz.asegurar(60);
    lz.texto(sec.titulo.toUpperCase(), M, lz.y + 4, { size: 10, font: f.bold, color: P });
    lz.y += 10;

    const fondo = (it, i) => (i % 2 ? C.grisClaro : null);
    const cols = [
      {
        titulo: 'Descripción', w: 0, multilinea: true, valor: (it) => it.descripcion,
        fuente: (it, f) => (it.nota ? f.ital : f.reg), color: (it) => (it.nota ? C.gris : C.negro),
        fondo, ocupaHasta: (it, cs) => (it.nota ? CW : undefined),
        anchoTexto: (it, cs) => (it.nota ? CW - 10 : cs[0].ancho - 10),
      },
      ...(sec.conTipo ? [{ titulo: 'O/G', w: 72, align: 'center', valor: (it) => (it.nota ? '' : it.tipo || ''), fondo, oculta: (it) => it.nota }] : []),
      { titulo: 'Cant.', w: 42, align: 'center', valor: (it) => (tieneNumeros(it) ? fmtCant(it.cantidad) : ''), fondo, oculta: (it) => it.nota },
      { titulo: 'P. unitario', w: 82, align: 'right', valor: (it) => (tieneNumeros(it) ? sinCosto(it, num(it.precio)) : ''), fondo, oculta: (it) => it.nota },
      { titulo: 'Importe', w: 82, align: 'right', valor: (it) => (tieneNumeros(it) ? sinCosto(it, importe(it)) : ''), fondo, oculta: (it) => it.nota },
    ];
    tabla(lz, {
      cols, filas,
      encabezado: { fondo: C.negro, color: C.blanco },
      separador: (y) => lz.linea(M, y, M + CW, y),
    });
    lz.y += 16;
  }

  // ---- Totales ----
  const filasTot = [];
  for (const sec of emp.secciones) {
    if ((d.items || []).some((it) => it.seccion === sec.id && !it.nota)) {
      filasTot.push([sec.id === 'ref' ? 'Subtotal refacciones' : sec.titulo, dinero(t.porSeccion[sec.id])]);
    }
  }
  if (t.descuento) filasTot.push([etiquetaDescuento(d), '-' + dinero(t.descuento)]);
  if (d.iva) {
    filasTot.push(['Subtotal', dinero(t.base)]);
    filasTot.push([`IVA ${IVA_TASA * 100}%`, dinero(t.iva)]);
  }
  const altoTot = filasTot.length * 18 + 26;
  lz.asegurar(altoTot);
  const xt = M + CW - 270;
  for (const [lab, val] of filasTot) {
    lz.texto(lab, xt, lz.y + 12, { size: 9, align: 'right', ancho: 170 });
    lz.texto(val, xt + 178, lz.y + 12, { size: 9, align: 'right', ancho: 86 });
    lz.linea(xt + 20, lz.y + 17, M + CW, lz.y + 17, C.linea);
    lz.y += 18;
  }
  lz.y += 4;
  lz.rect(xt + 70, lz.y, 200, 22, suave);
  lz.texto('TOTAL MXN', xt + 70, lz.y + 15, { size: 10.5, font: f.bold, color: P, align: 'right', ancho: 100 });
  lz.texto(dinero(t.total), xt + 178, lz.y + 15, { size: 10.5, font: f.bold, color: P, align: 'right', ancho: 86 });
  lz.y += 36;

  // ---- Notas y condiciones ----
  bloqueTexto(lz, d.notas ? 'Notas: ' + d.notas : '', { fondo: null, color: C.negro, size: 8.5 });
  bloqueTexto(lz, d.condiciones ?? emp.condiciones, { fondo: C.grisClaro, color: C.gris, size: 8 });
  return lz;
}

// =====================================================================
// DK ENERGY
// =====================================================================
async function pdfDK(doc, f, cot) {
  const emp = EMPRESAS.dk;
  const N = hex(emp.colores.primario);
  const MED = hex(emp.colores.medio);
  const AZ = hex(emp.colores.suave);
  const logo = await doc.embedPng(await bytes(emp.logo));
  const banner = await doc.embedJpg(await bytes(emp.banner));
  const d = cot.datos || {};
  const t = calcular(cot);

  const lz = new Lienzo(doc, f, {
    margenInferior: 56,
    alNuevaPagina: (lz, primera) => {
      lz.rect(M, H - 40, CW, 4, N);
      lz.y = M;
      if (!primera) {
        lz.rect(M, lz.y, CW, 22, N);
        lz.texto(`COTIZACIÓN ${cot.folio || ''}  (continuación)`, M, lz.y + 15, { size: 10, font: f.bold, color: C.blanco, align: 'center', ancho: CW });
        lz.y += 30;
      }
    },
  });

  // ---- Encabezado ----
  const top = lz.y, hh = 108;
  const bw = (hh * banner.width) / banner.height;
  lz.imagen(banner, M, top, bw, hh);
  const lw = (hh * logo.width) / logo.height;
  lz.imagen(logo, M + bw + 6, top, lw, hh);
  const xc = M + bw + 6 + lw + 12, wc = M + CW - xc;
  let cy = top + 16;
  emp.contacto.forEach((ln, i) => {
    if (!ln) { cy += 5; return; }
    for (const p of partir(ln, i === 0 ? f.boldItal : f.ital, i === 0 ? 11 : 8.5, wc)) {
      lz.texto(p, xc, cy, { size: i === 0 ? 11 : 8.5, font: i === 0 ? f.boldItal : f.ital, color: i === 0 ? N : C.grisTxt });
      cy += i === 0 ? 13 : 10.5;
    }
  });
  lz.y = top + hh + 8;

  lz.rect(M, lz.y, CW, 28, N);
  lz.texto('COTIZACIÓN', M, lz.y + 19, { size: 15, font: f.bold, color: C.blanco, align: 'center', ancho: CW });
  lz.y += 36;

  // ---- Datos del cliente ----
  const pares = [
    ['FECHA:', fechaLarga(cot.fecha), 'No. COTIZACIÓN:', cot.folio || '(sin guardar)'],
    ['ESTADO / MPIO.:', d.ubicacion, 'CORREO:', d.correo],
    ['CLIENTE:', cot.cliente, 'TEL/CEL:', d.telefono],
  ];
  const l1 = 82, v1 = 204, l2 = 92, v2 = CW - l1 - v1 - l2 - 6;
  for (const [a, va, b, vb] of pares) {
    const lin1 = partir(va || '', f.reg, 8.5, v1 - 10);
    const lin2 = partir(vb || '', f.reg, 8.5, v2 - 10);
    const h = Math.max(16, Math.max(lin1.length, lin2.length) * 10.5 + 5);
    lz.texto(a, M, lz.y + 11, { size: 7.5, font: f.bold, color: N });
    lz.rect(M + l1, lz.y, v1, h, AZ);
    lin1.forEach((ln, i) => lz.texto(ln, M + l1 + 5, lz.y + 11 + i * 10.5, { size: 8.5, color: C.grisTxt }));
    const x2 = M + l1 + v1 + 6;
    lz.texto(b, x2, lz.y + 11, { size: 7.5, font: f.bold, color: N });
    lz.rect(x2 + l2, lz.y, v2, h, AZ);
    lin2.forEach((ln, i) => lz.texto(ln, x2 + l2, lz.y + 11 + i * 10.5, { size: 8.5, color: C.grisTxt, align: 'center', ancho: v2 }));
    lz.y += h + 2;
  }
  lz.y += 10;

  // ---- Artículos ----
  lz.rect(M, lz.y, CW, 18, MED);
  lz.texto('ARTÍCULOS', M + 6, lz.y + 12.5, { size: 9.5, font: f.bold, color: C.blanco });
  lz.y += 18;

  const filas = (d.items || []).filter((it) => it.descripcion || num(it.precio));
  const fondoAz = (it) => AZ;
  const cols = [
    { titulo: 'CANTIDAD', w: 66, align: 'center', valor: (it) => (it.nota ? '' : fmtCant(it.cantidad)), fondo: fondoAz },
    {
      titulo: 'DESCRIPCIÓN', w: 0, multilinea: true, valor: (it) => it.descripcion,
      fuente: (it, f) => (it.nota ? f.reg : f.bold), color: () => C.grisTxt, fondo: fondoAz,
    },
    { titulo: 'PRECIO UNITARIO', w: 92, align: 'right', valor: (it) => (it.nota ? '' : dinero(num(it.precio))), fondo: fondoAz },
    { titulo: 'IMPORTE', w: 92, align: 'right', valor: (it) => (it.nota ? '' : dinero(importe(it))), fondo: () => C.grisF2 },
  ];
  if (filas.length) {
    tabla(lz, {
      cols, filas, size: 8.5, filaMin: 16, pad: 4,
      encabezado: { fondo: N, color: C.blanco, size: 8 },
      separador: (y) => lz.linea(M, y, M + CW, y, C.blanco, 1),
    });
  }

  // ---- Totales ----
  const filasTot = [['SUBTOTAL', dinero(t.suma)]];
  if (t.descuento) filasTot.push([etiquetaDescuento(d).toUpperCase(), '-' + dinero(t.descuento)]);
  if (d.iva) {
    if (t.descuento) filasTot.push(['SUBTOTAL', dinero(t.base)]);
    filasTot.push([`IVA ${IVA_TASA * 100}%`, dinero(t.iva)]);
  }
  lz.asegurar(filasTot.length * 18 + 40);
  lz.y += 4;
  const wv = 92, wlab = 140, xv = M + CW - wv;
  for (const [lab, val] of filasTot) {
    lz.rect(xv - wlab, lz.y, wlab + wv, 17, C.grisF2);
    lz.texto(lab, xv - wlab, lz.y + 12, { size: 8.5, font: f.bold, color: N, align: 'right', ancho: wlab - 8 });
    lz.texto(val, xv, lz.y + 12, { size: 8.5, font: f.bold, color: C.grisTxt, align: 'right', ancho: wv - 5 });
    lz.y += 19;
  }
  lz.y += 2;
  lz.rect(M, lz.y, CW, 22, N);
  lz.texto('TOTAL', xv - wlab, lz.y + 15, { size: 11, font: f.bold, color: C.blanco, align: 'right', ancho: wlab - 8 });
  lz.texto(dinero(t.total), xv, lz.y + 15, { size: 11, font: f.bold, color: C.blanco, align: 'right', ancho: wv - 5 });
  lz.y += 32;

  bloqueTexto(lz, d.notas ? 'Notas: ' + d.notas : '', { fondo: null, color: C.grisTxt, size: 8.5 });
  bloqueTexto(lz, d.condiciones ?? emp.condiciones, { fondo: C.grisF2, color: N, size: 8.5, font: f.bold });
  return lz;
}

// ---------------------------------------------------------------------
function bloqueTexto(lz, txt, { fondo, color, size = 8, font }) {
  if (!txt || !String(txt).trim()) return;
  const fnt = font || lz.f.reg;
  const pad = 8, inter = size + 3;
  const lineas = partir(txt, fnt, size, CW - pad * 2);
  // si no cabe completo, se divide entre páginas
  let i = 0;
  while (i < lineas.length) {
    if (!lz.cabe(pad * 2 + inter)) lz.nuevaPagina();
    const disponibles = Math.max(1, Math.floor((H - lz.margenInferior - lz.y - pad * 2) / inter));
    const trozo = lineas.slice(i, i + disponibles);
    const h = trozo.length * inter + pad * 2 - 2;
    if (fondo) lz.rect(M, lz.y, CW, h, fondo);
    trozo.forEach((ln, k) => lz.texto(ln, M + pad, lz.y + pad + size + k * inter - 1, { size, font: fnt, color }));
    lz.y += h + 10;
    i += trozo.length;
  }
}

function etiquetaDescuento(d) {
  const v = d.descuento || {};
  return v.tipo === '%' ? `Descuento ${num(v.valor)}%` : 'Descuento';
}

const fmtCant = (v) => {
  const n = num(v);
  return Number.isInteger(n) ? new Intl.NumberFormat('es-MX').format(n) : new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 }).format(n);
};

function numerarPaginas(lz, f) {
  const total = lz.paginas.length;
  if (total < 2) return;
  lz.paginas.forEach((p, i) => {
    const s = `Página ${i + 1} de ${total}`;
    p.drawText(limpiar(s, f.reg), { x: W - M - f.reg.widthOfTextAtSize(s, 7.5), y: 24, size: 7.5, font: f.reg, color: C.gris });
  });
}

// =====================================================================
export async function generarPDF(cot) {
  const doc = await PDFDocument.create();
  const emp = EMPRESAS[cot.empresa];
  doc.setTitle(`Cotización ${cot.folio || ''} - ${emp.nombre}`);
  doc.setAuthor(emp.nombre);
  doc.setCreator('Cotizador');
  const f = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    ital: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItal: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const lz = cot.empresa === 'km' ? await pdfKM(doc, f, cot) : await pdfDK(doc, f, cot);
  numerarPaginas(lz, f);
  return doc.save();
}

export function nombreArchivo(cot) {
  const emp = EMPRESAS[cot.empresa];
  const cliente = (cot.cliente || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
  const base = emp.id === 'km' ? 'KM' : 'DK';
  return `Cotizacion_${base}_${cot.folio || 'borrador'}${cliente ? '_' + cliente : ''}.pdf`;
}
