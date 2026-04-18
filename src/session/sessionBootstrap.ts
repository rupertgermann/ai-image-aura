import { credentialsPort, generateDraftPort, initializeAuraPersistence } from '../db/AuraPersistence';
import { createGenerateSessionStore } from '../generate-session/GenerateSession';
import { createLocalStorageMigrator } from './LocalStorageMigrator';
import { createSessionHydrator } from './SessionHydrator';

export const sessionHydrator = createSessionHydrator({
    credentialsPort,
    generateDraftPort,
    bootstrap: () => initializeAuraPersistence(),
});

export const localStorageMigrator = createLocalStorageMigrator({
    credentialsPort,
    generateDraftPort,
});

export const generateSessionStore = createGenerateSessionStore({
    draftHandle: {
        getDraft: () => sessionHydrator.getDraft(),
        setDraft: (draft) => sessionHydrator.setGenerateDraft(draft),
    },
});
