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
    const primaryLayerIndex = primarySelectedLayerId
        ? layerStack.layers.findIndex((layer) => layer.id === primarySelectedLayerId)
        : -1;
    const canEditPrimary = !!primaryLayer && primaryLayer.kind !== 'base' && !primaryLayer.locked;
    const selectedEditableCount = layerStack.layers.filter((layer) => (
        selectedLayerIds.includes(layer.id) && layer.kind !== 'base' && !layer.locked
    )).length;
    const canMoveUp = canEditPrimary && primaryLayerIndex < layerStack.layers.length - 1;
    const canMoveDown = canEditPrimary && primaryLayerIndex > 1;
    const canDuplicate = selectedEditableCount > 0;
    const canDelete = selectedEditableCount > 0;

    return (
        <div className="layer-panel">
            <div className="layer-panel-actions">
                <button className="btn-icon" title="Move layer up" disabled={!canMoveUp} onClick={() => onMove(1)}>
                    <ChevronUp size={16} />
                </button>
                <button className="btn-icon" title="Move layer down" disabled={!canMoveDown} onClick={() => onMove(-1)}>
                    <ChevronDown size={16} />
                </button>
                <button className="btn-icon" title="Duplicate selected layers" disabled={!canDuplicate} onClick={onDuplicate}>
                    <Copy size={16} />
                </button>
                <button className="btn-icon" title="Delete selected layers" disabled={!canDelete} onClick={onDelete}>
                    <Trash2 size={16} />
                </button>
            </div>
            {selectedLayerIds.length > 0 && (
                <div className="layer-selection-summary">
                    {selectedLayerIds.length} selected - {selectedEditableCount} editable
                </div>
            )}
            <div className="layer-list">
                {[...layerStack.layers].reverse().map((layer) => {
                    const selected = selectedLayerIds.includes(layer.id);
                    const opacityPercent = Math.round(layer.opacity * 100);
                    return (
                        <div key={layer.id} className={`layer-row ${selected ? 'selected' : ''} ${!layer.visible ? 'hidden' : ''}`}>
                            <button
                                className="btn-icon"
                                title={layer.visible ? 'Hide layer' : 'Show layer'}
                                aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                                disabled={layer.kind === 'base'}
                                onClick={() => onSetVisible(layer.id, !layer.visible)}
                            >
                                {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                            </button>
                            <button
                                className="layer-name"
                                aria-pressed={selected}
                                onClick={(event) => onSelectLayer(layer.id, event.shiftKey || event.metaKey)}
                            >
                                {layer.locked && <Lock size={12} />}
                                <span>{layer.name}</span>
                                <small>{layer.kind === 'base' ? 'Base' : `${opacityPercent}%`}</small>
                            </button>
                            <input
                                type="text"
                                aria-label={`${layer.name} name`}
                                value={layer.name}
                                disabled={layer.locked}
                                onChange={(event) => onRenameLayer(layer.id, event.target.value)}
                            />
                            <div className="layer-opacity-control">
                                <input
                                    aria-label={`${layer.name} opacity`}
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={opacityPercent}
                                    disabled={layer.locked}
                                    onChange={(event) => onSetOpacity(layer.id, Number(event.target.value) / 100)}
                                />
                                <span>{opacityPercent}%</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
