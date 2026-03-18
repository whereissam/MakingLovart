import { create } from 'zustand';
import { useUIStore } from './useUIStore';
import type {
    UserApiKey,
    ModelPreference,
    AIProvider,
    AICapability,
    UserEffect,
    CharacterLockProfile,
    ChatAttachment,
    ImageElement,
    PromptEnhanceMode,
} from '../types';
import { fileToDataUrl } from '../utils/fileUtils';
import { enhancePromptWithProvider, inferProviderFromModel } from '../services/aiGateway';
import { setGeminiRuntimeConfig } from '../services/geminiService';
import { setBananaRuntimeConfig } from '../services/bananaService';
import { generateId } from '../utils/id';

const DEFAULT_MODEL_PREFS: ModelPreference = {
    textModel: 'gemini-2.5-pro',
    imageModel: 'gemini-2.5-flash-image-preview',
    videoModel: 'veo-2.0-generate-001',
    agentModel: 'banana-vision-v1',
};

const PROVIDER_MODELS: Record<string, { text: string[]; image: string[]; video: string[] }> = {
    google: {
        text: ['gemini-2.5-pro', 'gemini-2.5-flash'],
        image: ['gemini-2.5-flash-image-preview', 'imagen-4.0-generate-001'],
        video: ['veo-2.0-generate-001'],
    },
    openai: { text: ['gpt-4o-mini'], image: ['dall-e-3'], video: [] },
    anthropic: { text: ['claude-3-5-sonnet'], image: [], video: [] },
    qwen: { text: ['qwen-max'], image: [], video: [] },
    stability: { text: [], image: ['sdxl'], video: [] },
    banana: { text: [], image: [], video: [] },
};

const FALLBACK_TEXT_OPTIONS = ['gemini-2.5-pro'];
const FALLBACK_IMAGE_OPTIONS = ['gemini-2.5-flash-image-preview'];
const FALLBACK_VIDEO_OPTIONS = ['veo-2.0-generate-001'];

export const inferCapabilitiesByProvider = (provider: AIProvider): AICapability[] => {
    switch (provider) {
        case 'google':
            return ['text', 'image', 'video'];
        case 'openai':
            return ['text', 'image'];
        case 'anthropic':
        case 'qwen':
            return ['text'];
        case 'stability':
            return ['image'];
        case 'banana':
            return ['agent'];
        case 'custom':
            return ['text', 'image', 'video'];
        default:
            return ['text'];
    }
};

const hasCapabilityOverlap = (left: AICapability[], right: AICapability[]) =>
    left.some((capability) => right.includes(capability));

const normalizeApiKeyEntry = (item: Partial<UserApiKey>): UserApiKey | null => {
    if (!item || !item.id || !item.provider || !item.key) return null;
    return {
        id: item.id,
        provider: item.provider,
        capabilities:
            Array.isArray(item.capabilities) && item.capabilities.length > 0
                ? item.capabilities
                : inferCapabilitiesByProvider(item.provider),
        key: item.key,
        baseUrl: item.baseUrl,
        name: item.name,
        isDefault: item.isDefault,
        status: item.status,
        createdAt: item.createdAt || Date.now(),
        updatedAt: item.updatedAt || Date.now(),
    };
};

const loadApiKeys = (): UserApiKey[] => {
    try {
        const raw = localStorage.getItem('userApiKeys.v1');
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed)
            ? parsed.map(normalizeApiKeyEntry).filter((item): item is UserApiKey => !!item)
            : [];
    } catch {
        return [];
    }
};

const loadModelPreference = (): ModelPreference => {
    try {
        const raw = localStorage.getItem('modelPreference.v1');
        return raw ? { ...DEFAULT_MODEL_PREFS, ...JSON.parse(raw) } : DEFAULT_MODEL_PREFS;
    } catch {
        return DEFAULT_MODEL_PREFS;
    }
};

const loadUserEffects = (): UserEffect[] => {
    try {
        const saved = localStorage.getItem('userEffects');
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
};

const loadCharacterLocks = (): CharacterLockProfile[] => {
    try {
        const raw = localStorage.getItem('characterLocks.v1');
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
};

const loadAutoEnhance = (): boolean => {
    try {
        return localStorage.getItem('autoEnhance.v1') === 'true';
    } catch {
        return false;
    }
};

interface AIState {
    // API Keys
    userApiKeys: UserApiKey[];
    modelPreference: ModelPreference;

    // Dynamic model options (computed from userApiKeys)
    dynamicModelOptions: { text: string[]; image: string[]; video: string[] };

    // Generation settings
    generationMode: 'image' | 'video' | 'keyframe';
    videoAspectRatio: '16:9' | '9:16';
    isAutoEnhanceEnabled: boolean;

    // Effects
    userEffects: UserEffect[];

    // Character lock
    characterLocks: CharacterLockProfile[];
    activeCharacterLockId: string | null;

    // Prompt
    prompt: string;
    promptAttachments: ChatAttachment[];
    chatAttachments: ChatAttachment[];
    mentionedElementIds: string[];

    // Actions - API Keys
    addApiKey: (payload: Omit<UserApiKey, 'id' | 'createdAt' | 'updatedAt'>) => void;
    deleteApiKey: (id: string) => void;
    setDefaultApiKey: (id: string) => void;
    getPreferredApiKey: (capability: AICapability, provider?: AIProvider) => UserApiKey | undefined;

    // Actions - Model Preference
    setModelPreference: (updater: ModelPreference | ((prev: ModelPreference) => ModelPreference)) => void;
    setTextModel: (model: string) => void;
    setImageModel: (model: string) => void;
    setVideoModel: (model: string) => void;

    // Actions - Generation
    setGenerationMode: (mode: 'image' | 'video' | 'keyframe') => void;
    setVideoAspectRatio: (ratio: '16:9' | '9:16') => void;
    setAutoEnhanceEnabled: (enabled: boolean) => void;

    // Actions - Effects
    addUserEffect: (effect: UserEffect) => void;
    deleteUserEffect: (id: string) => void;

    // Actions - Character lock
    lockCharacterFromImage: (image: ImageElement, name?: string) => void;
    setActiveCharacterLock: (id: string | null) => void;

    // Actions - Prompt
    setPrompt: (prompt: string) => void;
    setMentionedElementIds: (ids: string[]) => void;
    addPromptAttachment: (payload: Omit<ChatAttachment, 'id'>) => void;
    removePromptAttachment: (id: string) => void;
    addPromptAttachmentFiles: (files: FileList | File[]) => Promise<void>;
    addChatAttachment: (payload: Omit<ChatAttachment, 'id'>) => void;
    removeChatAttachment: (id: string) => void;
    addChatAttachmentFiles: (files: FileList | File[]) => Promise<void>;
    addAttachmentFromCanvas: (payload: { id: string; name?: string; href: string; mimeType: string }) => void;

    // Actions - Enhance prompt
    enhancePrompt: (payload: { prompt: string; mode: PromptEnhanceMode; stylePreset?: string }) => Promise<any>;

    // Actions - Sync runtime configs
    syncRuntimeConfigs: () => void;
}

const computeDynamicModelOptions = (userApiKeys: UserApiKey[]) => {
    const textSet = new Set<string>();
    const imageSet = new Set<string>();
    const videoSet = new Set<string>();
    for (const key of userApiKeys) {
        const providerModels = PROVIDER_MODELS[key.provider];
        if (!providerModels) continue;
        const caps = key.capabilities?.length ? key.capabilities : inferCapabilitiesByProvider(key.provider);
        if (caps.includes('text')) providerModels.text.forEach((m) => textSet.add(m));
        if (caps.includes('image')) providerModels.image.forEach((m) => imageSet.add(m));
        if (caps.includes('video')) providerModels.video.forEach((m) => videoSet.add(m));
    }
    return {
        text: textSet.size > 0 ? Array.from(textSet) : FALLBACK_TEXT_OPTIONS,
        image: imageSet.size > 0 ? Array.from(imageSet) : FALLBACK_IMAGE_OPTIONS,
        video: videoSet.size > 0 ? Array.from(videoSet) : FALLBACK_VIDEO_OPTIONS,
    };
};

export const useAIStore = create<AIState>((set, get) => {
    const initialApiKeys = loadApiKeys();

    return {
        // State
        userApiKeys: initialApiKeys,
        modelPreference: loadModelPreference(),
        dynamicModelOptions: computeDynamicModelOptions(initialApiKeys),
        generationMode: 'image',
        videoAspectRatio: '16:9',
        isAutoEnhanceEnabled: loadAutoEnhance(),
        userEffects: loadUserEffects(),
        characterLocks: loadCharacterLocks(),
        activeCharacterLockId: localStorage.getItem('characterLocks.activeId') || null,
        prompt: '',
        promptAttachments: [],
        chatAttachments: [],
        mentionedElementIds: [],

        // API Keys
        addApiKey: (payload) => {
            const now = Date.now();
            const capabilities = payload.capabilities?.length
                ? payload.capabilities
                : inferCapabilitiesByProvider(payload.provider);
            const nextKey: UserApiKey = { ...payload, capabilities, id: generateId(), createdAt: now, updatedAt: now };

            set((state) => {
                const isFirstOfCapabilities = !state.userApiKeys.some((k) =>
                    hasCapabilityOverlap(
                        k.capabilities?.length ? k.capabilities : inferCapabilitiesByProvider(k.provider),
                        capabilities,
                    ),
                );
                const shouldSetDefault = payload.isDefault || isFirstOfCapabilities;
                const withDefault = shouldSetDefault
                    ? state.userApiKeys.map((k) => {
                          const existingCaps = k.capabilities?.length
                              ? k.capabilities
                              : inferCapabilitiesByProvider(k.provider);
                          return hasCapabilityOverlap(existingCaps, capabilities) ? { ...k, isDefault: false } : k;
                      })
                    : state.userApiKeys;

                const newKeys = [{ ...nextKey, isDefault: shouldSetDefault }, ...withDefault];
                localStorage.setItem('userApiKeys.v1', JSON.stringify(newKeys));
                return {
                    userApiKeys: newKeys,
                    dynamicModelOptions: computeDynamicModelOptions(newKeys),
                };
            });
            get().syncRuntimeConfigs();
        },

        deleteApiKey: (id) => {
            set((state) => {
                const newKeys = state.userApiKeys.filter((k) => k.id !== id);
                localStorage.setItem('userApiKeys.v1', JSON.stringify(newKeys));
                return {
                    userApiKeys: newKeys,
                    dynamicModelOptions: computeDynamicModelOptions(newKeys),
                };
            });
            get().syncRuntimeConfigs();
        },

        setDefaultApiKey: (id) => {
            set((state) => {
                const target = state.userApiKeys.find((k) => k.id === id);
                if (!target) return state;
                const targetCaps = target.capabilities?.length
                    ? target.capabilities
                    : inferCapabilitiesByProvider(target.provider);
                const newKeys = state.userApiKeys.map((k) => {
                    const existingCaps = k.capabilities?.length
                        ? k.capabilities
                        : inferCapabilitiesByProvider(k.provider);
                    return hasCapabilityOverlap(existingCaps, targetCaps) ? { ...k, isDefault: k.id === id } : k;
                });
                localStorage.setItem('userApiKeys.v1', JSON.stringify(newKeys));
                return { userApiKeys: newKeys };
            });
            get().syncRuntimeConfigs();
        },

        getPreferredApiKey: (capability, provider?) => {
            const { userApiKeys } = get();
            const matches = userApiKeys.filter((key) => {
                const capabilities = key.capabilities?.length
                    ? key.capabilities
                    : inferCapabilitiesByProvider(key.provider);
                return capabilities.includes(capability) && (!provider || key.provider === provider);
            });
            return matches.find((key) => key.isDefault) || matches[0];
        },

        // Model Preference
        setModelPreference: (updater) => {
            set((state) => {
                const next = typeof updater === 'function' ? updater(state.modelPreference) : updater;
                localStorage.setItem('modelPreference.v1', JSON.stringify(next));
                return { modelPreference: next };
            });
            get().syncRuntimeConfigs();
        },

        setTextModel: (model) => get().setModelPreference((prev) => ({ ...prev, textModel: model })),
        setImageModel: (model) => get().setModelPreference((prev) => ({ ...prev, imageModel: model })),
        setVideoModel: (model) => get().setModelPreference((prev) => ({ ...prev, videoModel: model })),

        // Generation
        setGenerationMode: (mode) => set({ generationMode: mode }),
        setVideoAspectRatio: (ratio) => set({ videoAspectRatio: ratio }),
        setAutoEnhanceEnabled: (enabled) => {
            localStorage.setItem('autoEnhance.v1', enabled.toString());
            set({ isAutoEnhanceEnabled: enabled });
        },

        // Effects
        addUserEffect: (effect) => {
            set((state) => {
                const next = [...state.userEffects, effect];
                localStorage.setItem('userEffects', JSON.stringify(next));
                return { userEffects: next };
            });
        },
        deleteUserEffect: (id) => {
            set((state) => {
                const next = state.userEffects.filter((e) => e.id !== id);
                localStorage.setItem('userEffects', JSON.stringify(next));
                return { userEffects: next };
            });
        },

        // Character Lock
        lockCharacterFromImage: (image, name?) => {
            const { characterLocks } = get();
            const lockName = name?.trim() || image.name || `Character ${characterLocks.length + 1}`;
            const descriptor = [
                `Character lock: ${lockName}.`,
                'Keep face, hairstyle, costume, body shape, and age consistent across all shots.',
                'Do not alter identity unless explicitly requested.',
            ].join(' ');

            const next: CharacterLockProfile = {
                id: generateId(),
                name: lockName,
                anchorElementId: image.id,
                referenceImage: image.href,
                descriptor,
                createdAt: Date.now(),
                isActive: true,
            };

            const newLocks = [...characterLocks.map((lock) => ({ ...lock, isActive: false })), next];
            localStorage.setItem('characterLocks.v1', JSON.stringify(newLocks));
            localStorage.setItem('characterLocks.activeId', next.id);
            set({ characterLocks: newLocks, activeCharacterLockId: next.id });
        },

        setActiveCharacterLock: (id) => {
            set((state) => {
                const newLocks = state.characterLocks.map((lock) => ({
                    ...lock,
                    isActive: id ? lock.id === id : false,
                }));
                localStorage.setItem('characterLocks.v1', JSON.stringify(newLocks));
                if (id) {
                    localStorage.setItem('characterLocks.activeId', id);
                } else {
                    localStorage.removeItem('characterLocks.activeId');
                }
                return { characterLocks: newLocks, activeCharacterLockId: id };
            });
        },

        // Prompt
        setPrompt: (prompt) => set({ prompt }),
        setMentionedElementIds: (ids) => set({ mentionedElementIds: ids }),

        addPromptAttachment: (payload) => {
            set((state) => {
                if (state.promptAttachments.some((item) => item.href === payload.href)) return state;
                return { promptAttachments: [...state.promptAttachments, { ...payload, id: generateId() }] };
            });
        },
        removePromptAttachment: (id) => {
            set((state) => ({ promptAttachments: state.promptAttachments.filter((item) => item.id !== id) }));
        },
        addPromptAttachmentFiles: async (files) => {
            const list = Array.from(files).filter((file) => file.type.startsWith('image/'));
            if (list.length === 0) return;
            try {
                const dataList = await Promise.all(list.map(fileToDataUrl));
                dataList.forEach((item, index) => {
                    get().addPromptAttachment({
                        name: list[index].name || `Upload ${index + 1}`,
                        href: item.dataUrl,
                        mimeType: item.mimeType,
                        source: 'upload',
                    });
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Attachment upload failed.';
                useUIStore.getState().setError(message);
            }
        },

        addChatAttachment: (payload) => {
            set((state) => {
                if (state.chatAttachments.some((item) => item.href === payload.href)) return state;
                return { chatAttachments: [...state.chatAttachments, { ...payload, id: generateId() }] };
            });
        },
        removeChatAttachment: (id) => {
            set((state) => ({ chatAttachments: state.chatAttachments.filter((item) => item.id !== id) }));
        },
        addChatAttachmentFiles: async (files) => {
            const list = Array.from(files).filter((file) => file.type.startsWith('image/'));
            if (list.length === 0) return;
            try {
                const dataList = await Promise.all(list.map(fileToDataUrl));
                dataList.forEach((item, index) => {
                    get().addChatAttachment({
                        name: list[index].name || `Upload ${index + 1}`,
                        href: item.dataUrl,
                        mimeType: item.mimeType,
                        source: 'upload',
                    });
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Attachment upload failed.';
                useUIStore.getState().setError(message);
            }
        },

        addAttachmentFromCanvas: (payload) => {
            get().addChatAttachment({
                name: payload.name || `Canvas ${payload.id.slice(-4)}`,
                href: payload.href,
                mimeType: payload.mimeType,
                source: 'canvas',
            });
        },

        // Enhance prompt
        enhancePrompt: async (payload) => {
            useUIStore.getState().setIsEnhancingPrompt(true);
            try {
                const { modelPreference, getPreferredApiKey } = get();
                const provider = inferProviderFromModel(modelPreference.textModel);
                const key = getPreferredApiKey('text', provider);
                return await enhancePromptWithProvider(payload, modelPreference.textModel, key);
            } finally {
                useUIStore.getState().setIsEnhancingPrompt(false);
            }
        },

        // Sync runtime configs
        syncRuntimeConfigs: () => {
            const { modelPreference, getPreferredApiKey } = get();
            const textProvider = inferProviderFromModel(modelPreference.textModel);
            const imageProvider = inferProviderFromModel(modelPreference.imageModel);
            const videoProvider = inferProviderFromModel(modelPreference.videoModel);

            const googleTextKey = getPreferredApiKey('text', 'google');
            const googleImageKey = getPreferredApiKey('image', 'google');
            const googleVideoKey = getPreferredApiKey('video', 'google');
            const bananaKey = getPreferredApiKey('agent', 'banana');

            setGeminiRuntimeConfig({
                textApiKey: googleTextKey?.key,
                imageApiKey: googleImageKey?.key || googleTextKey?.key,
                videoApiKey: googleVideoKey?.key || googleImageKey?.key || googleTextKey?.key,
                textModel: textProvider === 'google' ? modelPreference.textModel : undefined,
                imageModel:
                    imageProvider === 'google' && modelPreference.imageModel.startsWith('gemini')
                        ? modelPreference.imageModel
                        : undefined,
                textToImageModel:
                    imageProvider === 'google' && modelPreference.imageModel.startsWith('imagen')
                        ? modelPreference.imageModel
                        : undefined,
                videoModel: videoProvider === 'google' ? modelPreference.videoModel : undefined,
            });
            setBananaRuntimeConfig({
                apiKey: bananaKey?.key,
                splitUrl: bananaKey?.baseUrl ? `${bananaKey.baseUrl.replace(/\/$/, '')}/split-layers` : undefined,
                agentUrl: bananaKey?.baseUrl ? `${bananaKey.baseUrl.replace(/\/$/, '')}/agent` : undefined,
            });
        },
    };
});

// Initialize runtime configs on store creation
useAIStore.getState().syncRuntimeConfigs();
