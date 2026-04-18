import { describe, expect, it } from 'vitest';
import {
    API_KEY_LEGACY_LS_KEY,
    API_KEY_PRIMARY_LS_KEY,
    MIGRATION_DECISION_KEY,
    createLocalStorageMigrator,
    type LocalStorageMigrator,
} from './LocalStorageMigrator';
import type { CredentialsPort } from '../credentials/SQLiteCredentialsPort';
import type { GenerateDraftPort } from '../generate-session/SQLiteGenerateDraftPort';
import {
    DEFAULT_GENERATE_DRAFT,
    GENERATE_DRAFT_KEY,
    LEGACY_DRAFT_KEYS,
    type GenerateDraft,
} from '../generate-session/GenerateSession';

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

class InMemoryGenerateDraftPort implements GenerateDraftPort {
    draft: GenerateDraft | null = null;
    saveCount = 0;

    async init(): Promise<void> {}

    async load(): Promise<GenerateDraft | null> {
        return this.draft;
    }

    async save(draft: GenerateDraft): Promise<void> {
        this.draft = { ...draft };
        this.saveCount += 1;
    }

    async clear(): Promise<void> {
        this.draft = null;
    }
}

class FailingGenerateDraftPort implements GenerateDraftPort {
    async init(): Promise<void> {}
    async load(): Promise<GenerateDraft | null> { return null; }
    async save(): Promise<void> { throw new Error('draft write failed'); }
    async clear(): Promise<void> {}
}

interface Harness {
    migrator: LocalStorageMigrator;
    storage: MemoryStorage;
    credentialsPort: InMemoryCredentialsPort;
    draftPort: InMemoryGenerateDraftPort;
}

function createHarness(
    seed: Record<string, string> = {},
    overrides: {
        credentialsPort?: CredentialsPort;
        generateDraftPort?: GenerateDraftPort;
    } = {},
): Harness {
    const storage = new MemoryStorage();
    for (const [key, value] of Object.entries(seed)) {
        storage.setItem(key, value);
    }
    const credentialsPort = overrides.credentialsPort ?? new InMemoryCredentialsPort();
    const draftPort = overrides.generateDraftPort ?? new InMemoryGenerateDraftPort();
    const migrator = createLocalStorageMigrator({
        credentialsPort,
        generateDraftPort: draftPort,
        localStorage: storage,
    });
    return {
        migrator,
        storage,
        credentialsPort: credentialsPort as InMemoryCredentialsPort,
        draftPort: draftPort as InMemoryGenerateDraftPort,
    };
}

function makeStoredDraft(overrides: Partial<GenerateDraft> = {}): GenerateDraft {
    return {
        ...DEFAULT_GENERATE_DRAFT,
        prompt: 'stored prompt',
        quality: 'high',
        ...overrides,
    };
}

describe('LocalStorageMigrator.detect', () => {
    it('reports everything as absent when nothing is stored', () => {
        const { migrator } = createHarness();

        expect(migrator.detect()).toEqual({
            apiKey: { present: false },
            generateDraft: { present: false },
        });
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

    it('detects a draft stored under the current key', () => {
        const { migrator } = createHarness({
            [GENERATE_DRAFT_KEY]: JSON.stringify(makeStoredDraft()),
        });

        expect(migrator.detect().generateDraft.present).toBe(true);
        expect(migrator.hasMigratableData()).toBe(true);
    });

    it('detects a draft assembled from any legacy per-field key', () => {
        const { migrator } = createHarness({
            [LEGACY_DRAFT_KEYS.prompt]: JSON.stringify('legacy prompt'),
        });

        expect(migrator.detect().generateDraft.present).toBe(true);
    });

    it('does not confuse unrelated keys as draft presence', () => {
        const { migrator } = createHarness({
            aura_current_view: JSON.stringify('archive'),
        });

        expect(migrator.detect().generateDraft.present).toBe(false);
    });
});

describe('LocalStorageMigrator.migrate api key branch', () => {
    it('writes the current api key through the port and removes both source keys on success', async () => {
        const { migrator, storage, credentialsPort } = createHarness({
            [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
            [API_KEY_LEGACY_LS_KEY]: 'sk-legacy-raw',
        });

        const outcome = await migrator.migrate();

        expect(outcome.apiKey).toEqual({ detected: true, migrated: true });
        expect(credentialsPort.apiKey).toBe('sk-current');
        expect(storage.getItem(API_KEY_PRIMARY_LS_KEY)).toBeNull();
        expect(storage.getItem(API_KEY_LEGACY_LS_KEY)).toBeNull();
        expect(migrator.getDecision()).toBe('migrated');
    });

    it('migrates the legacy api key when the current key is missing', async () => {
        const { migrator, storage, credentialsPort } = createHarness({
            [API_KEY_LEGACY_LS_KEY]: 'sk-legacy-raw',
        });

        await migrator.migrate();

        expect(credentialsPort.apiKey).toBe('sk-legacy-raw');
        expect(storage.getItem(API_KEY_LEGACY_LS_KEY)).toBeNull();
    });

    it('flips the decision to migrated even when no data was present', async () => {
        const { migrator, credentialsPort } = createHarness();

        const outcome = await migrator.migrate();

        expect(outcome.apiKey).toEqual({ detected: false, migrated: false });
        expect(outcome.generateDraft).toEqual({ detected: false, migrated: false });
        expect(credentialsPort.apiKey).toBeNull();
        expect(migrator.getDecision()).toBe('migrated');
    });

    it('leaves the source keys intact when the api key port write fails', async () => {
        const { migrator, storage } = createHarness(
            {
                [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
                [API_KEY_LEGACY_LS_KEY]: 'sk-legacy-raw',
            },
            { credentialsPort: new FailingCredentialsPort() },
        );

        const outcome = await migrator.migrate();

        expect(outcome.apiKey.migrated).toBe(false);
        expect(outcome.apiKey.error?.message).toBe('write failed');
        expect(storage.getItem(API_KEY_PRIMARY_LS_KEY)).toBe(JSON.stringify('sk-current'));
        expect(storage.getItem(API_KEY_LEGACY_LS_KEY)).toBe('sk-legacy-raw');
        expect(migrator.getDecision()).toBe('migrated');
    });

    it('is idempotent when invoked again with no migratable data left', async () => {
        const { migrator, credentialsPort } = createHarness({
            [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
        });

        await migrator.migrate();
        const before = credentialsPort.saveCount;
        const outcome = await migrator.migrate();

        expect(outcome.apiKey).toEqual({ detected: false, migrated: false });
        expect(credentialsPort.saveCount).toBe(before);
    });
});

describe('LocalStorageMigrator.migrate draft branch', () => {
    it('writes the current draft through the port and removes the current key and all legacy keys on success', async () => {
        const storedDraft = makeStoredDraft({ prompt: 'current draft prompt' });
        const { migrator, storage, draftPort } = createHarness({
            [GENERATE_DRAFT_KEY]: JSON.stringify(storedDraft),
            [LEGACY_DRAFT_KEYS.prompt]: JSON.stringify('stale'),
        });

        const outcome = await migrator.migrate();

        expect(outcome.generateDraft).toEqual({ detected: true, migrated: true });
        expect(draftPort.draft).toEqual(storedDraft);
        expect(storage.getItem(GENERATE_DRAFT_KEY)).toBeNull();
        expect(storage.getItem(LEGACY_DRAFT_KEYS.prompt)).toBeNull();
    });

    it('composes a draft from the 8 legacy per-field keys when the current key is missing', async () => {
        const { migrator, storage, draftPort } = createHarness({
            [LEGACY_DRAFT_KEYS.prompt]: JSON.stringify('legacy prompt'),
            [LEGACY_DRAFT_KEYS.quality]: JSON.stringify('low'),
            [LEGACY_DRAFT_KEYS.aspectRatio]: JSON.stringify('1536x1024'),
            [LEGACY_DRAFT_KEYS.background]: JSON.stringify('opaque'),
            [LEGACY_DRAFT_KEYS.style]: JSON.stringify('oil painting on linen'),
            [LEGACY_DRAFT_KEYS.lighting]: JSON.stringify('candlelight with deep shadows'),
            [LEGACY_DRAFT_KEYS.palette]: JSON.stringify('emerald + burgundy + gold'),
            [LEGACY_DRAFT_KEYS.isSaved]: JSON.stringify(true),
        });

        const outcome = await migrator.migrate();

        expect(outcome.generateDraft.migrated).toBe(true);
        expect(draftPort.draft).toEqual({
            prompt: 'legacy prompt',
            quality: 'low',
            aspectRatio: '1536x1024',
            background: 'opaque',
            style: 'oil painting on linen',
            lighting: 'candlelight with deep shadows',
            palette: 'emerald + burgundy + gold',
            isSaved: true,
        });
        for (const key of Object.values(LEGACY_DRAFT_KEYS)) {
            expect(storage.getItem(key)).toBeNull();
        }
    });

    it('prefers the current key over any legacy fields', async () => {
        const current = makeStoredDraft({ prompt: 'from current key' });
        const { migrator, storage, draftPort } = createHarness({
            [GENERATE_DRAFT_KEY]: JSON.stringify(current),
            [LEGACY_DRAFT_KEYS.prompt]: JSON.stringify('from legacy key'),
        });

        await migrator.migrate();

        expect(draftPort.draft?.prompt).toBe('from current key');
        expect(storage.getItem(LEGACY_DRAFT_KEYS.prompt)).toBeNull();
    });

    it('reports absence when no draft keys are present', async () => {
        const { migrator, draftPort } = createHarness();

        const outcome = await migrator.migrate();

        expect(outcome.generateDraft).toEqual({ detected: false, migrated: false });
        expect(draftPort.draft).toBeNull();
    });

    it('leaves draft source keys intact when the draft port write fails', async () => {
        const storedDraft = makeStoredDraft();
        const { migrator, storage } = createHarness(
            {
                [GENERATE_DRAFT_KEY]: JSON.stringify(storedDraft),
            },
            { generateDraftPort: new FailingGenerateDraftPort() },
        );

        const outcome = await migrator.migrate();

        expect(outcome.generateDraft.migrated).toBe(false);
        expect(outcome.generateDraft.error?.message).toBe('draft write failed');
        expect(storage.getItem(GENERATE_DRAFT_KEY)).toBe(JSON.stringify(storedDraft));
    });

    it('isolates api key success from draft port failure', async () => {
        const storedDraft = makeStoredDraft();
        const { migrator, storage, credentialsPort } = createHarness(
            {
                [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
                [GENERATE_DRAFT_KEY]: JSON.stringify(storedDraft),
            },
            { generateDraftPort: new FailingGenerateDraftPort() },
        );

        const outcome = await migrator.migrate();

        expect(outcome.apiKey).toEqual({ detected: true, migrated: true });
        expect(outcome.generateDraft.migrated).toBe(false);
        expect(credentialsPort.apiKey).toBe('sk-current');
        expect(storage.getItem(API_KEY_PRIMARY_LS_KEY)).toBeNull();
        expect(storage.getItem(GENERATE_DRAFT_KEY)).toBe(JSON.stringify(storedDraft));
    });
});

describe('LocalStorageMigrator.decline + decision', () => {
    it('preserves source data and flips the flag on decline', () => {
        const { migrator, storage } = createHarness({
            [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
            [GENERATE_DRAFT_KEY]: JSON.stringify(makeStoredDraft()),
        });

        migrator.decline();

        expect(storage.getItem(API_KEY_PRIMARY_LS_KEY)).toBe(JSON.stringify('sk-current'));
        expect(storage.getItem(GENERATE_DRAFT_KEY)).not.toBeNull();
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
