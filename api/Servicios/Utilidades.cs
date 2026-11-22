using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Azure.Functions.Worker.Http;

namespace Promos.Api.Servicios;

internal static class Json
{
    /// <summary>camelCase y sin distinguir mayúsculas al leer.</summary>
    public static readonly JsonSerializerOptions Opciones = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };
}

internal static class Respuesta
{
    public static async Task<HttpResponseData> JsonAsync(
        HttpRequestData req, HttpStatusCode codigo, object? cuerpo, string cache = "no-store")
    {
        var res = req.CreateResponse(codigo);
        res.Headers.Add("Content-Type", "application/json; charset=utf-8");
        res.Headers.Add("Cache-Control", cache);
        if (cuerpo is not null)
            await res.WriteStringAsync(JsonSerializer.Serialize(cuerpo, Json.Opciones), Encoding.UTF8);
        return res;
    }

    public static Task<HttpResponseData> ErrorAsync(HttpRequestData req, HttpStatusCode codigo, params string[] errores) =>
        JsonAsync(req, codigo, new { errores });

    public static async Task<T?> LeerCuerpoAsync<T>(HttpRequestData req, CancellationToken ct) where T : class
    {
        try
        {
            return await JsonSerializer.DeserializeAsync<T>(req.Body, Json.Opciones, ct);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}

/// <summary>
/// Lee el usuario que Static Web Apps inyecta en el encabezado x-ms-client-principal.
/// Las reglas de staticwebapp.config.json ya bloquean /api/gestion/* a quien no tenga el rol,
/// esto es una segunda verificación dentro de la función.
/// </summary>
internal static class Socio
{
    public const string Rol = "socio";

    public static Usuario? Leer(HttpRequestData req)
    {
        if (!req.Headers.TryGetValues("x-ms-client-principal", out var valores)) return null;
        var base64 = valores.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(base64)) return null;
        try
        {
            var json = Encoding.UTF8.GetString(Convert.FromBase64String(base64));
            return JsonSerializer.Deserialize<Usuario>(json, Json.Opciones);
        }
        catch (Exception e) when (e is FormatException or JsonException)
        {
            return null;
        }
    }

    public static bool EsSocio(HttpRequestData req) =>
        Leer(req)?.UserRoles?.Contains(Rol, StringComparer.OrdinalIgnoreCase) == true;

    public sealed class Usuario
    {
        public string? IdentityProvider { get; set; }
        public string? UserId { get; set; }
        public string? UserDetails { get; set; }
        public List<string>? UserRoles { get; set; }
    }
}
