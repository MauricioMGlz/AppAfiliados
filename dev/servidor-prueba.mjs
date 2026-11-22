// Servidor de prueba SOLO para desarrollo: sirve /src y simula la API en memoria,
// con un usuario "socio" ficticio. Sirve para probar el diseño del carrusel y del panel
// sin Azure. Los datos se pierden al detenerlo.
//
//   node dev/servidor-prueba.mjs          → http://localhost:4280
//   node dev/servidor-prueba.mjs --vacio  → sin promociones de ejemplo

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { promosDemo } from '../src/js/demo.js';

const RAIZ = fileURLToPath(new URL('../src/', import.meta.url));
const PUERTO = Number(process.env.PORT) || 4280;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };

// Mismos encabezados de seguridad (CSP, etc.) que aplica Azure, para detectar problemas antes.
const { globalHeaders = {} } = JSON.parse(await readFile(join(RAIZ, 'staticwebapp.config.json'), 'utf8'));

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
const nuevoId = () => randomUUID().replaceAll('-', '');

let promos = process.argv.includes('--vacio') ? [] : promosDemo().map((p, i) => ({
  ...p, id: nuevoId(), vigenciaDesde: null, activa: true, orden: i, actualizada: new Date().toISOString(),
}));

function estado(p) {
  const h = hoy();
  if (!p.activa) return 'oculta';
  if (p.vigenciaDesde && h < p.vigenciaDesde) return 'programada';
  if (p.vigenciaHasta && h > p.vigenciaHasta) return 'vencida';
  return 'visible';
}

function validar(e, imagenObligatoria) {
  const errores = [];
  const t = (v) => (typeof v === 'string' && v.trim()) || null;
  const d = { establecimiento: t(e.establecimiento), descuento: t(e.descuento), descripcion: t(e.descripcion), enlace: t(e.enlace), vigenciaDesde: t(e.vigenciaDesde), vigenciaHasta: t(e.vigenciaHasta), activa: e.activa ?? true };
  if (!d.establecimiento) errores.push('El nombre del establecimiento es obligatorio.');
  if (!d.descuento) errores.push('Escribe el descuento o la promoción (por ejemplo: 15% de descuento).');
  if (d.enlace && !d.enlace.includes('://') && !d.enlace.startsWith('tel:')) d.enlace = 'https://' + d.enlace;
  if (d.enlace && !/^(https?:\/\/|tel:)/i.test(d.enlace)) errores.push('El enlace no es válido.');
  if (d.vigenciaDesde && d.vigenciaHasta && d.vigenciaDesde > d.vigenciaHasta) errores.push('La fecha de inicio no puede ser posterior a la fecha de fin.');
  if (e.imagen && !/^data:image\/(jpeg|png|webp);base64,/.test(e.imagen)) errores.push('La imagen debe ser JPG, PNG o WebP.');
  if (!e.imagen && imagenObligatoria) errores.push('La imagen es obligatoria.');
  return { d, errores };
}

const json = (res, codigo, cuerpo) => {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(cuerpo === undefined ? '' : JSON.stringify(cuerpo));
};

async function leerCuerpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  try { return JSON.parse(Buffer.concat(partes).toString('utf8') || 'null'); } catch { return null; }
}

async function api(m, ruta, cuerpo, res) {
  const ordenadas = () => [...promos].sort((a, b) => a.orden - b.orden);

  if (m === 'GET' && ruta === '/api/promos') {
    return json(res, 200, ordenadas().filter((p) => estado(p) === 'visible').map(({ id, imagenUrl, establecimiento, descuento, descripcion, enlace, vigenciaHasta }) =>
      ({ id, imagenUrl, establecimiento, descuento, descripcion, enlace, vigenciaHasta })));
  }
  if (m === 'GET' && ruta === '/api/gestion/promos') {
    return json(res, 200, { hoy: hoy(), promos: ordenadas().map((p) => ({ ...p, estado: estado(p) })) });
  }
  if (m === 'POST' && ruta === '/api/gestion/promos') {
    const { d, errores } = validar(cuerpo, true);
    if (errores.length) return json(res, 400, { errores });
    const p = { ...d, id: nuevoId(), imagenUrl: cuerpo.imagen, orden: promos.length ? Math.max(...promos.map((x) => x.orden)) + 1 : 0, actualizada: new Date().toISOString() };
    promos.push(p);
    return json(res, 201, { ...p, estado: estado(p) });
  }
  const mPromo = ruta.match(/^\/api\/gestion\/promos\/([a-f0-9]{32})$/);
  if (mPromo && m === 'PUT') {
    const p = promos.find((x) => x.id === mPromo[1]);
    if (!p) return json(res, 404, { errores: ['La promoción no existe o ya fue eliminada.'] });
    const { d, errores } = validar(cuerpo, false);
    if (errores.length) return json(res, 400, { errores });
    Object.assign(p, d, cuerpo.imagen ? { imagenUrl: cuerpo.imagen } : {}, { actualizada: new Date().toISOString() });
    return json(res, 200, { ...p, estado: estado(p) });
  }
  if (mPromo && m === 'DELETE') {
    const antes = promos.length;
    promos = promos.filter((x) => x.id !== mPromo[1]);
    return antes === promos.length ? json(res, 404, { errores: ['La promoción no existe.'] }) : json(res, 204);
  }
  if (m === 'PUT' && ruta === '/api/gestion/orden') {
    const ids = cuerpo.ids ?? [];
    promos.forEach((p) => { const i = ids.indexOf(p.id); p.orden = i === -1 ? 1e6 + p.orden : i; });
    ordenadas().forEach((p, i) => (p.orden = i));
    return json(res, 204);
  }
  return json(res, 404, { errores: ['Ruta no encontrada.'] });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let ruta = decodeURIComponent(url.pathname);
  try {
    if (ruta === '/.auth/me') return json(res, 200, { clientPrincipal: { identityProvider: 'aad', userDetails: 'socio.prueba@ejemplo.com', userRoles: ['anonymous', 'authenticated', 'socio'] } });
    if (ruta.startsWith('/.auth/')) { res.writeHead(302, { Location: url.searchParams.get('post_login_redirect_uri') || url.searchParams.get('post_logout_redirect_uri') || '/' }); return res.end(); }
    if (ruta.startsWith('/api/')) {
      const cuerpo = ['POST', 'PUT'].includes(req.method) ? ((await leerCuerpo(req)) ?? {}) : {};
      return api(req.method, ruta, cuerpo, res);
    }

    if (ruta === '/admin') ruta = '/admin/';
    if (ruta.endsWith('/')) ruta += 'index.html';
    const archivo = normalize(join(RAIZ, ruta));
    if (!archivo.startsWith(RAIZ)) return json(res, 403, {});
    const datos = await readFile(archivo);
    res.writeHead(200, { ...globalHeaders, 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream' });
    res.end(datos);
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'EISDIR') {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(await readFile(join(RAIZ, '404.html')));
    }
    console.error(e);
    json(res, 500, { errores: ['Error del servidor de prueba.'] });
  }
}).listen(PUERTO, () => {
  console.log(`Página pública:  http://localhost:${PUERTO}/`);
  console.log(`Panel del socio: http://localhost:${PUERTO}/admin/`);
});
