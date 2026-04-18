// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { SessionProvider } from './SessionContext';
import { createSessionHydrator, type SessionHydrator } from './SessionHydrator';
import { useApiKey } from './useApiKey';
import type { CredentialsPort } from '../credentials/SQLiteCredentialsPort';
import type { GenerateDraftPort } from '../generate-session/SQLiteGenerateDraftPort';
import type { GenerateLineageSourcePort } from '../generate-session/SQLiteGenerateLineageSourcePort';
import type { AutopilotSettingsPort } from '../autopilot/SQLiteAutopilotSettingsPort';
import type { AutopilotSettings } from '../autopilot/AutopilotSettings';
import type { GenerateLineageSource } from '../generate-session/GenerateSession';

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

class FailingOnSaveCredentialsPort implements CredentialsPort {
    saveAttempts = 0;
    async init(): Promise<void> {}
    async load(): Promise<string | null> { return null; }
    async save(): Promise<void> {
        this.saveAttempts += 1;
        throw new Error('save failed');
    }
    async clear(): Promise<void> {}
}

const emptyDraftPort: GenerateDraftPort = {
    async init() {},
    async load() { return null; },
    async save() {},
    async clear() {},
};

const emptyAutopilotPort: AutopilotSettingsPort = {
    async init() {},
    async load(): Promise<AutopilotSettings | null> { return null; },
    async save() {},
    async clear() {},
};

const emptyLineageSourcePort: GenerateLineageSourcePort = {
    async init() {},
    async load(): Promise<GenerateLineageSource | null> { return null; },
    async save() {},
    async clear() {},
};

function makeHydratorWithCredentials(credentialsPort: CredentialsPort): SessionHydrator {
    return createSessionHydrator({
        credentialsPort,
        generateDraftPort: emptyDraftPort,
        autopilotSettingsPort: emptyAutopilotPort,
        generateLineageSourcePort: emptyLineageSourcePort,
    });
}

async function renderUseApiKey(hydrator: SessionHydrator) {
    await hydrator.hydrate();

    const wrapper = ({ children }: { children: ReactNode }) => (
        <SessionProvider hydrator={hydrator}>{children}</SessionProvider>
    );

    const result = renderHook(() => useApiKey(), { wrapper });
    await waitFor(() => {
        expect(result.result.current).toBeDefined();
    });
    return result;
}

describe('useApiKey', () => {
    it('reflects the hydrated api key from the session snapshot', async () => {
        const port = new InMemoryCredentialsPort('sk-stored');
        const hydrator = makeHydratorWithCredentials(port);

        const { result } = await renderUseApiKey(hydrator);

        expect(result.current.apiKey).toBe('sk-stored');
        expect(result.current.lastError).toBeNull();
    });

    it('updates the snapshot optimistically and calls the credentials port on setApiKey', async () => {
        const port = new InMemoryCredentialsPort('sk-initial');
        const hydrator = makeHydratorWithCredentials(port);

        const { result } = await renderUseApiKey(hydrator);

        await act(async () => {
            await result.current.setApiKey('sk-new');
        });

        expect(result.current.apiKey).toBe('sk-new');
        expect(port.saveCalls).toEqual(['sk-new']);
    });

    it('surfaces a save error through lastError without corrupting the optimistic snapshot', async () => {
        const port = new FailingOnSaveCredentialsPort();
        const hydrator = makeHydratorWithCredentials(port);

        const { result } = await renderUseApiKey(hydrator);

        await act(async () => {
            await result.current.setApiKey('sk-attempt');
        });

        expect(result.current.apiKey).toBe('sk-attempt');
        expect(result.current.lastError?.domain).toBe('apiKey');
        expect(result.current.lastError?.operation).toBe('save');
        expect(result.current.lastError?.cause.message).toBe('save failed');
        expect(port.saveAttempts).toBe(1);
    });

    it('routes empty values through clear on the credentials port', async () => {
        const port = new InMemoryCredentialsPort('sk-stored');
        const hydrator = makeHydratorWithCredentials(port);

        const { result } = await renderUseApiKey(hydrator);

        await act(async () => {
            await result.current.setApiKey('');
        });

        expect(result.current.apiKey).toBe('');
        expect(port.clearCalls).toBe(1);
        expect(port.saveCalls).toEqual([]);
    });

    it('re-renders consumers when the api key changes', async () => {
        const port = new InMemoryCredentialsPort('sk-initial');
        const hydrator = makeHydratorWithCredentials(port);

        const spy = vi.fn();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <SessionProvider hydrator={hydrator}>{children}</SessionProvider>
        );

        await hydrator.hydrate();
        const { result } = renderHook(() => {
            const controller = useApiKey();
            spy(controller.apiKey);
            return controller;
        }, { wrapper });

        await waitFor(() => expect(spy).toHaveBeenCalled());
        const callsAfterInitial = spy.mock.calls.length;

        await act(async () => {
            await result.current.setApiKey('sk-new');
        });

        expect(spy.mock.calls.length).toBeGreaterThan(callsAfterInitial);
    });
});
