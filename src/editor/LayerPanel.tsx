import { Copy, Eye, EyeOff, Lock, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import type { ArchiveLayerStack } from '../db/types';

interface LayerPanelProps {
    layerStack: ArchiveLayerStack;
    selectedLayerIds: string[];
    primarySelectedLayerId: string | null;
    onSelectLayer: (layerId: string, additive?: boolean) => void;
    onRenameLayer: (layerId: string, name: string) => void;
    onSetVisible: (layerId: string, visible: boolean) => void;
    onSetOpacity: (layerId: string, opacity: number) => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onMove: (direction: -1 | 1) => void;
}

export function LayerPanel({
    layerStack,
    selectedLayerIds,
    primarySelectedLayerId,
    onSelectLayer,
    onRenameLayer,
    onSetVisible,
    onSetOpacity,
    onDuplicate,
    onDelete,
    onMove,
}: LayerPanelProps) {
    const primaryLayer = layerStack.layers.find((layer) => layer.id === primarySelectedLayerId);
    const canEditPrimary = !!primaryLayer && !primaryLayer.locked;

    return (
        <div className="layer-panel">
            <div className="layer-panel-actions">
                <button className="btn-icon" title="Move layer up" disabled={!canEditPrimary} onClick={() => onMove(1)}>
                    <ChevronUp size={16} />
                </button>
                <button className="btn-icon" title="Move layer down" disabled={!canEditPrimary} onClick={() => onMove(-1)}>
                    <ChevronDown size={16} />
                </button>
                <button className="btn-icon" title="Duplicate selected layers" disabled={!canEditPrimary} onClick={onDuplicate}>
                    <Copy size={16} />
                </button>
                <button className="btn-icon" title="Delete selected layers" disabled={!canEditPrimary} onClick={onDelete}>
                    <Trash2 size={16} />
                </button>
            </div>
            <div className="layer-list">
                {[...layerStack.layers].reverse().map((layer) => {
                    const selected = selectedLayerIds.includes(layer.id);
                    return (
                        <div key={layer.id} className={`layer-row ${selected ? 'selected' : ''}`}>
                            <button
                                className="btn-icon"
                                title={layer.visible ? 'Hide layer' : 'Show layer'}
                                disabled={layer.kind === 'base'}
                                onClick={() => onSetVisible(layer.id, !layer.visible)}
                            >
                                {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                            </button>
                            <button
                                className="layer-name"
                                onClick={(event) => onSelectLayer(layer.id, event.shiftKey || event.metaKey)}
                            >
                                {layer.locked && <Lock size={12} />}
                                <span>{layer.name}</span>
                            </button>
                            <input
                                aria-label={`${layer.name} name`}
                                value={layer.name}
                                disabled={layer.locked}
                                onChange={(event) => onRenameLayer(layer.id, event.target.value)}
                            />
                            <input
                                aria-label={`${layer.name} opacity`}
                                type="range"
                                min="0"
                                max="100"
                                value={Math.round(layer.opacity * 100)}
                                disabled={layer.locked}
                                onChange={(event) => onSetOpacity(layer.id, Number(event.target.value) / 100)}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
