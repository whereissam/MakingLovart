import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAIStore, inferCapabilitiesByProvider } from '../src/stores/useAIStore';

// Mock the service modules
vi.mock('../src/services/geminiService', () => ({
    setGeminiRuntimeConfig: vi.fn(),
}));
vi.mock('../src/services/bananaService', () => ({
    setBananaRuntimeConfig: vi.fn(),
}));
vi.mock('../src/services/aiGateway', () => ({
    enhancePromptWithProvider: vi.fn(),
    inferProviderFromModel: (model: string) => {
        if (model.includes('gemini') || model.includes('imagen') || model.includes('veo')) return 'google';
        if (model.includes('gpt') || model.includes('dall-e')) return 'openai';
        if (model.includes('claude')) return 'anthropic';
        return 'custom';
    },
}));

describe('inferCapabilitiesByProvider', () => {
    it('should return correct capabilities for google', () => {
        expect(inferCapabilitiesByProvider('google')).toEqual(['text', 'image', 'video']);
    });

    it('should return correct capabilities for openai', () => {
        expect(inferCapabilitiesByProvider('openai')).toEqual(['text', 'image']);
    });

    it('should return correct capabilities for anthropic', () => {
        expect(inferCapabilitiesByProvider('anthropic')).toEqual(['text']);
    });

    it('should return correct capabilities for stability', () => {
        expect(inferCapabilitiesByProvider('stability')).toEqual(['image']);
    });

    it('should return correct capabilities for banana', () => {
        expect(inferCapabilitiesByProvider('banana')).toEqual(['agent']);
    });
});

describe('useAIStore', () => {
    beforeEach(() => {
        localStorage.clear();
        useAIStore.setState({
            userApiKeys: [],
            prompt: '',
            promptAttachments: [],
            chatAttachments: [],
            mentionedElementIds: [],
            generationMode: 'image',
            videoAspectRatio: '16:9',
            isAutoEnhanceEnabled: false,
            userEffects: [],
            characterLocks: [],
            activeCharacterLockId: null,
        });
    });

    it('should initialize with defaults', () => {
        const state = useAIStore.getState();
        expect(state.prompt).toBe('');
        expect(state.generationMode).toBe('image');
        expect(state.videoAspectRatio).toBe('16:9');
        expect(state.userApiKeys).toEqual([]);
    });

    it('should set prompt', () => {
        useAIStore.getState().setPrompt('a cute cat');
        expect(useAIStore.getState().prompt).toBe('a cute cat');
    });

    it('should set generation mode', () => {
        useAIStore.getState().setGenerationMode('video');
        expect(useAIStore.getState().generationMode).toBe('video');
    });

    it('should set video aspect ratio', () => {
        useAIStore.getState().setVideoAspectRatio('9:16');
        expect(useAIStore.getState().videoAspectRatio).toBe('9:16');
    });

    it('should add and delete user effects', () => {
        const effect = { id: 'e1', name: 'Glow', value: 'glow effect' };
        useAIStore.getState().addUserEffect(effect);
        expect(useAIStore.getState().userEffects).toHaveLength(1);
        expect(useAIStore.getState().userEffects[0].name).toBe('Glow');

        useAIStore.getState().deleteUserEffect('e1');
        expect(useAIStore.getState().userEffects).toHaveLength(0);
    });

    it('should add API key with auto-default', () => {
        useAIStore.getState().addApiKey({
            provider: 'google',
            capabilities: ['text', 'image'],
            key: 'test-key-123',
        });

        const keys = useAIStore.getState().userApiKeys;
        expect(keys).toHaveLength(1);
        expect(keys[0].provider).toBe('google');
        expect(keys[0].isDefault).toBe(true); // first key is auto-default
    });

    it('should delete API key', () => {
        useAIStore.getState().addApiKey({
            provider: 'google',
            capabilities: ['text'],
            key: 'key-1',
        });
        const id = useAIStore.getState().userApiKeys[0].id;

        useAIStore.getState().deleteApiKey(id);
        expect(useAIStore.getState().userApiKeys).toHaveLength(0);
    });

    it('should get preferred API key', () => {
        useAIStore.getState().addApiKey({
            provider: 'google',
            capabilities: ['text', 'image'],
            key: 'google-key',
        });
        useAIStore.getState().addApiKey({
            provider: 'openai',
            capabilities: ['text', 'image'],
            key: 'openai-key',
        });

        const googleKey = useAIStore.getState().getPreferredApiKey('text', 'google');
        expect(googleKey?.key).toBe('google-key');

        const openaiKey = useAIStore.getState().getPreferredApiKey('text', 'openai');
        expect(openaiKey?.key).toBe('openai-key');
    });

    it('should toggle auto-enhance and persist', () => {
        useAIStore.getState().setAutoEnhanceEnabled(true);
        expect(useAIStore.getState().isAutoEnhanceEnabled).toBe(true);
        expect(localStorage.getItem('autoEnhance.v1')).toBe('true');
    });

    it('should set mentioned element IDs', () => {
        useAIStore.getState().setMentionedElementIds(['id1', 'id2']);
        expect(useAIStore.getState().mentionedElementIds).toEqual(['id1', 'id2']);
    });
});
