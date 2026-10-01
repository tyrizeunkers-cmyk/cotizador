// Configuración de cada negocio.
// Para cambiar textos fijos, colores o datos de contacto, edita este archivo.
// Para agregar un tercer negocio: copia un bloque, cambia el id y crea su plantilla en pdf.js.

export const EMPRESAS = {
  km: {
    id: 'km',
    nombre: 'KM Motors',
    subtitulo: 'Mecánica especializada',
    colores: { primario: '#741417', oscuro: '#080808', suave: '#F6EAEA' },
    logo: 'assets/km-logo.png',
    // Folio: KMS-DDMMAA-NN (consecutivo que reinicia cada día)
    folio: { prefijo: 'KMS', porDia: true, digitos: 2, inicio: 1 },
    vigenciaDias: 7,
    // Campos del encabezado de la cotización
    campos: ['cliente', 'telefono', 'vehiculo', 'titulo'],
    // Secciones de conceptos
    secciones: [
      { id: 'ref', titulo: 'Refacciones', conTipo: true },
      { id: 'mo', titulo: 'Mano de obra y servicios', conTipo: false },
    ],
    tipos: ['ORIGINAL', 'GENÉRICO'],
    tiposCorto: { ORIGINAL: 'Original', 'GENÉRICO': 'Genérico' },
    condiciones:
      'Condiciones: Cotización válida por 7 días. Precios expresados en pesos mexicanos. ' +
      'Refacciones sujetas a disponibilidad al momento de autorizar. Cualquier trabajo o pieza ' +
      'adicional se cotizará por separado y requerirá autorización del cliente.',
  },

  dk: {
    id: 'dk',
    nombre: 'DK Energy',
    subtitulo: 'Energía fotovoltaica',
    colores: { primario: '#1F3864', oscuro: '#1F3864', medio: '#2E5395', suave: '#D9E2F3' },
    logo: 'assets/dk-logo.png',
    banner: 'assets/dk-banner.jpg',
    contacto: [
      'DK ENERGY',
      '',
      'Toluca, Estado de México',
      'Servicio en todo el Estado de México y CDMX',
      '',
      'WhatsApp: 722 843 7628',
    ],
    // Folio consecutivo: 0007, 0008, ... (las cotizaciones en Excel llegaron a 0006)
    folio: { prefijo: '', porDia: false, digitos: 4, inicio: 7 },
    vigenciaDias: 15,
    campos: ['cliente', 'telefono', 'correo', 'ubicacion'],
    secciones: [{ id: 'art', titulo: 'Artículos', conTipo: false }],
    tipos: [],
    ubicacionDefault: 'Toluca, Estado de México',
    condiciones:
      'Cotización válida por 15 días. Precios expresados en pesos mexicanos (MXN).\n' +
      'Comprometidos con su ahorro y el futuro de la energía.\n' +
      'Agradecemos la oportunidad de presentar esta propuesta. En DK Energy trabajamos para ' +
      'ofrecer soluciones confiables, eficientes y adaptadas a cada proyecto.',
  },
};

export const IVA_TASA = 0.16;

export const ETIQUETAS = {
  cliente: 'Cliente',
  telefono: 'Teléfono / WhatsApp',
  correo: 'Correo',
  vehiculo: 'Vehículo',
  titulo: 'Trabajo (ej. Suspensión y soportes)',
  ubicacion: 'Estado / Municipio',
};

export const ESTADOS = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
};
