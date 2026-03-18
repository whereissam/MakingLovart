import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../src/stores/useUIStore';

describe('useUIStore', () => {
    beforeEach(() => {
        localStorage.clear();
        // Reset store to initial state
        useUIStore.setState({
            themeMode: 'system',
            language: 'en',
            isSettingsPanelOpen: false,
            isAssetPanelOpen: false,
            isLayerMinimized: false,
            isInspirationMinimized: false,
            isLoading: false,
            error: null,
            progressMessage: '',
        });
    });

    it('should initialize with default values', () => {
        const state = useUIStore.getState();
        expect(state.language).toBe('en');
        expect(state.isLoading).toBe(false);
        expect(state.error).toBeNull();
        expect(state.isSettingsPanelOpen).toBe(false);
    });

    it('should set language', () => {
        useUIStore.getState().setLanguage('zho');
        expect(useUIStore.getState().language).toBe('zho');
    });

    it('should set theme mode and persist to localStorage', () => {
        useUIStore.getState().setThemeMode('dark');
        expect(useUIStore.getState().themeMode).toBe('dark');
        expect(useUIStore.getState().resolvedTheme).toBe('dark');
        expect(localStorage.getItem('themeMode.v1')).toBe('dark');
    });

    it('should resolve system theme correctly', () => {
        useUIStore.getState().setThemeMode('system');
        useUIStore.getState().setSystemTheme('dark');
        expect(useUIStore.getState().resolvedTheme).toBe('dark');

        useUIStore.getState().setSystemTheme('light');
        expect(useUIStore.getState().resolvedTheme).toBe('light');
    });

    it('should set loading state', () => {
        useUIStore.getState().setIsLoading(true);
        expect(useUIStore.getState().isLoading).toBe(true);
    });

    it('should set error', () => {
        useUIStore.getState().setError('Something broke');
        expect(useUIStore.getState().error).toBe('Something broke');

        useUIStore.getState().setError(null);
        expect(useUIStore.getState().error).toBeNull();
    });

    it('should toggle panel states and persist', () => {
        useUIStore.getState().setLayerMinimized(true);
        expect(useUIStore.getState().isLayerMinimized).toBe(true);
        expect(localStorage.getItem('layerPanelMinimized')).toBe('true');

        useUIStore.getState().setInspirationMinimized(true);
        expect(useUIStore.getState().isInspirationMinimized).toBe(true);
        expect(localStorage.getItem('inspirationPanelMinimized')).toBe('true');
    });

    it('should update theme palette when theme changes', () => {
        useUIStore.getState().setThemeMode('dark');
        const palette = useUIStore.getState().themePalette;
        expect(palette.appBackground).toBe('#0c0f14');

        useUIStore.getState().setThemeMode('light');
        const lightPalette = useUIStore.getState().themePalette;
        expect(lightPalette.appBackground).toBe('#f3f5f9');
    });
});
