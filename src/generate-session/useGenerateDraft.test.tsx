// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { SessionProvider } from '../session/SessionContext';
import { createSessionHydrator, type SessionHydrator } from '../session/SessionHydrator';
import { DEFAULT_GENERATE_DRAFT, useGenerateDraft, type GenerateDraft } from './GenerateSession';
import type { CredentialsPort } from '../credentials/SQLiteCredentialsPort';
import type { GenerateDraftPort } from './SQLiteGenerateDraftPort';
import type { GenerateLineageSourcePort } from './SQLiteGenerateLineageSourcePort';
import type { AutopilotSettingsPort } from '../autopilot/SQLiteAutopilotSettingsPort';

class InMemoryGenerateDraftPort implements GenerateDraftPort {
    draft: GenerateDraft | null;
    saveCalls: GenerateDraft[] = [];
    clearCalls = 0;

    constructor(initial: GenerateDraft | null = null) {
        this.draft = initial;
    }

    async init(): Promise<void> {}
    async load(): Promise<GenerateDraft | null> { return this.draft; }
    async save(draft: GenerateDraft): Promise<void> {
        this.saveCalls.push(draft);
        this.draft = draft;
    }
    async clear(): Promise<void> {
        this.clearCalls += 1;
        this.draft = null;
    }
}

class FailingOnSaveDraftPort implements GenerateDraftPort {
    saveAttempts = 0;
    async init(): Promise<void> {}
    async load(): Promise<GenerateDraft | null> { return null; }
    async save(): Promise<void> {
        this.saveAttempts += 1;
        throw new Error('save draft failed');
    }
    async clear(): Promise<void> {}
}

const emptyCredentialsPort: CredentialsPort = {
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

const emptyLineageSourcePort: GenerateLineageSourcePort = {
    async init() {},
    async load() { return null; },
    async save() {},
    async clear() {},
};

function makeHydratorWithDraft(draftPort: GenerateDraftPort): SessionHydrator {
    return createSessionHydrator({
        credentialsPort: emptyCredentialsPort,
        generateDraftPort: draftPort,
        autopilotSettingsPort: emptyAutopilotPort,
        generateLineageSourcePort: emptyLineageSourcePort,
    });
}

async function renderUseGenerateDraft(hydrator: SessionHydrator) {
    await hydrator.hydrate();

    const wrapper = ({ children }: { children: ReactNode }) => (
        <SessionProvider hydrator={hydrator}>{children}</SessionProvider>
    );

    const result = renderHook(() => useGenerateDraft(), { wrapper });
    await waitFor(() => {
        const [draft] = result.result.current;
        expect(draft).toBeDefined();
    });
    return result;
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

describe('useGenerateDraft', () => {
    it('reflects the hydrated draft from the session snapshot', async () => {
        const stored = makeDraft({ prompt: 'stored prompt' });
        const port = new InMemoryGenerateDraftPort(stored);
        const hydrator = makeHydratorWithDraft(port);

        const { result } = await renderUseGenerateDraft(hydrator);
        const [draft] = result.current;

        expect(draft).toEqual(stored);
    });

    it('falls back to default draft when the port is empty', async () => {
        const port = new InMemoryGenerateDraftPort(null);
        const hydrator = makeHydratorWithDraft(port);

        const { result } = await renderUseGenerateDraft(hydrator);
        const [draft] = result.current;

        expect(draft).toEqual(DEFAULT_GENERATE_DRAFT);
    });

    it('updates the snapshot optimistically and saves to the port when called with a value', async () => {
        const port = new InMemoryGenerateDraftPort(makeDraft());
        const hydrator = makeHydratorWithDraft(port);

        const { result } = await renderUseGenerateDraft(hydrator);

        const next = makeDraft({ prompt: 'next prompt' });
        await act(async () => {
            const [, setDraft] = result.current;
            setDraft(next);
            // let the microtask that invokes port.save resolve
            await Promise.resolve();
        });

        const [draft] = result.current;
        expect(draft).toEqual(next);
        expect(port.saveCalls.at(-1)).toEqual(next);
    });

    it('supports the functional updater form', async () => {
        const port = new InMemoryGenerateDraftPort(makeDraft({ prompt: 'seed' }));
        const hydrator = makeHydratorWithDraft(port);

        const { result } = await renderUseGenerateDraft(hydrator);

        await act(async () => {
            const [, setDraft] = result.current;
            setDraft((current) => ({ ...current, prompt: 'updated via fn' }));
            await Promise.resolve();
        });

        const [draft] = result.current;
        expect(draft.prompt).toBe('updated via fn');
        expect(port.saveCalls.at(-1)?.prompt).toBe('updated via fn');
    });

    it('surfaces save errors via the session state without corrupting the optimistic snapshot', async () => {
        const port = new FailingOnSaveDraftPort();
        const hydrator = makeHydratorWithDraft(port);

        const { result } = await renderUseGenerateDraft(hydrator);

        const next = makeDraft({ prompt: 'doomed prompt' });
        await act(async () => {
            const [, setDraft] = result.current;
            setDraft(next);
            await Promise.resolve();
            await Promise.resolve();
        });

        const [draft] = result.current;
        expect(draft).toEqual(next);
        expect(port.saveAttempts).toBe(1);
        expect(hydrator.getState().lastError?.domain).toBe('generateDraft');
        expect(hydrator.getState().lastError?.operation).toBe('save');
    });

    it('notifies consumers on every change', async () => {
        const port = new InMemoryGenerateDraftPort();
        const hydrator = makeHydratorWithDraft(port);

        const spy = vi.fn();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <SessionProvider hydrator={hydrator}>{children}</SessionProvider>
        );

        await hydrator.hydrate();
        const { result } = renderHook(() => {
            const value = useGenerateDraft();
            spy(value[0].prompt);
            return value;
        }, { wrapper });

        await waitFor(() => expect(spy).toHaveBeenCalled());
        const callsAfterInitial = spy.mock.calls.length;

        await act(async () => {
            const [, setDraft] = result.current;
            setDraft(makeDraft({ prompt: 'trigger-change' }));
            await Promise.resolve();
        });

        expect(spy.mock.calls.length).toBeGreaterThan(callsAfterInitial);
    });
});
