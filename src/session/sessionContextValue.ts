import { createContext, useContext } from 'react';
import type { SessionState } from './types';

export interface SessionContextValue {
    state: SessionState;
    setApiKey: (value: string) => Promise<void>;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSessionContext(): SessionContextValue {
    const value = useContext(SessionContext);
    if (!value) {
        throw new Error('useSessionContext must be used within a SessionProvider');
    }
    return value;
}
