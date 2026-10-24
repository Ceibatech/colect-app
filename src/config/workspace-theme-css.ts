import { WORKSPACE_PALETTES } from "@/config/workspace-theme";

/** Root inheritance also covers mobile sheets, dialogs and other body portals.
 * :has scopes the rules to the authenticated shell and removes them on logout.
 * Values and selectors come exclusively from the static palette registry.
 */
export const WORKSPACE_THEME_CSS = Object.values(WORKSPACE_PALETTES).map((palette) => {
  return (["light", "dark"] as const).map((mode) => {
    const root = mode === "dark" ? ":root.dark" : ":root";
    const tone = palette[mode];
    return `
${root}:has([data-workspace-role="${palette.key}"]) {
  --sidebar: ${tone.sidebar};
  --sidebar-foreground: ${tone.sidebarForeground};
  --sidebar-accent: ${tone.sidebarAccent};
  --sidebar-accent-foreground: ${tone.sidebarAccentForeground};
  --sidebar-border: color-mix(in srgb, ${tone.sidebarForeground} 20%, transparent);
  --workspace-role-ink: ${tone.primary};
  --workspace-role-mark: ${palette.dark.primary};
}
${root}:has([data-workspace-theme="${palette.key}"]) {
  --background: ${tone.surface};
  --primary: ${tone.primary};
  --workspace-page-accent: ${tone.primary};
  --primary-foreground: ${tone.primaryForeground};
  --ring: ${tone.primary};
  --accent: color-mix(in srgb, ${tone.primary} 12%, var(--card));
  --accent-foreground: var(--foreground);
  --sidebar-primary: ${palette.dark.primary};
  --sidebar-primary-foreground: ${palette.dark.primaryForeground};
  --sidebar-ring: ${palette.dark.primary};
}`;
  }).join("\n");
}).join("\n") + `
body:has([data-workspace-theme]) {
  background-image: linear-gradient(150deg, color-mix(in srgb, var(--primary) 10%, transparent), transparent 38rem);
}
.workspace-role-badge {
  color: var(--workspace-role-ink);
  background: color-mix(in srgb, var(--workspace-role-ink) 10%, var(--card));
  border-color: color-mix(in srgb, var(--workspace-role-ink) 28%, transparent);
}
`;
