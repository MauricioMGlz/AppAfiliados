using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using Promos.Api.Modelos;
using Promos.Api.Servicios;

namespace Promos.Api.Funciones;

/// <summary>
/// Endpoints del panel del socio. Todas las rutas /api/gestion/* están restringidas al rol "socio"
/// en staticwebapp.config.json y además se verifica el rol aquí.
/// (No se usa el prefijo "admin" porque Azure Functions lo reserva para sus propias rutas.)
/// </summary>
public sealed class GestionPromos(PromoStore store, ILogger<GestionPromos> log)
{
    /// <summary>GET /api/gestion/promos → todas las promociones (incluye ocultas y vencidas).</summary>
    [Function("GestionListar")]
    public Task<HttpResponseData> Listar(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "gestion/promos")] HttpRequestData req,
        CancellationToken ct) =>
        Ejecutar(req, "listar", async () =>
        {
            var (lista, _) = await store.LeerAsync(ct);
            var hoy = store.Hoy();
            var resultado = lista.OrderBy(p => p.Orden).Select(p => PromoGestion.Desde(p, hoy)).ToList();
            return await Respuesta.JsonAsync(req, HttpStatusCode.OK, new { hoy = hoy.ToString("yyyy-MM-dd"), promos = resultado });
        });

    /// <summary>POST /api/gestion/promos → crea una promoción (la imagen es obligatoria).</summary>
    [Function("GestionCrear")]
    public Task<HttpResponseData> Crear(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "gestion/promos")] HttpRequestData req,
        CancellationToken ct) =>
        Ejecutar(req, "crear", async () =>
        {
            var entrada = await Respuesta.LeerCuerpoAsync<PromoEntrada>(req, ct);
            if (entrada is null) return await Respuesta.ErrorAsync(req, HttpStatusCode.BadRequest, "Solicitud inválida.");

            var (datos, errores) = ValidadorPromo.Validar(entrada, imagenObligatoria: true);
            if (datos is null) return await Respuesta.ErrorAsync(req, HttpStatusCode.BadRequest, [.. errores]);

            var idImagen = await store.GuardarImagenAsync(datos.Imagen!, ct);
            try
            {
                var ahora = DateTimeOffset.UtcNow;
                var nueva = await store.ModificarAsync(lista =>
                {
                    var promo = new Promo
                    {
                        Id = PromoStore.NuevoId(),
                        Imagen = idImagen,
                        Orden = lista.Count == 0 ? 0 : lista.Max(p => p.Orden) + 1,
                        Creada = ahora
                    };
                    Aplicar(promo, datos, ahora);
                    lista.Add(promo);
                    return promo;
                }, ct);

                return await Respuesta.JsonAsync(req, HttpStatusCode.Created, PromoGestion.Desde(nueva, store.Hoy()));
            }
            catch
            {
                await store.BorrarImagenAsync(idImagen, CancellationToken.None); // no dejar imágenes huérfanas
                throw;
            }
        });

    /// <summary>PUT /api/gestion/promos/{id} → edita; si no se manda imagen, se conserva la actual.</summary>
    [Function("GestionActualizar")]
    public Task<HttpResponseData> Actualizar(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "gestion/promos/{id}")] HttpRequestData req,
        string id,
        CancellationToken ct) =>
        Ejecutar(req, "actualizar", async () =>
        {
            if (!PromoStore.EsIdValido(id)) return await NoEncontrada(req);

            var entrada = await Respuesta.LeerCuerpoAsync<PromoEntrada>(req, ct);
            if (entrada is null) return await Respuesta.ErrorAsync(req, HttpStatusCode.BadRequest, "Solicitud inválida.");

            var (datos, errores) = ValidadorPromo.Validar(entrada, imagenObligatoria: false);
            if (datos is null) return await Respuesta.ErrorAsync(req, HttpStatusCode.BadRequest, [.. errores]);

            string? idImagenNueva = datos.Imagen is null ? null : await store.GuardarImagenAsync(datos.Imagen, ct);
            string? idImagenAnterior = null;
            try
            {
                var ahora = DateTimeOffset.UtcNow;
                var editada = await store.ModificarAsync<Promo?>(lista =>
                {
                    var promo = lista.FirstOrDefault(p => p.Id == id);
                    if (promo is null) return null;
                    if (idImagenNueva is not null)
                    {
                        idImagenAnterior = promo.Imagen;
                        promo.Imagen = idImagenNueva;
                    }
                    Aplicar(promo, datos, ahora);
                    return promo;
                }, ct);

                if (editada is null)
                {
                    await store.BorrarImagenAsync(idImagenNueva, CancellationToken.None);
                    return await NoEncontrada(req);
                }

                await store.BorrarImagenAsync(idImagenAnterior, CancellationToken.None);
                return await Respuesta.JsonAsync(req, HttpStatusCode.OK, PromoGestion.Desde(editada, store.Hoy()));
            }
            catch
            {
                await store.BorrarImagenAsync(idImagenNueva, CancellationToken.None);
                throw;
            }
        });

    /// <summary>DELETE /api/gestion/promos/{id}</summary>
    [Function("GestionEliminar")]
    public Task<HttpResponseData> Eliminar(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "gestion/promos/{id}")] HttpRequestData req,
        string id,
        CancellationToken ct) =>
        Ejecutar(req, "eliminar", async () =>
        {
            if (!PromoStore.EsIdValido(id)) return await NoEncontrada(req);

            var eliminada = await store.ModificarAsync<Promo?>(lista =>
            {
                var promo = lista.FirstOrDefault(p => p.Id == id);
                if (promo is not null) lista.Remove(promo);
                return promo;
            }, ct);

            if (eliminada is null) return await NoEncontrada(req);

            await store.BorrarImagenAsync(eliminada.Imagen, CancellationToken.None);
            return req.CreateResponse(HttpStatusCode.NoContent);
        });

    /// <summary>PUT /api/gestion/orden → { "ids": ["...", "..."] } en el orden deseado.</summary>
    [Function("GestionOrdenar")]
    public Task<HttpResponseData> Ordenar(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "gestion/orden")] HttpRequestData req,
        CancellationToken ct) =>
        Ejecutar(req, "ordenar", async () =>
        {
            var entrada = await Respuesta.LeerCuerpoAsync<OrdenEntrada>(req, ct);
            if (entrada?.Ids is not { Count: > 0 } ids)
                return await Respuesta.ErrorAsync(req, HttpStatusCode.BadRequest, "Falta la lista de ids.");

            await store.ModificarAsync(lista =>
            {
                var posicion = ids.Distinct()
                    .Select((id, i) => (id, i))
                    .ToDictionary(x => x.id, x => x.i);

                // Las que no vengan en la lista se quedan al final, en su orden anterior.
                var ordenadas = lista
                    .OrderBy(p => posicion.TryGetValue(p.Id, out var i) ? i : int.MaxValue)
                    .ThenBy(p => p.Orden)
                    .ToList();

                for (var i = 0; i < ordenadas.Count; i++) ordenadas[i].Orden = i;
                return true;
            }, ct);

            return req.CreateResponse(HttpStatusCode.NoContent);
        });

    private static void Aplicar(Promo promo, DatosPromo datos, DateTimeOffset ahora)
    {
        promo.Establecimiento = datos.Establecimiento;
        promo.Descuento = datos.Descuento;
        promo.Descripcion = datos.Descripcion;
        promo.Enlace = datos.Enlace;
        promo.VigenciaDesde = datos.VigenciaDesde;
        promo.VigenciaHasta = datos.VigenciaHasta;
        promo.Activa = datos.Activa;
        promo.Actualizada = ahora;
    }

    private static Task<HttpResponseData> NoEncontrada(HttpRequestData req) =>
        Respuesta.ErrorAsync(req, HttpStatusCode.NotFound, "La promoción no existe o ya fue eliminada.");

    /// <summary>Verifica el rol y convierte excepciones en respuestas con mensaje en español.</summary>
    private async Task<HttpResponseData> Ejecutar(HttpRequestData req, string accion, Func<Task<HttpResponseData>> accionAsync)
    {
        if (!Socio.EsSocio(req))
            return await Respuesta.ErrorAsync(req, HttpStatusCode.Forbidden, "No tienes permiso para modificar las promociones.");

        try
        {
            return await accionAsync();
        }
        catch (ConfiguracionFaltanteException ex)
        {
            log.LogError(ex, "Configuración faltante");
            return await Respuesta.ErrorAsync(req, HttpStatusCode.InternalServerError, ex.Message);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error al {Accion} promoción", accion);
            return await Respuesta.ErrorAsync(req, HttpStatusCode.InternalServerError,
                "Ocurrió un error al guardar. Intenta de nuevo en un momento.");
        }
    }
}
