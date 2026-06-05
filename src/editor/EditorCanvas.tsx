import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from 'react-konva';
import Konva from 'konva';
import type { ArchiveLayer, ArchiveLayerStack } from '../db/types';
import type { EditorAdjustments } from './layers';
import { renderLayerStackToBlob, renderLayerStackToDataUrl } from './renderLayerStack';

export interface EditorCanvasHandle {
    exportDataUrl: () => Promise<string>;
    exportBlob: () => Promise<Blob>;
}

interface EditorCanvasProps {
    layerStack: ArchiveLayerStack;
    adjustments: EditorAdjustments;
    selectedLayerIds: string[];
    primarySelectedLayerId: string | null;
    onSelectLayer: (layerId: string, additive?: boolean) => void;
    onTransformLayer: (layerId: string, patch: { x: number; y: number; width: number; height: number; rotation: number }) => void;
}

export const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(({
    layerStack,
    adjustments,
    selectedLayerIds,
    primarySelectedLayerId,
    onSelectLayer,
    onTransformLayer,
}, ref) => {
    const transformerRef = useRef<Konva.Transformer>(null);
    const layerRefs = useRef(new Map<string, Konva.Image>());
    const scale = useMemo(() => {
        const maxWidth = 920;
        const maxHeight = 720;
        return Math.min(maxWidth / layerStack.canvasWidth, maxHeight / layerStack.canvasHeight, 1);
    }, [layerStack.canvasHeight, layerStack.canvasWidth]);
    const selectedLayer = layerStack.layers.find((layer) => layer.id === primarySelectedLayerId);
    const canTransform = selectedLayer && !selectedLayer.locked;

    useImperativeHandle(ref, () => ({
        exportDataUrl: () => renderLayerStackToDataUrl(layerStack, adjustments),
        exportBlob: () => renderLayerStackToBlob(layerStack, adjustments),
    }), [adjustments, layerStack]);

    useEffect(() => {
        const node = primarySelectedLayerId ? layerRefs.current.get(primarySelectedLayerId) : null;
        if (node && canTransform) {
            transformerRef.current?.nodes([node]);
        } else {
            transformerRef.current?.nodes([]);
        }
        transformerRef.current?.getLayer()?.batchDraw();
    }, [canTransform, primarySelectedLayerId, layerStack]);

    return (
        <Stage
            width={layerStack.canvasWidth * scale}
            height={layerStack.canvasHeight * scale}
            scaleX={scale}
            scaleY={scale}
            className="editor-stage"
            onMouseDown={(event) => {
                if (event.target === event.target.getStage()) {
                    onSelectLayer('base');
                }
            }}
        >
            <Layer>
                <Rect
                    x={0}
                    y={0}
                    width={layerStack.canvasWidth}
                    height={layerStack.canvasHeight}
                    fill="#f4f1ec"
                />
                {layerStack.layers.map((layer) => (
                    <CanvasLayerImage
                        key={layer.id}
                        layer={layer}
                        selected={selectedLayerIds.includes(layer.id)}
                        setNode={(node) => {
                            if (node) {
                                layerRefs.current.set(layer.id, node);
                            } else {
                                layerRefs.current.delete(layer.id);
                            }
                        }}
                        onSelect={(additive) => onSelectLayer(layer.id, additive)}
                        onTransform={(patch) => onTransformLayer(layer.id, patch)}
                    />
                ))}
                <Transformer
                    ref={transformerRef}
                    rotateEnabled
                    enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                    keepRatio
                />
            </Layer>
        </Stage>
    );
});

function CanvasLayerImage({
    layer,
    selected,
    setNode,
    onSelect,
    onTransform,
}: {
    layer: ArchiveLayer;
    selected: boolean;
    setNode: (node: Konva.Image | null) => void;
    onSelect: (additive: boolean) => void;
    onTransform: (patch: { x: number; y: number; width: number; height: number; rotation: number }) => void;
}) {
    const image = useLoadedImage(layer.assetUrl);
    const imageRef = useRef<Konva.Image>(null);

    useEffect(() => {
        setNode(imageRef.current);
        return () => setNode(null);
    }, [setNode]);

    if (!layer.visible || !image) {
        return null;
    }

    return (
        <KonvaImage
            ref={imageRef}
            image={image}
            x={layer.x}
            y={layer.y}
            width={layer.width}
            height={layer.height}
            rotation={layer.rotation}
            opacity={layer.opacity}
            draggable={!layer.locked}
            shadowColor={selected ? '#b45f06' : undefined}
            shadowBlur={selected ? 12 : 0}
            onMouseDown={(event) => {
                event.cancelBubble = true;
                onSelect(event.evt.shiftKey || event.evt.metaKey);
            }}
            onDragEnd={(event) => {
                onTransform({
                    x: event.target.x(),
                    y: event.target.y(),
                    width: layer.width,
                    height: layer.height,
                    rotation: layer.rotation,
                });
            }}
            onTransformEnd={(event) => {
                const node = event.target;
                const width = Math.max(1, node.width() * node.scaleX());
                const height = Math.max(1, node.height() * node.scaleY());
                node.scaleX(1);
                node.scaleY(1);
                onTransform({
                    x: node.x(),
                    y: node.y(),
                    width,
                    height,
                    rotation: node.rotation(),
                });
            }}
        />
    );
}

function useLoadedImage(source: string) {
    const [image, setImage] = useState<HTMLImageElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        const nextImage = new Image();
        nextImage.crossOrigin = 'anonymous';
        nextImage.onload = () => {
            if (!cancelled) {
                setImage(nextImage);
            }
        };
        nextImage.onerror = () => {
            if (!cancelled) {
                setImage(null);
            }
        };
        nextImage.src = source;

        return () => {
            cancelled = true;
        };
    }, [source]);

    return image;
}
