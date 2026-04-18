import { describe, expect, it } from 'vitest';
import {
    API_KEY_LEGACY_LS_KEY,
    API_KEY_PRIMARY_LS_KEY,
    MIGRATION_DECISION_KEY,
    createLocalStorageMigrator,
    type LocalStorageMigrator,
} from './LocalStorageMigrator';
import type { AutopilotSettingsPort } from '../autopilot/SQLiteAutopilotSettingsPort';
import {
    DEFAULT_AUTOPILOT_SETTINGS,
    LEGACY_AUTOPILOT_KEYS,
    sanitizeAutopilotSettings,
    type AutopilotSettings,
} from '../autopilot/AutopilotSettings';
import type { CredentialsPort } from '../credentials/SQLiteCredentialsPort';
import type { GenerateDraftPort } from '../generate-session/SQLiteGenerateDraftPort';
import type { GenerateLineageSourcePort } from '../generate-session/SQLiteGenerateLineageSourcePort';
import {
    DEFAULT_GENERATE_DRAFT,
    GENERATE_DRAFT_KEY,
    GENERATE_LINEAGE_SOURCE_KEY,
    LEGACY_DRAFT_KEYS,
    type GenerateDraft,
    type GenerateLineageSource,
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

class InMemoryAutopilotSettingsPort implements AutopilotSettingsPort {
    settings: AutopilotSettings | null = null;
    saveCount = 0;

    async init(): Promise<void> {}

    async load(): Promise<AutopilotSettings | null> {
        return this.settings;
    }

    async save(settings: AutopilotSettings): Promise<void> {
        this.settings = { ...settings };
        this.saveCount += 1;
    }

    async clear(): Promise<void> {
        this.settings = null;
    }
}

class FailingAutopilotSettingsPort implements AutopilotSettingsPort {
    async init(): Promise<void> {}
    async load(): Promise<AutopilotSettings | null> { return null; }
    async save(): Promise<void> { throw new Error('autopilot write failed'); }
    async clear(): Promise<void> {}
}

class InMemoryGenerateLineageSourcePort implements GenerateLineageSourcePort {
    source: GenerateLineageSource | null = null;
    saveCount = 0;

    async init(): Promise<void> {}

    async load(): Promise<GenerateLineageSource | null> {
        return this.source;
    }

    async save(source: GenerateLineageSource): Promise<void> {
        this.source = { archiveImageId: source.archiveImageId, stepId: source.stepId ?? null };
        this.saveCount += 1;
    }

    async clear(): Promise<void> {
        this.source = null;
    }
}

class FailingGenerateLineageSourcePort implements GenerateLineageSourcePort {
    async init(): Promise<void> {}
    async load(): Promise<GenerateLineageSource | null> { return null; }
    async save(): Promise<void> { throw new Error('lineage source write failed'); }
    async clear(): Promise<void> {}
}

interface Harness {
    migrator: LocalStorageMigrator;
    storage: MemoryStorage;
    credentialsPort: InMemoryCredentialsPort;
    draftPort: InMemoryGenerateDraftPort;
    autopilotPort: InMemoryAutopilotSettingsPort;
    lineageSourcePort: InMemoryGenerateLineageSourcePort;
}

function createHarness(
    seed: Record<string, string> = {},
    overrides: {
        credentialsPort?: CredentialsPort;
        generateDraftPort?: GenerateDraftPort;
        autopilotSettingsPort?: AutopilotSettingsPort;
        generateLineageSourcePort?: GenerateLineageSourcePort;
    } = {},
): Harness {
    const storage = new MemoryStorage();
    for (const [key, value] of Object.entries(seed)) {
        storage.setItem(key, value);
    }
    const credentialsPort = overrides.credentialsPort ?? new InMemoryCredentialsPort();
    const draftPort = overrides.generateDraftPort ?? new InMemoryGenerateDraftPort();
    const autopilotPort = overrides.autopilotSettingsPort ?? new InMemoryAutopilotSettingsPort();
    const lineageSourcePort = overrides.generateLineageSourcePort ?? new InMemoryGenerateLineageSourcePort();
    const migrator = createLocalStorageMigrator({
        credentialsPort,
        generateDraftPort: draftPort,
        autopilotSettingsPort: autopilotPort,
        generateLineageSourcePort: lineageSourcePort,
        localStorage: storage,
    });
    return {
        migrator,
        storage,
        credentialsPort: credentialsPort as InMemoryCredentialsPort,
        draftPort: draftPort as InMemoryGenerateDraftPort,
        autopilotPort: autopilotPort as InMemoryAutopilotSettingsPort,
        lineageSourcePort: lineageSourcePort as InMemoryGenerateLineageSourcePort,
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

function makeStoredAutopilot(overrides: Partial<AutopilotSettings> = {}): AutopilotSettings {
    return {
        ...DEFAULT_AUTOPILOT_SETTINGS,
        mode: 'autopilot',
        goal: 'stored goal',
        maxIterations: 5,
        satisfactionThreshold: 80,
        ...overrides,
    };
}

function makeStoredLineageSource(overrides: Partial<GenerateLineageSource> = {}): GenerateLineageSource {
    return {
        archiveImageId: 'stored-archive-image',
        stepId: 'stored-step',
        ...overrides,
    };
}

describe('LocalStorageMigrator.detect', () => {
    it('reports everything as absent when nothing is stored', () => {
        const { migrator } = createHarness();

        expect(migrator.detect()).toEqual({
            apiKey: { present: false },
            generateDraft: { present: false },
            autopilotSettings: { present: false },
            generateLineageSource: { present: false },
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

    it('detects autopilot settings when any of the four legacy keys is present', () => {
        const { migrator } = createHarness({
            [LEGACY_AUTOPILOT_KEYS.mode]: JSON.stringify('autopilot'),
        });

        expect(migrator.detect().autopilotSettings.present).toBe(true);
        expect(migrator.hasMigratableData()).toBe(true);
    });

    it('reports autopilot settings absent when no autopilot keys exist', () => {
        const { migrator } = createHarness({
            [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
        });

        expect(migrator.detect().autopilotSettings.present).toBe(false);
    });

    it('detects a lineage source stored under the lineage key', () => {
        const { migrator } = createHarness({
            [GENERATE_LINEAGE_SOURCE_KEY]: JSON.stringify(makeStoredLineageSource()),
        });

        expect(migrator.detect().generateLineageSource.present).toBe(true);
        expect(migrator.hasMigratableData()).toBe(true);
    });

    it('reports lineage source absent when the stored value is malformed', () => {
        const { migrator } = createHarness({
            [GENERATE_LINEAGE_SOURCE_KEY]: JSON.stringify({ stepId: 'orphan' }),
        });

        expect(migrator.detect().generateLineageSource.present).toBe(false);
    });

    it('reports lineage source absent when no lineage key exists', () => {
        const { migrator } = createHarness({
            [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
        });

        expect(migrator.detect().generateLineageSource.present).toBe(false);
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

describe('LocalStorageMigrator.migrate autopilot branch', () => {
    it('composes settings from all four autopilot keys, migrates them, and removes the source keys', async () => {
        const { migrator, storage, autopilotPort } = createHarness({
            [LEGACY_AUTOPILOT_KEYS.mode]: JSON.stringify('autopilot'),
            [LEGACY_AUTOPILOT_KEYS.goal]: JSON.stringify('a cozy scene'),
            [LEGACY_AUTOPILOT_KEYS.maxIterations]: JSON.stringify(7),
            [LEGACY_AUTOPILOT_KEYS.satisfactionThreshold]: JSON.stringify(75),
        });

        const outcome = await migrator.migrate();

        expect(outcome.autopilotSettings).toEqual({ detected: true, migrated: true });
        expect(autopilotPort.settings).toEqual({
            mode: 'autopilot',
            goal: 'a cozy scene',
            maxIterations: 7,
            satisfactionThreshold: 75,
        });
        for (const key of Object.values(LEGACY_AUTOPILOT_KEYS)) {
            expect(storage.getItem(key)).toBeNull();
        }
    });

    it('migrates a partial autopilot record, filling missing fields with defaults', async () => {
        const { migrator, autopilotPort } = createHarness({
            [LEGACY_AUTOPILOT_KEYS.goal]: JSON.stringify('only goal set'),
        });

        const outcome = await migrator.migrate();

        expect(outcome.autopilotSettings.migrated).toBe(true);
        expect(autopilotPort.settings).toEqual({
            ...DEFAULT_AUTOPILOT_SETTINGS,
            goal: 'only goal set',
        });
    });

    it('reports autopilot absence when no autopilot keys are present', async () => {
        const { migrator, autopilotPort } = createHarness();

        const outcome = await migrator.migrate();

        expect(outcome.autopilotSettings).toEqual({ detected: false, migrated: false });
        expect(autopilotPort.settings).toBeNull();
    });

    it('leaves autopilot source keys intact when the autopilot port write fails', async () => {
        const { migrator, storage } = createHarness(
            {
                [LEGACY_AUTOPILOT_KEYS.mode]: JSON.stringify('autopilot'),
                [LEGACY_AUTOPILOT_KEYS.goal]: JSON.stringify('unchanged goal'),
            },
            { autopilotSettingsPort: new FailingAutopilotSettingsPort() },
        );

        const outcome = await migrator.migrate();

        expect(outcome.autopilotSettings.migrated).toBe(false);
        expect(outcome.autopilotSettings.error?.message).toBe('autopilot write failed');
        expect(storage.getItem(LEGACY_AUTOPILOT_KEYS.mode)).toBe(JSON.stringify('autopilot'));
        expect(storage.getItem(LEGACY_AUTOPILOT_KEYS.goal)).toBe(JSON.stringify('unchanged goal'));
    });

    it('isolates autopilot failure from api key and draft success', async () => {
        const storedDraft = makeStoredDraft();
        const { migrator, storage, credentialsPort, draftPort } = createHarness(
            {
                [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
                [GENERATE_DRAFT_KEY]: JSON.stringify(storedDraft),
                [LEGACY_AUTOPILOT_KEYS.mode]: JSON.stringify('autopilot'),
            },
            { autopilotSettingsPort: new FailingAutopilotSettingsPort() },
        );

        const outcome = await migrator.migrate();

        expect(outcome.apiKey).toEqual({ detected: true, migrated: true });
        expect(outcome.generateDraft).toEqual({ detected: true, migrated: true });
        expect(outcome.autopilotSettings.migrated).toBe(false);
        expect(credentialsPort.apiKey).toBe('sk-current');
        expect(draftPort.draft).toEqual(storedDraft);
        expect(storage.getItem(LEGACY_AUTOPILOT_KEYS.mode)).toBe(JSON.stringify('autopilot'));
    });

    it('is idempotent — second migrate finds no autopilot data after success', async () => {
        const { migrator, autopilotPort } = createHarness({
            [LEGACY_AUTOPILOT_KEYS.mode]: JSON.stringify('autopilot'),
        });

        await migrator.migrate();
        const before = autopilotPort.saveCount;
        const outcome = await migrator.migrate();

        expect(outcome.autopilotSettings).toEqual({ detected: false, migrated: false });
        expect(autopilotPort.saveCount).toBe(before);
    });

    it('migrates all four domains together in a single pass', async () => {
        const storedDraft = makeStoredDraft();
        const storedAutopilot = makeStoredAutopilot();
        const storedLineageSource = makeStoredLineageSource();
        const { migrator, storage, credentialsPort, draftPort, autopilotPort, lineageSourcePort } = createHarness({
            [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
            [GENERATE_DRAFT_KEY]: JSON.stringify(storedDraft),
            [LEGACY_AUTOPILOT_KEYS.mode]: JSON.stringify(storedAutopilot.mode),
            [LEGACY_AUTOPILOT_KEYS.goal]: JSON.stringify(storedAutopilot.goal),
            [LEGACY_AUTOPILOT_KEYS.maxIterations]: JSON.stringify(storedAutopilot.maxIterations),
            [LEGACY_AUTOPILOT_KEYS.satisfactionThreshold]: JSON.stringify(storedAutopilot.satisfactionThreshold),
            [GENERATE_LINEAGE_SOURCE_KEY]: JSON.stringify(storedLineageSource),
        });

        const outcome = await migrator.migrate();

        expect(outcome.apiKey.migrated).toBe(true);
        expect(outcome.generateDraft.migrated).toBe(true);
        expect(outcome.autopilotSettings.migrated).toBe(true);
        expect(outcome.generateLineageSource.migrated).toBe(true);
        expect(credentialsPort.apiKey).toBe('sk-current');
        expect(draftPort.draft).toEqual(storedDraft);
        expect(autopilotPort.settings).toEqual(sanitizeAutopilotSettings(storedAutopilot));
        expect(lineageSourcePort.source).toEqual(storedLineageSource);
        expect(storage.getItem(API_KEY_PRIMARY_LS_KEY)).toBeNull();
        expect(storage.getItem(GENERATE_DRAFT_KEY)).toBeNull();
        expect(storage.getItem(GENERATE_LINEAGE_SOURCE_KEY)).toBeNull();
        for (const key of Object.values(LEGACY_AUTOPILOT_KEYS)) {
            expect(storage.getItem(key)).toBeNull();
        }
    });
});

describe('LocalStorageMigrator.migrate lineage source branch', () => {
    it('writes the stored lineage source through the port and removes the key on success', async () => {
        const stored = makeStoredLineageSource();
        const { migrator, storage, lineageSourcePort } = createHarness({
            [GENERATE_LINEAGE_SOURCE_KEY]: JSON.stringify(stored),
        });

        const outcome = await migrator.migrate();

        expect(outcome.generateLineageSource).toEqual({ detected: true, migrated: true });
        expect(lineageSourcePort.source).toEqual(stored);
        expect(storage.getItem(GENERATE_LINEAGE_SOURCE_KEY)).toBeNull();
    });

    it('migrates a lineage source with a null step id', async () => {
        const stored = makeStoredLineageSource({ stepId: null });
        const { migrator, lineageSourcePort } = createHarness({
            [GENERATE_LINEAGE_SOURCE_KEY]: JSON.stringify(stored),
        });

        const outcome = await migrator.migrate();

        expect(outcome.generateLineageSource.migrated).toBe(true);
        expect(lineageSourcePort.source).toEqual({ archiveImageId: 'stored-archive-image', stepId: null });
    });

    it('reports lineage source absence when no lineage key is present', async () => {
        const { migrator, lineageSourcePort } = createHarness();

        const outcome = await migrator.migrate();

        expect(outcome.generateLineageSource).toEqual({ detected: false, migrated: false });
        expect(lineageSourcePort.source).toBeNull();
    });

    it('leaves the lineage key intact when the port write fails', async () => {
        const stored = makeStoredLineageSource();
        const { migrator, storage } = createHarness(
            {
                [GENERATE_LINEAGE_SOURCE_KEY]: JSON.stringify(stored),
            },
            { generateLineageSourcePort: new FailingGenerateLineageSourcePort() },
        );

        const outcome = await migrator.migrate();

        expect(outcome.generateLineageSource.migrated).toBe(false);
        expect(outcome.generateLineageSource.error?.message).toBe('lineage source write failed');
        expect(storage.getItem(GENERATE_LINEAGE_SOURCE_KEY)).toBe(JSON.stringify(stored));
    });

    it('isolates lineage source failure from api key and draft success', async () => {
        const storedDraft = makeStoredDraft();
        const storedLineageSource = makeStoredLineageSource();
        const { migrator, storage, credentialsPort, draftPort } = createHarness(
            {
                [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
                [GENERATE_DRAFT_KEY]: JSON.stringify(storedDraft),
                [GENERATE_LINEAGE_SOURCE_KEY]: JSON.stringify(storedLineageSource),
            },
            { generateLineageSourcePort: new FailingGenerateLineageSourcePort() },
        );

        const outcome = await migrator.migrate();

        expect(outcome.apiKey).toEqual({ detected: true, migrated: true });
        expect(outcome.generateDraft).toEqual({ detected: true, migrated: true });
        expect(outcome.generateLineageSource.migrated).toBe(false);
        expect(credentialsPort.apiKey).toBe('sk-current');
        expect(draftPort.draft).toEqual(storedDraft);
        expect(storage.getItem(API_KEY_PRIMARY_LS_KEY)).toBeNull();
        expect(storage.getItem(GENERATE_DRAFT_KEY)).toBeNull();
        expect(storage.getItem(GENERATE_LINEAGE_SOURCE_KEY)).toBe(JSON.stringify(storedLineageSource));
    });

    it('is idempotent — second migrate finds no lineage data after success', async () => {
        const { migrator, lineageSourcePort } = createHarness({
            [GENERATE_LINEAGE_SOURCE_KEY]: JSON.stringify(makeStoredLineageSource()),
        });

        await migrator.migrate();
        const before = lineageSourcePort.saveCount;
        const outcome = await migrator.migrate();

        expect(outcome.generateLineageSource).toEqual({ detected: false, migrated: false });
        expect(lineageSourcePort.saveCount).toBe(before);
    });
});

describe('LocalStorageMigrator.decline + decision', () => {
    it('preserves source data and flips the flag on decline', () => {
        const stored = makeStoredLineageSource();
        const { migrator, storage } = createHarness({
            [API_KEY_PRIMARY_LS_KEY]: JSON.stringify('sk-current'),
            [GENERATE_DRAFT_KEY]: JSON.stringify(makeStoredDraft()),
            [LEGACY_AUTOPILOT_KEYS.mode]: JSON.stringify('autopilot'),
            [GENERATE_LINEAGE_SOURCE_KEY]: JSON.stringify(stored),
        });

        migrator.decline();

        expect(storage.getItem(API_KEY_PRIMARY_LS_KEY)).toBe(JSON.stringify('sk-current'));
        expect(storage.getItem(GENERATE_DRAFT_KEY)).not.toBeNull();
        expect(storage.getItem(LEGACY_AUTOPILOT_KEYS.mode)).toBe(JSON.stringify('autopilot'));
        expect(storage.getItem(GENERATE_LINEAGE_SOURCE_KEY)).toBe(JSON.stringify(stored));
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
