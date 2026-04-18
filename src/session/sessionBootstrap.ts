import { credentialsPort, initializeAuraPersistence } from '../db/AuraPersistence';
import { createLocalStorageMigrator } from './LocalStorageMigrator';
import { createSessionHydrator } from './SessionHydrator';

export const sessionHydrator = createSessionHydrator({
    credentialsPort,
    bootstrap: () => initializeAuraPersistence(),
});

export const localStorageMigrator = createLocalStorageMigrator({
    credentialsPort,
});
