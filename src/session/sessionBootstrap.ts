import {
    autopilotSettingsPort,
    credentialsPort,
    generateDraftPort,
    generateLineageSourcePort,
    initializeAuraPersistence,
} from '../db/AuraPersistence';
import { createGenerateSessionStore } from '../generate-session/GenerateSession';
import { createLocalStorageMigrator } from './LocalStorageMigrator';
import { createSessionHydrator } from './SessionHydrator';

export const sessionHydrator = createSessionHydrator({
    credentialsPort,
    generateDraftPort,
    autopilotSettingsPort,
    generateLineageSourcePort,
    bootstrap: () => initializeAuraPersistence(),
});

export const localStorageMigrator = createLocalStorageMigrator({
    credentialsPort,
    generateDraftPort,
    autopilotSettingsPort,
    generateLineageSourcePort,
});

export const generateSessionStore = createGenerateSessionStore({
    draftHandle: {
        getDraft: () => sessionHydrator.getDraft(),
        setDraft: (draft) => sessionHydrator.setGenerateDraft(draft),
    },
    lineageSourceHandle: {
        getLineageSource: () => sessionHydrator.getGenerateLineageSource(),
        setLineageSource: (source) => sessionHydrator.setGenerateLineageSource(source),
        clearLineageSource: () => sessionHydrator.clearGenerateLineageSource(),
    },
});
