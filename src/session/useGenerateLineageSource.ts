import { useCallback } from 'react';
import {
    sanitizeGenerateLineageSource,
    type GenerateLineageSource,
} from '../generate-session/GenerateSession';
import { useSessionContext } from './sessionContextValue';
import type { SessionError } from './types';

export interface GenerateLineageSourceController {
    lineageSource: GenerateLineageSource | null;
    setLineageSource: (value: GenerateLineageSource) => Promise<void>;
    clearLineageSource: () => Promise<void>;
    lastError: SessionError | null;
}

export function useGenerateLineageSource(): GenerateLineageSourceController {
    const { state, setGenerateLineageSource, clearGenerateLineageSource } = useSessionContext();

    const setLineageSource = useCallback(
        async (value: GenerateLineageSource) => {
            const sanitized = sanitizeGenerateLineageSource(value);
            if (!sanitized) {
                await clearGenerateLineageSource();
                return;
            }
            await setGenerateLineageSource(sanitized);
        },
        [clearGenerateLineageSource, setGenerateLineageSource],
    );

    const clearLineageSource = useCallback(
        () => clearGenerateLineageSource(),
        [clearGenerateLineageSource],
    );

    return {
        lineageSource: state.snapshot.generateLineageSource,
        setLineageSource,
        clearLineageSource,
        lastError: state.lastError?.domain === 'generateLineageSource' ? state.lastError : null,
    };
}
