/**
 * API Config Store — CRUD + localStorage persistence
 *
 * Manages user-created API endpoint configurations (Banana, Veo, Sora, custom).
 * Each config has a key, base URL, model list, and default model.
 * API keys are base64-obfuscated in localStorage.
 *
 * Migrated to Zustand for global state sharing.
 */

import { create } from 'zustand';
import type { APIConfig, APIConfigState, ModelItem } from '../types/api-config';

const STORAGE_KEY = 'apiConfigs.v2';

function obfuscate(plain: string): string {
    try {
        return btoa(unescape(encodeURIComponent(plain)));
    } catch {
        return plain;
    }
}

function deobfuscate(encoded: string): string {
    try {
        return decodeURIComponent(escape(atob(encoded)));
    } catch {
        return encoded;
    }
}

function serialize(state: APIConfigState): string {
    const safe: APIConfigState = {
        ...state,
        configs: state.configs.map((c) => ({ ...c, apiKey: obfuscate(c.apiKey) })),
    };
    return JSON.stringify(safe);
}

function deserialize(raw: string): APIConfigState {
    const parsed = JSON.parse(raw) as APIConfigState;
    return {
        ...parsed,
        configs: (parsed.configs || []).map((c) => ({ ...c, apiKey: deobfuscate(c.apiKey) })),
    };
}

function loadState(): APIConfigState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { configs: [], activeConfigId: null, activeModelId: null };
        return deserialize(raw);
    } catch {
        return { configs: [], activeConfigId: null, activeModelId: null };
    }
}

function uuid(): string {
    return 'cfg_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

interface APIConfigActions {
    configs: APIConfig[];
    activeConfigId: string | null;
    activeModelId: string | null;
    activeConfig: APIConfig | null;
    activeModels: ModelItem[];

    addConfig: (draft: Omit<APIConfig, 'id' | 'createdAt' | 'updatedAt'>) => string;
    updateConfig: (id: string, patch: Partial<Omit<APIConfig, 'id' | 'createdAt'>>) => void;
    deleteConfig: (id: string) => void;
    setActiveConfig: (id: string) => void;
    setActiveModel: (modelId: string) => void;
}

const persist = (state: APIConfigState) => {
    localStorage.setItem(STORAGE_KEY, serialize(state));
};

export const useAPIConfigStore = create<APIConfigActions>((set, get) => {
    const initial = loadState();

    return {
        configs: initial.configs,
        activeConfigId: initial.activeConfigId,
        activeModelId: initial.activeModelId,
        activeConfig: initial.configs.find((c) => c.id === initial.activeConfigId) ?? null,
        activeModels: initial.configs.find((c) => c.id === initial.activeConfigId)?.models ?? [],

        addConfig: (draft) => {
            const now = Date.now();
            const newConfig: APIConfig = { ...draft, id: uuid(), createdAt: now, updatedAt: now };

            set((state) => {
                const configs = [...state.configs, newConfig];
                const isFirst = !state.activeConfigId;
                const activeConfigId = isFirst ? newConfig.id : state.activeConfigId;
                const activeModelId = isFirst
                    ? newConfig.defaultModel || newConfig.models[0]?.id || null
                    : state.activeModelId;
                const activeConfig = configs.find((c) => c.id === activeConfigId) ?? null;

                const next = {
                    configs,
                    activeConfigId,
                    activeModelId,
                    activeConfig,
                    activeModels: activeConfig?.models ?? [],
                };
                persist(next);
                return next;
            });

            return newConfig.id;
        },

        updateConfig: (id, patch) => {
            set((state) => {
                const configs = state.configs.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c));
                const activeConfig = configs.find((c) => c.id === state.activeConfigId) ?? null;
                const next = { ...state, configs, activeConfig, activeModels: activeConfig?.models ?? [] };
                persist(next);
                return next;
            });
        },

        deleteConfig: (id) => {
            set((state) => {
                const configs = state.configs.filter((c) => c.id !== id);
                const wasActive = state.activeConfigId === id;
                const activeConfigId = wasActive ? (configs[0]?.id ?? null) : state.activeConfigId;
                const activeModelId = wasActive
                    ? (configs[0]?.defaultModel ?? configs[0]?.models[0]?.id ?? null)
                    : state.activeModelId;
                const activeConfig = configs.find((c) => c.id === activeConfigId) ?? null;

                const next = {
                    configs,
                    activeConfigId,
                    activeModelId,
                    activeConfig,
                    activeModels: activeConfig?.models ?? [],
                };
                persist(next);
                return next;
            });
        },

        setActiveConfig: (id) => {
            set((state) => {
                const cfg = state.configs.find((c) => c.id === id);
                const next = {
                    ...state,
                    activeConfigId: id,
                    activeModelId: cfg?.defaultModel || cfg?.models[0]?.id || null,
                    activeConfig: cfg ?? null,
                    activeModels: cfg?.models ?? [],
                };
                persist(next);
                return next;
            });
        },

        setActiveModel: (modelId) => {
            set((state) => {
                const next = { ...state, activeModelId: modelId };
                persist(next);
                return next;
            });
        },
    };
});

export type APIConfigStore = ReturnType<typeof useAPIConfigStore.getState>;
