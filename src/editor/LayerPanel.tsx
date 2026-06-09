import { useState } from 'react';
import { Copy, Eye, EyeOff, Lock, LockOpen, Trash2, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { ARCHIVE_LAYER_BLEND_MODES, type ArchiveLayerBlendMode, type ArchiveLayerStack } from '../db/types';

interface LayerPanelProps {
    layerStack: ArchiveLayerStack;
    selectedLayerIds: string[];
    primarySelectedLayerId: string | null;
    onSelectLayer: (layerId: string, additive?: boolean) => void;
    onRenameLayer: (layerId: string, name: string) => void;
    onSetVisible: (layerId: string, visible: boolean) => void;
    onSetOpacity: (layerId: string, opacity: number) => void;
    onSetLocked: (layerId: string, locked: boolean) => void;
    onSetBlendMode: (layerId: string, blendMode: ArchiveLayerBlendMode) => void;
    onReorder: (layerId: string, targetIndex: number) => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onMove: (direction: -1 | 1) => void;
}

const BLEND_MODE_LABELS: Record<ArchiveLayerBlendMode, string> = {
    'normal': 'Normal',
    'multiply': 'Multiply',
    'screen': 'Screen',
    'overlay': 'Overlay',
    'darken': 'Darken',
    'lighten': 'Lighten',
    'soft-light': 'Soft light',
    'difference': 'Difference',
};

export function LayerPanel({
    layerStack,
    selectedLayerIds,
    primarySelectedLayerId,
    onSelectLayer,
    onRenameLayer,
    onSetVisible,
    onSetOpacity,
    onSetLocked,
    onSetBlendMode,
    onReorder,
    onDuplicate,
    onDelete,
    onMove,
}: LayerPanelProps) {
    const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
    const [dropTargetLayerId, setDropTargetLayerId] = useState<string | null>(null);
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
                    const stackIndex = layerStack.layers.findIndex((candidate) => candidate.id === layer.id);
                    const selected = selectedLayerIds.includes(layer.id);
                    const draggable = layer.kind !== 'base' && !layer.locked;
                    const rowClasses = [
                        'layer-row',
                        selected ? 'selected' : '',
                        !layer.visible ? 'hidden' : '',
                        dropTargetLayerId === layer.id && draggedLayerId !== layer.id ? 'drop-target' : '',
                    ].filter(Boolean).join(' ');
                    return (
                        <div
                            key={layer.id}
                            className={rowClasses}
                            onDragOver={(event) => {
                                if (!draggedLayerId || draggedLayerId === layer.id) {
                                    return;
                                }
                                event.preventDefault();
                                setDropTargetLayerId(layer.id);
                            }}
                            onDragLeave={() => {
                                setDropTargetLayerId((current) => current === layer.id ? null : current);
                            }}
                            onDrop={(event) => {
                                event.preventDefault();
                                if (draggedLayerId && draggedLayerId !== layer.id) {
                                    onReorder(draggedLayerId, Math.max(1, stackIndex));
                                }
                                setDraggedLayerId(null);
                                setDropTargetLayerId(null);
                            }}
                        >
                            <span
                                className={`layer-drag-handle ${draggable ? '' : 'disabled'}`}
                                title={draggable ? 'Drag to reorder' : undefined}
                                draggable={draggable}
                                onDragStart={(event) => {
                                    event.dataTransfer.effectAllowed = 'move';
                                    setDraggedLayerId(layer.id);
                                }}
                                onDragEnd={() => {
                                    setDraggedLayerId(null);
                                    setDropTargetLayerId(null);
                                }}
                            >
                                <GripVertical size={14} />
                            </span>
                            <span className="layer-thumbnail" aria-hidden="true">
                                <img src={layer.assetUrl} alt="" loading="lazy" draggable={false} />
                            </span>
                            <button
                                className="layer-name"
                                aria-pressed={selected}
                                onClick={(event) => onSelectLayer(layer.id, event.shiftKey || event.metaKey)}
                            >
                                <span>{layer.name}</span>
                                <small>
                                    {layer.kind === 'base'
                                        ? 'Base'
                                        : layer.blendMode !== 'normal'
                                            ? `${BLEND_MODE_LABELS[layer.blendMode]} - ${Math.round(layer.opacity * 100)}%`
                                            : `${Math.round(layer.opacity * 100)}%`}
                                </small>
                            </button>
                            <div className="layer-row-toggles">
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
                                    className="btn-icon"
                                    title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                                    aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                                    disabled={layer.kind === 'base'}
                                    onClick={() => onSetLocked(layer.id, !layer.locked)}
                                >
                                    {layer.locked ? <Lock size={16} /> : <LockOpen size={16} />}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            {primaryLayer && primaryLayer.kind !== 'base' && (
                <div className="layer-detail">
                    <input
                        type="text"
                        aria-label={`${primaryLayer.name} name`}
                        value={primaryLayer.name}
                        disabled={primaryLayer.locked}
                        onChange={(event) => onRenameLayer(primaryLayer.id, event.target.value)}
                    />
                    <label className="layer-blend-control">
                        <span>Blend</span>
                        <select
                            aria-label={`${primaryLayer.name} blend mode`}
                            value={primaryLayer.blendMode}
                            disabled={primaryLayer.locked}
                            onChange={(event) => onSetBlendMode(primaryLayer.id, event.target.value as ArchiveLayerBlendMode)}
                        >
                            {ARCHIVE_LAYER_BLEND_MODES.map((mode) => (
                                <option key={mode} value={mode}>{BLEND_MODE_LABELS[mode]}</option>
                            ))}
                        </select>
                    </label>
                    <div className="layer-opacity-control">
                        <input
                            aria-label={`${primaryLayer.name} opacity`}
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round(primaryLayer.opacity * 100)}
                            disabled={primaryLayer.locked}
                            onChange={(event) => onSetOpacity(primaryLayer.id, Number(event.target.value) / 100)}
                        />
                        <span>{Math.round(primaryLayer.opacity * 100)}%</span>
                    </div>
                </div>
            )}
        </div>
    );
}
