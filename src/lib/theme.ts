/** Apparence du site : claire par défaut, sombre si le visiteur l'a choisie. Le choix est gardé dans un cookie. */
export const THEME_COOKIE = "tf_theme";
export type Theme = "light" | "dark";
export const THEME_COLORS: Record<Theme, string> = { light: "#F5F4F0", dark: "#121715" };
export const pickTheme = (value: string | undefined): Theme => (value === "dark" ? "dark" : "light");
