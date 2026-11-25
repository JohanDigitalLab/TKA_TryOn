export const THEME_STORAGE_KEY = "tryon-theme";

export function resolveTheme(preference, systemDark = false) {
  return preference === "light" || preference === "dark"
    ? preference
    : systemDark ? "dark" : "light";
}

// Runs in the document head before any application surface is painted.
// Storage can be unavailable (privacy settings); system preference still works.
export const themeInitScript = `(() => {
  let preference;
  try { preference = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); } catch {}
  const theme = (${resolveTheme.toString()})(preference, matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();`;
