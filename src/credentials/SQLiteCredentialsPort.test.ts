import { describe, expect, it } from 'vitest';
import type { CredentialsPort } from './SQLiteCredentialsPort';

class InMemoryCredentialsPort implements CredentialsPort {
    private apiKey: string | null = null;
    private rowCount = 0;
    private initialized = false;

    async init(): Promise<void> {
        this.initialized = true;
    }

    async load(): Promise<string | null> {
        if (!this.initialized) {
            await this.init();
        }
        return this.apiKey;
    }

    async save(apiKey: string): Promise<void> {
        if (!this.initialized) {
            await this.init();
        }
        this.apiKey = apiKey;
        this.rowCount = 1;
    }

    async clear(): Promise<void> {
        if (!this.initialized) {
            await this.init();
        }
        this.apiKey = null;
        this.rowCount = 0;
    }

    getRowCount(): number {
        return this.rowCount;
    }
}

describe('CredentialsPort contract', () => {
    it('returns null for an empty store', async () => {
        const port = new InMemoryCredentialsPort();

        await expect(port.load()).resolves.toBeNull();
    });

    it('round-trips a saved api key', async () => {
        const port = new InMemoryCredentialsPort();

        await port.save('sk-test-123');

        await expect(port.load()).resolves.toBe('sk-test-123');
    });

    it('overwrites the api key on subsequent save', async () => {
        const port = new InMemoryCredentialsPort();

        await port.save('sk-first');
        await port.save('sk-second');

        await expect(port.load()).resolves.toBe('sk-second');
    });

    it('keeps the credentials table as a singleton across saves', async () => {
        const port = new InMemoryCredentialsPort();

        await port.save('sk-first');
        await port.save('sk-second');
        await port.save('sk-third');

        expect(port.getRowCount()).toBe(1);
    });

    it('clears the stored value', async () => {
        const port = new InMemoryCredentialsPort();

        await port.save('sk-test-123');
        await port.clear();

        await expect(port.load()).resolves.toBeNull();
        expect(port.getRowCount()).toBe(0);
    });
});
