/**
 * KonvaCanvas — GPU-accelerated canvas rendering engine
 *
 * Replaces SVG rendering for better performance at 100+ elements.
 * Uses HTML5 Canvas via Konva/react-konva.
 *
 * Limitations vs SVG:
 * - Text rendering uses Konva.Text (no HTML/CSS styling)
 * - Video elements render as placeholder thumbnails
 * - Export uses canvas.toDataURL instead of SVG serialization
 */

import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Rect, Circle, Ellipse, Line, Arrow, Image as KonvaImage, Text as KonvaText, Group, Transformer } from 'react-konva';
import Konva from 'konva';
import type { Element, ImageElement, PathElement, ShapeElement, TextElement, ArrowElement, LineElement, VideoElement, GroupElement, Point } from '../../types';
import type { Rect as RectType, Guide } from '../../utils/geometry';
import { getElementBounds } from '../../utils/geometry';

interface KonvaCanvasProps {
    elements: Element[];
    selectedElementIds: string[];
    panOffset: Point;
    zoom: number;
    activeTool: string;
    drawingOptions: { strokeColor: string; strokeWidth: number };
    croppingState: any;
    selectionBox: RectType | null;
    alignmentGuides: Guide[];
    lassoPath: Point[] | null;
    editingElement: { id: string; text: string } | null;
    canvasBackgroundColor: string;
    interactionMode: React.MutableRefObject<string | null>;

    onMouseDown: (e: any) => void;
    onMouseMove: (e: any) => void;
    onMouseUp: (e: any) => void;
    onWheel: (e: any) => void;
    onContextMenu: (e: any) => void;

    width: number;
    height: number;
}

// Cache loaded images to avoid re-creating Image objects
const imageCache = new Map<string, HTMLImageElement>();

function useImage(href: string): HTMLImageElement | null {
    const [image, setImage] = React.useState<HTMLImageElement | null>(() => imageCache.get(href) || null);

    useEffect(() => {
        if (imageCache.has(href)) {
            setImage(imageCache.get(href)!);
            return;
        }

        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            imageCache.set(href, img);
            setImage(img);
        };
        img.src = href;
    }, [href]);

    return image;
}

// Individual element renderers

const PathRenderer: React.FC<{ el: PathElement; zoom: number }> = ({ el, zoom }) => {
    if (el.points.length < 2) return null;
    const flatPoints = el.points.flatMap(p => [p.x, p.y]);
    return (
        <Line
            points={flatPoints}
            stroke={el.strokeColor}
            strokeWidth={el.strokeWidth / zoom}
            opacity={el.strokeOpacity ?? 1}
            lineCap="round"
            lineJoin="round"
            listening={true}
            hitStrokeWidth={Math.max(el.strokeWidth / zoom, 10)}
        />
    );
};

const ArrowRenderer: React.FC<{ el: ArrowElement; zoom: number }> = ({ el, zoom }) => {
    const [start, end] = el.points;
    return (
        <Arrow
            points={[start.x, start.y, end.x, end.y]}
            stroke={el.strokeColor}
            strokeWidth={el.strokeWidth / zoom}
            fill={el.strokeColor}
            pointerLength={el.strokeWidth * 4}
            pointerWidth={el.strokeWidth * 3}
            lineCap="round"
        />
    );
};

const LineRenderer: React.FC<{ el: LineElement; zoom: number }> = ({ el, zoom }) => {
    const [start, end] = el.points;
    return (
        <Line
            points={[start.x, start.y, end.x, end.y]}
            stroke={el.strokeColor}
            strokeWidth={el.strokeWidth / zoom}
            lineCap="round"
        />
    );
};

const ShapeRenderer: React.FC<{ el: ShapeElement; zoom: number }> = ({ el, zoom }) => {
    const commonProps = {
        x: el.x,
        y: el.y,
        fill: el.fillColor,
        stroke: el.strokeColor,
        strokeWidth: el.strokeWidth / zoom,
        dash: el.strokeDashArray ? [...el.strokeDashArray] : undefined,
    };

    if (el.shapeType === 'rectangle') {
        return (
            <Rect
                {...commonProps}
                width={el.width}
                height={el.height}
                cornerRadius={el.borderRadius || 0}
            />
        );
    }
    if (el.shapeType === 'circle') {
        return (
            <Ellipse
                {...commonProps}
                x={el.x + el.width / 2}
                y={el.y + el.height / 2}
                radiusX={el.width / 2}
                radiusY={el.height / 2}
            />
        );
    }
    if (el.shapeType === 'triangle') {
        return (
            <Line
                {...commonProps}
                points={[el.width / 2, 0, 0, el.height, el.width, el.height]}
                closed
                x={el.x}
                y={el.y}
            />
        );
    }
    return null;
};

const ImageRenderer: React.FC<{ el: ImageElement; isCropping: boolean }> = ({ el, isCropping }) => {
    const image = useImage(el.href);
    if (!image) return null;

    return (
        <KonvaImage
            x={el.x}
            y={el.y}
            width={el.width}
            height={el.height}
            image={image}
            opacity={isCropping ? 0.3 : 1}
            cornerRadius={el.borderRadius || 0}
        />
    );
};

const TextRenderer: React.FC<{ el: TextElement }> = ({ el }) => {
    return (
        <KonvaText
            x={el.x}
            y={el.y}
            width={el.width}
            height={el.height}
            text={el.text}
            fontSize={el.fontSize}
            fill={el.fontColor}
            fontFamily="Inter, system-ui, sans-serif"
            wrap="word"
        />
    );
};

const VideoPlaceholder: React.FC<{ el: VideoElement }> = ({ el }) => {
    return (
        <Group x={el.x} y={el.y}>
            <Rect width={el.width} height={el.height} fill="#1a1a2e" cornerRadius={8} />
            <KonvaText
                x={0}
                y={el.height / 2 - 10}
                width={el.width}
                text="Video"
                fontSize={14}
                fill="#999"
                align="center"
            />
        </Group>
    );
};

// Selection overlay
const SelectionOverlay: React.FC<{
    el: Element;
    elements: Element[];
    selectedElementIds: string[];
    zoom: number;
    croppingState: any;
}> = ({ el, elements, selectedElementIds, zoom, croppingState }) => {
    if (!selectedElementIds.includes(el.id) || croppingState) return null;

    const bounds = getElementBounds(el, elements);
    const isMultiSelect = selectedElementIds.length > 1 || el.type === 'path' || el.type === 'arrow' || el.type === 'line' || el.type === 'group';

    if (isMultiSelect) {
        return (
            <Rect
                x={bounds.x}
                y={bounds.y}
                width={bounds.width}
                height={bounds.height}
                stroke="rgb(59, 130, 246)"
                strokeWidth={2 / zoom}
                dash={[6 / zoom, 4 / zoom]}
                listening={false}
            />
        );
    }

    // Resize handles for single selection
    if (el.type === 'image' || el.type === 'shape' || el.type === 'text' || el.type === 'video') {
        const handleSize = 8 / zoom;
        const handles = [
            { x: el.x, y: el.y },
            { x: el.x + el.width / 2, y: el.y },
            { x: el.x + el.width, y: el.y },
            { x: el.x, y: el.y + el.height / 2 },
            { x: el.x + el.width, y: el.y + el.height / 2 },
            { x: el.x, y: el.y + el.height },
            { x: el.x + el.width / 2, y: el.y + el.height },
            { x: el.x + el.width, y: el.y + el.height },
        ];

        return (
            <Group listening={false}>
                <Rect
                    x={el.x}
                    y={el.y}
                    width={el.width}
                    height={el.height}
                    stroke="rgb(59, 130, 246)"
                    strokeWidth={2 / zoom}
                />
                {handles.map((h, i) => (
                    <Rect
                        key={i}
                        x={h.x - handleSize / 2}
                        y={h.y - handleSize / 2}
                        width={handleSize}
                        height={handleSize}
                        fill="white"
                        stroke="#3b82f6"
                        strokeWidth={1 / zoom}
                    />
                ))}
            </Group>
        );
    }

    return null;
};

// Grid pattern
const GridPattern: React.FC<{ panOffset: Point; zoom: number; width: number; height: number }> = ({
    panOffset, zoom, width, height,
}) => {
    const gridSize = 20;
    const dots: { x: number; y: number }[] = [];

    const startX = Math.floor(-panOffset.x / zoom / gridSize) * gridSize;
    const startY = Math.floor(-panOffset.y / zoom / gridSize) * gridSize;
    const endX = startX + width / zoom + gridSize * 2;
    const endY = startY + height / zoom + gridSize * 2;

    // Limit dots to prevent performance issues at low zoom
    const maxDots = 5000;
    let count = 0;
    for (let x = startX; x < endX && count < maxDots; x += gridSize) {
        for (let y = startY; y < endY && count < maxDots; y += gridSize) {
            dots.push({ x, y });
            count++;
        }
    }

    return (
        <Group listening={false}>
            {dots.map((d, i) => (
                <Circle key={i} x={d.x} y={d.y} radius={1} fill="#9ca3af" opacity={0.5} />
            ))}
        </Group>
    );
};

export const KonvaCanvas: React.FC<KonvaCanvasProps> = ({
    elements,
    selectedElementIds,
    panOffset,
    zoom,
    activeTool,
    croppingState,
    selectionBox,
    alignmentGuides,
    lassoPath,
    canvasBackgroundColor,
    interactionMode,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onWheel,
    onContextMenu,
    width,
    height,
}) => {
    const stageRef = useRef<Konva.Stage>(null);

    // Determine cursor
    let cursor = 'default';
    if (activeTool === 'pan') cursor = 'grab';
    if (activeTool === 'draw' || activeTool === 'highlighter') cursor = 'crosshair';
    if (activeTool === 'erase') cursor = 'crosshair';
    if (activeTool === 'text') cursor = 'text';
    if (activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'triangle') cursor = 'crosshair';
    if (activeTool === 'arrow' || activeTool === 'line') cursor = 'crosshair';
    if (interactionMode.current === 'pan') cursor = 'grabbing';

    // Convert Konva events to the format mouse handlers expect
    const wrapMouseEvent = useCallback((handler: (e: any) => void) => {
        return (e: Konva.KonvaEventObject<MouseEvent>) => {
            const stage = e.target.getStage();
            if (!stage) return;

            // Create a synthetic event compatible with existing handlers
            const syntheticEvent = {
                ...e.evt,
                target: e.target,
                currentTarget: stage.container(),
                preventDefault: () => e.evt.preventDefault(),
                stopPropagation: () => e.evt.stopPropagation(),
                clientX: e.evt.clientX,
                clientY: e.evt.clientY,
                button: e.evt.button,
                shiftKey: e.evt.shiftKey,
                ctrlKey: e.evt.ctrlKey,
                metaKey: e.evt.metaKey,
                // Add data-id lookup for element hit detection
                closest: (selector: string) => {
                    if (selector === '[data-id]') {
                        const shape = e.target;
                        const id = shape.getAttr('elementId');
                        if (id) return { getAttribute: () => id };
                    }
                    return null;
                },
            };
            handler(syntheticEvent);
        };
    }, []);

    const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        onWheel({
            ...e.evt,
            preventDefault: () => e.evt.preventDefault(),
            deltaY: e.evt.deltaY,
            clientX: e.evt.clientX,
            clientY: e.evt.clientY,
            ctrlKey: e.evt.ctrlKey,
            metaKey: e.evt.metaKey,
        });
    }, [onWheel]);

    const visibleElements = useMemo(() => {
        return elements.filter(el => el.isVisible !== false);
    }, [elements]);

    return (
        <Stage
            ref={stageRef}
            width={width}
            height={height}
            style={{ cursor }}
            onMouseDown={wrapMouseEvent(onMouseDown)}
            onMouseMove={wrapMouseEvent(onMouseMove)}
            onMouseUp={wrapMouseEvent(onMouseUp)}
            onWheel={handleWheel}
            onContextMenu={wrapMouseEvent(onContextMenu)}
        >
            {/* Background layer */}
            <Layer>
                <Rect x={0} y={0} width={width} height={height} fill={canvasBackgroundColor} listening={false} />
            </Layer>

            {/* Grid layer */}
            <Layer offsetX={-panOffset.x} offsetY={-panOffset.y} scaleX={zoom} scaleY={zoom}>
                <GridPattern panOffset={panOffset} zoom={zoom} width={width} height={height} />
            </Layer>

            {/* Elements layer */}
            <Layer offsetX={-panOffset.x} offsetY={-panOffset.y} scaleX={zoom} scaleY={zoom}>
                {visibleElements.map((el) => {
                    return (
                        <Group key={el.id} id={el.id}>
                            {el.type === 'path' && <PathRenderer el={el} zoom={zoom} />}
                            {el.type === 'arrow' && <ArrowRenderer el={el} zoom={zoom} />}
                            {el.type === 'line' && <LineRenderer el={el} zoom={zoom} />}
                            {el.type === 'shape' && <ShapeRenderer el={el} zoom={zoom} />}
                            {el.type === 'image' && <ImageRenderer el={el} isCropping={!!croppingState && croppingState.elementId !== el.id} />}
                            {el.type === 'text' && <TextRenderer el={el} />}
                            {el.type === 'video' && <VideoPlaceholder el={el} />}
                            <SelectionOverlay
                                el={el}
                                elements={elements}
                                selectedElementIds={selectedElementIds}
                                zoom={zoom}
                                croppingState={croppingState}
                            />
                        </Group>
                    );
                })}
            </Layer>

            {/* Overlay layer (selection box, lasso, alignment guides) */}
            <Layer offsetX={-panOffset.x} offsetY={-panOffset.y} scaleX={zoom} scaleY={zoom}>
                {selectionBox && (
                    <Rect
                        x={selectionBox.x}
                        y={selectionBox.y}
                        width={selectionBox.width}
                        height={selectionBox.height}
                        fill="rgba(59, 130, 246, 0.1)"
                        stroke="rgb(59, 130, 246)"
                        strokeWidth={1 / zoom}
                        listening={false}
                    />
                )}
                {lassoPath && lassoPath.length > 1 && (
                    <Line
                        points={lassoPath.flatMap(p => [p.x, p.y])}
                        stroke="rgb(59, 130, 246)"
                        strokeWidth={1 / zoom}
                        dash={[4 / zoom, 4 / zoom]}
                        fill="rgba(59, 130, 246, 0.1)"
                        closed
                        listening={false}
                    />
                )}
                {alignmentGuides.map((guide, i) => (
                    <Line
                        key={i}
                        points={
                            guide.type === 'v'
                                ? [guide.position, guide.start, guide.position, guide.end]
                                : [guide.start, guide.position, guide.end, guide.position]
                        }
                        stroke="#3b82f6"
                        strokeWidth={1 / zoom}
                        dash={[4 / zoom, 4 / zoom]}
                        listening={false}
                    />
                ))}
            </Layer>
        </Stage>
    );
};
