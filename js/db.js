// Capa de datos: Supabase (nube) o almacenamiento local del navegador.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const URL_BASE = (SUPABASE_URL || '').replace(/\/+$/, '');
export const MODO_NUBE = Boolean(URL_BASE && SUPABASE_ANON_KEY);

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
const ahora = () => new Date().toISOString();

// ---------------------------------------------------------------------
// Almacenamiento local seguro (Safari en modo privado puede lanzar error)
// ---------------------------------------------------------------------
const mem = {};
const ls = {
  get(k, def) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? (k in mem ? mem[k] : def) : JSON.parse(v);
    } catch {
      return k in mem ? mem[k] : def;
    }
  },
  set(k, v) {
    mem[k] = v;
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio o privado */ }
  },
  del(k) {
    delete mem[k];
    try { localStorage.removeItem(k); } catch { /* nada */ }
  },
};

// =====================================================================
// Backend en la nube (Supabase vía REST, sin librerías externas)
// =====================================================================
const SES_KEY = 'cot_sesion';

class ErrorNube extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

async function authFetch(path, body) {
  const r = await fetch(`${URL_BASE}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = data.error_description || data.msg || data.message || 'Error de autenticación';
    throw new ErrorNube(traducirError(m), r.status);
  }
  return data;
}

function traducirError(m) {
  if (/invalid login/i.test(m)) return 'Correo o contraseña incorrectos';
  if (/email not confirmed/i.test(m)) return 'Tu correo aún no está confirmado en Supabase';
  if (/failed to fetch|network/i.test(m)) return 'Sin conexión a internet';
  return m;
}

function guardarSesion(d) {
  const ses = {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + (d.expires_in || 3600) * 1000,
    email: d.user?.email,
  };
  ls.set(SES_KEY, ses);
  return ses;
}

let refrescando = null;
async function tokenVigente() {
  let ses = ls.get(SES_KEY, null);
  if (!ses) throw new ErrorNube('Sesión no iniciada', 401);
  if (Date.now() > ses.expires_at - 60_000) {
    refrescando = refrescando || authFetch('token?grant_type=refresh_token', { refresh_token: ses.refresh_token })
      .then(guardarSesion)
      .finally(() => { refrescando = null; });
    try {
      ses = await refrescando;
    } catch (e) {
      if (e.status && e.status < 500) ls.del(SES_KEY);
      throw e;
    }
  }
  return ses.access_token;
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const token = await tokenVigente();
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  let r;
  try {
    r = await fetch(`${URL_BASE}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ErrorNube('Sin conexión a internet. Intenta de nuevo.', 0);
  }
  if (r.status === 401) { ls.del(SES_KEY); throw new ErrorNube('Tu sesión expiró, vuelve a entrar', 401); }
  const txt = await r.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!r.ok) throw new ErrorNube(data?.message || `Error ${r.status}`, r.status);
  return data;
}

const enc = encodeURIComponent;

const nube = {
  sesion() { return ls.get(SES_KEY, null); },
  async entrar(email, password) {
    const d = await authFetch('token?grant_type=password', { email, password });
    return guardarSesion(d);
  },
  async salir() {
    const ses = ls.get(SES_KEY, null);
    ls.del(SES_KEY);
    if (ses) {
      fetch(`${URL_BASE}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${ses.access_token}` },
      }).catch(() => {});
    }
  },

  listarCotizaciones(empresa) {
    return rest(`cotizaciones?select=id,empresa,folio,fecha,cliente,total,estado,updated_at,created_at&empresa=eq.${enc(empresa)}&order=created_at.desc&limit=500`);
  },
  async obtenerCotizacion(id) {
    const r = await rest(`cotizaciones?select=*&id=eq.${enc(id)}`);
    return r?.[0] || null;
  },
  async guardarCotizacion(c) {
    const fila = {
      empresa: c.empresa, folio: c.folio, fecha: c.fecha, cliente: c.cliente,
      total: c.total, estado: c.estado, datos: c.datos, updated_at: ahora(),
    };
    if (c.id) {
      const r = await rest(`cotizaciones?id=eq.${enc(c.id)}`, { method: 'PATCH', body: fila, prefer: 'return=representation' });
      return r[0];
    }
    const r = await rest('cotizaciones', { method: 'POST', body: fila, prefer: 'return=representation' });
    return r[0];
  },
  eliminarCotizacion(id) { return rest(`cotizaciones?id=eq.${enc(id)}`, { method: 'DELETE' }); },

  siguienteFolio(empresa, clave, inicio) {
    return rest('rpc/siguiente_folio', { method: 'POST', body: { p_empresa: empresa, p_clave: clave, p_inicio: inicio } });
  },

  listar(tabla, empresa, orden) {
    return rest(`${tabla}?select=*&empresa=eq.${enc(empresa)}&order=${orden}.asc&limit=2000`);
  },
  async guardar(tabla, obj) {
    const { id, user_id, created_at, ...fila } = obj;
    fila.updated_at = ahora();
    if (id) {
      const r = await rest(`${tabla}?id=eq.${enc(id)}`, { method: 'PATCH', body: fila, prefer: 'return=representation' });
      return r[0];
    }
    const r = await rest(tabla, { method: 'POST', body: fila, prefer: 'return=representation' });
    return r[0];
  },
  eliminar(tabla, id) { return rest(`${tabla}?id=eq.${enc(id)}`, { method: 'DELETE' }); },
};

// =====================================================================
// Backend local (solo este navegador)
// =====================================================================
const tablaLocal = (t) => ls.get(`cot_${t}`, []);
const guardarTablaLocal = (t, v) => ls.set(`cot_${t}`, v);

const local = {
  sesion() { return { email: 'Modo local', local: true }; },
  async entrar() { return this.sesion(); },
  async salir() {},

  async listarCotizaciones(empresa) {
    return tablaLocal('cotizaciones')
      .filter((c) => c.empresa === empresa)
      .map(({ datos, ...resto }) => resto)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  },
  async obtenerCotizacion(id) {
    return structuredClone(tablaLocal('cotizaciones').find((c) => c.id === id) || null);
  },
  async guardarCotizacion(c) {
    const lista = tablaLocal('cotizaciones');
    const fila = { ...structuredClone(c), updated_at: ahora() };
    const i = c.id ? lista.findIndex((x) => x.id === c.id) : -1;
    if (i >= 0) lista[i] = { ...lista[i], ...fila };
    else lista.push({ ...fila, id: uid(), created_at: ahora() });
    guardarTablaLocal('cotizaciones', lista);
    return structuredClone(i >= 0 ? lista[i] : lista[lista.length - 1]);
  },
  async eliminarCotizacion(id) {
    guardarTablaLocal('cotizaciones', tablaLocal('cotizaciones').filter((c) => c.id !== id));
  },

  async siguienteFolio(empresa, clave, inicio) {
    const f = ls.get('cot_folios', {});
    const k = `${empresa}|${clave}`;
    f[k] = f[k] == null ? inicio : f[k] + 1;
    ls.set('cot_folios', f);
    return f[k];
  },

  async listar(tabla, empresa, orden) {
    return tablaLocal(tabla)
      .filter((x) => x.empresa === empresa)
      .sort((a, b) => String(a[orden] || '').localeCompare(String(b[orden] || ''), 'es'));
  },
  async guardar(tabla, obj) {
    const lista = tablaLocal(tabla);
    const i = obj.id ? lista.findIndex((x) => x.id === obj.id) : -1;
    const fila = { ...obj, updated_at: ahora() };
    if (i >= 0) lista[i] = fila;
    else lista.push({ ...fila, id: uid(), created_at: ahora() });
    guardarTablaLocal(tabla, lista);
    return i >= 0 ? lista[i] : lista[lista.length - 1];
  },
  async eliminar(tabla, id) {
    guardarTablaLocal(tabla, tablaLocal(tabla).filter((x) => x.id !== id));
  },
};

export const db = MODO_NUBE ? nube : local;
