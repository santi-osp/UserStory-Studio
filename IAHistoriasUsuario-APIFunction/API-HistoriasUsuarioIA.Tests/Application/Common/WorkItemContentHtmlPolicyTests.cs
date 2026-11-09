using API_HistoriasUsuarioIA_funcion.Application.Common;

namespace API_HistoriasUsuarioIA_funcion.Tests.Application.Common;

public sealed class WorkItemContentHtmlPolicyTests
{
    [Theory]
    [InlineData("")]
    [InlineData("Texto plano")]
    [InlineData("<p>Texto <strong>importante</strong><br>Otro</p>")]
    [InlineData("<ul><li>Uno</li><li><em>Dos</em></li></ul>")]
    [InlineData("<ol><li>Primero</li><li><strong>Segundo</strong></li></ol>")]
    [InlineData("<p>Texto con Unicode: á, ñ, ✓ y 😀</p><p><br/></p>")]
    [InlineData("<p>Uno &amp; dos &#160; tres</p>")]
    public void IsSafe_AcceptsCanonicalContent(string value)
    {
        Assert.True(WorkItemContentHtmlPolicy.IsSafe(value));
    }

    [Theory]
    [InlineData("<script>alert(1)</script>")]
    [InlineData("<img src=x onerror=alert(1)>")]
    [InlineData("<a href=\"javascript:alert(1)\">x</a>")]
    [InlineData("<svg><script>alert(1)</script></svg>")]
    [InlineData("<math><mtext>x</mtext></math>")]
    [InlineData("<p style=\"background:url(javascript:x)\">x</p>")]
    [InlineData("<p><strong>sin cierre</p>")]
    [InlineData("<!-- comentario --><p>x</p>")]
    [InlineData("<!DOCTYPE x [<!ENTITY y SYSTEM 'file:///etc/passwd'>]><p>&y;</p>")]
    public void IsSafe_RejectsHostileOrMalformedContent(string value)
    {
        Assert.False(WorkItemContentHtmlPolicy.IsSafe(value));
    }
}
