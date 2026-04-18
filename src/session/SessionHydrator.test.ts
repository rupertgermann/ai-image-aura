import { describe, expect, it, vi } from 'vitest';
import { createSessionHydrator, type SessionHydratorDeps } from './SessionHydrator';
import type { CredentialsPort } from '../credentials/SQLiteCredentialsPort';
import type { GenerateDraftPort } from '../generate-session/SQLiteGenerateDraftPort';
import type { GenerateLineageSourcePort } from '../generate-session/SQLiteGenerateLineageSourcePort';
import type { AutopilotSettingsPort } from '../autopilot/SQLiteAutopilotSettingsPort';
import {
    DEFAULT_AUTOPILOT_SETTINGS,
    type AutopilotSettings,
} from '../autopilot/AutopilotSettings';
import {
    DEFAULT_GENERATE_DRAFT,
    type GenerateDraft,
    type GenerateLineageSource,
} from '../generate-session/GenerateSession';

class InMemoryCredentialsPort implements CredentialsPort {
    apiKey: string | null;
    saveCalls: string[] = [];
    clearCalls = 0;

    constructor(initial: string | null = null) {
        this.apiKey = initial;
    }

    async init(): Promise<void> {}

    async load(): Promise<string | null> {
        return this.apiKey;
    }

    async save(apiKey: string): Promise<void> {
        this.saveCalls.push(apiKey);
        this.apiKey = apiKey;
    }

    async clear(): Promise<void> {
        this.clearCalls += 1;
        this.apiKey = null;
    }
}

class FlakyCredentialsPort implements CredentialsPort {
    private shouldFail: 'save' | 'clear' | 'load' | null;

    constructor(failOn: 'save' | 'clear' | 'load' | null = null) {
        this.shouldFail = failOn;
    }

    async init(): Promise<void> {}

    async load(): Promise<string | null> {
        if (this.shouldFail === 'load') throw new Error('load failed');
        return null;
    }

    async save(): Promise<void> {
        if (this.shouldFail === 'save') throw new Error('save failed');
    }

    async clear(): Promise<void> {
        if (this.shouldFail === 'clear') throw new Error('clear failed');
    }
}

class InMemoryGenerateDraftPort implements GenerateDraftPort {
    draft: GenerateDraft | null;
    saveCalls: GenerateDraft[] = [];
    clearCalls = 0;

    constructor(initial: GenerateDraft | null = null) {
        this.draft = initial;
    }

    async init(): Promise<void> {}

    async load(): Promise<GenerateDraft | null> {
        return this.draft;
    }

    async save(draft: GenerateDraft): Promise<void> {
        this.saveCalls.push(draft);
        this.draft = draft;
    }

    async clear(): Promise<void> {
        this.clearCalls += 1;
        this.draft = null;
    }
}

class FlakyGenerateDraftPort implements GenerateDraftPort {
    private shouldFail: 'save' | 'load' | 'clear' | null;

    constructor(failOn: 'save' | 'load' | 'clear' | null = null) {
        this.shouldFail = failOn;
    }

    async init(): Promise<void> {}

    async load(): Promise<GenerateDraft | null> {
        if (this.shouldFail === 'load') throw new Error('load draft failed');
        return null;
    }

    async save(): Promise<void> {
        if (this.shouldFail === 'save') throw new Error('save draft failed');
    }

    async clear(): Promise<void> {
        if (this.shouldFail === 'clear') throw new Error('clear draft failed');
    }
}

class InMemoryAutopilotSettingsPort implements AutopilotSettingsPort {
    settings: AutopilotSettings | null;
    saveCalls: AutopilotSettings[] = [];
    clearCalls = 0;

    constructor(initial: AutopilotSettings | null = null) {
        this.settings = initial;
    }

    async init(): Promise<void> {}

    async load(): Promise<AutopilotSettings | null> {
        return this.settings;
    }

    async save(settings: AutopilotSettings): Promise<void> {
        this.saveCalls.push(settings);
        this.settings = settings;
    }

    async clear(): Promise<void> {
        this.clearCalls += 1;
        this.settings = null;
    }
}

class FlakyAutopilotSettingsPort implements AutopilotSettingsPort {
    private shouldFail: 'save' | 'load' | 'clear' | null;

    constructor(failOn: 'save' | 'load' | 'clear' | null = null) {
        this.shouldFail = failOn;
    }

    async init(): Promise<void> {}

    async load(): Promise<AutopilotSettings | null> {
        if (this.shouldFail === 'load') throw new Error('load autopilot failed');
        return null;
    }

    async save(): Promise<void> {
        if (this.shouldFail === 'save') throw new Error('save autopilot failed');
    }

    async clear(): Promise<void> {
        if (this.shouldFail === 'clear') throw new Error('clear autopilot failed');
    }
}

class InMemoryGenerateLineageSourcePort implements GenerateLineageSourcePort {
    source: GenerateLineageSource | null;
    saveCalls: GenerateLineageSource[] = [];
    clearCalls = 0;

    constructor(initial: GenerateLineageSource | null = null) {
        this.source = initial;
    }

    async init(): Promise<void> {}

    async load(): Promise<GenerateLineageSource | null> {
        return this.source;
    }

    async save(source: GenerateLineageSource): Promise<void> {
        this.saveCalls.push(source);
        this.source = source;
    }

    async clear(): Promise<void> {
        this.clearCalls += 1;
        this.source = null;
    }
}

class FlakyGenerateLineageSourcePort implements GenerateLineageSourcePort {
    private shouldFail: 'save' | 'load' | 'clear' | null;

    constructor(failOn: 'save' | 'load' | 'clear' | null = null) {
        this.shouldFail = failOn;
    }

    async init(): Promise<void> {}

    async load(): Promise<GenerateLineageSource | null> {
        if (this.shouldFail === 'load') throw new Error('load lineage source failed');
        return null;
    }

    async save(): Promise<void> {
        if (this.shouldFail === 'save') throw new Error('save lineage source failed');
    }

    async clear(): Promise<void> {
        if (this.shouldFail === 'clear') throw new Error('clear lineage source failed');
    }
}

function makeHydrator(deps: Partial<SessionHydratorDeps> = {}) {
    return createSessionHydrator({
        credentialsPort: deps.credentialsPort ?? new InMemoryCredentialsPort(),
        generateDraftPort: deps.generateDraftPort ?? new InMemoryGenerateDraftPort(),
        autopilotSettingsPort: deps.autopilotSettingsPort ?? new InMemoryAutopilotSettingsPort(),
        generateLineageSourcePort: deps.generateLineageSourcePort ?? new InMemoryGenerateLineageSourcePort(),
        bootstrap: deps.bootstrap,
    });
}

function makeDraft(overrides: Partial<GenerateDraft> = {}): GenerateDraft {
    return {
        prompt: 'a koi pond at dusk',
        quality: 'high',
        aspectRatio: '1024x1024',
        background: 'auto',
        style: 'risograph poster',
        lighting: 'golden hour',
        palette: 'copper + teal + cream',
        isSaved: false,
        ...overrides,
    };
}

function makeAutopilotSettings(overrides: Partial<AutopilotSettings> = {}): AutopilotSettings {
    return {
        mode: 'autopilot',
        goal: 'A rainy Tokyo street at night',
        maxIterations: 6,
        satisfactionThreshold: 85,
        ...overrides,
    };
}

describe('SessionHydrator.hydrate', () => {
    it('hydrates an empty store to defaults', async () => {
        const hydrator = makeHydrator({
            credentialsPort: new InMemoryCredentialsPort(null),
            generateDraftPort: new InMemoryGenerateDraftPort(null),
            autopilotSettingsPort: new InMemoryAutopilotSettingsPort(null),
            generateLineageSourcePort: new InMemoryGenerateLineageSourcePort(null),
        });

        await hydrator.hydrate();

        expect(hydrator.getState()).toEqual({
            snapshot: {
                apiKey: '',
                generateDraft: DEFAULT_GENERATE_DRAFT,
                autopilotSettings: DEFAULT_AUTOPILOT_SETTINGS,
                generateLineageSource: null,
            },
            isHydrated: true,
            lastError: null,
        });
    });

    it('hydrates a populated store with the persisted api key and draft', async () => {
        const storedDraft = makeDraft({ prompt: 'stored prompt' });
        const hydrator = makeHydrator({
            credentialsPort: new InMemoryCredentialsPort('sk-stored'),
            generateDraftPort: new InMemoryGenerateDraftPort(storedDraft),
        });

        await hydrator.hydrate();

        expect(hydrator.getState().snapshot.apiKey).toBe('sk-stored');
        expect(hydrator.getState().snapshot.generateDraft).toEqual(storedDraft);
        expect(hydrator.getState().isHydrated).toBe(true);
    });

    it('hydrates persisted autopilot settings alongside other domains', async () => {
        const storedSettings = makeAutopilotSettings({ goal: 'stored goal' });
        const hydrator = makeHydrator({
            autopilotSettingsPort: new InMemoryAutopilotSettingsPort(storedSettings),
        });

        await hydrator.hydrate();

        expect(hydrator.getState().snapshot.autopilotSettings).toEqual(storedSettings);
        expect(hydrator.getAutopilotSettings()).toEqual(storedSettings);
    });

    it('falls back to default autopilot settings when the port returns null', async () => {
        const hydrator = makeHydrator({
            autopilotSettingsPort: new InMemoryAutopilotSettingsPort(null),
        });

        await hydrator.hydrate();

        expect(hydrator.getState().snapshot.autopilotSettings).toEqual(DEFAULT_AUTOPILOT_SETTINGS);
    });

    it('loads api key and draft in parallel', async () => {
        const order: string[] = [];
        const credentialsPort = new InMemoryCredentialsPort('sk-stored');
        const draftPort = new InMemoryGenerateDraftPort(makeDraft());

        credentialsPort.load = async () => {
            order.push('apiKey-start');
            await new Promise((resolve) => setTimeout(resolve, 10));
            order.push('apiKey-end');
            return 'sk-stored';
        };
        draftPort.load = async () => {
            order.push('draft-start');
            return makeDraft();
        };

        const hydrator = makeHydrator({ credentialsPort, generateDraftPort: draftPort });
        await hydrator.hydrate();

        expect(order[0]).toBe('apiKey-start');
        expect(order[1]).toBe('draft-start');
    });

    it('awaits the bootstrap step before loading from the ports', async () => {
        const order: string[] = [];
        const port = new InMemoryCredentialsPort('sk-stored');
        const originalLoad = port.load.bind(port);
        port.load = async () => {
            order.push('load');
            return originalLoad();
        };
        const bootstrap = vi.fn(async () => {
            order.push('bootstrap');
        });

        const hydrator = makeHydrator({ credentialsPort: port, bootstrap });
        await hydrator.hydrate();

        expect(order[0]).toBe('bootstrap');
        expect(order).toContain('load');
    });

    it('records a load error and stays hydrated when the credentials port fails', async () => {
        const hydrator = makeHydrator({ credentialsPort: new FlakyCredentialsPort('load') });

        await hydrator.hydrate();

        const state = hydrator.getState();
        expect(state.isHydrated).toBe(true);
        expect(state.lastError?.domain).toBe('apiKey');
        expect(state.lastError?.operation).toBe('load');
        expect(state.snapshot.apiKey).toBe('');
    });

    it('records a load error and stays hydrated when the draft port fails', async () => {
        const hydrator = makeHydrator({ generateDraftPort: new FlakyGenerateDraftPort('load') });

        await hydrator.hydrate();

        const state = hydrator.getState();
        expect(state.isHydrated).toBe(true);
        expect(state.lastError?.domain).toBe('generateDraft');
        expect(state.lastError?.operation).toBe('load');
        expect(state.snapshot.generateDraft).toEqual(DEFAULT_GENERATE_DRAFT);
    });

    it('records a load error and stays hydrated when the autopilot port fails', async () => {
        const hydrator = makeHydrator({
            autopilotSettingsPort: new FlakyAutopilotSettingsPort('load'),
        });

        await hydrator.hydrate();

        const state = hydrator.getState();
        expect(state.isHydrated).toBe(true);
        expect(state.lastError?.domain).toBe('autopilotSettings');
        expect(state.lastError?.operation).toBe('load');
        expect(state.snapshot.autopilotSettings).toEqual(DEFAULT_AUTOPILOT_SETTINGS);
    });

    it('hydrates a persisted lineage source alongside other domains', async () => {
        const stored: GenerateLineageSource = { archiveImageId: 'archive-1', stepId: 'step-1' };
        const hydrator = makeHydrator({
            generateLineageSourcePort: new InMemoryGenerateLineageSourcePort(stored),
        });

        await hydrator.hydrate();

        expect(hydrator.getState().snapshot.generateLineageSource).toEqual(stored);
        expect(hydrator.getGenerateLineageSource()).toEqual(stored);
    });

    it('falls back to null lineage source when the port returns null', async () => {
        const hydrator = makeHydrator({
            generateLineageSourcePort: new InMemoryGenerateLineageSourcePort(null),
        });

        await hydrator.hydrate();

        expect(hydrator.getState().snapshot.generateLineageSource).toBeNull();
    });

    it('records a load error and stays hydrated when the lineage source port fails', async () => {
        const hydrator = makeHydrator({
            generateLineageSourcePort: new FlakyGenerateLineageSourcePort('load'),
        });

        await hydrator.hydrate();

        const state = hydrator.getState();
        expect(state.isHydrated).toBe(true);
        expect(state.lastError?.domain).toBe('generateLineageSource');
        expect(state.lastError?.operation).toBe('load');
        expect(state.snapshot.generateLineageSource).toBeNull();
    });

    it('only runs hydration once across concurrent calls', async () => {
        const port = new InMemoryCredentialsPort('sk-stored');
        const loadSpy = vi.spyOn(port, 'load');
        const hydrator = makeHydrator({ credentialsPort: port });

        await Promise.all([hydrator.hydrate(), hydrator.hydrate(), hydrator.hydrate()]);

        expect(loadSpy).toHaveBeenCalledTimes(1);
    });
});

describe('SessionHydrator.setApiKey', () => {
    it('updates the snapshot optimistically before the port settles', async () => {
        let resolveSave: (() => void) | null = null;
        const port = new InMemoryCredentialsPort();
        port.save = vi.fn(async (value: string) => {
            await new Promise<void>((resolve) => {
                resolveSave = resolve;
            });
            port.apiKey = value;
        });

        const hydrator = makeHydrator({ credentialsPort: port });
        await hydrator.hydrate();

        const writePromise = hydrator.setApiKey('sk-new');

        expect(hydrator.getState().snapshot.apiKey).toBe('sk-new');

        resolveSave!();
        await writePromise;

        expect(port.save).toHaveBeenCalledWith('sk-new');
    });

    it('routes empty values through clear()', async () => {
        const port = new InMemoryCredentialsPort('sk-stored');
        const hydrator = makeHydrator({ credentialsPort: port });
        await hydrator.hydrate();

        await hydrator.setApiKey('');

        expect(hydrator.getState().snapshot.apiKey).toBe('');
        expect(port.clearCalls).toBe(1);
    });

    it('records a save error without corrupting the optimistic snapshot', async () => {
        const port = new FlakyCredentialsPort('save');
        const hydrator = makeHydrator({ credentialsPort: port });
        await hydrator.hydrate();

        await hydrator.setApiKey('sk-new');

        const state = hydrator.getState();
        expect(state.snapshot.apiKey).toBe('sk-new');
        expect(state.lastError?.operation).toBe('save');
        expect(state.lastError?.cause.message).toBe('save failed');
    });

    it('records a clear error without corrupting the optimistic snapshot', async () => {
        const port = new FlakyCredentialsPort('clear');
        const hydrator = makeHydrator({ credentialsPort: port });
        await hydrator.hydrate();

        await hydrator.setApiKey('');

        const state = hydrator.getState();
        expect(state.snapshot.apiKey).toBe('');
        expect(state.lastError?.operation).toBe('clear');
    });

    it('notifies subscribers on each state change', async () => {
        const port = new InMemoryCredentialsPort('sk-initial');
        const hydrator = makeHydrator({ credentialsPort: port });

        const listener = vi.fn();
        hydrator.subscribe(listener);

        await hydrator.hydrate();
        expect(listener).toHaveBeenCalled();

        const callsAfterHydrate = listener.mock.calls.length;
        await hydrator.setApiKey('sk-next');
        expect(listener.mock.calls.length).toBeGreaterThan(callsAfterHydrate);
    });

    it('stops notifying after unsubscribe', async () => {
        const port = new InMemoryCredentialsPort();
        const hydrator = makeHydrator({ credentialsPort: port });

        const listener = vi.fn();
        const unsubscribe = hydrator.subscribe(listener);

        await hydrator.hydrate();
        unsubscribe();
        const callCount = listener.mock.calls.length;

        await hydrator.setApiKey('sk-next');

        expect(listener.mock.calls.length).toBe(callCount);
    });
});

describe('SessionHydrator.setGenerateDraft', () => {
    it('updates the snapshot optimistically before the port settles', async () => {
        let resolveSave: (() => void) | null = null;
        const port = new InMemoryGenerateDraftPort();
        port.save = vi.fn(async (draft: GenerateDraft) => {
            await new Promise<void>((resolve) => {
                resolveSave = resolve;
            });
            port.draft = draft;
        });

        const hydrator = makeHydrator({ generateDraftPort: port });
        await hydrator.hydrate();

        const next = makeDraft({ prompt: 'new prompt' });
        const writePromise = hydrator.setGenerateDraft(next);

        expect(hydrator.getState().snapshot.generateDraft).toEqual(next);

        resolveSave!();
        await writePromise;

        expect(port.save).toHaveBeenCalledWith(next);
    });

    it('records a save error without corrupting the optimistic snapshot', async () => {
        const port = new FlakyGenerateDraftPort('save');
        const hydrator = makeHydrator({ generateDraftPort: port });
        await hydrator.hydrate();

        const next = makeDraft({ prompt: 'new prompt' });
        await hydrator.setGenerateDraft(next);

        const state = hydrator.getState();
        expect(state.snapshot.generateDraft).toEqual(next);
        expect(state.lastError?.domain).toBe('generateDraft');
        expect(state.lastError?.operation).toBe('save');
        expect(state.lastError?.cause.message).toBe('save draft failed');
    });

    it('notifies subscribers on draft changes', async () => {
        const port = new InMemoryGenerateDraftPort();
        const hydrator = makeHydrator({ generateDraftPort: port });

        const listener = vi.fn();
        hydrator.subscribe(listener);

        await hydrator.hydrate();
        const callsAfterHydrate = listener.mock.calls.length;

        await hydrator.setGenerateDraft(makeDraft({ prompt: 'next' }));

        expect(listener.mock.calls.length).toBeGreaterThan(callsAfterHydrate);
    });

    it('reflects the persisted draft via getDraft()', async () => {
        const stored = makeDraft({ prompt: 'stored' });
        const hydrator = makeHydrator({ generateDraftPort: new InMemoryGenerateDraftPort(stored) });
        await hydrator.hydrate();

        expect(hydrator.getDraft()).toEqual(stored);
    });
});

describe('SessionHydrator.setAutopilotSettings', () => {
    it('updates the snapshot optimistically before the port settles', async () => {
        let resolveSave: (() => void) | null = null;
        const port = new InMemoryAutopilotSettingsPort();
        port.save = vi.fn(async (settings: AutopilotSettings) => {
            await new Promise<void>((resolve) => {
                resolveSave = resolve;
            });
            port.settings = settings;
        });

        const hydrator = makeHydrator({ autopilotSettingsPort: port });
        await hydrator.hydrate();

        const next = makeAutopilotSettings({ goal: 'new goal' });
        const writePromise = hydrator.setAutopilotSettings(next);

        expect(hydrator.getState().snapshot.autopilotSettings).toEqual(next);

        resolveSave!();
        await writePromise;

        expect(port.save).toHaveBeenCalledWith(next);
    });

    it('records a save error without corrupting the optimistic snapshot', async () => {
        const port = new FlakyAutopilotSettingsPort('save');
        const hydrator = makeHydrator({ autopilotSettingsPort: port });
        await hydrator.hydrate();

        const next = makeAutopilotSettings({ goal: 'new goal' });
        await hydrator.setAutopilotSettings(next);

        const state = hydrator.getState();
        expect(state.snapshot.autopilotSettings).toEqual(next);
        expect(state.lastError?.domain).toBe('autopilotSettings');
        expect(state.lastError?.operation).toBe('save');
        expect(state.lastError?.cause.message).toBe('save autopilot failed');
    });

    it('notifies subscribers on autopilot setting changes', async () => {
        const port = new InMemoryAutopilotSettingsPort();
        const hydrator = makeHydrator({ autopilotSettingsPort: port });

        const listener = vi.fn();
        hydrator.subscribe(listener);

        await hydrator.hydrate();
        const callsAfterHydrate = listener.mock.calls.length;

        await hydrator.setAutopilotSettings(makeAutopilotSettings({ goal: 'next' }));

        expect(listener.mock.calls.length).toBeGreaterThan(callsAfterHydrate);
    });
});

describe('SessionHydrator.refresh', () => {
    it('re-reads the api key from the port after external writes', async () => {
        const port = new InMemoryCredentialsPort();
        const hydrator = makeHydrator({ credentialsPort: port });
        await hydrator.hydrate();

        port.apiKey = 'sk-from-elsewhere';
        await hydrator.refresh();

        expect(hydrator.getState().snapshot.apiKey).toBe('sk-from-elsewhere');
    });

    it('re-reads the draft from the port after external writes', async () => {
        const port = new InMemoryGenerateDraftPort();
        const hydrator = makeHydrator({ generateDraftPort: port });
        await hydrator.hydrate();

        const next = makeDraft({ prompt: 'from-elsewhere' });
        port.draft = next;
        await hydrator.refresh();

        expect(hydrator.getState().snapshot.generateDraft).toEqual(next);
    });

    it('re-reads autopilot settings from the port after external writes', async () => {
        const port = new InMemoryAutopilotSettingsPort();
        const hydrator = makeHydrator({ autopilotSettingsPort: port });
        await hydrator.hydrate();

        const next = makeAutopilotSettings({ goal: 'external write' });
        port.settings = next;
        await hydrator.refresh();

        expect(hydrator.getState().snapshot.autopilotSettings).toEqual(next);
    });

    it('re-reads the lineage source from the port after external writes', async () => {
        const port = new InMemoryGenerateLineageSourcePort();
        const hydrator = makeHydrator({ generateLineageSourcePort: port });
        await hydrator.hydrate();

        const next: GenerateLineageSource = { archiveImageId: 'external-archive', stepId: 'external-step' };
        port.source = next;
        await hydrator.refresh();

        expect(hydrator.getState().snapshot.generateLineageSource).toEqual(next);
    });
});

describe('SessionHydrator.setGenerateLineageSource', () => {
    it('updates the snapshot optimistically before the port settles', async () => {
        let resolveSave: (() => void) | null = null;
        const port = new InMemoryGenerateLineageSourcePort();
        port.save = vi.fn(async (source: GenerateLineageSource) => {
            await new Promise<void>((resolve) => {
                resolveSave = resolve;
            });
            port.source = source;
        });

        const hydrator = makeHydrator({ generateLineageSourcePort: port });
        await hydrator.hydrate();

        const next: GenerateLineageSource = { archiveImageId: 'archive-next', stepId: 'step-next' };
        const writePromise = hydrator.setGenerateLineageSource(next);

        expect(hydrator.getState().snapshot.generateLineageSource).toEqual(next);

        resolveSave!();
        await writePromise;

        expect(port.save).toHaveBeenCalledWith(next);
    });

    it('routes invalid values (no archiveImageId) through clear()', async () => {
        const port = new InMemoryGenerateLineageSourcePort({ archiveImageId: 'archive-1', stepId: 'step-1' });
        const hydrator = makeHydrator({ generateLineageSourcePort: port });
        await hydrator.hydrate();

        await hydrator.setGenerateLineageSource({ archiveImageId: '', stepId: null } as GenerateLineageSource);

        expect(hydrator.getState().snapshot.generateLineageSource).toBeNull();
        expect(port.clearCalls).toBe(1);
    });

    it('records a save error without corrupting the optimistic snapshot', async () => {
        const port = new FlakyGenerateLineageSourcePort('save');
        const hydrator = makeHydrator({ generateLineageSourcePort: port });
        await hydrator.hydrate();

        const next: GenerateLineageSource = { archiveImageId: 'archive-1', stepId: 'step-1' };
        await hydrator.setGenerateLineageSource(next);

        const state = hydrator.getState();
        expect(state.snapshot.generateLineageSource).toEqual(next);
        expect(state.lastError?.domain).toBe('generateLineageSource');
        expect(state.lastError?.operation).toBe('save');
        expect(state.lastError?.cause.message).toBe('save lineage source failed');
    });

    it('notifies subscribers on lineage source changes', async () => {
        const port = new InMemoryGenerateLineageSourcePort();
        const hydrator = makeHydrator({ generateLineageSourcePort: port });

        const listener = vi.fn();
        hydrator.subscribe(listener);

        await hydrator.hydrate();
        const callsAfterHydrate = listener.mock.calls.length;

        await hydrator.setGenerateLineageSource({ archiveImageId: 'archive-next', stepId: null });

        expect(listener.mock.calls.length).toBeGreaterThan(callsAfterHydrate);
    });
});

describe('SessionHydrator.clearGenerateLineageSource', () => {
    it('clears the snapshot and invokes port.clear()', async () => {
        const port = new InMemoryGenerateLineageSourcePort({ archiveImageId: 'archive-1', stepId: 'step-1' });
        const hydrator = makeHydrator({ generateLineageSourcePort: port });
        await hydrator.hydrate();

        await hydrator.clearGenerateLineageSource();

        expect(hydrator.getState().snapshot.generateLineageSource).toBeNull();
        expect(port.clearCalls).toBe(1);
    });

    it('records a clear error without corrupting the optimistic snapshot', async () => {
        const port = new FlakyGenerateLineageSourcePort('clear');
        const hydrator = makeHydrator({ generateLineageSourcePort: port });
        await hydrator.hydrate();

        await hydrator.clearGenerateLineageSource();

        const state = hydrator.getState();
        expect(state.snapshot.generateLineageSource).toBeNull();
        expect(state.lastError?.domain).toBe('generateLineageSource');
        expect(state.lastError?.operation).toBe('clear');
        expect(state.lastError?.cause.message).toBe('clear lineage source failed');
    });
});
