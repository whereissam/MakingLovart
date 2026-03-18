/**
 * API 配置管理 — 类型定义
 *
 * 用户自定义多个 API 服务商配置，每个配置包含 KEY、地址、模型列表。
 * 可在 PromptBar 中快速切换已保存的配置方案。
 */

// ─── 服务商类型 ─────────────────────────────────────────────────
// Unified with AIProvider from types.ts. Legacy aliases kept for backward compat.
import type { AIProvider } from '../types';
export type ProviderType = AIProvider;

// ─── 模型项 ─────────────────────────────────────────────────────
export interface ModelItem {
    id: string; // 如 "sora-1", "veo-2"
    name: string; // 显示名称
}

// ─── 单条 API 配置 ──────────────────────────────────────────────
export interface APIConfig {
    id: string; // UUID
    name: string; // 配置名称，如 "我的Sora"
    provider: ProviderType; // 服务商类型
    apiKey: string; // 用户输入的 API KEY（存储时 base64 混淆）
    apiBaseUrl: string; // API 基础地址
    models: ModelItem[]; // 该 KEY 可调用的模型列表
    defaultModel: string; // 默认模型 id
    extraConfig?: Record<string, string>; // 额外配置（如 Google 的 projectId）
    createdAt: number;
    updatedAt: number;
}

// ─── 服务商预设 ─────────────────────────────────────────────────
export interface ProviderPreset {
    name: string;
    baseUrl: string;
    headerKey: string; // 请求 header 名称
    models: ModelItem[]; // 推荐模型
    extraFields: string[]; // 需要用户额外输入的字段 key
}

export const PROVIDER_PRESETS: Partial<Record<ProviderType, ProviderPreset>> = {
    google: {
        name: 'Google (Gemini / Veo)',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        headerKey: 'x-goog-api-key',
        models: [
            { id: 'gemini-2.5-flash-image-preview', name: 'Gemini Flash Image' },
            { id: 'imagen-4.0-generate-001', name: 'Imagen 4.0' },
            { id: 'veo-2.0-generate-001', name: 'Veo 2.0' },
        ],
        extraFields: [],
    },
    openai: {
        name: 'OpenAI (DALL-E / Sora)',
        baseUrl: 'https://api.openai.com/v1',
        headerKey: 'Authorization',
        models: [
            { id: 'dall-e-3', name: 'DALL-E 3' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
            { id: 'sora-1', name: 'Sora 1' },
        ],
        extraFields: [],
    },
    anthropic: {
        name: 'Anthropic (Claude)',
        baseUrl: 'https://api.anthropic.com/v1',
        headerKey: 'x-api-key',
        models: [{ id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' }],
        extraFields: [],
    },
    stability: {
        name: 'Stability AI (SDXL)',
        baseUrl: 'https://api.stability.ai/v1',
        headerKey: 'Authorization',
        models: [{ id: 'sdxl', name: 'Stable Diffusion XL' }],
        extraFields: [],
    },
    banana: {
        name: 'Banana',
        baseUrl: 'https://api.banana.dev/v2',
        headerKey: 'Banana-Api-Key',
        models: [
            { id: 'flux-video', name: 'Flux Video' },
            { id: 'banana-default', name: 'Banana Default' },
        ],
        extraFields: [],
    },
    qwen: {
        name: 'Qwen',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        headerKey: 'Authorization',
        models: [{ id: 'qwen-max', name: 'Qwen Max' }],
        extraFields: [],
    },
    custom: {
        name: 'Custom',
        baseUrl: '',
        headerKey: 'Authorization',
        models: [],
        extraFields: [],
    },
};

// ─── Store 状态 ─────────────────────────────────────────────────
export interface APIConfigState {
    configs: APIConfig[];
    activeConfigId: string | null;
    activeModelId: string | null;
}

// ─── 视频生成请求 & 响应（供 api-client 使用）─────────────────
export interface VideoGenerationRequest {
    prompt: string;
    parameters?: Record<string, unknown>;
}

export interface VideoGenerationResponse {
    taskId?: string;
    status?: string;
    videoUrl?: string;
    [key: string]: unknown;
}
