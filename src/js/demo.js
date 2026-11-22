// Datos de ejemplo para ver el carrusel sin backend: abre /?demo
// Los establecimientos son ficticios.

const ejemplos = [
  { nombre: 'Café La Esquina', grande: '15%', chico: 'en toda la carta', c1: '#6f3b1d', c2: '#c9792e', descuento: '15% de descuento', descripcion: 'Aplica en bebidas y pan dulce, de lunes a viernes.', enlace: 'https://maps.google.com/?q=cafe', hasta: '2026-12-31' },
  { nombre: 'Óptica Visión Clara', grande: '2×1', chico: 'en armazones', c1: '#0b4f6c', c2: '#20a4c9', descuento: '2×1 en armazones', descripcion: 'Incluye examen de la vista sin costo para el titular de la tarjeta.', enlace: 'https://wa.me/5210000000000', hasta: null },
  { nombre: 'Gimnasio Fuerza Total', grande: 'GRATIS', chico: 'inscripción', c1: '#1f2933', c2: '#e4572e', descuento: 'Inscripción gratis', descripcion: 'Y 10% de descuento en la mensualidad durante los primeros 3 meses.', enlace: null, hasta: '2027-01-31' },
  { nombre: 'Taller Mecánico Ruiz', grande: '10%', chico: 'en servicio', c1: '#2d3a1f', c2: '#7fa33a', descuento: '10% en mano de obra', descripcion: 'Afinación, frenos y suspensión.', enlace: 'tel:+520000000000', hasta: null },
];

function svg(e, ancho, alto) {
  const t = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${e.c1}"/><stop offset="1" stop-color="${e.c2}"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="${ancho * .85}" cy="${alto * .15}" r="${ancho * .32}" fill="#fff" opacity=".08"/>
  <circle cx="${ancho * .1}" cy="${alto * .95}" r="${ancho * .4}" fill="#000" opacity=".08"/>
  <text x="50%" y="${alto * .2}" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="${ancho * .055}" font-weight="700" fill="#fff" letter-spacing="3" opacity=".85">${e.nombre.toUpperCase()}</text>
  <text x="50%" y="${alto * .55}" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="${ancho * (e.grande.length > 4 ? .2 : .3)}" font-weight="900" fill="#fff">${e.grande}</text>
  <text x="50%" y="${alto * .68}" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="${ancho * .07}" font-weight="600" fill="#fff">${e.chico}</text>
  <rect x="${ancho * .25}" y="${alto * .8}" width="${ancho * .5}" height="${alto * .075}" rx="${alto * .037}" fill="#fff"/>
  <text x="50%" y="${alto * .85}" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="${ancho * .04}" font-weight="800" fill="${e.c1}">SOLO AFILIADOS</text>
</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t);
}

export function promosDemo() {
  // Alterna proporciones (cuadrada y vertical) para mostrar cómo se adapta el carrusel.
  return ejemplos.map((e, i) => ({
    id: String(i),
    imagenUrl: i % 2 === 0 ? svg(e, 1080, 1080) : svg(e, 1080, 1350),
    establecimiento: e.nombre,
    descuento: e.descuento,
    descripcion: e.descripcion,
    enlace: e.enlace,
    vigenciaHasta: e.hasta,
  }));
}
