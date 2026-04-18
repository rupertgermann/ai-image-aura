// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { SessionProvider } from './SessionContext';
import { createSessionHydrator, type SessionHydrator } from './SessionHydrator';
import { useAutopilotSettings } from './useAutopilotSettings';
import {
    DEFAULT_AUTOPILOT_SETTINGS,
    type AutopilotSettings,
} from '../autopilot/AutopilotSettings';
import type { AutopilotSettingsPort } from '../autopilot/SQLiteAutopilotSettingsPort';
import type { CredentialsPort } from '../credentials/SQLiteCredentialsPort';
import type { GenerateDraftPort } from '../generate-session/SQLiteGenerateDraftPort';
import type { GenerateLineageSourcePort } from '../generate-session/SQLiteGenerateLineageSourcePort';

class InMemoryAutopilotSettingsPort implements AutopilotSettingsPort {
    settings: AutopilotSettings | null;
    saveCalls: AutopilotSettings[] = [];
    clearCalls = 0;

    constructor(initial: AutopilotSettings | null = null) {
        this.settings = initial;
    }

    async init(): Promise<void> {}
    async load(): Promise<AutopilotSettings | null> { return this.settings; }
    async save(settings: AutopilotSettings): Promise<void> {
        this.saveCalls.push(settings);
        this.settings = settings;
    }
    async clear(): Promise<void> {
        this.clearCalls += 1;
        this.settings = null;
    }
}

class FailingOnSaveAutopilotPort implements AutopilotSettingsPort {
    saveAttempts = 0;
    async init(): Promise<void> {}
    async load(): Promise<AutopilotSettings | null> { return null; }
    async save(): Promise<void> {
        this.saveAttempts += 1;
        throw new Error('save autopilot failed');
    }
    async clear(): Promise<void> {}
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

const emptyLineageSourcePort: GenerateLineageSourcePort = {
    async init() {},
    async load() { return null; },
    async save() {},
    async clear() {},
};

function makeHydrator(autopilotPort: AutopilotSettingsPort): SessionHydrator {
    return createSessionHydrator({
        credentialsPort: emptyCredentialsPort,
        generateDraftPort: emptyDraftPort,
        autopilotSettingsPort: autopilotPort,
        generateLineageSourcePort: emptyLineageSourcePort,
    });
}

async function renderUseAutopilot(hydrator: SessionHydrator) {
    await hydrator.hydrate();

    const wrapper = ({ children }: { children: ReactNode }) => (
        <SessionProvider hydrator={hydrator}>{children}</SessionProvider>
    );

    const result = renderHook(() => useAutopilotSettings(), { wrapper });
    await waitFor(() => {
        expect(result.result.current).toBeDefined();
    });
    return result;
}

function makeSettings(overrides: Partial<AutopilotSettings> = {}): AutopilotSettings {
    return {
        mode: 'autopilot',
        goal: 'A cozy scene',
        maxIterations: 6,
        satisfactionThreshold: 85,
        ...overrides,
    };
}

describe('useAutopilotSettings', () => {
    it('reflects the hydrated autopilot settings from the session snapshot', async () => {
        const stored = makeSettings({ goal: 'stored goal' });
        const port = new InMemoryAutopilotSettingsPort(stored);
        const hydrator = makeHydrator(port);

        const { result } = await renderUseAutopilot(hydrator);

        expect(result.current.settings).toEqual(stored);
        expect(result.current.lastError).toBeNull();
    });

    it('falls back to defaults when the port is empty', async () => {
        const port = new InMemoryAutopilotSettingsPort(null);
        const hydrator = makeHydrator(port);

        const { result } = await renderUseAutopilot(hydrator);

        expect(result.current.settings).toEqual(DEFAULT_AUTOPILOT_SETTINGS);
    });

    it('updates the snapshot optimistically when setSettings is called', async () => {
        const port = new InMemoryAutopilotSettingsPort(makeSettings());
        const hydrator = makeHydrator(port);

        const { result } = await renderUseAutopilot(hydrator);

        const next = makeSettings({ goal: 'new goal' });
        await act(async () => {
            await result.current.setSettings(next);
        });

        expect(result.current.settings).toEqual(next);
        expect(port.saveCalls.at(-1)).toEqual(next);
    });

    it('exposes per-field setters that update the snapshot and call the port', async () => {
        const port = new InMemoryAutopilotSettingsPort(makeSettings());
        const hydrator = makeHydrator(port);

        const { result } = await renderUseAutopilot(hydrator);

        await act(async () => {
            await result.current.setMode('single-shot');
        });
        expect(result.current.settings.mode).toBe('single-shot');

        await act(async () => {
            await result.current.setGoal('updated goal');
        });
        expect(result.current.settings.goal).toBe('updated goal');

        await act(async () => {
            await result.current.setMaxIterations(8);
        });
        expect(result.current.settings.maxIterations).toBe(8);

        await act(async () => {
            await result.current.setSatisfactionThreshold(95);
        });
        expect(result.current.settings.satisfactionThreshold).toBe(95);

        expect(port.saveCalls.length).toBe(4);
        expect(port.saveCalls.at(-1)).toEqual({
            mode: 'single-shot',
            goal: 'updated goal',
            maxIterations: 8,
            satisfactionThreshold: 95,
        });
    });

    it('surfaces save errors via lastError while keeping the optimistic snapshot', async () => {
        const port = new FailingOnSaveAutopilotPort();
        const hydrator = makeHydrator(port);

        const { result } = await renderUseAutopilot(hydrator);

        const next = makeSettings({ goal: 'doomed goal' });
        await act(async () => {
            await result.current.setSettings(next);
        });

        expect(result.current.settings).toEqual(next);
        expect(result.current.lastError?.domain).toBe('autopilotSettings');
        expect(result.current.lastError?.operation).toBe('save');
        expect(result.current.lastError?.cause.message).toBe('save autopilot failed');
        expect(port.saveAttempts).toBe(1);
    });

    it('notifies consumers on every setting change', async () => {
        const port = new InMemoryAutopilotSettingsPort(makeSettings());
        const hydrator = makeHydrator(port);

        const spy = vi.fn();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <SessionProvider hydrator={hydrator}>{children}</SessionProvider>
        );

        await hydrator.hydrate();
        const { result } = renderHook(() => {
            const value = useAutopilotSettings();
            spy(value.settings.goal);
            return value;
        }, { wrapper });

        await waitFor(() => expect(spy).toHaveBeenCalled());
        const callsAfterInitial = spy.mock.calls.length;

        await act(async () => {
            await result.current.setGoal('trigger-change');
        });

        expect(spy.mock.calls.length).toBeGreaterThan(callsAfterInitial);
    });

    it('scopes lastError to the autopilot domain', async () => {
        // Force an error by using a failing autopilot port.
        const port = new FailingOnSaveAutopilotPort();
        const hydrator = makeHydrator(port);

        const { result } = await renderUseAutopilot(hydrator);

        await act(async () => {
            await result.current.setGoal('changes');
        });

        expect(result.current.lastError?.domain).toBe('autopilotSettings');
    });
});
