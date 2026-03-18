import { describe, it, expect } from 'vitest';
import { isProxyMode, checkProxyHealth } from '../src/services/proxyClient';

describe('proxyClient', () => {
    it('should report proxy mode as disabled when env var is not set', () => {
        expect(isProxyMode).toBe(false);
    });

    it('should return not ok when proxy is not available', async () => {
        const health = await checkProxyHealth();
        expect(health.ok).toBe(false);
        expect(health.providers).toEqual([]);
    });
});
