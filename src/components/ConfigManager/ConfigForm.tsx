/**
 * ConfigForm — 新建 / 编辑配置弹窗
 *
 * - 快捷预设按钮：Banana / Veo / Sora / 自定义
 * - 表单字段：名称、API KEY、基础地址、额外字段（如 projectId）
 * - 模型列表管理：添加、删除、选择默认模型
 * - 测试连接
 */

import React, { useEffect, useState } from 'react';
import type { APIConfig, ModelItem, ProviderType } from '../../types/api-config';
import { PROVIDER_PRESETS } from '../../types/api-config';
import ApiClient from '../../services/apiClient';

interface ConfigFormProps {
    /** 编辑时传入已有配置，新建时传 null */
    editConfig: APIConfig | null;
    onSave: (draft: Omit<APIConfig, 'id' | 'createdAt' | 'updatedAt'>) => void;
    onUpdate: (id: string, patch: Partial<Omit<APIConfig, 'id' | 'createdAt'>>) => void;
    onClose: () => void;
    isDark: boolean;
}

export const ConfigForm: React.FC<ConfigFormProps> = ({ editConfig, onSave, onUpdate, onClose, isDark }) => {
    const isEditing = !!editConfig;

    const [provider, setProvider] = useState<ProviderType>(editConfig?.provider ?? 'openai');
    const [name, setName] = useState(editConfig?.name ?? '');
    const [apiKey, setApiKey] = useState(editConfig?.apiKey ?? '');
    const [apiBaseUrl, setApiBaseUrl] = useState(editConfig?.apiBaseUrl ?? (PROVIDER_PRESETS.openai?.baseUrl || ''));
    const [models, setModels] = useState<ModelItem[]>(editConfig?.models ?? []);
    const [defaultModel, setDefaultModel] = useState(editConfig?.defaultModel ?? '');
    const [extraConfig, setExtraConfig] = useState<Record<string, string>>(editConfig?.extraConfig ?? {});
    const [showKey, setShowKey] = useState(false);
    const [newModelId, setNewModelId] = useState('');
    const [newModelName, setNewModelName] = useState('');
    const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
    const [isTesting, setIsTesting] = useState(false);

    const preset = PROVIDER_PRESETS[provider];

    // 切换预设时自动填入
    const applyPreset = (p: ProviderType) => {
        const ps = PROVIDER_PRESETS[p];
        if (!ps) return;
        setProvider(p);
        setApiBaseUrl(ps.baseUrl);
        setModels(ps.models.map((m) => ({ ...m })));
        setDefaultModel(ps.models[0]?.id ?? '');
        setExtraConfig({});
        setTestResult(null);
        if (!name || Object.values(PROVIDER_PRESETS).some((pr) => pr?.name === name)) {
            setName(ps.name);
        }
    };

    useEffect(() => {
        if (!isEditing) applyPreset(provider);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const addModel = () => {
        const id = newModelId.trim();
        const nm = newModelName.trim() || id;
        if (!id || models.some((m) => m.id === id)) return;
        const next = [...models, { id, name: nm }];
        setModels(next);
        if (!defaultModel) setDefaultModel(id);
        setNewModelId('');
        setNewModelName('');
    };

    const removeModel = (id: string) => {
        const next = models.filter((m) => m.id !== id);
        setModels(next);
        if (defaultModel === id) setDefaultModel(next[0]?.id ?? '');
    };

    const handleTest = async () => {
        setIsTesting(true);
        setTestResult(null);
        const draft: APIConfig = {
            id: 'test',
            name,
            provider,
            apiKey,
            apiBaseUrl,
            models,
            defaultModel,
            extraConfig,
            createdAt: 0,
            updatedAt: 0,
        };
        const result = await ApiClient.getInstance().testConnection(draft);
        setTestResult(result);
        setIsTesting(false);
    };

    const handleSubmit = () => {
        if (!name.trim() || !apiKey.trim()) return;
        const payload = {
            name: name.trim(),
            provider,
            apiKey: apiKey.trim(),
            apiBaseUrl: apiBaseUrl.trim(),
            models,
            defaultModel: defaultModel || models[0]?.id || '',
            extraConfig: Object.keys(extraConfig).length > 0 ? extraConfig : undefined,
        };

        if (isEditing && editConfig) {
            onUpdate(editConfig.id, payload);
        } else {
            onSave(payload as Omit<APIConfig, 'id' | 'createdAt' | 'updatedAt'>);
        }
        onClose();
    };

    const inputClass = `w-full rounded-2xl border px-3 py-2.5 text-sm outline-none transition ${
        isDark
            ? 'border-[#2A3140] bg-[#161A22] text-[#F3F4F6] placeholder:text-[#667085] focus:border-[#4B5B78]'
            : 'border-[#E4E7EC] bg-white text-[#344054] placeholder:text-[#98A2B3] focus:border-[#98A2B3]'
    }`;

    const chipClass = `rounded-full border px-3 py-2 text-xs font-medium transition cursor-pointer`;
    const presetChipActive = isDark
        ? 'border-[#4B5B78] bg-[#1B2330] text-[#7CB4FF]'
        : 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]';
    const presetChipDefault = isDark
        ? 'border-[#2A3140] bg-[#1B2029] text-[#D0D5DD] hover:bg-[#252C39]'
        : 'border-[#E4E7EC] bg-[#F8FAFC] text-[#475467] hover:bg-[#F2F4F7]';

    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className={`relative max-h-[88vh] w-[92%] max-w-[520px] overflow-y-auto rounded-[28px] border p-6 shadow-[0_40px_120px_rgba(15,23,42,0.18)] ${
                    isDark ? 'border-[#2A3140] bg-[#12151B]' : 'border-[#E4E7EC] bg-white'
                }`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="mb-5 flex items-center justify-between">
                    <h3 className={`text-lg font-semibold ${isDark ? 'text-[#F3F4F6]' : 'text-[#101828]'}`}>
                        {isEditing ? '✏️ 编辑配置' : '➕ 新建配置'}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`flex h-9 w-9 items-center justify-center rounded-2xl border transition ${
                            isDark
                                ? 'border-[#2A3140] text-[#98A2B3] hover:bg-[#1B2029]'
                                : 'border-[#E4E7EC] text-[#667085] hover:bg-[#F9FAFB]'
                        }`}
                    >
                        ×
                    </button>
                </div>

                {/* 快捷预设 */}
                <div className="mb-4">
                    <div className={`mb-2 text-xs font-medium ${isDark ? 'text-[#98A2B3]' : 'text-[#667085]'}`}>
                        快捷选择
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(Object.keys(PROVIDER_PRESETS) as ProviderType[]).map((p) => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => applyPreset(p)}
                                className={`${chipClass} ${provider === p ? presetChipActive : presetChipDefault}`}
                            >
                                {PROVIDER_PRESETS[p]?.name ?? p}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-3">
                    {/* 配置名称 */}
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="配置名称"
                        className={inputClass}
                    />

                    {/* API KEY */}
                    <div className="flex gap-2">
                        <input
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            type={showKey ? 'text' : 'password'}
                            placeholder="粘贴 API Key"
                            className={inputClass}
                        />
                        <button
                            type="button"
                            onClick={() => setShowKey((v) => !v)}
                            className={`shrink-0 rounded-2xl border px-3 py-2 text-xs font-medium transition ${
                                isDark
                                    ? 'border-[#2A3140] text-[#98A2B3] hover:bg-[#252C39]'
                                    : 'border-[#E4E7EC] text-[#667085] hover:bg-[#F2F4F7]'
                            }`}
                        >
                            {showKey ? '👁️' : '🔒'}
                        </button>
                    </div>

                    {/* API 地址 */}
                    <input
                        value={apiBaseUrl}
                        onChange={(e) => setApiBaseUrl(e.target.value)}
                        placeholder="API 基础地址"
                        className={inputClass}
                    />

                    {/* 额外字段 */}
                    {(preset?.extraFields ?? []).map((field) => (
                        <div key={field}>
                            <div className={`mb-1 text-xs font-medium ${isDark ? 'text-[#D0D5DD]' : 'text-[#344054]'}`}>
                                {field}
                            </div>
                            <input
                                value={extraConfig[field] ?? ''}
                                onChange={(e) => setExtraConfig((prev) => ({ ...prev, [field]: e.target.value }))}
                                placeholder={`输入 ${field}`}
                                className={inputClass}
                            />
                        </div>
                    ))}

                    {/* 模型列表 */}
                    <div>
                        <div className={`mb-2 text-xs font-semibold ${isDark ? 'text-[#D0D5DD]' : 'text-[#344054]'}`}>
                            ── 可用模型 ──
                        </div>
                        <div className="space-y-1.5">
                            {models.map((m) => (
                                <div
                                    key={m.id}
                                    className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                                        isDark ? 'border-[#2A3140] bg-[#161A22]' : 'border-[#E4E7EC] bg-[#F9FAFB]'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <span
                                            className={`text-sm font-medium ${isDark ? 'text-[#F3F4F6]' : 'text-[#101828]'}`}
                                        >
                                            {m.name}
                                        </span>
                                        <span
                                            className={`ml-2 text-xs ${isDark ? 'text-[#667085]' : 'text-[#98A2B3]'}`}
                                        >
                                            ({m.id})
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {m.id === defaultModel ? (
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                                    isDark
                                                        ? 'bg-[#123524] text-[#75E0A7]'
                                                        : 'bg-[#ECFDF3] text-[#027A48]'
                                                }`}
                                            >
                                                默认
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setDefaultModel(m.id)}
                                                className={`text-[10px] ${isDark ? 'text-[#98A2B3] hover:text-[#B2CCFF]' : 'text-[#667085] hover:text-[#175CD3]'}`}
                                            >
                                                设为默认
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => removeModel(m.id)}
                                            className={`text-xs ${isDark ? 'text-[#FDA29B] hover:text-red-400' : 'text-[#DC2626] hover:text-red-600'}`}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 添加模型 */}
                        <div className="mt-2 flex gap-2">
                            <input
                                value={newModelId}
                                onChange={(e) => setNewModelId(e.target.value)}
                                placeholder="模型 ID"
                                className={`${inputClass} flex-1`}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addModel();
                                    }
                                }}
                            />
                            <input
                                value={newModelName}
                                onChange={(e) => setNewModelName(e.target.value)}
                                placeholder="显示名（可选）"
                                className={`${inputClass} flex-1`}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addModel();
                                    }
                                }}
                            />
                            <button
                                type="button"
                                onClick={addModel}
                                disabled={!newModelId.trim()}
                                className={`shrink-0 rounded-2xl border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed ${
                                    isDark
                                        ? 'border-[#4B5B78] bg-[#1B2330] text-[#B2CCFF] disabled:border-[#2A3140] disabled:text-[#3A4458]'
                                        : 'border-[#B2CCFF] bg-[#EEF4FF] text-[#175CD3] disabled:border-[#E4E7EC] disabled:text-[#D0D5DD]'
                                }`}
                            >
                                + 添加
                            </button>
                        </div>
                    </div>

                    {/* 默认模型 下拉 */}
                    {models.length > 0 && (
                        <div>
                            <div className={`mb-1 text-xs font-medium ${isDark ? 'text-[#D0D5DD]' : 'text-[#344054]'}`}>
                                默认模型
                            </div>
                            <select
                                value={defaultModel}
                                onChange={(e) => setDefaultModel(e.target.value)}
                                className={inputClass}
                                aria-label="默认模型"
                                title="选择默认模型"
                            >
                                {models.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name} ({m.id})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* 测试连接结果 */}
                {testResult && (
                    <div
                        className={`mt-3 rounded-xl px-3 py-2 text-sm ${
                            testResult.ok
                                ? isDark
                                    ? 'bg-[#123524] text-[#75E0A7]'
                                    : 'bg-[#ECFDF3] text-[#027A48]'
                                : isDark
                                  ? 'bg-[#3A1616] text-[#FDA29B]'
                                  : 'bg-[#FEF3F2] text-[#B42318]'
                        }`}
                    >
                        {testResult.ok ? '✓ ' : '✗ '}
                        {testResult.message}
                    </div>
                )}

                {/* 操作按钮 */}
                <div className="mt-5 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={handleTest}
                        disabled={!apiKey.trim() || isTesting}
                        className={`rounded-full border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed ${
                            isDark
                                ? 'border-[#2A3140] text-[#D0D5DD] hover:bg-[#1B2029] disabled:text-[#3A4458]'
                                : 'border-[#E4E7EC] text-[#344054] hover:bg-[#F9FAFB] disabled:text-[#D0D5DD]'
                        }`}
                    >
                        {isTesting ? '⏳ 测试中...' : '🔍 测试连接'}
                    </button>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!name.trim() || !apiKey.trim()}
                        className={`rounded-full px-5 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed ${
                            isDark
                                ? 'bg-[#F3F4F6] text-[#111827] hover:bg-white disabled:bg-[#3A4458] disabled:text-[#98A2B3]'
                                : 'bg-[#111827] text-white hover:bg-[#0F172A] disabled:bg-[#D0D5DD]'
                        }`}
                    >
                        💾 保存
                    </button>
                </div>
            </div>
        </div>
    );
};
