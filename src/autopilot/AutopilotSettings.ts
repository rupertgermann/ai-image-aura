import {
    DEFAULT_AUTOPILOT_MAX_ITERATIONS,
    DEFAULT_AUTOPILOT_SATISFACTION_THRESHOLD,
    MAX_AUTOPILOT_ITERATIONS,
} from './AutopilotSession';

export const AUTOPILOT_MODE_KEY = 'generate_mode';
export const AUTOPILOT_GOAL_KEY = 'generate_autopilot_goal';
export const AUTOPILOT_MAX_ITERATIONS_KEY = 'generate_autopilot_max_iterations';
export const AUTOPILOT_THRESHOLD_KEY = 'generate_autopilot_threshold';

export const LEGACY_AUTOPILOT_KEYS = {
    mode: AUTOPILOT_MODE_KEY,
    goal: AUTOPILOT_GOAL_KEY,
    maxIterations: AUTOPILOT_MAX_ITERATIONS_KEY,
    satisfactionThreshold: AUTOPILOT_THRESHOLD_KEY,
} as const;

export type LegacyAutopilotField = keyof typeof LEGACY_AUTOPILOT_KEYS;

export type AutopilotMode = 'single-shot' | 'autopilot';

export interface AutopilotSettings {
    mode: AutopilotMode;
    goal: string;
    maxIterations: number;
    satisfactionThreshold: number;
}

export const DEFAULT_AUTOPILOT_SETTINGS: AutopilotSettings = {
    mode: 'single-shot',
    goal: '',
    maxIterations: DEFAULT_AUTOPILOT_MAX_ITERATIONS,
    satisfactionThreshold: DEFAULT_AUTOPILOT_SATISFACTION_THRESHOLD,
};

export function sanitizeAutopilotSettings(
    settings: Partial<Record<keyof AutopilotSettings, unknown>>,
): AutopilotSettings {
    return {
        mode: coerceMode(settings.mode),
        goal: typeof settings.goal === 'string' ? settings.goal : DEFAULT_AUTOPILOT_SETTINGS.goal,
        maxIterations: coerceMaxIterations(settings.maxIterations),
        satisfactionThreshold: coerceSatisfactionThreshold(settings.satisfactionThreshold),
    };
}

function coerceMode(value: unknown): AutopilotMode {
    return value === 'single-shot' || value === 'autopilot' ? value : DEFAULT_AUTOPILOT_SETTINGS.mode;
}

function coerceMaxIterations(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return DEFAULT_AUTOPILOT_SETTINGS.maxIterations;
    }
    const rounded = Math.round(numeric);
    if (rounded < 1) {
        return 1;
    }
    if (rounded > MAX_AUTOPILOT_ITERATIONS) {
        return MAX_AUTOPILOT_ITERATIONS;
    }
    return rounded;
}

function coerceSatisfactionThreshold(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return DEFAULT_AUTOPILOT_SETTINGS.satisfactionThreshold;
    }
    if (numeric < 0) {
        return 0;
    }
    if (numeric > 100) {
        return 100;
    }
    return numeric;
}
