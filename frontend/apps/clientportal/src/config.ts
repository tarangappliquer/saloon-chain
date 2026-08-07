class AppConfig {
  get apiBaseUrl(): string {
    return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5127';
  }

  get enableThemeToggle(): boolean {
    return import.meta.env.VITE_ENABLE_THEME_TOGGLE === 'true';
  }
}

export const appConfig = new AppConfig();
