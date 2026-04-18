import { describe, expect, it } from 'vitest';
import {
    API_KEY_LEGACY_LS_KEY,
    API_KEY_PRIMARY_LS_KEY,
    MIGRATION_DECISION_KEY,
    createLocalStorageMigrator,
    type LocalStorageMigrator,
} from './LocalStorageMigrator';
import type { CredentialsPort } from '../credentials/SQLiteCredentialsPort';

class MemoryStorage implements Storage {
    private readonly map = new Map<string, string>();

    get length(): number {
        return this.map.size;
    }

    clear(): void {
        this.map.clear();
    }

    getItem(key: string): string | null {
        return this.map.has(key) ? (this.map.get(key) as string) : null;
    }

    key(index: number): string | null {
        return Array.from(this.map.keys())[index] ?? null;
    }

    removeItem(key: string): void {
        this.map.delete(key);
    }

    setItem(key: string, value: string): void {
        this.map.set(key, value);
    }
}

class InMemoryCredentialsPort implements CredentialsPort {
    apiKey: string | null = null;
    saveCount = 0;

    async init(): Promise<void> {}

    async load(): Promise<string | null> {
        return this.apiKey;
    }

    async save(apiKey: string): Promise<void> {
        this.apiKey = apiKey;
        this.saveCount += 1;
    }

    async clear(): Promise<void> {
        this.apiKey = null;
    }
}

class FailingCredentialsPort implements CredentialsPort {
    async init(): Promise<void> {}
    async load(): Promise<string | null> { return null; }
    async save(): Promise<void> { throw new Error('write failed'); }
    async clear(): Promise<void> {}
}

interface Harness {
    migrator: LocalStorageMigrator;
    storage: MemoryStorage;
    port: InMemoryCredentialsPort;
}

function createHarness(seed: Record<string, string> = {}, port: CredentialsPort = new InMemoryCredentialsPort()): Harness {
    const storage = new MemoryStorage();
    for (const [key, value] of Object.entries(seed)) {
        storage.setItem(key, value);
    }
    const migrator = createLocalStorageMigrator({ credentialsPort: port, localStorage: storage });
    return { migrator, storage, port: port as InMemoryCredentialsPort };
}

describe('LocalStorageMigrator.detect', () => {
    it('reports api key as absent when nothing is stored', () => {
        const { migrator } = createHarness();

        expect(migrator.detect()).toEqual({ apiKey: { present: false } });
        expect(migrator.hasMigratableData()).toBe(false);
    });

    it('detects an api key stored under the current key', () => {
        const { migrator } = createHarness({
            [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
        });

        expect(migrator.detect().apiKey.present).toBe(true);
        expect(migrator.hasMigratableData()).toBe(true);
    });

    it('detects an api key stored under the legacy key only', () => {
        const { migrator } = createHarness({
            [API_KEY_LEGACY_LS_KEY]: 'sk-legacy-raw',
        });

        expect(migrator.detect().apiKey.present).toBe(true);
    });

    it('treats an empty string value as absent', () => {
        const { migrator } = createHarness({
            [API_KEY_PRIMARY_LS_KEY]: JSON.stringify(''),
        });

        expect(migrator.detect().apiKey.present).toBe(false);
    });
});

describe('LocalStorageMigrator.migrate', () => {
    it('writes the current api key through the port and removes both source keys on success', async () => {
        const { migrator, storage, port } = createHarness({
            [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
            [API_KEY_LEGACY_LS_KEY]: 'sk-legacy-raw',
        });

        const outcome = await migrator.migrate();

        expect(outcome.apiKey).toEqual({ detected: true, migrated: true });
        expect(port.apiKey).toBe('sk-current');
        expect(storage.getItem(API_KEY_PRIMARY_LS_KEY)).toBeNull();
        expect(storage.getItem(API_KEY_LEGACY_LS_KEY)).toBeNull();
        expect(migrator.getDecision()).toBe('migrated');
    });

    it('migrates the legacy api key when the current key is missing', async () => {
        const { migrator, storage, port } = createHarness({
            [API_KEY_LEGACY_LS_KEY]: 'sk-legacy-raw',
        });

        await migrator.migrate();

        expect(port.apiKey).toBe('sk-legacy-raw');
        expect(storage.getItem(API_KEY_LEGACY_LS_KEY)).toBeNull();
    });

    it('flips the decision to migrated even when no data was present', async () => {
        const { migrator, port } = createHarness();

        const outcome = await migrator.migrate();

        expect(outcome.apiKey).toEqual({ detected: false, migrated: false });
        expect(port.apiKey).toBeNull();
        expect(migrator.getDecision()).toBe('migrated');
    });

    it('leaves the source keys intact when the port write fails', async () => {
        const { migrator, storage } = createHarness({
            [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
            [API_KEY_LEGACY_LS_KEY]: 'sk-legacy-raw',
        }, new FailingCredentialsPort());

        const outcome = await migrator.migrate();

        expect(outcome.apiKey.migrated).toBe(false);
        expect(outcome.apiKey.error?.message).toBe('write failed');
        expect(storage.getItem(API_KEY_PRIMARY_LS_KEY)).toBe(JSON.stringify('sk-current'));
        expect(storage.getItem(API_KEY_LEGACY_LS_KEY)).toBe('sk-legacy-raw');
        expect(migrator.getDecision()).toBe('migrated');
    });

    it('is idempotent when invoked again with no migratable data left', async () => {
        const { migrator, port } = createHarness({
            [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
        });

        await migrator.migrate();
        const before = port.saveCount;
        const outcome = await migrator.migrate();

        expect(outcome.apiKey).toEqual({ detected: false, migrated: false });
        expect(port.saveCount).toBe(before);
    });
});

describe('LocalStorageMigrator.decline + decision', () => {
    it('preserves source data and flips the flag on decline', () => {
        const { migrator, storage } = createHarness({
            [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
        });

        migrator.decline();

        expect(storage.getItem(API_KEY_PRIMARY_LS_KEY)).toBe(JSON.stringify('sk-current'));
        expect(migrator.getDecision()).toBe('declined');
    });

    it('returns null for the decision before any choice', () => {
        const { migrator } = createHarness();

        expect(migrator.getDecision()).toBeNull();
    });

    it('restores prompt eligibility after resetDecision', () => {
        const { migrator, storage } = createHarness();

        migrator.decline();
        expect(migrator.getDecision()).toBe('declined');

        migrator.resetDecision();
        expect(migrator.getDecision()).toBeNull();
        expect(storage.getItem(MIGRATION_DECISION_KEY)).toBeNull();
    });
});
