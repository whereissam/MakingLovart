/**
 * Backend API Proxy Server
 *
 * Proxies AI API calls so API keys never touch the client.
 * Run with: bun run server/index.ts
 *
 * Environment variables:
 *   GOOGLE_API_KEY    — Google Gemini / Imagen / Veo
 *   OPENAI_API_KEY    — OpenAI GPT / DALL-E
 *   STABILITY_API_KEY — Stability.ai SDXL
 *   PORT              — Server port (default 3001)
 */

const PORT = parseInt(process.env.PORT || '3001', 10);

const PROVIDER_BASE_URLS: Record<string, string> = {
    google: 'https://generativelanguage.googleapis.com',
    openai: 'https://api.openai.com',
    stability: 'https://api.stability.ai',
};

const API_KEYS: Record<string, string | undefined> = {
    google: process.env.GOOGLE_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    stability: process.env.STABILITY_API_KEY,
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Provider, X-Model',
};

async function handleProxy(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health check
    if (url.pathname === '/health') {
        const configured = Object.entries(API_KEYS)
            .filter(([, v]) => !!v)
            .map(([k]) => k);
        return Response.json({ status: 'ok', providers: configured }, { headers: CORS_HEADERS });
    }

    // Proxy endpoint: POST /api/proxy
    if (url.pathname === '/api/proxy' && req.method === 'POST') {
        const provider = req.headers.get('X-Provider');
        if (!provider || !PROVIDER_BASE_URLS[provider]) {
            return Response.json(
                { error: `Unknown provider: ${provider}` },
                { status: 400, headers: CORS_HEADERS },
            );
        }

        const apiKey = API_KEYS[provider];
        if (!apiKey) {
            return Response.json(
                { error: `No API key configured for provider: ${provider}` },
                { status: 403, headers: CORS_HEADERS },
            );
        }

        try {
            const body = await req.json();
            const targetPath = body.path || '';
            const targetUrl = `${PROVIDER_BASE_URLS[provider]}${targetPath}`;

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            // Provider-specific auth
            if (provider === 'google') {
                // Google uses query param for API key
                const separator = targetUrl.includes('?') ? '&' : '?';
                const authedUrl = `${targetUrl}${separator}key=${apiKey}`;
                const response = await fetch(authedUrl, {
                    method: body.method || 'POST',
                    headers,
                    body: body.body ? JSON.stringify(body.body) : undefined,
                });
                const data = await response.text();
                return new Response(data, {
                    status: response.status,
                    headers: { ...CORS_HEADERS, 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
                });
            }

            if (provider === 'openai') {
                headers['Authorization'] = `Bearer ${apiKey}`;
            } else if (provider === 'stability') {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const response = await fetch(targetUrl, {
                method: body.method || 'POST',
                headers,
                body: body.body ? JSON.stringify(body.body) : undefined,
            });

            const data = await response.text();
            return new Response(data, {
                status: response.status,
                headers: { ...CORS_HEADERS, 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Proxy request failed';
            return Response.json(
                { error: message },
                { status: 502, headers: CORS_HEADERS },
            );
        }
    }

    return Response.json(
        { error: 'Not found', endpoints: ['GET /health', 'POST /api/proxy'] },
        { status: 404, headers: CORS_HEADERS },
    );
}

console.log(`API Proxy server listening on http://localhost:${PORT}`);
console.log(`Configured providers: ${Object.entries(API_KEYS).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}`);

Bun.serve({
    port: PORT,
    fetch: handleProxy,
});
