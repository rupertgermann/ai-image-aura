import { useCallback } from 'react';
import {
    sanitizeAutopilotSettings,
    type AutopilotMode,
    type AutopilotSettings,
} from '../autopilot/AutopilotSettings';
import { useSessionContext } from './sessionContextValue';
import type { SessionError } from './types';

export interface AutopilotSettingsController {
    settings: AutopilotSettings;
    setSettings: (value: AutopilotSettings) => Promise<void>;
    setMode: (value: AutopilotMode) => Promise<void>;
    setGoal: (value: string) => Promise<void>;
    setMaxIterations: (value: number) => Promise<void>;
    setSatisfactionThreshold: (value: number) => Promise<void>;
    lastError: SessionError | null;
}

export function useAutopilotSettings(): AutopilotSettingsController {
    const { state, setAutopilotSettings } = useSessionContext();
    const settings = state.snapshot.autopilotSettings;

    const update = useCallback(
        (value: AutopilotSettings) => setAutopilotSettings(sanitizeAutopilotSettings(value)),
        [setAutopilotSettings],
    );

    const setMode = useCallback(
        (value: AutopilotMode) => setAutopilotSettings(sanitizeAutopilotSettings({ ...settings, mode: value })),
        [setAutopilotSettings, settings],
    );

    const setGoal = useCallback(
        (value: string) => setAutopilotSettings(sanitizeAutopilotSettings({ ...settings, goal: value })),
        [setAutopilotSettings, settings],
    );

    const setMaxIterations = useCallback(
        (value: number) => setAutopilotSettings(sanitizeAutopilotSettings({ ...settings, maxIterations: value })),
        [setAutopilotSettings, settings],
    );

    const setSatisfactionThreshold = useCallback(
        (value: number) => setAutopilotSettings(sanitizeAutopilotSettings({ ...settings, satisfactionThreshold: value })),
        [setAutopilotSettings, settings],
    );

    return {
        settings,
        setSettings: update,
        setMode,
        setGoal,
        setMaxIterations,
        setSatisfactionThreshold,
        lastError: state.lastError?.domain === 'autopilotSettings' ? state.lastError : null,
    };
}
