import { createContext, useContext } from 'react';

export interface MigrationContextValue {
    requestRerun: () => void;
}

export const MigrationContext = createContext<MigrationContextValue | null>(null);

export function useMigrationCoordinator(): MigrationContextValue {
    const value = useContext(MigrationContext);
    if (!value) {
        throw new Error('useMigrationCoordinator must be used within a MigrationGate');
    }
    return value;
}
