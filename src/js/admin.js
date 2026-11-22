// Panel del socio: alta, edición, orden y eliminación de promociones.
// Solo se puede abrir con una cuenta invitada con el rol "socio" (ver staticwebapp.config.json).

const $ = (id) => document.getElementById(id);
const lista = $('lista');
const mensajeLista = $('mensajeLista');
const editor = $('editor');
const formulario = $('formulario');
const archivo = $('archivo');
const zonaImagen = $('zonaImagen');
const vistaPrevia = $('vistaPrevia');
const zonaTexto = $('zonaTexto');
const btnCambiarImagen = $('cambiarImagen');
const cajaErrores = $('errores');
const btnGuardar = $('guardar');
const confirmar = $('confirmar');

const ESTADOS = {
  visible: 'Visible',
  programada: 'Programada',
  vencida: 'Vencida',
  oculta: 'Oculta',
};

let promos = [];
let editandoId = null;     // null = nueva
let imagenNueva = null;    // data URL ya optimizada, o null si no se cambió
let ocupado = false;

// ---------- Inicio ----------
cargarUsuario();
cargar();

$('nueva').addEventListener('click', () => abrirEditor(null));
editor.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => editor.close()));
editor.addEventListener('close', limpiarEditor);
formulario.addEventListener('submit', guardar);
archivo.addEventListener('change', () => archivo.files[0] && usarArchivo(archivo.files[0]));
btnCambiarImagen.addEventListener('click', () => archivo.click());

['dragenter', 'dragover'].forEach((ev) => zonaImagen.addEventListener(ev, (e) => {
  e.preventDefault();
  zonaImagen.classList.add('arrastrando');
}));
['dragleave', 'drop'].forEach((ev) => zonaImagen.addEventListener(ev, () => zonaImagen.classList.remove('arrastrando')));
zonaImagen.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) usarArchivo(f);
});

// ---------- API ----------
async function api(metodo, url, cuerpo) {
  const r = await fetch(url, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    credentials: 'same-origin',
  });

  // Static Web Apps redirige al login cuando la sesión expiró.
  if (r.status === 401 || (r.redirected && new URL(r.url).pathname.startsWith('/login'))) {
    location.href = '/login.html';
    throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  }
  if (r.status === 204) return null;

  const tipo = r.headers.get('Content-Type') || '';
  const datos = tipo.includes('application/json') ? await r.json() : null;
  if (!r.ok) {
    const errores = datos?.errores?.length ? datos.errores : [`Error ${r.status}. Intenta de nuevo.`];
    const err = new Error(errores.join('\n'));
    err.errores = errores;
    throw err;
  }
  return datos;
}

async function cargarUsuario() {
  try {
    const r = await fetch('/.auth/me');
    const { clientPrincipal } = await r.json();
    if (clientPrincipal) $('usuario').textContent = `Sesión: ${clientPrincipal.userDetails}`;
  } catch { /* no es crítico */ }
}

async function cargar() {
  try {
    const datos = await api('GET', '/api/gestion/promos');
    promos = datos.promos;
    pintar();
  } catch (e) {
    mensajeLista.hidden = false;
    mensajeLista.textContent = e.message;
  }
}

// ---------- Lista ----------
function pintar() {
  promos.sort((a, b) => a.orden - b.orden);
  lista.replaceChildren(...promos.map(crearItem));
  mensajeLista.hidden = promos.length > 0;
  if (!promos.length) mensajeLista.textContent = 'Aún no hay promociones. Agrega la primera con “Nueva promoción”.';
}

function crearItem(p, i) {
  const li = el('li', 'item' + (p.estado === 'visible' ? '' : ' apagada'));

  const img = el('img', 'miniatura');
  img.src = p.imagenUrl;
  img.alt = '';
  img.loading = 'lazy';

  const datos = el('div', 'datos');
  const meta = el('p', 'meta');
  meta.append(el('span', `chip ${p.estado}`, ESTADOS[p.estado] ?? p.estado), el('span', null, textoVigencia(p)));
  datos.append(el('h3', null, p.establecimiento), el('p', 'desc', p.descuento), meta);

  const acciones = el('div', 'acciones');
  acciones.append(
    boton('Subir', ICONOS.arriba, () => mover(p.id, -1), i === 0),
    boton('Bajar', ICONOS.abajo, () => mover(p.id, 1), i === promos.length - 1),
    boton(p.activa ? 'Ocultar del carrusel' : 'Mostrar en el carrusel', p.activa ? ICONOS.ojo : ICONOS.ojoTachado, () => alternar(p)),
    boton('Editar', ICONOS.lapiz, () => abrirEditor(p)),
    boton('Eliminar', ICONOS.basura, () => eliminar(p), false, 'eliminar'),
  );

  li.append(img, datos, acciones);
  return li;
}

function textoVigencia(p) {
  const d = p.vigenciaDesde && fecha(p.vigenciaDesde);
  const h = p.vigenciaHasta && fecha(p.vigenciaHasta);
  if (d && h) return `Del ${d} al ${h}`;
  if (h) return `Hasta el ${h}`;
  if (d) return `Desde el ${d}`;
  return 'Sin fecha límite';
}

async function mover(id, delta) {
  if (ocupado) return;
  const i = promos.findIndex((p) => p.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= promos.length) return;

  const respaldo = promos.map((p) => ({ ...p }));
  [promos[i], promos[j]] = [promos[j], promos[i]];
  promos.forEach((p, k) => (p.orden = k));
  pintar();

  try {
    ocupado = true;
    await api('PUT', '/api/gestion/orden', { ids: promos.map((p) => p.id) });
  } catch (e) {
    promos = respaldo;
    pintar();
    avisar(e.message, true);
  } finally {
    ocupado = false;
  }
}

async function alternar(p) {
  if (ocupado) return;
  try {
    ocupado = true;
    const actualizada = await api('PUT', `/api/gestion/promos/${p.id}`, { ...camposDe(p), activa: !p.activa });
    reemplazar(actualizada);
    avisar(actualizada.activa ? 'La promoción se muestra en el carrusel.' : 'La promoción quedó oculta.');
  } catch (e) {
    avisar(e.message, true);
  } finally {
    ocupado = false;
  }
}

async function eliminar(p) {
  $('textoConfirmar').textContent = `Se eliminará “${p.establecimiento} — ${p.descuento}” y su imagen. Esta acción no se puede deshacer.`;
  confirmar.returnValue = '';
  confirmar.showModal();
  const respuesta = await new Promise((ok) => confirmar.addEventListener('close', () => ok(confirmar.returnValue), { once: true }));
  if (respuesta !== 'si') return;

  try {
    await api('DELETE', `/api/gestion/promos/${p.id}`);
    promos = promos.filter((x) => x.id !== p.id);
    pintar();
    avisar('Promoción eliminada.');
  } catch (e) {
    avisar(e.message, true);
  }
}

// ---------- Editor ----------
function abrirEditor(p) {
  editandoId = p?.id ?? null;
  imagenNueva = null;
  $('tituloEditor').textContent = p ? 'Editar promoción' : 'Nueva promoción';

  const f = formulario.elements;
  f.establecimiento.value = p?.establecimiento ?? '';
  f.descuento.value = p?.descuento ?? '';
  f.descripcion.value = p?.descripcion ?? '';
  f.enlace.value = p?.enlace ?? '';
  f.vigenciaDesde.value = p?.vigenciaDesde ?? '';
  f.vigenciaHasta.value = p?.vigenciaHasta ?? '';
  f.activa.checked = p?.activa ?? true;
  mostrarVistaPrevia(p?.imagenUrl ?? null);
  mostrarErrores([]);

  editor.showModal();
  if (!p) setTimeout(() => f.establecimiento.focus(), 50);
}

function limpiarEditor() {
  formulario.reset();
  archivo.value = '';
  imagenNueva = null;
  editandoId = null;
  mostrarVistaPrevia(null);
}

async function usarArchivo(file) {
  try {
    mostrarErrores([]);
    zonaTexto.querySelector('b').textContent = 'Optimizando imagen…';
    imagenNueva = await prepararImagen(file);
    mostrarVistaPrevia(imagenNueva);
  } catch (e) {
    mostrarErrores([e.message]);
  } finally {
    zonaTexto.querySelector('b').textContent = 'Toca para elegir la imagen';
    archivo.value = '';
  }
}

function mostrarVistaPrevia(url) {
  vistaPrevia.hidden = !url;
  zonaTexto.hidden = !!url;
  btnCambiarImagen.hidden = !url;
  zonaImagen.classList.toggle('con-imagen', !!url);
  if (url) vistaPrevia.src = url;
  else vistaPrevia.removeAttribute('src');
}

async function guardar(e) {
  e.preventDefault();
  if (ocupado) return;

  const f = formulario.elements;
  const datos = {
    establecimiento: f.establecimiento.value.trim(),
    descuento: f.descuento.value.trim(),
    descripcion: f.descripcion.value.trim() || null,
    enlace: f.enlace.value.trim() || null,
    vigenciaDesde: f.vigenciaDesde.value || null,
    vigenciaHasta: f.vigenciaHasta.value || null,
    activa: f.activa.checked,
  };

  const errores = [];
  if (!editandoId && !imagenNueva) errores.push('Elige una imagen para la promoción.');
  if (!datos.establecimiento) errores.push('Escribe el nombre del establecimiento.');
  if (!datos.descuento) errores.push('Escribe el descuento o la promoción.');
  if (datos.vigenciaDesde && datos.vigenciaHasta && datos.vigenciaDesde > datos.vigenciaHasta)
    errores.push('La fecha “desde” no puede ser posterior a la fecha “hasta”.');
  if (errores.length) return mostrarErrores(errores);

  if (imagenNueva) datos.imagen = imagenNueva;

  try {
    ocupado = true;
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando…';
    const guardada = editandoId
      ? await api('PUT', `/api/gestion/promos/${editandoId}`, datos)
      : await api('POST', '/api/gestion/promos', datos);
    const eraNueva = !editandoId;
    reemplazar(guardada);
    editor.close();
    avisar(eraNueva ? 'Promoción agregada.' : 'Cambios guardados.');
  } catch (err) {
    mostrarErrores(err.errores ?? [err.message]);
  } finally {
    ocupado = false;
    btnGuardar.disabled = false;
    btnGuardar.textContent = 'Guardar';
  }
}

function mostrarErrores(errores) {
  cajaErrores.hidden = !errores.length;
  const ul = el('ul');
  errores.forEach((t) => ul.append(el('li', null, t)));
  cajaErrores.replaceChildren(ul);
}

// Reduce la imagen a máx. 1600 px por lado y la convierte a WebP (o JPG si el navegador no soporta WebP).
// Así la página carga rápido en celular aunque el socio suba fotos de 10 MB.
async function prepararImagen(file) {
  if (file.type && !/^image\//.test(file.type)) throw new Error('El archivo no es una imagen.');
  if (file.size > 25 * 1024 * 1024) throw new Error('La imagen es demasiado grande (máximo 25 MB).');

  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('No se pudo leer la imagen. Usa JPG, PNG o WebP (si es una foto HEIC de iPhone, conviértela a JPG).');
  }

  const MAX = 1600;
  const escala = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * escala);
  const h = Math.round(bmp.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  let url = canvas.toDataURL('image/webp', 0.85);
  if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.85);
  return url;
}

// ---------- Utilidades ----------
function reemplazar(p) {
  const i = promos.findIndex((x) => x.id === p.id);
  if (i >= 0) promos[i] = p;
  else promos.push(p);
  pintar();
}

function camposDe(p) {
  const { establecimiento, descuento, descripcion, enlace, vigenciaDesde, vigenciaHasta, activa } = p;
  return { establecimiento, descuento, descripcion, enlace, vigenciaDesde, vigenciaHasta, activa };
}

let temporizadorAviso;
function avisar(texto, error = false) {
  const a = $('aviso');
  a.textContent = texto;
  a.classList.toggle('error', error);
  a.classList.add('mostrar');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => a.classList.remove('mostrar'), error ? 6000 : 3000);
}

function boton(etiqueta, icono, accion, deshabilitado = false, clase = '') {
  const b = el('button', `icono ${clase}`.trim());
  b.type = 'button';
  b.title = etiqueta;
  b.setAttribute('aria-label', etiqueta);
  b.disabled = deshabilitado;
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icono}</svg>`;
  b.addEventListener('click', accion);
  return b;
}

function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto != null) n.textContent = texto;
  return n;
}

function fecha(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

const ICONOS = {
  arriba: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  abajo: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ojoTachado: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  lapiz: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  basura: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
