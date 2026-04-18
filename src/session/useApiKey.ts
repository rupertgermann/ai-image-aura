import { useCallback } from 'react';
import { useSessionContext } from './sessionContextValue';
import type { SessionError } from './types';

export interface ApiKeyController {
    apiKey: string;
    setApiKey: (value: string) => Promise<void>;
    lastError: SessionError | null;
}

export function useApiKey(): ApiKeyController {
    const { state, setApiKey } = useSessionContext();

    const update = useCallback(
        (value: string) => setApiKey(value),
        [setApiKey],
    );

    return {
        apiKey: state.snapshot.apiKey,
        setApiKey: update,
        lastError: state.lastError,
    };
}
