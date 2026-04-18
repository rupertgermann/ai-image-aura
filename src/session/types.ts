import {
    DEFAULT_AUTOPILOT_SETTINGS,
    type AutopilotSettings,
} from '../autopilot/AutopilotSettings';
import { DEFAULT_GENERATE_DRAFT, type GenerateDraft } from '../generate-session/GenerateSession';

export interface SessionSnapshot {
    apiKey: string;
    generateDraft: GenerateDraft;
    autopilotSettings: AutopilotSettings;
}

export const EMPTY_SESSION_SNAPSHOT: SessionSnapshot = {
    apiKey: '',
    generateDraft: DEFAULT_GENERATE_DRAFT,
    autopilotSettings: DEFAULT_AUTOPILOT_SETTINGS,
};

export type SessionDomain = 'apiKey' | 'generateDraft' | 'autopilotSettings';

export type SessionOperation = 'load' | 'save' | 'clear';

export interface SessionError {
    domain: SessionDomain;
    operation: SessionOperation;
    cause: Error;
}

export interface SessionState {
    snapshot: SessionSnapshot;
    isHydrated: boolean;
    lastError: SessionError | null;
}

export const INITIAL_SESSION_STATE: SessionState = {
    snapshot: EMPTY_SESSION_SNAPSHOT,
    isHydrated: false,
    lastError: null,
};
