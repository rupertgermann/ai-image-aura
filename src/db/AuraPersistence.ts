import { SQLiteArchiveMetadataPort } from '../archive/SQLiteArchiveMetadataPort';
import { SQLiteLineageMetadataPort } from '../lineage/SQLiteLineageMetadataPort';

export const archiveMetadataPort = new SQLiteArchiveMetadataPort();
export const lineageMetadataPort = new SQLiteLineageMetadataPort();

let initializationPromise: Promise<void> | null = null;

export function initializeAuraPersistence(): Promise<void> {
    if (!initializationPromise) {
        initializationPromise = Promise.all([
            archiveMetadataPort.init(),
            lineageMetadataPort.init(),
        ]).then(() => undefined);
    }

    return initializationPromise;
}
