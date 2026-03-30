import typography from '@tailwindcss/typography';
declare const _default: {
    content: string[];
    plugins: (import("tailwindcss/types/config.js").PluginCreator | {
        handler: import("tailwindcss/types/config.js").PluginCreator;
        config?: Partial<import("tailwindcss/types/config.js").Config> | undefined;
    } | typeof typography | undefined)[];
    important?: Partial<import("tailwindcss/types/config.js").ImportantConfig> | undefined;
    prefix?: string | undefined;
    separator?: string | undefined;
    safelist?: import("tailwindcss/types/config.js").SafelistConfig[] | undefined;
    blocklist?: string[] | undefined;
    presets?: Partial<import("tailwindcss/types/config.js").Config>[] | undefined;
    future?: Partial<import("tailwindcss/types/config.js").FutureConfig> | undefined;
    experimental?: Partial<import("tailwindcss/types/config.js").ExperimentalConfig> | undefined;
    darkMode?: Partial<import("tailwindcss/types/config.js").DarkModeConfig> | undefined;
    theme?: Partial<import("tailwindcss/types/config.js").CustomThemeConfig & {
        extend: Partial<import("tailwindcss/types/config.js").CustomThemeConfig>;
    }> | undefined;
    corePlugins?: Partial<import("tailwindcss/types/config.js").CorePluginsConfig> | undefined;
};
export default _default;
