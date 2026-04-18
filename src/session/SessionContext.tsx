import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import type { SessionHydrator } from './SessionHydrator';
import { SessionContext, type SessionContextValue } from './sessionContextValue';

export interface SessionProviderProps {
    hydrator: SessionHydrator;
    children: ReactNode;
    fallback?: ReactNode;
}

export function SessionProvider({ hydrator, children, fallback }: SessionProviderProps) {
    const hydrationStartedRef = useRef(false);

    useEffect(() => {
        if (hydrationStartedRef.current) {
            return;
        }
        hydrationStartedRef.current = true;
        void hydrator.hydrate();
    }, [hydrator]);

    const state = useSyncExternalStore(hydrator.subscribe, hydrator.getState);

    const value = useMemo<SessionContextValue>(() => ({
        state,
        setApiKey: hydrator.setApiKey,
        setGenerateDraft: hydrator.setGenerateDraft,
    }), [state, hydrator]);

    if (!state.isHydrated) {
        return <>{fallback ?? <DefaultHydrationLoader />}</>;
    }

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function DefaultHydrationLoader() {
    return (
        <div className="hydration-loader" role="status" aria-live="polite">
            <Loader2 size={32} className="hydration-loader__spinner" />
            <span>Loading your studio…</span>
        </div>
    );
}
