import { EMPRESAS, ETIQUETAS, ESTADOS } from './empresas.js';
import { db, MODO_NUBE } from './db.js';
import { calcular, importe, dinero, fechaLarga, hoyISO, num } from './calc.js';
import { generarPDF, nombreArchivo } from './pdf.js';

// =====================================================================
// Utilidades
// =====================================================================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : 'i' + Date.now() + Math.random().toString(16).slice(2));
const clonar = (o) => JSON.parse(JSON.stringify(o));

const pref = {
  get(k, d) { try { const v = localStorage.getItem('cot_pref_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cot_pref_' + k, JSON.stringify(v)); } catch { /* nada */ } },
};

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const I = {
  mas: svg('<path d="M12 5v14M5 12h14"/>'),
  atras: svg('<path d="M15 18l-6-6 6-6"/>'),
  menu: svg('<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>'),
  buscar: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  compartir: svg('<path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>'),
  doc: svg('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),
  guardar: svg('<path d="M20 6L9 17l-5-5"/>'),
  usuario: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'),
  caja: svg('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'),
  cerrar: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
  basura: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  copiar: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>'),
  arriba: svg('<path d="M18 15l-6-6-6 6"/>'),
  abajo: svg('<path d="M6 9l6 6 6-6"/>'),
  estrella: svg('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>'),
  nota: svg('<path d="M4 6h16M4 12h10M4 18h7"/>'),
  descargar: svg('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
  whatsapp: svg('<path d="M3 21l1.7-5A8.5 8.5 0 1112 20.5a8.4 8.4 0 01-4.2-1.1z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 01-2-2l.8-1-1-2z"/>'),
  salir: svg('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>'),
  celular: svg('<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>'),
  libreta: svg('<path d="M4 4h12a4 4 0 014 4v12H8a4 4 0 01-4-4z"/><path d="M9 9h7M9 13h5"/>'),
};

let toastTimer;
function toast(msg, error = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'visible' + (error ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), error ? 4000 : 2200);
}

// =====================================================================
// Estado
// =====================================================================
const st = {
  empresa: pref.get('empresa', 'km'),
  ruta: { vista: 'lista' },
  lista: [],
  filtro: { q: '', estado: '' },
  cot: null,
  sucio: false,
  guardando: false,
  cache: {}, // { km: { clientes, productos }, dk: {...} }
  modal: null,
};
if (!EMPRESAS[st.empresa]) st.empresa = 'km';

const emp = () => EMPRESAS[st.empresa];

function aplicarTema() {
  document.documentElement.dataset.empresa = st.empresa;
  $('meta[name="theme-color"]').setAttribute('content', st.empresa === 'dk' ? '#1F3864' : '#111111');
}

// =====================================================================
// Rutas: #/km  #/km/clientes  #/km/productos  #/km/nueva  #/km/c/<id>
// =====================================================================
function leerRuta() {
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const e = EMPRESAS[partes[0]] ? partes[0] : st.empresa;
  const r = { empresa: e, vista: 'lista' };
  if (partes[1] === 'clientes') r.vista = 'clientes';
  else if (partes[1] === 'productos') r.vista = 'productos';
  else if (partes[1] === 'nueva') r.vista = 'nueva';
  else if (partes[1] === 'c' && partes[2]) { r.vista = 'editor'; r.id = partes[2]; }
  return r;
}
const ir = (hash) => { if (location.hash !== hash) location.hash = hash; else alCambiarRuta(); };
// replaceState no dispara "hashchange", así que no vuelve a pintar la vista
function reemplazarHash(hash) {
  history.replaceState(null, '', hash);
}

let rutaAnterior = location.hash;
async function alCambiarRuta() {
  const r = leerRuta();
  const enEditor = st.ruta.vista === 'editor' || st.ruta.vista === 'nueva';
  if (enEditor && st.sucio && r.vista !== st.ruta.vista) {
    if (!confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')) {
      reemplazarHash(rutaAnterior);
      return;
    }
    st.sucio = false;
  }
  rutaAnterior = location.hash;
  st.ruta = r;
  if (r.empresa !== st.empresa) {
    st.empresa = r.empresa;
    pref.set('empresa', r.empresa);
    st.filtro = { q: '', estado: '' };
  }
  aplicarTema();
  cerrarHoja();
  window.scrollTo(0, 0);
  try {
    if (r.vista === 'lista') await vistaLista();
    else if (r.vista === 'clientes') await vistaClientes();
    else if (r.vista === 'productos') await vistaProductos();
    else if (r.vista === 'nueva') vistaEditor(nuevaCotizacion());
    else if (r.vista === 'editor') {
      pintar(cabeceraEditor('Cargando…'), '<div class="vacio">Cargando…</div>');
      const c = await db.obtenerCotizacion(r.id);
      if (!c) { toast('No se encontró la cotización', true); return ir(`#/${st.empresa}`); }
      vistaEditor(normalizarCot(c));
    }
  } catch (e) {
    manejarError(e);
  }
}

function manejarError(e) {
  console.error(e);
  if (e?.status === 401) { iniciar(); return; }
  toast(e?.message || 'Ocurrió un error', true);
}

// =====================================================================
// Pintado general
// =====================================================================
function pintar(cabecera, contenido, extra = '') {
  $('#app').innerHTML = `${cabecera}<main>${contenido}</main>${extra}`;
}

function cabeceraPrincipal(activa) {
  const e = st.empresa;
  return `
  <header class="barra">
    <div class="barra-fila">
      <div class="empresas" role="group" aria-label="Empresa">
        ${Object.values(EMPRESAS).map((x) => `<button data-a="empresa" data-e="${x.id}" aria-pressed="${x.id === e}">${esc(x.nombre)}</button>`).join('')}
      </div>
      <button class="icono-btn" data-a="menu-general" aria-label="Menú">${I.menu}</button>
    </div>
    <nav class="pestanas">
      <a href="#/${e}" ${activa === 'lista' ? 'aria-current="page"' : ''}>Cotizaciones</a>
      <a href="#/${e}/clientes" ${activa === 'clientes' ? 'aria-current="page"' : ''}>Clientes</a>
      <a href="#/${e}/productos" ${activa === 'productos' ? 'aria-current="page"' : ''}>${e === 'km' ? 'Catálogo' : 'Productos'}</a>
    </nav>
    <div class="barra-acento"></div>
  </header>`;
}

function cabeceraEditor(titulo) {
  return `
  <header class="barra">
    <div class="barra-fila">
      <button class="icono-btn" data-a="volver" aria-label="Volver">${I.atras}</button>
      <h1 id="titulo-editor">${esc(titulo)}<span class="sub">${esc(emp().nombre)}</span></h1>
      <button class="icono-btn" data-a="menu-editor" aria-label="Más opciones">${I.menu}</button>
    </div>
    <div class="barra-acento"></div>
  </header>`;
}

// =====================================================================
// Lista de cotizaciones
// =====================================================================
async function vistaLista() {
  pintar(cabeceraPrincipal('lista'), '<div class="vacio">Cargando…</div>');
  const empresa = st.empresa;
  const lista = await db.listarCotizaciones(empresa);
  if (empresa !== st.empresa || st.ruta.vista !== 'lista') return;
  st.lista = lista;
  pintar(
    cabeceraPrincipal('lista'),
    `${resumenMes()}
     <div class="buscador">${I.buscar}<input class="entrada" type="search" id="buscar" placeholder="Buscar por cliente o folio" value="${esc(st.filtro.q)}" autocomplete="off"></div>
     <div class="chips" role="group" aria-label="Filtrar por estado">
       <button class="chip" data-a="filtro-estado" data-v="" aria-pressed="${!st.filtro.estado}">Todas</button>
       ${Object.entries(ESTADOS).map(([k, v]) => `<button class="chip" data-a="filtro-estado" data-v="${k}" aria-pressed="${st.filtro.estado === k}">${v}</button>`).join('')}
     </div>
     <div class="lista" id="lista"></div>`,
    `<button class="fab" data-a="nueva">${I.mas}<span>Nueva cotización</span></button>`
  );
  pintarFilas();
}

function resumenMes() {
  const mes = hoyISO().slice(0, 7);
  const delMes = st.lista.filter((c) => (c.fecha || '').startsWith(mes));
  const cotizado = delMes.reduce((a, c) => a + num(c.total), 0);
  const aceptado = delMes.filter((c) => c.estado === 'aceptada').reduce((a, c) => a + num(c.total), 0);
  const corto = (n) => (n >= 100000 ? '$' + Math.round(n / 1000).toLocaleString('es-MX') + 'k' : dinero(n).replace(/\.00$/, ''));
  return `<div class="resumen">
    <div><span>Este mes</span><b>${delMes.length}</b></div>
    <div><span>Cotizado</span><b>${corto(cotizado)}</b></div>
    <div><span>Aceptado</span><b>${corto(aceptado)}</b></div>
  </div>`;
}

function pintarFilas() {
  const cont = $('#lista');
  if (!cont) return;
  const q = norm(st.filtro.q);
  const filas = st.lista.filter((c) =>
    (!st.filtro.estado || c.estado === st.filtro.estado) &&
    (!q || norm(c.cliente).includes(q) || norm(c.folio).includes(q))
  );
  if (!filas.length) {
    cont.innerHTML = st.lista.length
      ? `<div class="vacio">No hay cotizaciones con ese filtro.</div>`
      : `<div class="vacio">${I.doc}<p>Aún no tienes cotizaciones de ${esc(emp().nombre)}.</p><button class="btn primario" data-a="nueva">${I.mas} Crear la primera</button></div>`;
    return;
  }
  cont.innerHTML = filas.map((c) => `
    <a class="fila-cot" href="#/${st.empresa}/c/${esc(c.id)}">
      <span class="cliente">${esc(c.cliente || 'Sin cliente')}</span>
      <span class="total">${dinero(c.total)}</span>
      <span class="meta">${esc(c.folio)} · ${fechaLarga(c.fecha)}</span>
      <span class="badge ${esc(c.estado)}">${esc(ESTADOS[c.estado] || c.estado)}</span>
    </a>`).join('');
}

// =====================================================================
// Cotización: modelo
// =====================================================================
function itemVacio(seccion, extra = {}) {
  return { id: nuevoId(), seccion, descripcion: '', tipo: '', cantidad: 1, precio: '', ...extra };
}

function nuevaCotizacion(base = {}) {
  const e = emp();
  return {
    empresa: e.id, folio: '', fecha: hoyISO(), cliente: '', estado: 'borrador', total: 0,
    datos: {
      telefono: '', correo: '', vehiculo: '', titulo: '', ubicacion: e.ubicacionDefault || '',
      items: [itemVacio(e.secciones[0].id, e.secciones[0].conTipo ? { tipo: e.tipos[0] } : {})],
      descuento: { tipo: '%', valor: '' }, iva: false, notas: '', condiciones: e.condiciones,
    },
    ...base,
  };
}

function normalizarCot(c) {
  const e = EMPRESAS[c.empresa];
  const d = c.datos || {};
  return {
    ...c,
    datos: {
      telefono: '', correo: '', vehiculo: '', titulo: '', ubicacion: '', notas: '',
      condiciones: e.condiciones, iva: false,
      ...d,
      descuento: { tipo: '%', valor: '', ...(d.descuento || {}) },
      items: (d.items || []).map((it) => ({ id: nuevoId(), ...it })),
    },
  };
}

// =====================================================================
// Editor
// =====================================================================
function pintarEditor(cot) {
  st.cot = cot;
  st.sucio = false;
  const e = emp();
  const d = cot.datos;
  const campo = (k) => {
    const tipos = { telefono: 'tel', correo: 'email' };
    const extra = k === 'telefono' ? 'inputmode="tel" autocomplete="tel"' : k === 'correo' ? 'inputmode="email" autocomplete="email"' : 'autocomplete="off"';
    if (k === 'cliente') {
      return `<label class="campo ancho">Cliente
        <div class="con-boton"><input data-f="cliente" value="${esc(cot.cliente)}" placeholder="Nombre del cliente" autocomplete="off" autocapitalize="words">
        <button class="btn secundario" type="button" data-a="elegir-cliente" aria-label="Elegir de mis clientes">${I.libreta}</button></div></label>`;
    }
    const ancho = k === 'titulo' || k === 'ubicacion' ? 'ancho' : '';
    return `<label class="campo ${ancho}">${esc(ETIQUETAS[k])}<input type="${tipos[k] || 'text'}" data-f="datos.${k}" value="${esc(d[k])}" ${extra}></label>`;
  };

  const secciones = e.secciones.map((s) => `
    <section class="tarjeta">
      <h2>${esc(s.titulo)} <span class="der" data-subtotal="${s.id}"></span></h2>
      <div class="conceptos" id="sec-${s.id}">${d.items.map((it, i) => (it.seccion === s.id ? htmlConcepto(it, i, s) : '')).join('')}</div>
      <div class="botones" style="margin-top:12px">
        <button class="btn secundario chico" data-a="agregar" data-sec="${s.id}">${I.mas} Concepto</button>
        <button class="btn chico" data-a="desde-catalogo" data-sec="${s.id}">${I.caja} Del catálogo</button>
        <button class="btn chico" data-a="agregar-nota" data-sec="${s.id}">${I.nota} Nota</button>
      </div>
    </section>`).join('');

  pintar(
    cabeceraEditor(cot.folio || 'Nueva cotización'),
    `<section class="tarjeta">
      <h2>Datos</h2>
      <div class="rejilla">
        ${campo('cliente')}
        <label class="campo">Fecha<input type="date" data-f="fecha" value="${esc(cot.fecha)}"></label>
        <label class="campo">Estado<select data-f="estado">${Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}" ${cot.estado === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        ${e.campos.filter((k) => k !== 'cliente').map(campo).join('')}
      </div>
    </section>
    ${secciones}
    <section class="tarjeta">
      <h2>Totales</h2>
      <div class="interruptor" style="margin-bottom:10px">
        <span>Descuento</span>
        <div class="con-boton" style="max-width:220px">
          <div class="segmento">
            <button type="button" data-a="desc-tipo" data-v="%" aria-pressed="${d.descuento.tipo === '%'}">%</button>
            <button type="button" data-a="desc-tipo" data-v="$" aria-pressed="${d.descuento.tipo === '$'}">$</button>
          </div>
          <input class="entrada" data-f="datos.descuento.valor" inputmode="decimal" placeholder="0" value="${esc(d.descuento.valor)}" style="text-align:right">
        </div>
      </div>
      <label class="interruptor"><span>Agregar IVA (16%)</span><input type="checkbox" data-f="datos.iva" ${d.iva ? 'checked' : ''}></label>
      <div class="totales" id="totales" style="margin-top:12px"></div>
    </section>
    <section class="tarjeta">
      <details class="plegable" ${d.notas ? 'open' : ''}>
        <summary>Notas para el cliente</summary>
        <div><textarea class="entrada" data-f="datos.notas" rows="3" placeholder="Aparecen en el PDF antes de las condiciones">${esc(d.notas)}</textarea></div>
      </details>
    </section>
    <section class="tarjeta">
      <details class="plegable">
        <summary>Condiciones (texto al pie)</summary>
        <div>
          <textarea class="entrada" data-f="datos.condiciones" rows="5">${esc(d.condiciones)}</textarea>
          <button class="btn chico" style="margin-top:8px" data-a="restaurar-condiciones">Restaurar texto original</button>
        </div>
      </details>
    </section>`,
    `<div class="pie-editor"><div class="dentro">
      <div class="tot"><span>Total</span><b id="pie-total">$0.00</b></div>
      <button class="btn" data-a="guardar" id="btn-guardar">${I.guardar}<span>Guardar</span></button>
      <button class="btn primario" data-a="pdf">${esCelular() ? I.compartir : I.doc}<span>${esCelular() ? 'Compartir' : 'Ver PDF'}</span></button>
    </div></div>`
  );
  $$('.concepto textarea').forEach(autoAltura);
  actualizarTotales();
  if (!cot.id && !matchMedia('(pointer: coarse)').matches) $('[data-f="cliente"]')?.focus();
}

function htmlConcepto(it, i, sec) {
  const e = emp();
  if (it.nota) {
    return `<div class="concepto nota" data-fila="${i}">
      <div class="c-desc"><span class="mini">Nota (sin precio)</span><textarea class="entrada" data-i="${i}" data-k="descripcion" rows="1" placeholder="Ej. Entrega en 2 días hábiles">${esc(it.descripcion)}</textarea></div>
      <div class="c-menu"><button class="icono-btn" data-a="menu-concepto" data-i="${i}" aria-label="Opciones">${I.menu}</button></div>
    </div>`;
  }
  return `<div class="concepto ${sec.conTipo ? '' : 'sin-tipo'}" data-fila="${i}">
    <div class="c-desc"><span class="mini">Descripción</span><textarea class="entrada" data-i="${i}" data-k="descripcion" rows="1" placeholder="${e.id === 'km' ? (sec.id === 'ref' ? 'Ej. Amortiguador delantero' : 'Ej. Cambio de amortiguadores') : 'Ej. Panel solar 550W'}">${esc(it.descripcion)}</textarea></div>
    ${sec.conTipo ? `<div class="c-tipo"><span class="mini">O/G</span><select class="entrada" data-i="${i}" data-k="tipo">${e.tipos.map((t) => `<option value="${t}" ${it.tipo === t ? 'selected' : ''}>${e.tiposCorto?.[t] || t}</option>`).join('')}<option value="" ${!it.tipo ? 'selected' : ''}>—</option></select></div>` : ''}
    <div class="c-cant"><span class="mini">Cant.</span><input class="entrada" data-i="${i}" data-k="cantidad" inputmode="decimal" value="${esc(it.cantidad)}"></div>
    <div class="c-precio"><span class="mini">Precio unit.</span><input class="entrada" data-i="${i}" data-k="precio" inputmode="decimal" placeholder="0.00" value="${esc(it.precio)}"></div>
    <div class="c-imp" data-imp="${i}"><small>Importe</small>${dineroItem(it)}</div>
    <div class="c-menu"><button class="icono-btn" data-a="menu-concepto" data-i="${i}" aria-label="Opciones">${I.menu}</button></div>
  </div>`;
}

const dineroItem = (it) => (it.descripcion && num(it.precio) === 0 && st.empresa === 'km' ? 'SIN COSTO' : dinero(importe(it)));

function repintarSecciones() {
  const e = emp();
  for (const s of e.secciones) {
    const cont = $(`#sec-${s.id}`);
    if (cont) cont.innerHTML = st.cot.datos.items.map((it, i) => (it.seccion === s.id ? htmlConcepto(it, i, s) : '')).join('');
  }
  $$('.concepto textarea').forEach(autoAltura);
  actualizarTotales();
}

function actualizarTotales() {
  const c = st.cot;
  const t = calcular(c);
  const e = emp();
  c.total = t.total;
  for (const s of e.secciones) {
    const el = $(`[data-subtotal="${s.id}"]`);
    if (el) el.textContent = e.secciones.length > 1 ? dinero(t.porSeccion[s.id]) : '';
  }
  const filas = [];
  if (e.secciones.length > 1) for (const s of e.secciones) filas.push([s.id === 'ref' ? 'Refacciones' : s.titulo, dinero(t.porSeccion[s.id])]);
  else filas.push(['Subtotal', dinero(t.suma)]);
  if (t.descuento) filas.push(['Descuento', '-' + dinero(t.descuento)]);
  if (c.datos.iva) {
    if (t.descuento || e.secciones.length > 1) filas.push(['Subtotal', dinero(t.base)]);
    filas.push(['IVA 16%', dinero(t.iva)]);
  }
  $('#totales').innerHTML = filas.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('') +
    `<div class="gran"><span>Total MXN</span><b>${dinero(t.total)}</b></div>`;
  $('#pie-total').textContent = dinero(t.total);
}

function autoAltura(el) {
  el.style.height = 'auto';
  el.style.height = Math.max(44, el.scrollHeight + 2) + 'px';
}

function marcarSucio() {
  st.sucio = true;
  const b = $('#btn-guardar');
  if (b) b.classList.add('secundario');
}

function fijarRuta(obj, ruta, valor) {
  const p = ruta.split('.');
  let o = obj;
  for (let i = 0; i < p.length - 1; i++) o = o[p[i]];
  o[p[p.length - 1]] = valor;
}

// ---------- Folio ----------
async function asignarFolio(cot) {
  const e = EMPRESAS[cot.empresa];
  const f = e.folio;
  let clave = 'global';
  if (f.porDia) {
    const [y, m, d] = (cot.fecha || hoyISO()).split('-');
    clave = `${d}${m}${y.slice(2)}`;
  }
  const n = await db.siguienteFolio(e.id, clave, f.inicio);
  const consecutivo = String(n).padStart(f.digitos, '0');
  return f.porDia ? `${f.prefijo}-${clave}-${consecutivo}` : `${f.prefijo}${consecutivo}`;
}

// ---------- Guardar ----------
async function guardar() {
  if (st.guardando) return false;
  const c = st.cot;
  if (!c.cliente.trim()) {
    toast('Escribe el nombre del cliente', true);
    $('[data-f="cliente"]')?.focus();
    return false;
  }
  st.guardando = true;
  const b = $('#btn-guardar');
  if (b) b.disabled = true;
  try {
    c.datos.items = c.datos.items.filter((it) => String(it.descripcion).trim() || num(it.precio));
    c.total = calcular(c).total;
    if (!c.folio) c.folio = await asignarFolio(c);
    const nuevo = !c.id;
    const fila = await db.guardarCotizacion(c);
    st.cot = normalizarCot(fila);
    st.sucio = false;
    repintarSecciones();
    if (nuevo) {
      reemplazarHash(`#/${c.empresa}/c/${fila.id}`);
      rutaAnterior = location.hash;
      st.ruta = { empresa: c.empresa, vista: 'editor', id: fila.id };
    }
    $('#titulo-editor').innerHTML = `${esc(st.cot.folio)}<span class="sub">${esc(emp().nombre)}</span>`;
    b?.classList.remove('secundario');
    toast(nuevo ? `Cotización ${st.cot.folio} guardada` : 'Cambios guardados');
    guardarClienteDesdeCot(st.cot).catch(() => {});
    return true;
  } catch (e) {
    manejarError(e);
    return false;
  } finally {
    st.guardando = false;
    if (b) b.disabled = false;
  }
}

async function guardarClienteDesdeCot(c) {
  const lista = await catalogo('clientes');
  const d = c.datos;
  const existente = lista.find((x) => norm(x.nombre) === norm(c.cliente));
  const datos = { telefono: d.telefono, correo: d.correo, ubicacion: d.ubicacion, vehiculo: d.vehiculo };
  if (existente) {
    const cambios = Object.fromEntries(Object.entries(datos).filter(([k, v]) => v && v !== existente[k]));
    if (!Object.keys(cambios).length) return;
    Object.assign(existente, await db.guardar('clientes', { ...existente, ...cambios }));
  } else {
    lista.push(await db.guardar('clientes', { empresa: c.empresa, nombre: c.cliente.trim(), ...datos }));
  }
}

// ---------- PDF ----------
function esCelular() {
  return matchMedia('(pointer: coarse)').matches && typeof navigator.canShare === 'function';
}

async function crearArchivoPDF() {
  const bytes = await generarPDF(st.cot);
  const nombre = nombreArchivo(st.cot);
  return new File([bytes], nombre, { type: 'application/pdf' });
}

async function accionPDF(modo) {
  if (st.sucio || !st.cot.id) {
    const ok = await guardar();
    if (!ok) return;
  }
  // En escritorio se abre la pestaña antes de esperar (evita bloqueo de ventanas emergentes)
  const ventana = modo === 'ver' ? window.open('', '_blank') : null;
  let archivo;
  try {
    toast('Generando PDF…');
    archivo = await crearArchivoPDF();
  } catch (e) {
    ventana?.close();
    return manejarError(e);
  }
  if (modo === 'ver') {
    const url = URL.createObjectURL(archivo);
    if (ventana) ventana.location.href = url;
    else descargar(archivo);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  if (modo === 'descargar') return descargar(archivo);
  // compartir
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: archivo.name });
      if (st.cot.estado === 'borrador') sugerirEnviada();
    } catch (e) {
      if (e.name === 'NotAllowedError') hojaPDFListo(archivo); // Safari pide un toque nuevo
      else if (e.name !== 'AbortError') manejarError(e);
    }
  } else {
    descargar(archivo);
  }
}

function descargar(archivo) {
  const url = URL.createObjectURL(archivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  toast('PDF descargado');
}

function hojaPDFListo(archivo) {
  abrirHoja({
    titulo: 'PDF listo',
    cuerpo: `<p class="texto-2" style="margin-top:0">${esc(archivo.name)}</p>
      <div class="menu-acciones">
        <button class="btn primario" data-a="h-compartir">${I.compartir} Compartir (WhatsApp, correo…)</button>
        <button class="btn" data-a="h-descargar">${I.descargar} Guardar en archivos</button>
      </div>`,
    acciones: {
      'h-compartir': async () => {
        try { await navigator.share({ files: [archivo], title: archivo.name }); cerrarHoja(); if (st.cot.estado === 'borrador') sugerirEnviada(); }
        catch (e) { if (e.name !== 'AbortError') manejarError(e); }
      },
      'h-descargar': () => { descargar(archivo); cerrarHoja(); },
    },
  });
}

function sugerirEnviada() {
  abrirHoja({
    titulo: '¿Marcar como enviada?',
    cuerpo: `<p class="texto-2" style="margin-top:0">Así podrás distinguirla de los borradores en tu lista.</p>`,
    pie: `<button class="btn" data-a="h-no">Ahora no</button><button class="btn primario" data-a="h-si">Sí, enviada</button>`,
    acciones: {
      'h-no': cerrarHoja,
      'h-si': async () => {
        cerrarHoja();
        st.cot.estado = 'enviada';
        const sel = $('[data-f="estado"]');
        if (sel) sel.value = 'enviada';
        await guardar();
      },
    },
  });
}

function mensajeWhatsApp() {
  const c = st.cot;
  const tel = String(c.datos.telefono || '').replace(/\D/g, '');
  const numero = tel.length === 10 ? '52' + tel : tel;
  const texto = `Hola ${c.cliente.split(' ')[0] || ''}, te comparto la cotización ${c.folio} de ${emp().nombre} por un total de ${dinero(c.total)} MXN.`;
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
}

// =====================================================================
// Catálogos
// =====================================================================
async function catalogo(tabla, forzar = false) {
  const e = st.empresa;
  st.cache[e] = st.cache[e] || {};
  if (forzar || !st.cache[e][tabla]) {
    st.cache[e][tabla] = await db.listar(tabla, e, tabla === 'clientes' ? 'nombre' : 'descripcion');
  }
  return st.cache[e][tabla];
}

async function vistaClientes() {
  pintar(cabeceraPrincipal('clientes'), '<div class="vacio">Cargando…</div>');
  const lista = await catalogo('clientes', true);
  if (st.ruta.vista !== 'clientes') return;
  pintar(
    cabeceraPrincipal('clientes'),
    `<div class="buscador">${I.buscar}<input class="entrada" type="search" id="buscar-cat" placeholder="Buscar cliente" autocomplete="off"></div>
     <div class="lista" id="lista-cat"></div>`,
    `<button class="fab" data-a="cliente-nuevo">${I.mas}<span>Cliente</span></button>`
  );
  pintarClientes(lista, '');
}

function pintarClientes(lista, q, destino = '#lista-cat', accion = 'cliente-editar') {
  const nq = norm(q);
  const filas = lista.filter((c) => !nq || norm(c.nombre).includes(nq) || norm(c.telefono).includes(nq) || norm(c.vehiculo).includes(nq));
  $(destino).innerHTML = filas.length
    ? filas.map((c) => `<button class="item-cat" data-a="${accion}" data-id="${esc(c.id)}">
        <div class="txt"><b>${esc(c.nombre)}</b><span>${esc([c.telefono, st.empresa === 'km' ? c.vehiculo : c.ubicacion].filter(Boolean).join(' · ') || '—')}</span></div>
      </button>`).join('')
    : `<div class="vacio">${I.usuario}<p>${lista.length ? 'Sin resultados.' : 'Los clientes se guardan solos al guardar una cotización, o puedes agregarlos aquí.'}</p></div>`;
}

async function vistaProductos() {
  pintar(cabeceraPrincipal('productos'), '<div class="vacio">Cargando…</div>');
  const lista = await catalogo('productos', true);
  if (st.ruta.vista !== 'productos') return;
  pintar(
    cabeceraPrincipal('productos'),
    `<div class="buscador">${I.buscar}<input class="entrada" type="search" id="buscar-cat" placeholder="Buscar en el catálogo" autocomplete="off"></div>
     <div id="lista-cat"></div>`,
    `<button class="fab" data-a="producto-nuevo">${I.mas}<span>Agregar</span></button>`
  );
  pintarProductos(lista, '');
}

function pintarProductos(lista, q, destino = '#lista-cat', accion = 'producto-editar', soloSeccion = null) {
  const nq = norm(q);
  const e = emp();
  let html = '';
  for (const s of e.secciones) {
    if (soloSeccion && s.id !== soloSeccion) continue;
    const filas = lista.filter((p) => p.seccion === s.id && (!nq || norm(p.descripcion).includes(nq)));
    if (!filas.length) continue;
    if (e.secciones.length > 1 && !soloSeccion) html += `<div class="subtitulo-lista">${esc(s.titulo)}</div>`;
    html += `<div class="lista">${filas.map((p) => `<button class="item-cat" data-a="${accion}" data-id="${esc(p.id)}">
        <div class="txt"><b>${esc(p.descripcion)}</b><span>${esc(p.tipo || '')}</span></div>
        <span class="precio">${num(p.precio) ? dinero(p.precio) : 'Sin costo'}</span>
      </button>`).join('')}</div>`;
  }
  $(destino).innerHTML = html || `<div class="vacio">${I.caja}<p>${lista.length ? 'Sin resultados.' : 'Guarda aquí tus productos y servicios frecuentes con su precio para agregarlos rápido a las cotizaciones.'}</p></div>`;
}

function formCliente(c = {}) {
  const km = st.empresa === 'km';
  return `<div class="rejilla">
    <label class="campo ancho">Nombre<input id="fc-nombre" value="${esc(c.nombre)}" autocapitalize="words" autocomplete="off"></label>
    <label class="campo">Teléfono / WhatsApp<input id="fc-telefono" type="tel" inputmode="tel" value="${esc(c.telefono)}"></label>
    <label class="campo">Correo<input id="fc-correo" type="email" inputmode="email" value="${esc(c.correo)}"></label>
    ${km ? `<label class="campo ancho">Vehículo<input id="fc-vehiculo" value="${esc(c.vehiculo)}"></label>`
         : `<label class="campo ancho">Estado / Municipio<input id="fc-ubicacion" value="${esc(c.ubicacion)}"></label>`}
  </div>`;
}

function leerFormCliente() {
  const v = (id) => $(`#fc-${id}`)?.value.trim() ?? '';
  return { nombre: v('nombre'), telefono: v('telefono'), correo: v('correo'), vehiculo: v('vehiculo'), ubicacion: v('ubicacion') };
}

async function editarCliente(id) {
  const lista = await catalogo('clientes');
  const c = id ? lista.find((x) => x.id === id) : { empresa: st.empresa };
  if (!c) return;
  abrirHoja({
    titulo: id ? 'Cliente' : 'Nuevo cliente',
    cuerpo: formCliente(c),
    pie: `${id ? `<button class="btn peligro" data-a="h-borrar">${I.basura}</button><button class="btn" data-a="h-cotizar">${I.doc} Cotizar</button>` : ''}
          <button class="btn primario" data-a="h-guardar">Guardar</button>`,
    alAbrir: () => !id && $('#fc-nombre').focus(),
    acciones: {
      'h-guardar': async () => {
        const datos = leerFormCliente();
        if (!datos.nombre) return toast('Escribe el nombre', true);
        try {
          await db.guardar('clientes', { ...c, ...datos, empresa: st.empresa });
          cerrarHoja();
          toast('Cliente guardado');
          vistaClientes();
        } catch (e) { manejarError(e); }
      },
      'h-borrar': async () => {
        if (!confirm(`¿Eliminar a ${c.nombre}? Sus cotizaciones no se borran.`)) return;
        try { await db.eliminar('clientes', c.id); cerrarHoja(); toast('Cliente eliminado'); vistaClientes(); } catch (e) { manejarError(e); }
      },
      'h-cotizar': () => {
        cerrarHoja();
        st.clientePendiente = c;
        ir(`#/${st.empresa}/nueva`);
      },
    },
  });
}

function formProducto(p = {}) {
  const e = emp();
  const sec = p.seccion || e.secciones[0].id;
  const conTipo = e.secciones.find((s) => s.id === sec)?.conTipo;
  return `<div class="rejilla">
    ${e.secciones.length > 1 ? `<label class="campo ancho">Sección<select id="fp-seccion">${e.secciones.map((s) => `<option value="${s.id}" ${s.id === sec ? 'selected' : ''}>${esc(s.titulo)}</option>`).join('')}</select></label>` : ''}
    <label class="campo ancho">Descripción<textarea id="fp-descripcion" rows="2">${esc(p.descripcion)}</textarea></label>
    <label class="campo" id="fp-tipo-campo" ${conTipo ? '' : 'hidden'}>Original / Genérico<select id="fp-tipo">${e.tipos.map((t) => `<option ${p.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}<option value="" ${conTipo && !p.tipo && p.id ? 'selected' : ''}>—</option></select></label>
    <label class="campo">Precio<input id="fp-precio" inputmode="decimal" placeholder="0.00" value="${esc(p.precio ?? '')}"></label>
  </div>`;
}

async function editarProducto(id, inicial = {}) {
  const lista = await catalogo('productos');
  const p = id ? lista.find((x) => x.id === id) : { empresa: st.empresa, ...inicial };
  if (!p) return;
  abrirHoja({
    titulo: id ? 'Editar' : 'Agregar al catálogo',
    cuerpo: formProducto(p),
    pie: `${id ? `<button class="btn peligro" data-a="h-borrar">${I.basura}</button>` : ''}<button class="btn primario" data-a="h-guardar">Guardar</button>`,
    alAbrir: (h) => {
      if (!id) $('#fp-descripcion').focus();
      $('#fp-seccion', h)?.addEventListener('change', (ev) => {
        const conTipo = emp().secciones.find((s) => s.id === ev.target.value)?.conTipo;
        $('#fp-tipo-campo').hidden = !conTipo;
      });
    },
    acciones: {
      'h-guardar': async () => {
        const seccion = $('#fp-seccion')?.value || emp().secciones[0].id;
        const conTipo = emp().secciones.find((s) => s.id === seccion)?.conTipo;
        const datos = {
          empresa: st.empresa, seccion,
          descripcion: $('#fp-descripcion').value.trim(),
          tipo: conTipo ? $('#fp-tipo').value : null,
          precio: num($('#fp-precio').value),
        };
        if (!datos.descripcion) return toast('Escribe la descripción', true);
        try {
          await db.guardar('productos', { ...p, ...datos });
          await catalogo('productos', true);
          cerrarHoja();
          toast('Guardado en el catálogo');
          if (st.ruta.vista === 'productos') vistaProductos();
        } catch (e) { manejarError(e); }
      },
      'h-borrar': async () => {
        if (!confirm('¿Eliminar del catálogo?')) return;
        try { await db.eliminar('productos', p.id); await catalogo('productos', true); cerrarHoja(); toast('Eliminado'); vistaProductos(); } catch (e) { manejarError(e); }
      },
    },
  });
}

// ---------- Selectores dentro del editor ----------
async function elegirCliente() {
  let lista;
  try { lista = await catalogo('clientes', true); } catch (e) { return manejarError(e); }
  abrirHoja({
    titulo: 'Elegir cliente',
    cuerpo: `<div class="buscador">${I.buscar}<input class="entrada" type="search" id="buscar-hoja" placeholder="Buscar" autocomplete="off"></div><div class="lista" id="lista-hoja"></div>`,
    alAbrir: () => {
      pintarClientes(lista, '', '#lista-hoja', 'h-elegir');
      $('#buscar-hoja').addEventListener('input', (ev) => pintarClientes(lista, ev.target.value, '#lista-hoja', 'h-elegir'));
    },
    acciones: {
      'h-elegir': (el) => {
        const c = lista.find((x) => x.id === el.dataset.id);
        if (c) aplicarCliente(c);
        cerrarHoja();
      },
    },
  });
}

function aplicarCliente(c) {
  const cot = st.cot;
  cot.cliente = c.nombre;
  for (const k of ['telefono', 'correo', 'ubicacion', 'vehiculo']) if (c[k]) cot.datos[k] = c[k];
  for (const el of $$('[data-f]')) {
    const ruta = el.dataset.f;
    if (ruta === 'cliente') el.value = cot.cliente;
    else if (ruta.startsWith('datos.') && ['telefono', 'correo', 'ubicacion', 'vehiculo'].includes(ruta.slice(6))) el.value = cot.datos[ruta.slice(6)] || '';
  }
  marcarSucio();
}

async function desdeCatalogo(seccion) {
  let lista;
  try { lista = await catalogo('productos', true); } catch (e) { return manejarError(e); }
  let agregados = 0;
  const sec = emp().secciones.find((s) => s.id === seccion);
  abrirHoja({
    titulo: `Agregar a ${sec.titulo.toLowerCase()}`,
    cuerpo: `<div class="buscador">${I.buscar}<input class="entrada" type="search" id="buscar-hoja" placeholder="Buscar" autocomplete="off"></div><div id="lista-hoja"></div>`,
    pie: `<button class="btn" data-a="h-nuevo">${I.mas} Nuevo</button><button class="btn primario" data-a="h-listo">Listo</button>`,
    alAbrir: () => {
      pintarProductos(lista, '', '#lista-hoja', 'h-elegir', seccion);
      $('#buscar-hoja').addEventListener('input', (ev) => pintarProductos(lista, ev.target.value, '#lista-hoja', 'h-elegir', seccion));
    },
    acciones: {
      'h-elegir': (el) => {
        const p = lista.find((x) => x.id === el.dataset.id);
        if (!p) return;
        const items = st.cot.datos.items;
        // reemplaza una fila vacía de la sección si existe
        const vacia = items.findIndex((it) => it.seccion === seccion && !it.nota && !String(it.descripcion).trim() && !num(it.precio));
        const nuevo = itemVacio(seccion, { descripcion: p.descripcion, tipo: p.tipo || '', precio: num(p.precio) });
        if (vacia >= 0) items[vacia] = nuevo; else insertarEnSeccion(nuevo);
        agregados++;
        marcarSucio();
        repintarSecciones();
        toast(`Agregado (${agregados})`);
      },
      'h-listo': cerrarHoja,
      'h-nuevo': () => { cerrarHoja(); editarProducto(null, { seccion }); },
    },
  });
}

function insertarEnSeccion(item) {
  const items = st.cot.datos.items;
  let pos = -1;
  items.forEach((it, i) => { if (it.seccion === item.seccion) pos = i; });
  if (pos < 0) {
    // después de la última fila de una sección anterior
    const orden = emp().secciones.map((s) => s.id);
    const idx = orden.indexOf(item.seccion);
    items.forEach((it, i) => { if (orden.indexOf(it.seccion) < idx) pos = i; });
  }
  items.splice(pos + 1, 0, item);
  return pos + 1;
}

function menuConcepto(i) {
  const items = st.cot.datos.items;
  const it = items[i];
  const mismos = items.map((x, k) => (x.seccion === it.seccion ? k : -1)).filter((k) => k >= 0);
  const p = mismos.indexOf(i);
  abrirHoja({
    titulo: it.descripcion ? it.descripcion.slice(0, 40) : (it.nota ? 'Nota' : 'Concepto'),
    cuerpo: `<div class="menu-acciones">
      ${p > 0 ? `<button class="btn" data-a="h-subir">${I.arriba} Subir</button>` : ''}
      ${p < mismos.length - 1 ? `<button class="btn" data-a="h-bajar">${I.abajo} Bajar</button>` : ''}
      <button class="btn" data-a="h-duplicar">${I.copiar} Duplicar</button>
      ${!it.nota ? `<button class="btn" data-a="h-catalogo">${I.estrella} Guardar en catálogo</button>` : ''}
      <button class="btn" data-a="h-nota">${I.nota} ${it.nota ? 'Convertir en concepto con precio' : 'Convertir en nota (sin precio)'}</button>
      <button class="btn peligro" data-a="h-borrar">${I.basura} Eliminar</button>
    </div>`,
    acciones: {
      'h-subir': () => { const j = mismos[p - 1]; [items[j], items[i]] = [items[i], items[j]]; fin(); },
      'h-bajar': () => { const j = mismos[p + 1]; [items[j], items[i]] = [items[i], items[j]]; fin(); },
      'h-duplicar': () => { items.splice(i + 1, 0, { ...clonar(it), id: nuevoId() }); fin(); },
      'h-nota': () => { it.nota = !it.nota; fin(); },
      'h-borrar': () => { items.splice(i, 1); fin(); },
      'h-catalogo': async () => {
        if (!String(it.descripcion).trim()) return toast('Escribe primero la descripción', true);
        try {
          const lista = await catalogo('productos', true);
          const ex = lista.find((x) => x.seccion === it.seccion && norm(x.descripcion) === norm(it.descripcion));
          await db.guardar('productos', { ...(ex || {}), empresa: st.empresa, seccion: it.seccion, descripcion: it.descripcion.trim(), tipo: it.tipo || null, precio: num(it.precio) });
          await catalogo('productos', true);
          cerrarHoja();
          toast(ex ? 'Precio actualizado en el catálogo' : 'Guardado en el catálogo');
        } catch (e) { manejarError(e); }
      },
    },
  });
  function fin() { cerrarHoja(); marcarSucio(); repintarSecciones(); }
}

function menuEditor() {
  const c = st.cot;
  const cel = esCelular();
  abrirHoja({
    titulo: c.folio || 'Nueva cotización',
    cuerpo: `<div class="menu-acciones">
      ${cel ? `<button class="btn" data-a="h-compartir">${I.compartir} Compartir PDF</button>` : `<button class="btn" data-a="h-ver">${I.doc} Ver PDF</button>`}
      <button class="btn" data-a="h-descargar">${I.descargar} Descargar PDF</button>
      ${c.datos.telefono ? `<button class="btn" data-a="h-wa">${I.whatsapp} Mensaje por WhatsApp</button>` : ''}
      ${c.id ? `<button class="btn" data-a="h-duplicar">${I.copiar} Duplicar cotización</button>` : ''}
      ${c.id ? `<button class="btn peligro" data-a="h-borrar">${I.basura} Eliminar cotización</button>` : ''}
    </div>`,
    acciones: {
      'h-compartir': () => { cerrarHoja(); accionPDF('compartir'); },
      'h-ver': () => { cerrarHoja(); accionPDF('ver'); },
      'h-descargar': () => { cerrarHoja(); accionPDF('descargar'); },
      'h-wa': () => { cerrarHoja(); mensajeWhatsApp(); },
      'h-duplicar': () => {
        cerrarHoja();
        if (st.sucio && !confirm('Hay cambios sin guardar en esta cotización. ¿Duplicar de todos modos?')) return;
        st.duplicarDe = clonar(st.cot);
        st.sucio = false;
        ir(`#/${st.empresa}/nueva`);
      },
      'h-borrar': async () => {
        if (!confirm(`¿Eliminar la cotización ${c.folio}? No se puede deshacer.`)) return;
        try {
          await db.eliminarCotizacion(c.id);
          st.sucio = false;
          cerrarHoja();
          toast('Cotización eliminada');
          ir(`#/${st.empresa}`);
        } catch (e) { manejarError(e); }
      },
    },
  });
}

function menuGeneral() {
  const ses = db.sesion();
  abrirHoja({
    titulo: 'Cotizador',
    cuerpo: `
      ${MODO_NUBE
        ? `<p class="texto-2" style="margin-top:0">Sesión: <b>${esc(ses?.email || '')}</b><br>Tus cotizaciones se sincronizan entre tus dispositivos.</p>`
        : `<div class="aviso"><b>Modo local.</b> Los datos se guardan solo en este dispositivo. Para sincronizar el iPhone y la PC, conecta Supabase (ver README).</div>`}
      <div class="menu-acciones">
        <button class="btn" data-a="h-instalar">${I.celular} Instalar en el iPhone o la PC</button>
        <button class="btn" data-a="h-recargar">${I.descargar} Buscar actualización</button>
        ${MODO_NUBE ? `<button class="btn peligro" data-a="h-salir">${I.salir} Cerrar sesión</button>` : ''}
      </div>`,
    acciones: {
      'h-instalar': () => {
        abrirHoja({
          titulo: 'Instalar la app',
          cuerpo: `<p><b>iPhone:</b> abre esta página en <b>Safari</b>, toca el botón Compartir ${I.compartir.replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px"')} y elige <b>“Agregar a pantalla de inicio”</b>.</p>
                   <p><b>PC (Chrome o Edge):</b> haz clic en el ícono de instalar que aparece a la derecha de la barra de direcciones, o en el menú ⋮ › <b>Instalar Cotizador</b>.</p>`,
        });
      },
      'h-recargar': async () => {
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          await reg?.update();
        } catch { /* nada */ }
        location.reload();
      },
      'h-salir': async () => {
        await db.salir();
        st.cache = {};
        cerrarHoja();
        iniciar();
      },
    },
  });
}

// =====================================================================
// Hojas (modales)
// =====================================================================
function abrirHoja({ titulo, cuerpo, pie = '', acciones = {}, alAbrir }) {
  cerrarHoja();
  const raiz = $('#modal-raiz');
  raiz.innerHTML = `<div class="velo" data-a="h-velo"><div class="hoja" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    <div class="hoja-cab"><h3>${esc(titulo)}</h3><button class="icono-btn" data-a="h-cerrar" aria-label="Cerrar">${I.cerrar}</button></div>
    <div class="hoja-cuerpo">${cuerpo}</div>
    ${pie ? `<div class="hoja-pie">${pie}</div>` : ''}
  </div></div>`;
  st.modal = { acciones };
  document.body.style.overflow = 'hidden';
  alAbrir?.(raiz.firstElementChild);
}

function cerrarHoja() {
  const raiz = $('#modal-raiz');
  if (raiz) raiz.innerHTML = '';
  st.modal = null;
  document.body.style.overflow = '';
}

$('#modal-raiz').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-a]');
  if (!el) return;
  const a = el.dataset.a;
  if (a === 'h-velo') { if (ev.target === el) cerrarHoja(); return; }
  if (a === 'h-cerrar') return cerrarHoja();
  st.modal?.acciones[a]?.(el, ev);
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && st.modal) cerrarHoja(); });

// =====================================================================
// Eventos de la app
// =====================================================================
const acciones = {
  empresa: (el) => ir(`#/${el.dataset.e}${st.ruta.vista === 'clientes' ? '/clientes' : st.ruta.vista === 'productos' ? '/productos' : ''}`),
  'menu-general': menuGeneral,
  nueva: () => ir(`#/${st.empresa}/nueva`),
  'filtro-estado': (el) => {
    st.filtro.estado = el.dataset.v;
    $$('[data-a="filtro-estado"]').forEach((b) => b.setAttribute('aria-pressed', b === el));
    pintarFilas();
  },
  volver: () => ir(`#/${st.empresa}`),
  'menu-editor': menuEditor,
  guardar: () => guardar(),
  pdf: () => accionPDF(esCelular() ? 'compartir' : 'ver'),
  agregar: (el) => {
    const s = emp().secciones.find((x) => x.id === el.dataset.sec);
    const i = insertarEnSeccion(itemVacio(s.id, s.conTipo ? { tipo: emp().tipos[0] } : {}));
    marcarSucio();
    repintarSecciones();
    $(`[data-i="${i}"][data-k="descripcion"]`)?.focus();
  },
  'agregar-nota': (el) => {
    const i = insertarEnSeccion(itemVacio(el.dataset.sec, { nota: true, cantidad: '', precio: '' }));
    marcarSucio();
    repintarSecciones();
    $(`[data-i="${i}"][data-k="descripcion"]`)?.focus();
  },
  'desde-catalogo': (el) => desdeCatalogo(el.dataset.sec),
  'menu-concepto': (el) => menuConcepto(Number(el.dataset.i)),
  'elegir-cliente': elegirCliente,
  'desc-tipo': (el) => {
    st.cot.datos.descuento.tipo = el.dataset.v;
    $$('[data-a="desc-tipo"]').forEach((b) => b.setAttribute('aria-pressed', b === el));
    marcarSucio();
    actualizarTotales();
  },
  'restaurar-condiciones': () => {
    st.cot.datos.condiciones = emp().condiciones;
    $('[data-f="datos.condiciones"]').value = emp().condiciones;
    marcarSucio();
  },
  'cliente-nuevo': () => editarCliente(null),
  'cliente-editar': (el) => editarCliente(el.dataset.id),
  'producto-nuevo': () => editarProducto(null),
  'producto-editar': (el) => editarProducto(el.dataset.id),
};

const appRaiz = $('#app');
appRaiz.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-a]');
  if (!el || !appRaiz.contains(el)) return;
  const fn = acciones[el.dataset.a];
  if (fn) { ev.preventDefault(); fn(el, ev); }
});

appRaiz.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.id === 'buscar') { st.filtro.q = el.value; return pintarFilas(); }
  if (el.id === 'buscar-cat') {
    const lista = st.cache[st.empresa]?.[st.ruta.vista] || [];
    return st.ruta.vista === 'clientes' ? pintarClientes(lista, el.value) : pintarProductos(lista, el.value);
  }
  if (!st.cot) return;
  if (el.dataset.i != null) {
    const i = Number(el.dataset.i);
    const it = st.cot.datos.items[i];
    if (!it) return;
    it[el.dataset.k] = el.value;
    if (el.tagName === 'TEXTAREA') autoAltura(el);
    const imp = $(`[data-imp="${i}"]`);
    if (imp) imp.innerHTML = `<small>Importe</small>${dineroItem(it)}`;
    marcarSucio();
    actualizarTotales();
  } else if (el.dataset.f) {
    const valor = el.type === 'checkbox' ? el.checked : el.value;
    fijarRuta(st.cot, el.dataset.f, valor);
    marcarSucio();
    if (el.dataset.f.startsWith('datos.descuento') || el.dataset.f === 'datos.iva') actualizarTotales();
  }
});
// los <select> y checkbox en algunos navegadores solo disparan "change"
appRaiz.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date') {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
});

window.addEventListener('beforeunload', (ev) => {
  if (st.sucio) { ev.preventDefault(); ev.returnValue = ''; }
});
window.addEventListener('hashchange', alCambiarRuta);

// Atajo: Ctrl/Cmd + S para guardar
document.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's' && st.cot && (st.ruta.vista === 'editor' || st.ruta.vista === 'nueva')) {
    ev.preventDefault();
    guardar();
  }
});

// =====================================================================
// Login e inicio
// =====================================================================
function vistaLogin() {
  document.documentElement.removeAttribute('data-empresa');
  $('#app').innerHTML = `
  <div class="login"><div class="tarjeta">
    <div class="logos"><img src="assets/km-logo.png" alt="KM Motors"><img src="assets/dk-logo.png" alt="DK Energy"></div>
    <h1>Cotizador</h1>
    <p>KM Motors · DK Energy</p>
    <form id="form-login">
      <label class="campo">Correo<input type="email" id="l-email" autocomplete="username" inputmode="email" required></label>
      <label class="campo">Contraseña<input type="password" id="l-pass" autocomplete="current-password" required></label>
      <button class="btn primario bloque" type="submit" id="l-btn">Entrar</button>
    </form>
  </div></div>`;
  $('#form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const b = $('#l-btn');
    b.disabled = true;
    b.textContent = 'Entrando…';
    try {
      await db.entrar($('#l-email').value.trim(), $('#l-pass').value);
      iniciar();
    } catch (e) {
      toast(e.message || 'No se pudo entrar', true);
      b.disabled = false;
      b.textContent = 'Entrar';
    }
  });
}

function iniciar() {
  if (MODO_NUBE && !db.sesion()) return vistaLogin();
  if (!location.hash || location.hash === '#') reemplazarHash(`#/${st.empresa}`);
  st.ruta = { vista: '' };
  alCambiarRuta();
}

// Valores precargados para "nueva" (duplicar o cotizar a un cliente)
function vistaEditor(cot) {
  if (!cot.id && st.duplicarDe) {
    const o = st.duplicarDe;
    st.duplicarDe = null;
    if (o.empresa === cot.empresa) {
      cot.cliente = o.cliente;
      cot.datos = { ...clonar(o.datos), items: o.datos.items.map((it) => ({ ...it, id: nuevoId() })) };
    }
    pintarEditor(cot);
    marcarSucio();
    toast('Copia creada. Revisa y guarda.');
    return;
  }
  if (!cot.id && st.clientePendiente) {
    const c = st.clientePendiente;
    st.clientePendiente = null;
    pintarEditor(cot);
    aplicarCliente(c);
    st.sucio = false;
    return;
  }
  pintarEditor(cot);
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

iniciar();
