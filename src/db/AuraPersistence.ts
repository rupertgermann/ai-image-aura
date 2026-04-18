import { SQLiteArchiveMetadataPort } from '../archive/SQLiteArchiveMetadataPort';
import { SQLiteAutopilotSettingsPort } from '../autopilot/SQLiteAutopilotSettingsPort';
import { SQLiteCredentialsPort } from '../credentials/SQLiteCredentialsPort';
import { SQLiteGenerateDraftPort } from '../generate-session/SQLiteGenerateDraftPort';
import { SQLiteGenerateLineageSourcePort } from '../generate-session/SQLiteGenerateLineageSourcePort';
import { SQLiteLineageMetadataPort } from '../lineage/SQLiteLineageMetadataPort';

export const archiveMetadataPort = new SQLiteArchiveMetadataPort();
export const lineageMetadataPort = new SQLiteLineageMetadataPort();
export const credentialsPort = new SQLiteCredentialsPort();
export const generateDraftPort = new SQLiteGenerateDraftPort();
export const autopilotSettingsPort = new SQLiteAutopilotSettingsPort();
export const generateLineageSourcePort = new SQLiteGenerateLineageSourcePort();

let initializationPromise: Promise<void> | null = null;

export function initializeAuraPersistence(): Promise<void> {
    if (!initializationPromise) {
        initializationPromise = Promise.all([
            archiveMetadataPort.init(),
            lineageMetadataPort.init(),
            credentialsPort.init(),
            generateDraftPort.init(),
            autopilotSettingsPort.init(),
            generateLineageSourcePort.init(),
        ]).then(() => undefined);
    }

    return initializationPromise;
}
