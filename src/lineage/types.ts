export type LineageStepType =
    | 'generation'
    | 'reference-generation'
    | 'ai-edit'
    | 'manual-edit'
    | 'overwrite'
    | 'save-as-copy'
    | 'autopilot-iteration';

export interface LineageStep {
    id: string;
    archiveImageId: string;
    parentStepId: string | null;
    stepType: LineageStepType;
    timestamp: string;
    metadata: Record<string, unknown>;
}

export type SaveLineageStepInput = Omit<LineageStep, 'id'> & {
    id?: string;
};
