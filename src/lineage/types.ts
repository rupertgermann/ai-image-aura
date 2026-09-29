export type LineageStepType =
    | 'generation'
    | 'reference-generation'
    | 'ai-edit'
    | 'manual-edit'
    | 'overwrite'
    | 'save-as-copy'
    | 'autopilot-iteration';

export interface LineageStep<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
    id: string;
    archiveImageId: string;
    parentStepId: string | null;
    stepType: LineageStepType;
    timestamp: string;
    metadata: TMetadata;
}

export type SaveLineageStepInput = Omit<LineageStep, 'id'> & {
    id?: string;
};
