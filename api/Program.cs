using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Promos.Api.Servicios;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices(servicios =>
    {
        servicios.AddSingleton<PromoStore>();
    })
    .Build();

host.Run();
