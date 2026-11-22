using System.Text.RegularExpressions;
using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Configuration;
using Promos.Api.Modelos;

namespace Promos.Api.Servicios;

/// <summary>
/// Guarda las promociones en Azure Blob Storage:
///  - contenedor "promos-datos"    → promos.json (la lista completa)
///  - contenedor "promos-imagenes" → una imagen por blob, nombrada con un id aleatorio
/// Ambos contenedores son privados; las imágenes se sirven a través de /api/imagen/{id}.
/// </summary>
public sealed partial class PromoStore
{
    private const string ContenedorDatos = "promos-datos";
    private const string ContenedorImagenes = "promos-imagenes";
    private const string ArchivoDatos = "promos.json";
    private const int MaxReintentos = 3;

    private readonly BlobContainerClient? _datos;
    private readonly BlobContainerClient? _imagenes;
    private readonly TimeZoneInfo _zona;
    private volatile bool _contenedoresListos;

    public PromoStore(IConfiguration config)
    {
        var conexion = config["PROMOS_STORAGE"];
        if (!string.IsNullOrWhiteSpace(conexion))
        {
            var servicio = new BlobServiceClient(conexion);
            _datos = servicio.GetBlobContainerClient(ContenedorDatos);
            _imagenes = servicio.GetBlobContainerClient(ContenedorImagenes);
        }
        _zona = CargarZona(config["ZONA_HORARIA"]);
    }

    [GeneratedRegex("^[a-f0-9]{32}$")]
    private static partial Regex PatronId();

    public static bool EsIdValido(string? id) => id is not null && PatronId().IsMatch(id);

    public static string NuevoId() => Guid.NewGuid().ToString("N");

    /// <summary>Fecha de hoy en la zona horaria configurada (por defecto, Ciudad de México).</summary>
    public DateOnly Hoy() => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, _zona).DateTime);

    public async Task<(List<Promo> Lista, ETag? Etag)> LeerAsync(CancellationToken ct)
    {
        var blob = Datos.GetBlobClient(ArchivoDatos);
        try
        {
            var respuesta = await blob.DownloadContentAsync(ct);
            var lista = respuesta.Value.Content.ToObjectFromJson<List<Promo>>(Json.Opciones) ?? [];
            return (lista, respuesta.Value.Details.ETag);
        }
        catch (RequestFailedException e) when (e.Status == 404)
        {
            // Todavía no existe el contenedor o el archivo: no hay promociones.
            return ([], null);
        }
    }

    /// <summary>
    /// Lee la lista, aplica el cambio y la guarda con control de concurrencia (ETag).
    /// Si alguien más guardó en medio, vuelve a leer y reintenta.
    /// </summary>
    public async Task<T> ModificarAsync<T>(Func<List<Promo>, T> cambio, CancellationToken ct)
    {
        await AsegurarContenedoresAsync(ct);
        var blob = Datos.GetBlobClient(ArchivoDatos);

        for (var intento = 0; ; intento++)
        {
            var (lista, etag) = await LeerAsync(ct);
            var resultado = cambio(lista);

            var opciones = new BlobUploadOptions
            {
                HttpHeaders = new BlobHttpHeaders { ContentType = "application/json; charset=utf-8" },
                Conditions = etag is { } version
                    ? new BlobRequestConditions { IfMatch = version }
                    : new BlobRequestConditions { IfNoneMatch = ETag.All }
            };

            try
            {
                await blob.UploadAsync(BinaryData.FromObjectAsJson(lista, Json.Opciones), opciones, ct);
                return resultado;
            }
            catch (RequestFailedException e) when ((e.Status == 412 || e.Status == 409) && intento < MaxReintentos)
            {
                // Conflicto de concurrencia: reintentar con la versión más reciente.
            }
        }
    }

    public async Task<string> GuardarImagenAsync(ImagenSubida imagen, CancellationToken ct)
    {
        await AsegurarContenedoresAsync(ct);
        var id = NuevoId();
        var opciones = new BlobUploadOptions
        {
            HttpHeaders = new BlobHttpHeaders
            {
                ContentType = imagen.Tipo,
                CacheControl = "public, max-age=31536000, immutable"
            }
        };
        await Imagenes.GetBlobClient(id).UploadAsync(BinaryData.FromBytes(imagen.Bytes), opciones, ct);
        return id;
    }

    public async Task<ImagenSubida?> LeerImagenAsync(string id, CancellationToken ct)
    {
        try
        {
            var respuesta = await Imagenes.GetBlobClient(id).DownloadContentAsync(ct);
            var tipo = respuesta.Value.Details.ContentType;
            return new ImagenSubida(respuesta.Value.Content.ToArray(),
                string.IsNullOrWhiteSpace(tipo) ? "application/octet-stream" : tipo);
        }
        catch (RequestFailedException e) when (e.Status == 404)
        {
            return null;
        }
    }

    public async Task BorrarImagenAsync(string? id, CancellationToken ct)
    {
        if (id is null || !EsIdValido(id)) return;
        await Imagenes.GetBlobClient(id).DeleteIfExistsAsync(cancellationToken: ct);
    }

    private BlobContainerClient Datos => _datos ?? throw new ConfiguracionFaltanteException();
    private BlobContainerClient Imagenes => _imagenes ?? throw new ConfiguracionFaltanteException();

    private async Task AsegurarContenedoresAsync(CancellationToken ct)
    {
        if (_contenedoresListos) return;
        await Datos.CreateIfNotExistsAsync(cancellationToken: ct);
        await Imagenes.CreateIfNotExistsAsync(cancellationToken: ct);
        _contenedoresListos = true;
    }

    private static TimeZoneInfo CargarZona(string? configurada)
    {
        foreach (var id in new[] { configurada, "America/Mexico_City", "Central Standard Time (Mexico)" })
        {
            if (!string.IsNullOrWhiteSpace(id) && TimeZoneInfo.TryFindSystemTimeZoneById(id, out var zona))
                return zona;
        }
        return TimeZoneInfo.Utc;
    }
}

public sealed class ConfiguracionFaltanteException()
    : InvalidOperationException("Falta la configuración PROMOS_STORAGE (cadena de conexión de la cuenta de almacenamiento).");
