using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using RazorEngineCore;

namespace SaloonApi.Shared.Email;

internal sealed class RazorTemplateEngine(IWebHostEnvironment env, ILogger<RazorTemplateEngine> logger) : IRazorTemplateEngine
{
    private readonly ConcurrentDictionary<string, IRazorEngineCompiledTemplate> _cache = new(StringComparer.OrdinalIgnoreCase);
    private readonly RazorEngine _razorEngine = new();

    [SuppressMessage("Design", "CA1031:Do not catch general exception types", Justification = "Template loading or compilation errors are logged and bubbled up appropriately.")]
    public async Task<string> RenderAsync<TModel>(string templateName, TModel model, CancellationToken ct = default)
    {
        var compiledTemplate = await GetOrCompileTemplateAsync(templateName, ct).ConfigureAwait(false);
        return await compiledTemplate.RunAsync(model).ConfigureAwait(false);
    }

    [SuppressMessage("Reliability", "CA2016:Forward the 'CancellationToken' parameter to methods that take one", Justification = "RazorEngineCore CompileAsync does not accept CancellationToken.")]
    [SuppressMessage("SonarAnalyzer.CSharp", "S8949", Justification = "RazorEngineCore CompileAsync does not accept CancellationToken.")]
    private async Task<IRazorEngineCompiledTemplate> GetOrCompileTemplateAsync(string templateName, CancellationToken ct)
    {
        if (_cache.TryGetValue(templateName, out var cached))
        {
            return cached;
        }

        var templatePath = Path.Combine(env.ContentRootPath, "EmailTemplates", $"{templateName}.cshtml");
        if (!File.Exists(templatePath))
        {
            // Fallback for execution from binary output directory
            templatePath = Path.Combine(AppContext.BaseDirectory, "EmailTemplates", $"{templateName}.cshtml");
        }

        if (!File.Exists(templatePath))
        {
            logger.LogError("Email template file not found at path: {TemplatePath}", templatePath);
            throw new FileNotFoundException($"Razor template '{templateName}.cshtml' was not found.", templatePath);
        }

        var templateContent = await File.ReadAllTextAsync(templatePath, ct).ConfigureAwait(false);
        var compiled = await _razorEngine.CompileAsync(templateContent).ConfigureAwait(false);

        _cache[templateName] = compiled;
        return compiled;
    }
}
