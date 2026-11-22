// Carrusel de promociones (página pública a la que lleva el QR).
// Lee /api/promos y arma una diapositiva por promoción.
// Para ver un ejemplo sin backend, abre la página con ?demo

const INTERVALO_MS = 6000;        // cambio automático
const PAUSA_TRAS_TOQUE_MS = 15000; // si la persona interactúa, esperar antes de seguir

const $ = (id) => document.getElementById(id);
const carrusel = $('carrusel');
const pista = $('pista');
const puntos = $('puntos');
const estado = $('estado');
const btnAnterior = $('anterior');
const btnSiguiente = $('siguiente');

const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let total = 0;
let actual = 0;
let temporizador = null;
let pausadoHasta = 0;

iniciar();

async function iniciar() {
  mostrarEstado('cargando');
  try {
    const promos = await obtenerPromos();
    if (!promos.length) {
      mostrarEstado('vacio');
      return;
    }
    construir(promos);
  } catch (e) {
    console.error(e);
    mostrarEstado('error');
  }
}

async function obtenerPromos() {
  if (new URLSearchParams(location.search).has('demo')) {
    const { promosDemo } = await import('./demo.js');
    return promosDemo();
  }
  const r = await fetch('/api/promos', { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function construir(promos) {
  total = promos.length;
  pista.replaceChildren(...promos.map((p, i) => crearSlide(p, i)));
  puntos.replaceChildren(...promos.map((p, i) => crearPunto(p, i)));

  estado.hidden = true;
  carrusel.hidden = false;
  carrusel.classList.toggle('varias', total > 1);
  puntos.hidden = total < 2;

  pista.addEventListener('scroll', alDesplazar, { passive: true });
  pista.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); irA(actual + 1); pausar(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); irA(actual - 1); pausar(); }
  });
  ['pointerdown', 'wheel', 'touchstart'].forEach((ev) =>
    pista.addEventListener(ev, pausar, { passive: true }));
  btnAnterior.addEventListener('click', () => { irA(actual - 1); pausar(); });
  btnSiguiente.addEventListener('click', () => { irA(actual + 1); pausar(); });
  window.addEventListener('resize', () => irA(actual, false));
  document.addEventListener('visibilitychange', () => (document.hidden ? detener() : reanudar()));

  marcarActual(0);
  reanudar();
}

function crearSlide(p, i) {
  const slide = el('article', 'slide');
  slide.setAttribute('role', 'group');
  slide.setAttribute('aria-roledescription', 'promoción');
  slide.setAttribute('aria-label', `${i + 1} de ${total}: ${p.establecimiento}`);

  const foto = el('div', 'foto');
  const difuminado = el('div', 'difuminado');
  const img = document.createElement('img');
  img.alt = `${p.establecimiento} — ${p.descuento}`;
  img.decoding = 'async';
  img.loading = i === 0 ? 'eager' : 'lazy';
  if (i === 0) img.fetchPriority = 'high';
  img.addEventListener('load', () => {
    difuminado.style.backgroundImage = `url("${img.currentSrc || img.src}")`;
    foto.classList.add('lista');
  });
  img.addEventListener('error', () => foto.classList.add('lista'));
  img.src = p.imagenUrl;
  foto.append(difuminado, img);

  const info = el('div', 'info');
  info.append(el('p', 'descuento', p.descuento), el('h2', null, p.establecimiento));
  if (p.descripcion) info.append(el('p', 'descripcion', p.descripcion));
  if (p.vigenciaHasta) info.append(el('p', 'vigencia', `Válido hasta el ${formatearFecha(p.vigenciaHasta)}`));
  if (p.enlace && esEnlaceSeguro(p.enlace)) info.append(crearBoton(p.enlace));

  slide.append(foto, info);
  return slide;
}

function crearPunto(p, i) {
  const b = el('button', 'punto');
  b.type = 'button';
  b.setAttribute('aria-label', `Ver promoción ${i + 1}: ${p.establecimiento}`);
  b.addEventListener('click', () => { irA(i); pausar(); });
  return b;
}

function crearBoton(url) {
  const a = el('a', 'boton');
  a.href = url;
  const u = url.toLowerCase();
  let texto = 'Ver más';
  let icono = '<path d="M7 17L17 7M9 7h8v8"/>';
  if (u.startsWith('tel:')) {
    texto = 'Llamar';
    icono = '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>';
  } else if (u.includes('wa.me') || u.includes('whatsapp')) {
    texto = 'Escribir por WhatsApp';
    icono = '<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z"/>';
  } else if (u.includes('maps') || u.includes('goo.gl/maps') || u.includes('maps.app')) {
    texto = 'Cómo llegar';
    icono = '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>';
  }
  if (!u.startsWith('tel:')) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  a.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icono}</svg>`;
  a.append(document.createTextNode(texto));
  return a;
}

// ---------- Navegación ----------
function alDesplazar() {
  const i = Math.round(pista.scrollLeft / pista.clientWidth);
  if (i !== actual && i >= 0 && i < total) marcarActual(i);
}

function irA(i, suave = true) {
  const destino = (i + total) % total; // da la vuelta al llegar al final
  pista.scrollTo({ left: destino * pista.clientWidth, behavior: suave && !reducirMovimiento ? 'smooth' : 'auto' });
  marcarActual(destino);
}

function marcarActual(i) {
  actual = i;
  [...puntos.children].forEach((b, j) => b.setAttribute('aria-current', j === i ? 'true' : 'false'));
}

// ---------- Avance automático ----------
function reanudar() {
  detener();
  if (total < 2 || reducirMovimiento) return;
  temporizador = setInterval(() => {
    if (Date.now() < pausadoHasta) return;
    if (carrusel.matches(':focus-within')) return;
    irA(actual + 1);
  }, INTERVALO_MS);
}

function detener() {
  clearInterval(temporizador);
  temporizador = null;
}

function pausar() {
  pausadoHasta = Date.now() + PAUSA_TRAS_TOQUE_MS;
}

// ---------- Estados ----------
function mostrarEstado(tipo) {
  carrusel.hidden = true;
  puntos.hidden = true;
  estado.hidden = false;
  if (tipo === 'cargando') {
    estado.innerHTML = '<div class="cargando" aria-hidden="true"><span></span><span></span><span></span></div><p>Cargando promociones…</p>';
  } else if (tipo === 'vacio') {
    estado.innerHTML = '<p>Por ahora no hay promociones vigentes. ¡Vuelve pronto!</p>';
  } else {
    estado.innerHTML = '<p>No pudimos cargar las promociones. Revisa tu conexión e intenta de nuevo.</p><button type="button" class="reintentar">Reintentar</button>';
    estado.querySelector('button').addEventListener('click', iniciar);
  }
}

// ---------- Utilidades ----------
function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto != null) n.textContent = texto;
  return n;
}

function formatearFecha(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function esEnlaceSeguro(url) {
  return /^(https?:\/\/|tel:)/i.test(url);
}
