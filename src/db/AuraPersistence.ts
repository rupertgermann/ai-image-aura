import { SQLiteArchiveMetadataPort } from '../archive/SQLiteArchiveMetadataPort';
import { SQLiteCredentialsPort } from '../credentials/SQLiteCredentialsPort';
import { SQLiteLineageMetadataPort } from '../lineage/SQLiteLineageMetadataPort';

export const archiveMetadataPort = new SQLiteArchiveMetadataPort();
export const lineageMetadataPort = new SQLiteLineageMetadataPort();
export const credentialsPort = new SQLiteCredentialsPort();

let initializationPromise: Promise<void> | null = null;

export function initializeAuraPersistence(): Promise<void> {
    if (!initializationPromise) {
        initializationPromise = Promise.all([
            archiveMetadataPort.init(),
            lineageMetadataPort.init(),
            credentialsPort.init(),
        ]).then(() => undefined);
    }

    return initializationPromise;
}
