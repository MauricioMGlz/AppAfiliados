using System.Text.RegularExpressions;
using Promos.Api.Modelos;

namespace Promos.Api.Servicios;

public sealed record DatosPromo(
    string Establecimiento,
    string Descuento,
    string? Descripcion,
    string? Enlace,
    string? VigenciaDesde,
    string? VigenciaHasta,
    bool Activa,
    ImagenSubida? Imagen);

public static partial class ValidadorPromo
{
    public const int MaxEstablecimiento = 80;
    public const int MaxDescuento = 60;
    public const int MaxDescripcion = 300;
    public const int MaxBytesImagen = 5 * 1024 * 1024;

    [GeneratedRegex(@"^data:(image/(?:jpeg|png|webp));base64,(.+)$", RegexOptions.Singleline)]
    private static partial Regex PatronDataUrl();

    public static (DatosPromo? Datos, List<string> Errores) Validar(PromoEntrada e, bool imagenObligatoria)
    {
        var errores = new List<string>();

        var establecimiento = Limpiar(e.Establecimiento);
        if (establecimiento is null) errores.Add("El nombre del establecimiento es obligatorio.");
        else if (establecimiento.Length > MaxEstablecimiento) errores.Add($"El establecimiento admite máximo {MaxEstablecimiento} caracteres.");

        var descuento = Limpiar(e.Descuento);
        if (descuento is null) errores.Add("Escribe el descuento o la promoción (por ejemplo: 15% de descuento).");
        else if (descuento.Length > MaxDescuento) errores.Add($"El descuento admite máximo {MaxDescuento} caracteres.");

        var descripcion = Limpiar(e.Descripcion);
        if (descripcion?.Length > MaxDescripcion) errores.Add($"La descripción admite máximo {MaxDescripcion} caracteres.");

        var enlace = NormalizarEnlace(e.Enlace, errores);

        var desde = Limpiar(e.VigenciaDesde);
        var hasta = Limpiar(e.VigenciaHasta);
        var fDesde = Promo.Fecha(desde);
        var fHasta = Promo.Fecha(hasta);
        if (desde is not null && fDesde is null) errores.Add("La fecha de inicio no es válida.");
        if (hasta is not null && fHasta is null) errores.Add("La fecha de fin no es válida.");
        if (fDesde is { } d && fHasta is { } h && d > h) errores.Add("La fecha de inicio no puede ser posterior a la fecha de fin.");

        ImagenSubida? imagen = null;
        if (!string.IsNullOrWhiteSpace(e.Imagen)) imagen = LeerImagen(e.Imagen, errores);
        else if (imagenObligatoria) errores.Add("La imagen es obligatoria.");

        if (errores.Count > 0) return (null, errores);

        return (new DatosPromo(establecimiento!, descuento!, descripcion, enlace, desde, hasta, e.Activa ?? true, imagen), errores);
    }

    private static string? Limpiar(string? valor)
    {
        var limpio = valor?.Trim();
        return string.IsNullOrEmpty(limpio) ? null : limpio;
    }

    /// <summary>Solo se aceptan enlaces http(s) y tel: para evitar javascript: u otros esquemas.</summary>
    private static string? NormalizarEnlace(string? valor, List<string> errores)
    {
        var enlace = Limpiar(valor);
        if (enlace is null) return null;

        if (!enlace.Contains("://", StringComparison.Ordinal) &&
            !enlace.StartsWith("tel:", StringComparison.OrdinalIgnoreCase))
        {
            enlace = "https://" + enlace;
        }

        if (enlace.Length > 500 ||
            !Uri.TryCreate(enlace, UriKind.Absolute, out var uri) ||
            uri.Scheme is not ("http" or "https" or "tel"))
        {
            errores.Add("El enlace no es válido. Usa una dirección que empiece con https:// o un teléfono con tel:.");
            return null;
        }
        return uri.AbsoluteUri;
    }

    private static ImagenSubida? LeerImagen(string dataUrl, List<string> errores)
    {
        var m = PatronDataUrl().Match(dataUrl);
        if (!m.Success)
        {
            errores.Add("La imagen debe ser JPG, PNG o WebP.");
            return null;
        }

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(m.Groups[2].Value);
        }
        catch (FormatException)
        {
            errores.Add("La imagen está dañada.");
            return null;
        }

        if (bytes.Length > MaxBytesImagen)
        {
            errores.Add("La imagen pesa más de 5 MB.");
            return null;
        }

        var tipo = m.Groups[1].Value;
        if (!CoincideFirma(bytes, tipo))
        {
            errores.Add("El contenido del archivo no corresponde a una imagen válida.");
            return null;
        }
        return new ImagenSubida(bytes, tipo);
    }

    /// <summary>Revisa los primeros bytes del archivo para confirmar que sí es la imagen que dice ser.</summary>
    private static bool CoincideFirma(byte[] b, string tipo) => tipo switch
    {
        "image/jpeg" => b.Length > 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF,
        "image/png" => b.Length > 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47,
        "image/webp" => b.Length > 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                        && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P',
        _ => false
    };
}
