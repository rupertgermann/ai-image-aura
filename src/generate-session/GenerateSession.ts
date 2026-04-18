import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ArchiveImage } from '../db/types';
import { storage, type StorageProvider } from '../services/StorageService';
import type { ImageBackground, ImageQuality } from '../utils/openai';
import { useSessionContext } from '../session/sessionContextValue';

export const GENERATE_DRAFT_KEY = 'aura_generate_draft';
const GENERATE_CURRENT_RESULT_KEY = 'generate_current_result';
const GENERATE_TRANSFERRED_REFERENCES_KEY = 'generate_transferred_references';
const GENERATE_LINEAGE_SOURCE_KEY = 'generate_lineage_source';
const VALID_ASPECT_RATIOS = new Set(['1024x1024', '1536x1024', '1024x1536', 'auto']);

export const LEGACY_DRAFT_KEYS = {
    prompt: 'aura_generate_prompt',
    quality: 'aura_generate_quality',
    aspectRatio: 'aura_generate_aspect_ratio',
    background: 'aura_generate_background',
    style: 'aura_generate_style',
    lighting: 'aura_generate_lighting',
    palette: 'aura_generate_palette',
    isSaved: 'aura_generate_is_saved',
} as const;

export type LegacyDraftField = keyof typeof LEGACY_DRAFT_KEYS;

export interface GenerateDraft {
    prompt: string;
    quality: ImageQuality;
    aspectRatio: string;
    background: ImageBackground;
    style: string;
    lighting: string;
    palette: string;
    isSaved: boolean;
}

export interface GenerateLineageSource {
    archiveImageId: string;
    stepId?: string | null;
}

export interface GenerateSessionStore {
    readDraft(): GenerateDraft;
    writeDraft(draft: GenerateDraft): void;
    transferFromArchive(image: ArchiveImage, lineageSource?: GenerateLineageSource | null, draftOverrides?: Partial<GenerateDraft>): Promise<void>;
    loadLineageSource(): GenerateLineageSource | null;
    saveLineageSource(source: GenerateLineageSource): void;
    clearLineageSource(): void;
    loadCurrentResult(): Promise<string | null>;
    saveCurrentResult(result: string): Promise<void>;
    clearCurrentResult(): Promise<void>;
    consumeTransferredReferences(): Promise<string[]>;
}

export interface SessionDraftHandle {
    getDraft(): GenerateDraft;
    setDraft(draft: GenerateDraft): Promise<void> | void;
}

interface CreateGenerateSessionStoreDeps {
    draftHandle: SessionDraftHandle;
    blobStorage?: StorageProvider;
    localStorage?: Storage;
}

export const DEFAULT_GENERATE_DRAFT: GenerateDraft = {
    prompt: '',
    quality: 'medium',
    aspectRatio: '1024x1024',
    background: 'auto',
    style: 'none',
    lighting: 'none',
    palette: 'none',
    isSaved: false,
};

class HandleBackedGenerateSessionStore implements GenerateSessionStore {
    private readonly blobStorage: StorageProvider;
    private readonly localStorage: Storage;
    private readonly draftHandle: SessionDraftHandle;

    constructor(blobStorage: StorageProvider, localStorage: Storage, draftHandle: SessionDraftHandle) {
        this.blobStorage = blobStorage;
        this.localStorage = localStorage;
        this.draftHandle = draftHandle;
    }

    readDraft(): GenerateDraft {
        return sanitizeGenerateDraft(this.draftHandle.getDraft());
    }

    writeDraft(draft: GenerateDraft): void {
        const nextDraft = sanitizeGenerateDraft(draft);
        void this.draftHandle.setDraft(nextDraft);
    }

    async transferFromArchive(image: ArchiveImage, lineageSource: GenerateLineageSource | null = { archiveImageId: image.id }, draftOverrides: Partial<GenerateDraft> = {}): Promise<void> {
        this.writeDraft({
            prompt: image.prompt,
            quality: coerceQuality(image.quality),
            aspectRatio: image.aspectRatio,
            background: coerceBackground(image.background),
            style: image.style || 'none',
            lighting: image.lighting || 'none',
            palette: image.palette || 'none',
            isSaved: false,
            ...draftOverrides,
        });
        if (lineageSource) {
            this.saveLineageSource(lineageSource);
        } else {
            this.clearLineageSource();
        }

        if (image.references && image.references.length > 0) {
            await this.blobStorage.save(GENERATE_TRANSFERRED_REFERENCES_KEY, JSON.stringify(image.references));
            return;
        }

        await this.blobStorage.remove(GENERATE_TRANSFERRED_REFERENCES_KEY);
    }

    loadLineageSource(): GenerateLineageSource | null {
        return this.readJson<GenerateLineageSource>(GENERATE_LINEAGE_SOURCE_KEY);
    }

    saveLineageSource(source: GenerateLineageSource): void {
        this.localStorage.setItem(GENERATE_LINEAGE_SOURCE_KEY, JSON.stringify(source));
    }

    clearLineageSource(): void {
        this.localStorage.removeItem(GENERATE_LINEAGE_SOURCE_KEY);
    }

    loadCurrentResult(): Promise<string | null> {
        return this.blobStorage.load(GENERATE_CURRENT_RESULT_KEY);
    }

    saveCurrentResult(result: string): Promise<void> {
        return this.blobStorage.save(GENERATE_CURRENT_RESULT_KEY, result);
    }

    clearCurrentResult(): Promise<void> {
        return this.blobStorage.remove(GENERATE_CURRENT_RESULT_KEY);
    }

    async consumeTransferredReferences(): Promise<string[]> {
        const value = await this.blobStorage.load(GENERATE_TRANSFERRED_REFERENCES_KEY);
        await this.blobStorage.remove(GENERATE_TRANSFERRED_REFERENCES_KEY);

        if (!value) {
            return [];
        }

        try {
            const references = JSON.parse(value) as string[];
            return Array.isArray(references) ? references : [];
        } catch {
            return [];
        }
    }

    private readJson<T>(key: string): T | null {
        const rawValue = this.localStorage.getItem(key);
        if (!rawValue) {
            return null;
        }

        try {
            return JSON.parse(rawValue) as T;
        } catch {
            return null;
        }
    }
}

export function createGenerateSessionStore(deps: CreateGenerateSessionStoreDeps): GenerateSessionStore {
    return new HandleBackedGenerateSessionStore(
        deps.blobStorage ?? storage,
        deps.localStorage ?? window.localStorage,
        deps.draftHandle,
    );
}

export function useGenerateDraft(): readonly [GenerateDraft, Dispatch<SetStateAction<GenerateDraft>>] {
    const ctx = useSessionContext();
    const draft = ctx.state.snapshot.generateDraft;
    const draftRef = useRef(draft);
    useEffect(() => {
        draftRef.current = draft;
    }, [draft]);
    const { setGenerateDraft } = ctx;
    const setDraft = useCallback<Dispatch<SetStateAction<GenerateDraft>>>(
        (update) => {
            const next = typeof update === 'function'
                ? (update as (current: GenerateDraft) => GenerateDraft)(draftRef.current)
                : update;
            void setGenerateDraft(sanitizeGenerateDraft(next));
        },
        [setGenerateDraft],
    );
    return [draft, setDraft] as const;
}

export const sanitizeGenerateDraft = (draft: Partial<Record<keyof GenerateDraft, unknown>>): GenerateDraft => ({
    prompt: typeof draft.prompt === 'string' ? draft.prompt : DEFAULT_GENERATE_DRAFT.prompt,
    quality: coerceQuality(draft.quality),
    aspectRatio: typeof draft.aspectRatio === 'string' && VALID_ASPECT_RATIOS.has(draft.aspectRatio)
        ? draft.aspectRatio
        : DEFAULT_GENERATE_DRAFT.aspectRatio,
    background: coerceBackground(draft.background),
    style: typeof draft.style === 'string' ? draft.style : DEFAULT_GENERATE_DRAFT.style,
    lighting: typeof draft.lighting === 'string' ? draft.lighting : DEFAULT_GENERATE_DRAFT.lighting,
    palette: typeof draft.palette === 'string' ? draft.palette : DEFAULT_GENERATE_DRAFT.palette,
    isSaved: typeof draft.isSaved === 'boolean' ? draft.isSaved : DEFAULT_GENERATE_DRAFT.isSaved,
});

const coerceQuality = (quality: unknown): ImageQuality => {
    return quality === 'low' || quality === 'medium' || quality === 'high'
        ? quality
        : DEFAULT_GENERATE_DRAFT.quality;
};

const coerceBackground = (background: unknown): ImageBackground => {
    return background === 'auto' || background === 'opaque' || background === 'transparent'
        ? background
        : DEFAULT_GENERATE_DRAFT.background;
};
