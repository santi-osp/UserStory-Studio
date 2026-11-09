using System.Reflection;
using Microsoft.Azure.Functions.Worker;

namespace API_HistoriasUsuarioIA_funcion.Tests.Function.Configuration;

public class HttpTriggerAuthorizationTests
{
    [Fact]
    public void EveryHttpTriggerIsAnonymous()
    {
        var triggers = typeof(GenerateWorkItemFunction).Assembly
            .GetTypes()
            .SelectMany(type => type.GetMethods(BindingFlags.Instance | BindingFlags.Public))
            .SelectMany(method => method.GetParameters())
            .Select(parameter => parameter.GetCustomAttribute<HttpTriggerAttribute>())
            .Where(attribute => attribute is not null)
            .Cast<HttpTriggerAttribute>()
            .ToArray();

        Assert.Equal(12, triggers.Length);
        Assert.All(triggers, trigger => Assert.Equal(AuthorizationLevel.Anonymous, trigger.AuthLevel));
    }
}
