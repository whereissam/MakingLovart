/**
 * Proxy Client — Routes API calls through the backend proxy when available.
 *
 * When VITE_API_PROXY_URL is set, all AI API calls go through the proxy
 * so API keys never touch the client. Falls back to direct calls otherwise.
 */

const PROXY_URL = import.meta.env?.VITE_API_PROXY_URL as string | undefined;

export const isProxyMode = !!PROXY_URL;

interface ProxyRequest {
    provider: string;
    path: string;
    method?: string;
    body?: unknown;
}

export async function proxyFetch(request: ProxyRequest): Promise<Response> {
    if (!PROXY_URL) {
        throw new Error('Proxy mode is not enabled. Set VITE_API_PROXY_URL.');
    }

    return fetch(`${PROXY_URL}/api/proxy`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Provider': request.provider,
        },
        body: JSON.stringify({
            path: request.path,
            method: request.method || 'POST',
            body: request.body,
        }),
    });
}

/**
 * Smart fetch — uses proxy when available, direct fetch otherwise.
 * In proxy mode, the API key is NOT sent from the client.
 * In direct mode, the API key is included in headers.
 */
export async function smartFetch(
    provider: string,
    url: string,
    options: RequestInit & { apiKey?: string },
): Promise<Response> {
    if (isProxyMode) {
        // Extract path from full URL
        const urlObj = new URL(url);
        return proxyFetch({
            provider,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'POST',
            body: options.body ? JSON.parse(options.body as string) : undefined,
        });
    }

    // Direct mode — use provided headers (caller adds API key)
    const { apiKey: _, ...fetchOptions } = options;
    return fetch(url, fetchOptions);
}

export async function checkProxyHealth(): Promise<{ ok: boolean; providers: string[] }> {
    if (!PROXY_URL) return { ok: false, providers: [] };

    try {
        const response = await fetch(`${PROXY_URL}/health`);
        return await response.json();
    } catch {
        return { ok: false, providers: [] };
    }
}
