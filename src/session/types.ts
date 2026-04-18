export interface SessionSnapshot {
    apiKey: string;
}

export const EMPTY_SESSION_SNAPSHOT: SessionSnapshot = {
    apiKey: '',
};

export type SessionDomain = 'apiKey';

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
