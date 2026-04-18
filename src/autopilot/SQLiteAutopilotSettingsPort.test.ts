import { describe, expect, it } from 'vitest';
import type { AutopilotSettingsPort } from './SQLiteAutopilotSettingsPort';
import {
    DEFAULT_AUTOPILOT_SETTINGS,
    sanitizeAutopilotSettings,
    type AutopilotSettings,
} from './AutopilotSettings';

class InMemoryAutopilotSettingsPort implements AutopilotSettingsPort {
    private settings: AutopilotSettings | null = null;
    private rowCount = 0;
    private initialized = false;

    async init(): Promise<void> {
        this.initialized = true;
    }

    async load(): Promise<AutopilotSettings | null> {
        if (!this.initialized) {
            await this.init();
        }
        return this.settings;
    }

    async save(settings: AutopilotSettings): Promise<void> {
        if (!this.initialized) {
            await this.init();
        }
        this.settings = sanitizeAutopilotSettings(settings);
        this.rowCount = 1;
    }

    async clear(): Promise<void> {
        if (!this.initialized) {
            await this.init();
        }
        this.settings = null;
        this.rowCount = 0;
    }

    getRowCount(): number {
        return this.rowCount;
    }
}

function makeSettings(overrides: Partial<AutopilotSettings> = {}): AutopilotSettings {
    return {
        mode: 'autopilot',
        goal: 'A cozy wintery scene',
        maxIterations: 6,
        satisfactionThreshold: 85,
        ...overrides,
    };
}

describe('AutopilotSettingsPort contract', () => {
    it('returns null for an empty store', async () => {
        const port = new InMemoryAutopilotSettingsPort();

        await expect(port.load()).resolves.toBeNull();
    });

    it('round-trips saved settings', async () => {
        const port = new InMemoryAutopilotSettingsPort();
        const settings = makeSettings();

        await port.save(settings);

        await expect(port.load()).resolves.toEqual(settings);
    });

    it('overwrites settings on subsequent save', async () => {
        const port = new InMemoryAutopilotSettingsPort();

        await port.save(makeSettings({ goal: 'first' }));
        await port.save(makeSettings({ goal: 'second' }));

        const loaded = await port.load();
        expect(loaded?.goal).toBe('second');
    });

    it('keeps the settings table as a singleton across saves', async () => {
        const port = new InMemoryAutopilotSettingsPort();

        await port.save(makeSettings({ goal: 'a' }));
        await port.save(makeSettings({ goal: 'b' }));
        await port.save(makeSettings({ goal: 'c' }));

        expect(port.getRowCount()).toBe(1);
    });

    it('clears the stored value', async () => {
        const port = new InMemoryAutopilotSettingsPort();

        await port.save(makeSettings());
        await port.clear();

        await expect(port.load()).resolves.toBeNull();
        expect(port.getRowCount()).toBe(0);
    });

    it('returns defaults when loading settings saved with missing fields', async () => {
        const port = new InMemoryAutopilotSettingsPort();

        await port.save(sanitizeAutopilotSettings({}));

        await expect(port.load()).resolves.toEqual(DEFAULT_AUTOPILOT_SETTINGS);
    });
});
