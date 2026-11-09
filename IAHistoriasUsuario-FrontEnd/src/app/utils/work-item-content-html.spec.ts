import {
  isWorkItemContentHtmlEmpty,
  normalizeWorkItemContentHtml,
  workItemContentHtmlToText,
} from './work-item-content-html';

describe('work-item-content-html', () => {
  it('keeps the semantic HTML allowed by the Azure DevOps contract', () => {
    expect(
      normalizeWorkItemContentHtml(
        '<p>Texto <strong>importante</strong> y <em>claro</em>.</p>',
      ),
    ).toBe('<p>Texto <strong>importante</strong> y <em>claro</em>.</p>');
  });

  it('decodes escaped allowed HTML without showing its tags as text', () => {
    expect(
      normalizeWorkItemContentHtml(
        '&lt;p&gt;Como usuario necesito...&lt;/p&gt;',
      ),
    ).toBe('<p>Como usuario necesito...</p>');
  });

  it('does not decode escaped unknown HTML into executable markup', () => {
    const result = normalizeWorkItemContentHtml(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );

    expect(result).toContain('&amp;lt;script&amp;gt;');
    expect(result).not.toContain('<script>');
  });

  it('normalizes equivalent bold and italic elements', () => {
    expect(
      normalizeWorkItemContentHtml('<p><b>Negrita</b> e <i>itálica</i></p>'),
    ).toBe('<p><strong>Negrita</strong> e <em>itálica</em></p>');
  });

  it('removes links and URLs from attributes while preserving visible text', () => {
    expect(
      normalizeWorkItemContentHtml(
        '<p>Consulta <a href="https://example.com">la documentación</a>.</p>',
      ),
    ).toBe('<p>Consulta la documentación.</p>');
  });

  it('removes images, styles, classes, ids and event attributes', () => {
    expect(
      normalizeWorkItemContentHtml(
        '<p class="x" id="y" style="color:red" onclick="alert(1)">Texto<img src="x"></p>',
      ),
    ).toBe('<p>Texto</p>');
  });

  it('removes scriptable protocols, SVG, MathML and mutation-XSS payloads', () => {
    const payloads = [
      '<a href="javascript:alert(1)">javascript</a>',
      '<a href="data:text/html,<script>alert(1)</script>">data</a>',
      '<svg><a href="javascript:alert(1)"><text>svg</text></a></svg>',
      '<math><mtext><img src=x onerror=alert(1)></mtext></math>',
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>">mxss</p>',
    ];

    payloads.forEach((payload) => {
      const result = normalizeWorkItemContentHtml(payload);
      expect(result).not.toMatch(/<script|<svg|<math|<img|<a\b/i);
      expect(result).not.toMatch(/javascript:|data:|onerror/i);
    });
  });

  it('removes dangerous style and malformed event-handler markup', () => {
    const result = normalizeWorkItemContentHtml(
      '<p style="background:url(javascript:alert(1))" onerror="alert(1)">Seguro<<img src=x onerror=alert(1)></p>',
    );

    expect(result).not.toMatch(/style=|javascript:|onerror|<img/i);
    expect(result).toContain('Seguro');
  });

  it('preserves bullet and numbered lists', () => {
    expect(
      normalizeWorkItemContentHtml(
        '<ul><li>Uno</li></ul><ol><li>Dos</li></ol>',
      ),
    ).toBe('<ul><li>Uno</li></ul><ol><li>Dos</li></ol>');
  });

  it('keeps a plain URL as text rather than creating a link', () => {
    const result = normalizeWorkItemContentHtml('https://example.com/docs');

    expect(result).toBe('<p>https://example.com/docs</p>');
    expect(result).not.toContain('<a');
  });

  it('normalizes visually empty editor structures to an empty string', () => {
    ['', ' ', '<p><br></p>', '<p>&nbsp;</p>', '<ul><li><br></li></ul>'].forEach(
      (value) => {
        expect(normalizeWorkItemContentHtml(value)).withContext(value).toBe('');
        expect(isWorkItemContentHtmlEmpty(value)).withContext(value).toBeTrue();
      },
    );
  });

  it('converts allowed HTML to its visible text for semantic validation', () => {
    expect(
      workItemContentHtmlToText('<p>Primero</p><ul><li>Segundo</li></ul>'),
    ).toBe('PrimeroSegundo');
  });
});
