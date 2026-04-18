import { describe, expect, it, vi } from 'vitest';
import { createSessionHydrator, type SessionHydratorDeps } from './SessionHydrator';
import type { CredentialsPort } from '../credentials/SQLiteCredentialsPort';

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

function makeHydrator(deps: Partial<SessionHydratorDeps> = {}) {
    return createSessionHydrator({
        credentialsPort: deps.credentialsPort ?? new InMemoryCredentialsPort(),
        bootstrap: deps.bootstrap,
    });
}

describe('SessionHydrator.hydrate', () => {
    it('hydrates an empty store to defaults', async () => {
        const hydrator = makeHydrator({ credentialsPort: new InMemoryCredentialsPort(null) });

        await hydrator.hydrate();

        expect(hydrator.getState()).toEqual({
            snapshot: { apiKey: '' },
            isHydrated: true,
            lastError: null,
        });
    });

    it('hydrates a populated store with the persisted api key', async () => {
        const hydrator = makeHydrator({ credentialsPort: new InMemoryCredentialsPort('sk-stored') });

        await hydrator.hydrate();

        expect(hydrator.getState().snapshot.apiKey).toBe('sk-stored');
        expect(hydrator.getState().isHydrated).toBe(true);
    });

    it('awaits the bootstrap step before loading from the port', async () => {
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

        expect(order).toEqual(['bootstrap', 'load']);
    });

    it('records a load error and stays hydrated when the port fails', async () => {
        const hydrator = makeHydrator({ credentialsPort: new FlakyCredentialsPort('load') });

        await hydrator.hydrate();

        const state = hydrator.getState();
        expect(state.isHydrated).toBe(true);
        expect(state.lastError?.operation).toBe('load');
        expect(state.snapshot.apiKey).toBe('');
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

describe('SessionHydrator.refresh', () => {
    it('re-reads the api key from the port after external writes', async () => {
        const port = new InMemoryCredentialsPort();
        const hydrator = makeHydrator({ credentialsPort: port });
        await hydrator.hydrate();

        port.apiKey = 'sk-from-elsewhere';
        await hydrator.refresh();

        expect(hydrator.getState().snapshot.apiKey).toBe('sk-from-elsewhere');
    });
});
