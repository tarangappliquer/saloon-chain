namespace SaloonApi.Shared.Email;

internal interface IRazorTemplateEngine
{
    Task<string> RenderAsync<TModel>(string templateName, TModel model, CancellationToken ct = default);
}
