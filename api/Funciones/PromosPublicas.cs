using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using Promos.Api.Modelos;
using Promos.Api.Servicios;

namespace Promos.Api.Funciones;

/// <summary>Endpoints públicos: los usa la página del carrusel (a la que lleva el QR).</summary>
public sealed class PromosPublicas(PromoStore store, ILogger<PromosPublicas> log)
{
    /// <summary>GET /api/promos → promociones activas y dentro de su vigencia, en orden.</summary>
    [Function("PromosPublicas")]
    public async Task<HttpResponseData> Listar(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "promos")] HttpRequestData req,
        CancellationToken ct)
    {
        try
        {
            var (lista, _) = await store.LeerAsync(ct);
            var hoy = store.Hoy();
            var vigentes = lista
                .Where(p => p.EstaVigente(hoy))
                .OrderBy(p => p.Orden)
                .Select(PromoPublica.Desde)
                .ToList();

            // Un minuto de caché: los cambios del socio se ven casi de inmediato.
            return await Respuesta.JsonAsync(req, HttpStatusCode.OK, vigentes, "public, max-age=60");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error al listar promociones públicas");
            return await Respuesta.ErrorAsync(req, HttpStatusCode.InternalServerError,
                "No se pudieron cargar las promociones.");
        }
    }

    /// <summary>GET /api/imagen/{id} → la imagen de una promoción, con caché larga (el id nunca se reutiliza).</summary>
    [Function("Imagen")]
    public async Task<HttpResponseData> Imagen(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "imagen/{id}")] HttpRequestData req,
        string id,
        CancellationToken ct)
    {
        if (!PromoStore.EsIdValido(id)) return req.CreateResponse(HttpStatusCode.NotFound);

        try
        {
            var imagen = await store.LeerImagenAsync(id, ct);
            if (imagen is null) return req.CreateResponse(HttpStatusCode.NotFound);

            var res = req.CreateResponse(HttpStatusCode.OK);
            res.Headers.Add("Content-Type", imagen.Tipo);
            res.Headers.Add("Cache-Control", "public, max-age=31536000, immutable");
            await res.WriteBytesAsync(imagen.Bytes);
            return res;
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error al leer la imagen {Id}", id);
            return req.CreateResponse(HttpStatusCode.InternalServerError);
        }
    }
}
