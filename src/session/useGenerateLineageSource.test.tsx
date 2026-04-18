// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { SessionProvider } from './SessionContext';
import { createSessionHydrator, type SessionHydrator } from './SessionHydrator';
import { useGenerateLineageSource } from './useGenerateLineageSource';
import type { GenerateLineageSource } from '../generate-session/GenerateSession';
import type { GenerateLineageSourcePort } from '../generate-session/SQLiteGenerateLineageSourcePort';
import type { CredentialsPort } from '../credentials/SQLiteCredentialsPort';
import type { GenerateDraftPort } from '../generate-session/SQLiteGenerateDraftPort';
import type { AutopilotSettingsPort } from '../autopilot/SQLiteAutopilotSettingsPort';

class InMemoryLineageSourcePort implements GenerateLineageSourcePort {
    source: GenerateLineageSource | null;
    saveCalls: GenerateLineageSource[] = [];
    clearCalls = 0;

    constructor(initial: GenerateLineageSource | null = null) {
        this.source = initial;
    }

    async init(): Promise<void> {}
    async load(): Promise<GenerateLineageSource | null> { return this.source; }
    async save(source: GenerateLineageSource): Promise<void> {
        this.saveCalls.push(source);
        this.source = source;
    }
    async clear(): Promise<void> {
        this.clearCalls += 1;
        this.source = null;
    }
}

class FailingOnSaveLineageSourcePort implements GenerateLineageSourcePort {
    saveAttempts = 0;
    async init(): Promise<void> {}
    async load(): Promise<GenerateLineageSource | null> { return null; }
    async save(): Promise<void> {
        this.saveAttempts += 1;
        throw new Error('save lineage source failed');
    }
    async clear(): Promise<void> {}
}

class FailingOnClearLineageSourcePort implements GenerateLineageSourcePort {
    clearAttempts = 0;
    async init(): Promise<void> {}
    async load(): Promise<GenerateLineageSource | null> {
        return { archiveImageId: 'archive-1', stepId: 'step-1' };
    }
    async save(): Promise<void> {}
    async clear(): Promise<void> {
        this.clearAttempts += 1;
        throw new Error('clear lineage source failed');
    }
}

const emptyCredentialsPort: CredentialsPort = {
    async init() {},
    async load() { return null; },
    async save() {},
    async clear() {},
};

const emptyDraftPort: GenerateDraftPort = {
    async init() {},
    async load() { return null; },
    async save() {},
    async clear() {},
};

const emptyAutopilotPort: AutopilotSettingsPort = {
    async init() {},
    async load() { return null; },
    async save() {},
    async clear() {},
};

function makeHydrator(lineagePort: GenerateLineageSourcePort): SessionHydrator {
    return createSessionHydrator({
        credentialsPort: emptyCredentialsPort,
        generateDraftPort: emptyDraftPort,
        autopilotSettingsPort: emptyAutopilotPort,
        generateLineageSourcePort: lineagePort,
    });
}

async function renderUseLineageSource(hydrator: SessionHydrator) {
    await hydrator.hydrate();

    const wrapper = ({ children }: { children: ReactNode }) => (
        <SessionProvider hydrator={hydrator}>{children}</SessionProvider>
    );

    const result = renderHook(() => useGenerateLineageSource(), { wrapper });
    await waitFor(() => {
        expect(result.result.current).toBeDefined();
    });
    return result;
}

describe('useGenerateLineageSource', () => {
    it('reflects the hydrated lineage source from the session snapshot', async () => {
        const stored: GenerateLineageSource = { archiveImageId: 'archive-1', stepId: 'step-1' };
        const port = new InMemoryLineageSourcePort(stored);
        const hydrator = makeHydrator(port);

        const { result } = await renderUseLineageSource(hydrator);

        expect(result.current.lineageSource).toEqual(stored);
        expect(result.current.lastError).toBeNull();
    });

    it('returns null when no lineage source is persisted', async () => {
        const port = new InMemoryLineageSourcePort(null);
        const hydrator = makeHydrator(port);

        const { result } = await renderUseLineageSource(hydrator);

        expect(result.current.lineageSource).toBeNull();
    });

    it('updates the snapshot optimistically and writes through the port on setLineageSource', async () => {
        const port = new InMemoryLineageSourcePort(null);
        const hydrator = makeHydrator(port);

        const { result } = await renderUseLineageSource(hydrator);

        const next: GenerateLineageSource = { archiveImageId: 'archive-next', stepId: 'step-next' };
        await act(async () => {
            await result.current.setLineageSource(next);
        });

        expect(result.current.lineageSource).toEqual(next);
        expect(port.saveCalls.at(-1)).toEqual(next);
    });

    it('routes invalid sources (empty archiveImageId) through clear()', async () => {
        const port = new InMemoryLineageSourcePort({ archiveImageId: 'archive-1', stepId: 'step-1' });
        const hydrator = makeHydrator(port);

        const { result } = await renderUseLineageSource(hydrator);

        await act(async () => {
            await result.current.setLineageSource({ archiveImageId: '', stepId: null } as GenerateLineageSource);
        });

        expect(result.current.lineageSource).toBeNull();
        expect(port.clearCalls).toBe(1);
        expect(port.saveCalls.length).toBe(0);
    });

    it('clears the lineage source via clearLineageSource', async () => {
        const port = new InMemoryLineageSourcePort({ archiveImageId: 'archive-1', stepId: 'step-1' });
        const hydrator = makeHydrator(port);

        const { result } = await renderUseLineageSource(hydrator);

        await act(async () => {
            await result.current.clearLineageSource();
        });

        expect(result.current.lineageSource).toBeNull();
        expect(port.clearCalls).toBe(1);
    });

    it('surfaces save errors via lastError without corrupting the optimistic snapshot', async () => {
        const port = new FailingOnSaveLineageSourcePort();
        const hydrator = makeHydrator(port);

        const { result } = await renderUseLineageSource(hydrator);

        const next: GenerateLineageSource = { archiveImageId: 'archive-next', stepId: 'step-next' };
        await act(async () => {
            await result.current.setLineageSource(next);
        });

        expect(result.current.lineageSource).toEqual(next);
        expect(result.current.lastError?.domain).toBe('generateLineageSource');
        expect(result.current.lastError?.operation).toBe('save');
        expect(result.current.lastError?.cause.message).toBe('save lineage source failed');
        expect(port.saveAttempts).toBe(1);
    });

    it('surfaces clear errors via lastError without resurrecting the snapshot value', async () => {
        const port = new FailingOnClearLineageSourcePort();
        const hydrator = makeHydrator(port);

        const { result } = await renderUseLineageSource(hydrator);

        await act(async () => {
            await result.current.clearLineageSource();
        });

        expect(result.current.lineageSource).toBeNull();
        expect(result.current.lastError?.domain).toBe('generateLineageSource');
        expect(result.current.lastError?.operation).toBe('clear');
        expect(result.current.lastError?.cause.message).toBe('clear lineage source failed');
        expect(port.clearAttempts).toBe(1);
    });
});
