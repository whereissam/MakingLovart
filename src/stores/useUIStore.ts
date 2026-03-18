import { create } from 'zustand';
import type { ThemeMode, WheelAction } from '../types';

type ResolvedTheme = 'light' | 'dark';

const THEME_PALETTES = {
    light: {
        appBackground: '#f3f5f9',
        canvasBackground: '#f7f8fb',
        uiBgColor: 'rgba(255, 255, 255, 0.92)',
        buttonBgColor: '#111827',
    },
    dark: {
        appBackground: '#0c0f14',
        canvasBackground: '#11151c',
        uiBgColor: 'rgba(18, 21, 27, 0.94)',
        buttonBgColor: '#f3f4f6',
    },
} as const;

interface UIState {
    // Theme
    themeMode: ThemeMode;
    systemTheme: ResolvedTheme;
    resolvedTheme: ResolvedTheme;
    themePalette: typeof THEME_PALETTES.light;
    canvasBackgroundColor: string;

    // Language
    language: 'en' | 'zho';

    // Panel visibility
    isSettingsPanelOpen: boolean;
    isAssetPanelOpen: boolean;
    isLayerMinimized: boolean;
    isInspirationMinimized: boolean;

    // Canvas interaction
    wheelAction: WheelAction;

    // Loading / Error
    isLoading: boolean;
    isEnhancingPrompt: boolean;
    error: string | null;
    progressMessage: string;

    // Layout
    toolbarLeft: number;
    rightPanelWidth: number;

    // Actions
    setThemeMode: (mode: ThemeMode) => void;
    setSystemTheme: (theme: ResolvedTheme) => void;
    setLanguage: (lang: 'en' | 'zho') => void;
    setSettingsPanelOpen: (open: boolean) => void;
    setAssetPanelOpen: (open: boolean) => void;
    setLayerMinimized: (minimized: boolean) => void;
    setInspirationMinimized: (minimized: boolean) => void;
    setWheelAction: (action: WheelAction) => void;
    setIsLoading: (loading: boolean) => void;
    setIsEnhancingPrompt: (enhancing: boolean) => void;
    setError: (error: string | null) => void;
    setProgressMessage: (message: string) => void;
    setToolbarLeft: (left: number) => void;
    setRightPanelWidth: (width: number) => void;
}

const loadThemeMode = (): ThemeMode => {
    try {
        const saved = localStorage.getItem('themeMode.v1');
        return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
    } catch {
        return 'system';
    }
};

const getSystemTheme = (): ResolvedTheme => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const resolveTheme = (mode: ThemeMode, system: ResolvedTheme): ResolvedTheme =>
    mode === 'system' ? system : mode;

export const useUIStore = create<UIState>((set, get) => {
    const initialThemeMode = loadThemeMode();
    const initialSystemTheme = getSystemTheme();
    const initialResolved = resolveTheme(initialThemeMode, initialSystemTheme);

    return {
        // Theme
        themeMode: initialThemeMode,
        systemTheme: initialSystemTheme,
        resolvedTheme: initialResolved,
        themePalette: THEME_PALETTES[initialResolved],
        canvasBackgroundColor: THEME_PALETTES[initialResolved].canvasBackground,

        // Language
        language: 'en',

        // Panel visibility
        isSettingsPanelOpen: false,
        isAssetPanelOpen: false,
        isLayerMinimized: localStorage.getItem('layerPanelMinimized') === 'true',
        isInspirationMinimized: localStorage.getItem('inspirationPanelMinimized') === 'true',

        // Canvas interaction
        wheelAction: 'zoom',

        // Loading / Error
        isLoading: false,
        isEnhancingPrompt: false,
        error: null,
        progressMessage: '',

        // Layout
        toolbarLeft: 68,
        rightPanelWidth: 2,

        // Actions
        setThemeMode: (mode) => {
            localStorage.setItem('themeMode.v1', mode);
            const resolved = resolveTheme(mode, get().systemTheme);
            set({
                themeMode: mode,
                resolvedTheme: resolved,
                themePalette: THEME_PALETTES[resolved],
                canvasBackgroundColor: THEME_PALETTES[resolved].canvasBackground,
            });
        },

        setSystemTheme: (theme) => {
            const resolved = resolveTheme(get().themeMode, theme);
            set({
                systemTheme: theme,
                resolvedTheme: resolved,
                themePalette: THEME_PALETTES[resolved],
                canvasBackgroundColor: THEME_PALETTES[resolved].canvasBackground,
            });
        },

        setLanguage: (lang) => set({ language: lang }),

        setSettingsPanelOpen: (open) => set({ isSettingsPanelOpen: open }),

        setAssetPanelOpen: (open) => set({ isAssetPanelOpen: open }),

        setLayerMinimized: (minimized) => {
            localStorage.setItem('layerPanelMinimized', minimized.toString());
            set({ isLayerMinimized: minimized });
        },

        setInspirationMinimized: (minimized) => {
            localStorage.setItem('inspirationPanelMinimized', minimized.toString());
            set({ isInspirationMinimized: minimized });
        },

        setWheelAction: (action) => set({ wheelAction: action }),
        setIsLoading: (loading) => set({ isLoading: loading }),
        setIsEnhancingPrompt: (enhancing) => set({ isEnhancingPrompt: enhancing }),
        setError: (error) => set({ error }),
        setProgressMessage: (message) => set({ progressMessage: message }),
        setToolbarLeft: (left) => set({ toolbarLeft: left }),
        setRightPanelWidth: (width) => set({ rightPanelWidth: width }),
    };
});
