import type { GenerateLineageMetadata } from './generateLineageMetadata';

export type LineageStepType =
    | 'generation'
    | 'reference-generation'
    | 'ai-edit'
    | 'manual-edit'
    | 'overwrite'
    | 'save-as-copy'
    | 'autopilot-iteration';

export type GenerateLineageStepType = 'generation' | 'reference-generation';

export interface LineageStep<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
    id: string;
    archiveImageId: string;
    parentStepId: string | null;
    stepType: LineageStepType;
    timestamp: string;
    metadata: TMetadata;
}

export type GenerateLineageStep = LineageStep<GenerateLineageMetadata> & {
    stepType: GenerateLineageStepType;
};

export type SaveLineageStepInput = Omit<LineageStep, 'id'> & {
    id?: string;
};
