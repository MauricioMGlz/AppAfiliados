using System.Globalization;

namespace Promos.Api.Modelos;

/// <summary>Promoción tal como se guarda en promos.json.</summary>
public sealed class Promo
{
    public string Id { get; set; } = "";
    /// <summary>Id del blob de la imagen (32 caracteres hex).</summary>
    public string Imagen { get; set; } = "";
    public string Establecimiento { get; set; } = "";
    public string Descuento { get; set; } = "";
    public string? Descripcion { get; set; }
    public string? Enlace { get; set; }
    /// <summary>Fecha yyyy-MM-dd (hora local configurada) o null.</summary>
    public string? VigenciaDesde { get; set; }
    public string? VigenciaHasta { get; set; }
    public bool Activa { get; set; } = true;
    public int Orden { get; set; }
    public DateTimeOffset Creada { get; set; }
    public DateTimeOffset Actualizada { get; set; }

    public string Estado(DateOnly hoy)
    {
        if (!Activa) return "oculta";
        if (Fecha(VigenciaDesde) is { } desde && hoy < desde) return "programada";
        if (Fecha(VigenciaHasta) is { } hasta && hoy > hasta) return "vencida";
        return "visible";
    }

    public bool EstaVigente(DateOnly hoy) => Estado(hoy) == "visible";

    public static DateOnly? Fecha(string? valor) =>
        DateOnly.TryParseExact(valor, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var f)
            ? f
            : null;
}

/// <summary>Lo que ve cualquier visitante de la página pública.</summary>
public sealed record PromoPublica(
    string Id,
    string ImagenUrl,
    string Establecimiento,
    string Descuento,
    string? Descripcion,
    string? Enlace,
    string? VigenciaHasta)
{
    public static PromoPublica Desde(Promo p) =>
        new(p.Id, UrlImagen(p.Imagen), p.Establecimiento, p.Descuento, p.Descripcion, p.Enlace, p.VigenciaHasta);

    public static string UrlImagen(string idImagen) => $"/api/imagen/{idImagen}";
}

/// <summary>Lo que ve el socio en el panel de administración.</summary>
public sealed record PromoGestion(
    string Id,
    string ImagenUrl,
    string Establecimiento,
    string Descuento,
    string? Descripcion,
    string? Enlace,
    string? VigenciaDesde,
    string? VigenciaHasta,
    bool Activa,
    int Orden,
    string Estado,
    DateTimeOffset Actualizada)
{
    public static PromoGestion Desde(Promo p, DateOnly hoy) =>
        new(p.Id, PromoPublica.UrlImagen(p.Imagen), p.Establecimiento, p.Descuento, p.Descripcion, p.Enlace,
            p.VigenciaDesde, p.VigenciaHasta, p.Activa, p.Orden, p.Estado(hoy), p.Actualizada);
}

/// <summary>Cuerpo que envía el panel al crear o editar.</summary>
public sealed class PromoEntrada
{
    public string? Establecimiento { get; set; }
    public string? Descuento { get; set; }
    public string? Descripcion { get; set; }
    public string? Enlace { get; set; }
    public string? VigenciaDesde { get; set; }
    public string? VigenciaHasta { get; set; }
    public bool? Activa { get; set; }
    /// <summary>Data URL (data:image/webp;base64,...). Obligatoria al crear; opcional al editar.</summary>
    public string? Imagen { get; set; }
}

public sealed class OrdenEntrada
{
    public List<string>? Ids { get; set; }
}

public sealed record ImagenSubida(byte[] Bytes, string Tipo);
