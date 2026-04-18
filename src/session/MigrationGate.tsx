import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { ReactNode } from 'react';
import MigrationPrompt from '../components/MigrationPrompt';
import type {
    LocalStorageMigrator,
    MigrationOutcome,
    MigrationSnapshot,
} from './LocalStorageMigrator';
import type { SessionHydrator } from './SessionHydrator';
import { MigrationContext, type MigrationContextValue } from './migrationContext';

export interface MigrationGateProps {
    migrator: LocalStorageMigrator;
    hydrator: SessionHydrator;
    onMigrationComplete?: (outcome: MigrationOutcome) => void;
    onMigrationError?: (error: Error) => void;
    children: ReactNode;
}

export function MigrationGate({
    migrator,
    hydrator,
    onMigrationComplete,
    onMigrationError,
    children,
}: MigrationGateProps) {
    const [snapshot, setSnapshot] = useState<MigrationSnapshot | null>(null);
    const [isMigrating, setIsMigrating] = useState(false);
    const [evaluationToken, setEvaluationToken] = useState(0);
    const evaluatedTokenRef = useRef(-1);

    useEffect(() => {
        if (evaluatedTokenRef.current === evaluationToken) {
            return;
        }
        evaluatedTokenRef.current = evaluationToken;

        const decision = migrator.getDecision();
        if (decision !== null) {
            setSnapshot(null);
            return;
        }

        const next = migrator.detect();
        const hasAny = next.apiKey.present || next.generateDraft.present;
        setSnapshot(hasAny ? next : null);
    }, [evaluationToken, migrator]);

    const handleMigrate = useCallback(async () => {
        setIsMigrating(true);
        try {
            const outcome = await migrator.migrate();
            await hydrator.refresh();
            onMigrationComplete?.(outcome);
            if (outcome.apiKey.error) {
                onMigrationError?.(outcome.apiKey.error);
            }
            if (outcome.generateDraft.error) {
                onMigrationError?.(outcome.generateDraft.error);
            }
        } catch (error) {
            const wrapped = error instanceof Error ? error : new Error(String(error));
            onMigrationError?.(wrapped);
        } finally {
            setIsMigrating(false);
            setSnapshot(null);
            setEvaluationToken((token) => token + 1);
        }
    }, [hydrator, migrator, onMigrationComplete, onMigrationError]);

    const handleDecline = useCallback(() => {
        migrator.decline();
        setSnapshot(null);
        setEvaluationToken((token) => token + 1);
    }, [migrator]);

    const requestRerun = useCallback(() => {
        migrator.resetDecision();
        setEvaluationToken((token) => token + 1);
    }, [migrator]);

    const contextValue = useMemo<MigrationContextValue>(() => ({
        requestRerun,
    }), [requestRerun]);

    return (
        <MigrationContext.Provider value={contextValue}>
            {children}
            {snapshot && (
                <MigrationPrompt
                    snapshot={snapshot}
                    onMigrate={handleMigrate}
                    onDecline={handleDecline}
                    isMigrating={isMigrating}
                />
            )}
        </MigrationContext.Provider>
    );
}
