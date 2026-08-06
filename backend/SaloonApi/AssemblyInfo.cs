using System.Runtime.CompilerServices;

// Most types here are internal (CA1515 -- this is an app, not a library); the test project
// needs access to exercise them directly (e.g. SlotCalculator) rather than only through HTTP.
[assembly: InternalsVisibleTo("SaloonApi.Tests")]
[assembly: InternalsVisibleTo("DynamicProxyGenAssembly2")]
