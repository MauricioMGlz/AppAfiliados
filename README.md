# Promociones para afiliados

Página sencilla con un carrusel de promociones, sin menús, a la que lleva el QR de la tarjeta de afiliado.
Incluye un panel privado (`/admin`) para que un socio suba, edite, ordene, oculte o borre las promociones.

- **Página pública:** `src/index.html` (responsive, funciona con el dedo en celular y con flechas en computadora)
- **Panel del socio:** `src/admin/` (protegido por rol `socio`)
- **API:** `api/` (Azure Functions en C#, .NET 10 aislado) que guarda en Azure Blob Storage
- **Hosting:** Azure Static Web Apps, plan **Free**

```
promos-afiliados/
├─ src/                          ← sitio estático (app_location)
│  ├─ index.html                 ← carrusel
│  ├─ admin/index.html           ← panel del socio
│  ├─ login.html, sin-acceso.html, 404.html
│  ├─ css/  js/  img/
│  └─ staticwebapp.config.json   ← rutas protegidas, encabezados de seguridad, runtime de la API
├─ api/                          ← Azure Functions (api_location)
│  ├─ Funciones/PromosPublicas.cs   GET /api/promos, GET /api/imagen/{id}
│  ├─ Funciones/GestionPromos.cs    /api/gestion/* (solo socio)
│  ├─ Servicios/                    almacenamiento, validación, utilidades
│  └─ Modelos/
└─ dev/servidor-prueba.mjs       ← simulador local sin Azure (solo para desarrollo)
```

---

## 1. Verlo funcionando en tu máquina (sin Azure)

Necesitas Node 18 o superior.

```bash
node dev/servidor-prueba.mjs
```

- Página pública: http://localhost:4280/
- Panel: http://localhost:4280/admin/ (entra con un socio ficticio)

El simulador guarda todo en memoria y trae 4 promociones de ejemplo. También puedes abrir la página pública con `?demo` para ver los ejemplos sin API.

## 2. Crear la cuenta de almacenamiento

1. En el portal de Azure: **Crear recurso → Cuenta de almacenamiento**.
2. Rendimiento **Estándar**, redundancia **LRS** (la más barata). La región puede ser **South Central US**, que es la más cercana a Tamaulipas.
3. Ya creada: **Seguridad y redes → Claves de acceso → Cadena de conexión**. Cópiala.

No tienes que crear contenedores: la API crea `promos-datos` y `promos-imagenes` (los dos **privados**) la primera vez que el socio guarda algo. Las imágenes se sirven a través de `/api/imagen/{id}`, así que no hace falta habilitar acceso anónimo ni CORS.

## 3. Publicar en Azure Static Web Apps

1. Sube esta carpeta a un repositorio de GitHub (puede ser privado).
2. En el portal: **Crear recurso → Static Web App**.
   - Plan: **Free**
   - Origen: **GitHub**, elige el repositorio y la rama
   - Valores predefinidos de compilación: **Personalizado**
   - **App location:** `src`
   - **Api location:** `api`
   - **Output location:** *(vacío)*
3. Azure crea un workflow de GitHub Actions en tu repositorio y despliega solo. Cada `git push` vuelve a publicar.
4. En el recurso de la Static Web App: **Configuración → Variables de entorno** y agrega:

   | Nombre | Valor |
   |---|---|
   | `PROMOS_STORAGE` | la cadena de conexión del paso 2 |
   | `ZONA_HORARIA` | `America/Mexico_City` *(opcional, es el valor por defecto)* |

> El runtime de la API está fijado en `dotnet-isolated:10.0` (en `staticwebapp.config.json`) y el proyecto usa `net10.0`. Los dos valores tienen que coincidir. Azure retiró .NET 8 y 9 en Static Web Apps el 10 de noviembre de 2026.

## 4. Invitar al socio

1. En la Static Web App: **Administración de roles → Invitar**.
2. Proveedor de autorización: **Microsoft Entra ID** (cuenta Microsoft u Outlook) o **GitHub**.
3. Detalles del invitado: el correo de su cuenta Microsoft o su usuario de GitHub.
4. Dominio: el dominio con el que entrará (tu dominio propio, si ya lo configuraste).
5. Roles: `socio` (en minúsculas, exactamente así).
6. Copia el enlace de invitación y mándaselo. Cuando lo acepte, podrá entrar a `https://tudominio.com/admin`.

El plan Free permite hasta 25 personas invitadas con roles. Si alguien inicia sesión sin la invitación, ve la página "Tu cuenta no tiene acceso".

## 5. Dominio propio (para que el QR no cambie nunca)

**El QR debe apuntar a tu dominio y no a la dirección `*.azurestaticapps.net`.** Así puedes cambiar de hosting algún día sin reimprimir tarjetas.

1. Compra el dominio (recomendado: `.com` en **Cloudflare Registrar** o **Porkbun**, que cobran lo mismo al registrar y al renovar).
2. En la Static Web App: **Dominios personalizados → Agregar → Dominio personalizado en otro DNS**.
3. Opción sencilla, con subdominio `www`: crea en tu DNS un registro **CNAME** `www` → `<tu-app>.azurestaticapps.net`.
4. Si también quieres el dominio sin `www` (`tudominio.com`): Azure te pide primero un registro **TXT** de validación y después un registro **CNAME/ALIAS** en la raíz. Cloudflare lo permite con "CNAME flattening".
5. Azure emite y renueva el certificado HTTPS sin costo.
6. Genera el QR con la URL final (por ejemplo `https://tudominio.com`). Usa corrección de errores **M** o **H** y pruébalo impreso con varios celulares antes de mandar a imprimir todas las tarjetas.
7. Deja activada la **renovación automática** del dominio. Si el dominio vence, todos los QR impresos dejan de funcionar.

## 6. Personalizar

- **Textos:** el encabezado y el pie están en `src/index.html` ("Tarjeta de Afiliado", "Promociones vigentes"...).
- **Colores:** las variables al inicio de `src/css/carrusel.css` (`--acento`, `--fondo`...).
- **Velocidad del carrusel:** `INTERVALO_MS` en `src/js/carrusel.js` (6 segundos por defecto). Cuando la persona toca el carrusel, el avance automático se pausa 15 segundos.

## Cómo funciona

- **Promociones:** se guardan en un solo `promos.json` dentro del blob privado `promos-datos`. Las escrituras usan ETag, así que si dos personas guardan al mismo tiempo no se pisan los cambios.
- **Visibilidad:** cada promoción tiene un interruptor de **mostrar u ocultar** y fechas opcionales de **visible desde** y **visible hasta**, calculadas con la hora de México. La página pública solo muestra las que están visibles hoy. El panel indica si cada una está *Visible*, *Programada*, *Vencida* u *Oculta*.
- **Imágenes:** el panel las reduce en el navegador a 1600 px como máximo y las convierte a WebP (o JPG). Una foto de 8 MB tomada con el celular queda en unos cientos de KB, así la página carga rápido con datos móviles.
- **Validación en el servidor:** el servidor revisa los campos, acepta solo JPG, PNG o WebP (verifica los primeros bytes del archivo, no solo la extensión), con un máximo de 5 MB, y solo permite enlaces `https://` o `tel:`.
- **Seguridad:** `/admin*` y `/api/gestion/*` requieren el rol `socio` en `staticwebapp.config.json`, y la API vuelve a verificar el rol en el código. El sitio envía una CSP estricta.

## Desarrollo local con la API real (opcional)

Requiere el SDK de .NET 10, [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local), [SWA CLI](https://azure.github.io/static-web-apps-cli/) y [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite).

```bash
cp api/local.settings.example.json api/local.settings.json
azurite --silent --location .azurite &
swa start src --api-location api
```

Abre http://localhost:4280/admin/. El emulador de SWA te muestra una pantalla de login falsa: escribe cualquier usuario y en **User's roles** agrega `socio`.

## Costos aproximados

| Concepto | Costo |
|---|---|
| Static Web Apps (plan Free, incluye la API) | $0 |
| Blob Storage (unas decenas de imágenes) | centavos de dólar al mes |
| Dominio `.com` | ~10–11 USD al año |
