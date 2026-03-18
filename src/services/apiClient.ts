/**
 * 统一 API 调用客户端（重构版）
 *
 * ❌ 不再从 .env / import.meta.env 读取任何 API KEY
 * ✅ 所有调用通过用户保存的 APIConfig 动态构建请求
 * ✅ 保留单例模式 + AbortController + 进度轮询
 */

import type { APIConfig, VideoGenerationRequest, VideoGenerationResponse } from '../types/api-config';
import { PROVIDER_PRESETS } from '../types/api-config';

class ApiClient {
  private static instance: ApiClient;
  private abortControllers = new Map<string, AbortController>();

  private constructor() {}

  static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  // ─── 底层 fetch 封装 ────────────────────────────────────────
  private async request<T>(
    url: string,
    options: RequestInit = {},
    taskId?: string,
  ): Promise<T> {
    const controller = new AbortController();
    if (taskId) this.abortControllers.set(taskId, controller);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error((error as any).message || `HTTP ${response.status}`);
      }

      return response.json() as Promise<T>;
    } finally {
      if (taskId) this.abortControllers.delete(taskId);
    }
  }

  /** 取消正在进行的请求 */
  abort(taskId: string): void {
    this.abortControllers.get(taskId)?.abort();
    this.abortControllers.delete(taskId);
  }

  // ─── 统一入口 ─────────────────────────────────────────────────
  async generate(
    config: APIConfig,
    model: string,
    req: VideoGenerationRequest,
    taskId?: string,
  ): Promise<VideoGenerationResponse> {
    switch (config.provider) {
      case 'banana':
        return this.requestBanana(config, model, req, taskId);
      case 'google':
        return this.requestVeo(config, model, req, taskId);
      case 'openai':
        return this.requestSora(config, model, req, taskId);
      case 'custom':
        return this.requestCustom(config, model, req, taskId);
    }
  }

  // ─── Banana ───────────────────────────────────────────────────
  private async requestBanana(
    config: APIConfig,
    model: string,
    req: VideoGenerationRequest,
    taskId?: string,
  ): Promise<VideoGenerationResponse> {
    const preset = PROVIDER_PRESETS.banana;
    return this.request<VideoGenerationResponse>(
      `${config.apiBaseUrl.replace(/\/$/, '')}/tasks/create`,
      {
        method: 'POST',
        headers: { [preset.headerKey]: config.apiKey },
        body: JSON.stringify({
          model,
          input: req.prompt,
          parameters: req.parameters ?? {},
        }),
      },
      taskId,
    );
  }

  // ─── Google Veo ───────────────────────────────────────────────
  private async requestVeo(
    config: APIConfig,
    model: string,
    req: VideoGenerationRequest,
    taskId?: string,
  ): Promise<VideoGenerationResponse> {
    const projectId = config.extraConfig?.projectId ?? '';
    const baseUrl = config.apiBaseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/projects/${projectId}/locations/us-central1/publishers/google/models/${model}:generateVideo`;

    return this.request<VideoGenerationResponse>(
      url,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          prompt: req.prompt,
          ...req.parameters,
        }),
      },
      taskId,
    );
  }

  // ─── OpenAI Sora ──────────────────────────────────────────────
  private async requestSora(
    config: APIConfig,
    model: string,
    req: VideoGenerationRequest,
    taskId?: string,
  ): Promise<VideoGenerationResponse> {
    return this.request<VideoGenerationResponse>(
      `${config.apiBaseUrl.replace(/\/$/, '')}/videos/generations`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model,
          prompt: req.prompt,
          ...req.parameters,
        }),
      },
      taskId,
    );
  }

  // ─── 自定义 ───────────────────────────────────────────────────
  private async requestCustom(
    config: APIConfig,
    model: string,
    req: VideoGenerationRequest,
    taskId?: string,
  ): Promise<VideoGenerationResponse> {
    const preset = PROVIDER_PRESETS.custom;
    return this.request<VideoGenerationResponse>(
      `${config.apiBaseUrl.replace(/\/$/, '')}/generate`,
      {
        method: 'POST',
        headers: { [preset.headerKey]: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model,
          prompt: req.prompt,
          ...req.parameters,
        }),
      },
      taskId,
    );
  }

  // ─── 轻量测试连接 ────────────────────────────────────────────
  async testConnection(config: APIConfig): Promise<{ ok: boolean; message: string }> {
    try {
      const baseUrl = config.apiBaseUrl.replace(/\/$/, '');

      if (config.provider === 'banana') {
        const res = await fetch(`${baseUrl}/health`, {
          method: 'GET',
          headers: { [PROVIDER_PRESETS.banana?.headerKey || 'Banana-Api-Key']: config.apiKey },
        });
        return res.ok
          ? { ok: true, message: '连接成功 ✓' }
          : { ok: false, message: `HTTP ${res.status}` };
      }

      if (config.provider === 'openai') {
        const res = await fetch(`${baseUrl}/models`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        return res.ok
          ? { ok: true, message: '连接成功 ✓' }
          : { ok: false, message: `HTTP ${res.status}` };
      }

      if (config.provider === 'google') {
        const projectId = config.extraConfig?.projectId ?? '';
        const res = await fetch(
          `${baseUrl}/projects/${projectId}/locations/us-central1/publishers/google/models`,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${config.apiKey}` },
          },
        );
        return res.ok
          ? { ok: true, message: '连接成功 ✓' }
          : { ok: false, message: `HTTP ${res.status}` };
      }

      // custom — 简单格式校验
      if (config.apiKey.length < 10) {
        return { ok: false, message: 'API Key 太短' };
      }
      return { ok: true, message: '格式校验通过（未做在线验证）' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '网络错误' };
    }
  }

  // ─── 进度轮询 ────────────────────────────────────────────────
  async pollTaskStatus(
    config: APIConfig,
    remoteTaskId: string,
    onProgress?: (status: string) => void,
    intervalMs = 3000,
    maxAttempts = 60,
  ): Promise<VideoGenerationResponse> {
    const baseUrl = config.apiBaseUrl.replace(/\/$/, '');

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, intervalMs));

      let url: string;
      const headers: Record<string, string> = {};

      switch (config.provider) {
        case 'banana':
          url = `${baseUrl}/tasks/${remoteTaskId}`;
          headers[PROVIDER_PRESETS.banana?.headerKey || 'Banana-Api-Key'] = config.apiKey;
          break;
        case 'openai':
          url = `${baseUrl}/videos/generations/${remoteTaskId}`;
          headers.Authorization = `Bearer ${config.apiKey}`;
          break;
        case 'google': {
          const projectId = config.extraConfig?.projectId ?? '';
          url = `${baseUrl}/projects/${projectId}/locations/us-central1/operations/${remoteTaskId}`;
          headers.Authorization = `Bearer ${config.apiKey}`;
          break;
        }
        default:
          url = `${baseUrl}/tasks/${remoteTaskId}`;
          headers.Authorization = `Bearer ${config.apiKey}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) continue;

      const data = (await res.json()) as VideoGenerationResponse;
      onProgress?.(data.status ?? 'processing');

      if (data.status === 'completed' || data.status === 'succeeded' || data.videoUrl) {
        return data;
      }

      if (data.status === 'failed' || data.status === 'error') {
        throw new Error('Video generation failed');
      }
    }

    throw new Error('Polling timeout, please try again later');
  }
}

export default ApiClient;
