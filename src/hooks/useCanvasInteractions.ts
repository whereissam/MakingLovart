import { useCallback, useRef } from 'react';
import type { Tool, Point, Element, ImageElement, PathElement, ShapeElement, TextElement, ArrowElement, LineElement, VideoElement } from '../types';
import type { Rect, Guide } from '../utils/geometry';
import { getElementBounds, isPointInPolygon, SNAP_THRESHOLD } from '../utils/geometry';
import { generateId } from '../utils/id';
import { fileToDataUrl } from '../utils/fileUtils';
import { useUIStore } from '../stores/useUIStore';

interface CanvasInteractionsParams {
    elements: Element[];
    activeTool: Tool;
    setActiveTool: (tool: Tool) => void;
    drawingOptions: { strokeColor: string; strokeWidth: number };
    selectedElementIds: string[];
    setSelectedElementIds: (ids: string[]) => void;
    selectionBox: Rect | null;
    setSelectionBox: (box: Rect | null) => void;
    croppingState: { elementId: string; originalElement: ImageElement; cropBox: Rect } | null;
    setCroppingState: (state: { elementId: string; originalElement: ImageElement; cropBox: Rect } | null) => void;
    alignmentGuides: Guide[];
    setAlignmentGuides: (guides: Guide[]) => void;
    editingElement: { id: string; text: string } | null;
    setEditingElement: (element: { id: string; text: string } | null) => void;
    lassoPath: Point[] | null;
    setLassoPath: (path: Point[] | null) => void;
    panOffset: Point;
    zoom: number;
    setElements: (updater: (prev: Element[]) => Element[], commit?: boolean) => void;
    commitAction: (updater: (prev: Element[]) => Element[]) => void;
    updateActiveBoard: (updater: (board: any) => any) => void;
    svgRef: React.RefObject<SVGSVGElement | null>;
    elementsRef: React.MutableRefObject<Element[]>;
    wheelAction: string;
}

export function useCanvasInteractions(params: CanvasInteractionsParams) {
    const {
        elements, activeTool, setActiveTool, drawingOptions,
        selectedElementIds, setSelectedElementIds,
        selectionBox, setSelectionBox,
        croppingState, setCroppingState,
        alignmentGuides, setAlignmentGuides,
        editingElement, setEditingElement,
        lassoPath, setLassoPath,
        panOffset, zoom,
        setElements, commitAction, updateActiveBoard,
        svgRef, elementsRef, wheelAction,
    } = params;

    const { setError } = useUIStore();

    const interactionMode = useRef<string | null>(null);
    const startPoint = useRef<Point>({ x: 0, y: 0 });
    const currentDrawingElementId = useRef<string | null>(null);
    const resizeStartInfo = useRef<{ originalElement: ImageElement | ShapeElement | TextElement | VideoElement; startCanvasPoint: Point; handle: string; shiftKey: boolean } | null>(null);
    const cropStartInfo = useRef<{ originalCropBox: Rect; startCanvasPoint: Point } | null>(null);
    const dragStartElementPositions = useRef<Map<string, {x: number, y: number} | Point[]>>(new Map());

    const getCanvasPoint = useCallback(
        (screenX: number, screenY: number): Point => {
            if (!svgRef.current) return { x: 0, y: 0 };
            const svgBounds = svgRef.current.getBoundingClientRect();
            const xOnSvg = screenX - svgBounds.left;
            const yOnSvg = screenY - svgBounds.top;

            return {
                x: (xOnSvg - panOffset.x) / zoom,
                y: (yOnSvg - panOffset.y) / zoom,
            };
        },
        [panOffset, zoom],
    );

    const handleAddImageElement = useCallback(
        async (file: File) => {
            if (!file.type.startsWith('image/')) {
                setError('Only image files are supported.');
                return;
            }
            setError(null);
            try {
                const { dataUrl, mimeType } = await fileToDataUrl(file);
                const img = new Image();
                img.onload = () => {
                    if (!svgRef.current) return;
                    const svgBounds = svgRef.current.getBoundingClientRect();
                    const screenCenter = {
                        x: svgBounds.left + svgBounds.width / 2,
                        y: svgBounds.top + svgBounds.height / 2,
                    };
                    const canvasPoint = getCanvasPoint(screenCenter.x, screenCenter.y);

                    const newImage: ImageElement = {
                        id: generateId(),
                        type: 'image',
                        name: file.name,
                        x: canvasPoint.x - img.width / 2,
                        y: canvasPoint.y - img.height / 2,
                        width: img.width,
                        height: img.height,
                        href: dataUrl,
                        mimeType: mimeType,
                    };
                    setElements((prev) => [...prev, newImage]);
                    setSelectedElementIds([newImage.id]);
                    setActiveTool('select');
                };
                img.src = dataUrl;
            } catch (err) {
                setError('Failed to load image.');
                console.error(err);
            }
        },
        [getCanvasPoint, activeBoardId, setElements],
    );

    const getSelectableElement = (elementId: string, allElements: Element[]): Element | null => {
        const element = allElements.find((el) => el.id === elementId);
        if (!element) return null;
        if (element.isLocked) return null;

        let current = element;
        while (current.parentId) {
            const parent = allElements.find((el) => el.id === current.parentId);
            if (!parent) return current; // Orphaned, treat as top-level
            if (parent.isLocked) return null; // Parent is locked, nothing inside is selectable
            current = parent;
        }
        return current;
    };

    const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
        if (editingElement) return;
        if (contextMenu) setContextMenu(null);

        if (e.button === 1) {
            // Middle mouse button for panning
            interactionMode.current = 'pan';
            startPoint.current = { x: e.clientX, y: e.clientY };
            e.preventDefault();
            return;
        }

        startPoint.current = { x: e.clientX, y: e.clientY };
        const canvasStartPoint = getCanvasPoint(e.clientX, e.clientY);

        const target = e.target as SVGElement;
        const handleName = target.getAttribute('data-handle');

        if (croppingState) {
            if (handleName) {
                interactionMode.current = `crop-${handleName}`;
                cropStartInfo.current = {
                    originalCropBox: { ...croppingState.cropBox },
                    startCanvasPoint: canvasStartPoint,
                };
            }
            return;
        }
        if (activeTool === 'text') {
            const newText: TextElement = {
                id: generateId(),
                type: 'text',
                name: 'Text',
                x: canvasStartPoint.x,
                y: canvasStartPoint.y,
                width: 150,
                height: 40,
                text: 'Text',
                fontSize: 24,
                fontColor: drawingOptions.strokeColor,
            };
            setElements((prev) => [...prev, newText]);
            setSelectedElementIds([newText.id]);
            setEditingElement({ id: newText.id, text: newText.text });
            setActiveTool('select');
            return;
        }

        if (activeTool === 'pan') {
            interactionMode.current = 'pan';
            return;
        }

        if (handleName && activeTool === 'select' && selectedElementIds.length === 1) {
            interactionMode.current = `resize-${handleName}`;
            const element = elements.find((el) => el.id === selectedElementIds[0]) as
                | ImageElement
                | ShapeElement
                | TextElement
                | VideoElement;
            resizeStartInfo.current = {
                originalElement: { ...element },
                startCanvasPoint: canvasStartPoint,
                handle: handleName,
                shiftKey: e.shiftKey,
            };
            return;
        }

        if (activeTool === 'draw' || activeTool === 'highlighter') {
            interactionMode.current = 'draw';
            const newPath: PathElement = {
                id: generateId(),
                type: 'path',
                name: 'Path',
                points: [canvasStartPoint],
                strokeColor: drawingOptions.strokeColor,
                strokeWidth: drawingOptions.strokeWidth,
                strokeOpacity: activeTool === 'highlighter' ? 0.5 : 1,
                x: 0,
                y: 0,
            };
            currentDrawingElementId.current = newPath.id;
            setElements((prev) => [...prev, newPath], false);
        } else if (activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'triangle') {
            interactionMode.current = 'drawShape';
            const newShape: ShapeElement = {
                id: generateId(),
                type: 'shape',
                name: activeTool.charAt(0).toUpperCase() + activeTool.slice(1),
                shapeType: activeTool,
                x: canvasStartPoint.x,
                y: canvasStartPoint.y,
                width: 0,
                height: 0,
                strokeColor: drawingOptions.strokeColor,
                strokeWidth: drawingOptions.strokeWidth,
                fillColor: 'transparent',
            };
            currentDrawingElementId.current = newShape.id;
            setElements((prev) => [...prev, newShape], false);
        } else if (activeTool === 'arrow') {
            interactionMode.current = 'drawArrow';
            const newArrow: ArrowElement = {
                id: generateId(),
                type: 'arrow',
                name: 'Arrow',
                x: canvasStartPoint.x,
                y: canvasStartPoint.y,
                points: [canvasStartPoint, canvasStartPoint],
                strokeColor: drawingOptions.strokeColor,
                strokeWidth: drawingOptions.strokeWidth,
            };
            currentDrawingElementId.current = newArrow.id;
            setElements((prev) => [...prev, newArrow], false);
        } else if (activeTool === 'line') {
            interactionMode.current = 'drawLine';
            const newLine: LineElement = {
                id: generateId(),
                type: 'line',
                name: 'Line',
                x: canvasStartPoint.x,
                y: canvasStartPoint.y,
                points: [canvasStartPoint, canvasStartPoint],
                strokeColor: drawingOptions.strokeColor,
                strokeWidth: drawingOptions.strokeWidth,
            };
            currentDrawingElementId.current = newLine.id;
            setElements((prev) => [...prev, newLine], false);
        } else if (activeTool === 'erase') {
            interactionMode.current = 'erase';
        } else if (activeTool === 'lasso') {
            interactionMode.current = 'lasso';
            setLassoPath([canvasStartPoint]);
        } else if (activeTool === 'select') {
            const clickedElementId = target.closest('[data-id]')?.getAttribute('data-id');
            const selectableElement = clickedElementId
                ? getSelectableElement(clickedElementId, elementsRef.current)
                : null;
            const selectableElementId = selectableElement?.id;

            if (selectableElementId) {
                if (e.detail === 2 && elements.find((el) => el.id === selectableElementId)?.type === 'text') {
                    const textEl = elements.find((el) => el.id === selectableElementId) as TextElement;
                    setEditingElement({ id: textEl.id, text: textEl.text });
                    return;
                }
                if (!e.shiftKey && !selectedElementIds.includes(selectableElementId)) {
                    setSelectedElementIds([selectableElementId]);
                } else if (e.shiftKey) {
                    setSelectedElementIds((prev) =>
                        prev.includes(selectableElementId)
                            ? prev.filter((id) => id !== selectableElementId)
                            : [...prev, selectableElementId],
                    );
                }
                interactionMode.current = 'dragElements';
                const idsToDrag = new Set<string>();
                if (selectableElement.type === 'group') {
                    idsToDrag.add(selectableElement.id);
                    getDescendants(selectableElement.id, elementsRef.current).forEach((desc) => idsToDrag.add(desc.id));
                } else {
                    idsToDrag.add(selectableElement.id);
                }

                const initialPositions = new Map<string, { x: number; y: number } | Point[]>();
                elementsRef.current.forEach((el) => {
                    if (idsToDrag.has(el.id)) {
                        if (el.type !== 'path' && el.type !== 'arrow' && el.type !== 'line') {
                            initialPositions.set(el.id, { x: el.x, y: el.y });
                        } else {
                            initialPositions.set(el.id, el.points);
                        }
                    }
                });
                dragStartElementPositions.current = initialPositions;
            } else {
                setSelectedElementIds([]);
                interactionMode.current = 'selectBox';
                setSelectionBox({ x: canvasStartPoint.x, y: canvasStartPoint.y, width: 0, height: 0 });
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!interactionMode.current) return;
        const point = getCanvasPoint(e.clientX, e.clientY);
        const startCanvasPoint = getCanvasPoint(startPoint.current.x, startPoint.current.y);

        if (interactionMode.current === 'erase') {
            const eraseRadius = drawingOptions.strokeWidth / zoom;
            const idsToDelete = new Set<string>();

            elements.forEach((el) => {
                if (el.type === 'path') {
                    for (let i = 0; i < el.points.length - 1; i++) {
                        const distance = Math.hypot(point.x - el.points[i].x, point.y - el.points[i].y);
                        if (distance < eraseRadius) {
                            idsToDelete.add(el.id);
                            return;
                        }
                    }
                }
            });

            if (idsToDelete.size > 0) {
                setElements((prev) => prev.filter((el) => !idsToDelete.has(el.id)), false);
            }
            return;
        }

        if (interactionMode.current.startsWith('resize-')) {
            if (!resizeStartInfo.current) return;
            const { originalElement, handle, startCanvasPoint: resizeStartPoint, shiftKey } = resizeStartInfo.current;
            let { x, y, width, height } = originalElement;
            const aspectRatio = originalElement.width / originalElement.height;
            const dx = point.x - resizeStartPoint.x;
            const dy = point.y - resizeStartPoint.y;

            if (handle.includes('r')) {
                width = originalElement.width + dx;
            }
            if (handle.includes('l')) {
                width = originalElement.width - dx;
                x = originalElement.x + dx;
            }
            if (handle.includes('b')) {
                height = originalElement.height + dy;
            }
            if (handle.includes('t')) {
                height = originalElement.height - dy;
                y = originalElement.y + dy;
            }

            if (originalElement.type !== 'text' && !shiftKey) {
                if (handle.includes('r') || handle.includes('l')) {
                    height = width / aspectRatio;
                    if (handle.includes('t')) y = originalElement.y + originalElement.height - height;
                } else {
                    width = height * aspectRatio;
                    if (handle.includes('l')) x = originalElement.x + originalElement.width - width;
                }
            }

            if (width < 1) {
                width = 1;
                x = originalElement.x + originalElement.width - 1;
            }
            if (height < 1) {
                height = 1;
                y = originalElement.y + originalElement.height - 1;
            }

            setElements(
                (prev) => prev.map((el) => (el.id === originalElement.id ? { ...el, x, y, width, height } : el)),
                false,
            );
            return;
        }

        if (interactionMode.current.startsWith('crop-')) {
            if (!croppingState || !cropStartInfo.current) return;
            const handle = interactionMode.current.split('-')[1];
            const { originalCropBox, startCanvasPoint: cropStartPoint } = cropStartInfo.current;
            let { x, y, width, height } = { ...originalCropBox };
            const { originalElement } = croppingState;
            const dx = point.x - cropStartPoint.x;
            const dy = point.y - cropStartPoint.y;

            if (handle.includes('r')) {
                width = originalCropBox.width + dx;
            }
            if (handle.includes('l')) {
                width = originalCropBox.width - dx;
                x = originalCropBox.x + dx;
            }
            if (handle.includes('b')) {
                height = originalCropBox.height + dy;
            }
            if (handle.includes('t')) {
                height = originalCropBox.height - dy;
                y = originalCropBox.y + dy;
            }

            if (x < originalElement.x) {
                width += x - originalElement.x;
                x = originalElement.x;
            }
            if (y < originalElement.y) {
                height += y - originalElement.y;
                y = originalElement.y;
            }
            if (x + width > originalElement.x + originalElement.width) {
                width = originalElement.x + originalElement.width - x;
            }
            if (y + height > originalElement.y + originalElement.height) {
                height = originalElement.y + originalElement.height - y;
            }

            if (width < 1) {
                width = 1;
                if (handle.includes('l')) {
                    x = originalCropBox.x + originalCropBox.width - 1;
                }
            }
            if (height < 1) {
                height = 1;
                if (handle.includes('t')) {
                    y = originalCropBox.y + originalCropBox.height - 1;
                }
            }

            setCroppingState((prev) => (prev ? { ...prev, cropBox: { x, y, width, height } } : null));
            return;
        }

        switch (interactionMode.current) {
            case 'pan': {
                const dx = e.clientX - startPoint.current.x;
                const dy = e.clientY - startPoint.current.y;
                updateActiveBoard((b) => ({ ...b, panOffset: { x: b.panOffset.x + dx, y: b.panOffset.y + dy } }));
                startPoint.current = { x: e.clientX, y: e.clientY };
                break;
            }
            case 'draw': {
                if (currentDrawingElementId.current) {
                    setElements(
                        (prev) =>
                            prev.map((el) => {
                                if (el.id === currentDrawingElementId.current && el.type === 'path') {
                                    return { ...el, points: [...el.points, point] };
                                }
                                return el;
                            }),
                        false,
                    );
                }
                break;
            }
            case 'lasso': {
                setLassoPath((prev) => (prev ? [...prev, point] : [point]));
                break;
            }
            case 'drawShape': {
                if (currentDrawingElementId.current) {
                    setElements(
                        (prev) =>
                            prev.map((el) => {
                                if (el.id === currentDrawingElementId.current && el.type === 'shape') {
                                    let newWidth = Math.abs(point.x - startCanvasPoint.x);
                                    let newHeight = Math.abs(point.y - startCanvasPoint.y);
                                    let newX = Math.min(point.x, startCanvasPoint.x);
                                    let newY = Math.min(point.y, startCanvasPoint.y);

                                    if (e.shiftKey) {
                                        if (el.shapeType === 'rectangle' || el.shapeType === 'circle') {
                                            const side = Math.max(newWidth, newHeight);
                                            newWidth = side;
                                            newHeight = side;
                                        } else if (el.shapeType === 'triangle') {
                                            newHeight = newWidth * (Math.sqrt(3) / 2);
                                        }

                                        if (point.x < startCanvasPoint.x) newX = startCanvasPoint.x - newWidth;
                                        if (point.y < startCanvasPoint.y) newY = startCanvasPoint.y - newHeight;
                                    }

                                    return { ...el, x: newX, y: newY, width: newWidth, height: newHeight };
                                }
                                return el;
                            }),
                        false,
                    );
                }
                break;
            }
            case 'drawArrow': {
                if (currentDrawingElementId.current) {
                    setElements(
                        (prev) =>
                            prev.map((el) => {
                                if (el.id === currentDrawingElementId.current && el.type === 'arrow') {
                                    return { ...el, points: [el.points[0], point] };
                                }
                                return el;
                            }),
                        false,
                    );
                }
                break;
            }
            case 'drawLine': {
                if (currentDrawingElementId.current) {
                    setElements(
                        (prev) =>
                            prev.map((el) => {
                                if (el.id === currentDrawingElementId.current && el.type === 'line') {
                                    return { ...el, points: [el.points[0], point] };
                                }
                                return el;
                            }),
                        false,
                    );
                }
                break;
            }
            case 'dragElements': {
                const dx = point.x - startCanvasPoint.x;
                const dy = point.y - startCanvasPoint.y;

                const movingElementIds = Array.from(dragStartElementPositions.current.keys());
                const movingElements = elements.filter((el) => movingElementIds.includes(el.id));
                const otherElements = elements.filter((el) => !movingElementIds.includes(el.id));
                const snapThresholdCanvas = SNAP_THRESHOLD / zoom;

                let finalDx = dx;
                let finalDy = dy;
                let activeGuides: Guide[] = [];

                // Alignment Snapping
                const getSnapPoints = (bounds: Rect) => ({
                    v: [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width],
                    h: [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height],
                });

                const staticSnapPoints = { v: new Set<number>(), h: new Set<number>() };
                otherElements.forEach((el) => {
                    const bounds = getElementBounds(el);
                    getSnapPoints(bounds).v.forEach((p) => staticSnapPoints.v.add(p));
                    getSnapPoints(bounds).h.forEach((p) => staticSnapPoints.h.add(p));
                });

                let bestSnapX = { dist: Infinity, val: finalDx, guide: null as Guide | null };
                let bestSnapY = { dist: Infinity, val: finalDy, guide: null as Guide | null };

                movingElements.forEach((movingEl) => {
                    const startPos = dragStartElementPositions.current.get(movingEl.id);
                    if (!startPos) return;

                    let movingBounds: Rect;
                    if (movingEl.type !== 'path' && movingEl.type !== 'arrow' && movingEl.type !== 'line') {
                        movingBounds = getElementBounds({
                            ...movingEl,
                            x: (startPos as Point).x,
                            y: (startPos as Point).y,
                        });
                    } else {
                        // path or arrow or line
                        if (movingEl.type === 'arrow' || movingEl.type === 'line') {
                            movingBounds = getElementBounds({ ...movingEl, points: startPos as [Point, Point] });
                        } else {
                            movingBounds = getElementBounds({ ...movingEl, points: startPos as Point[] });
                        }
                    }

                    const movingSnapPoints = getSnapPoints(movingBounds);

                    movingSnapPoints.v.forEach((p) => {
                        staticSnapPoints.v.forEach((staticP) => {
                            const dist = Math.abs(p + finalDx - staticP);
                            if (dist < snapThresholdCanvas && dist < bestSnapX.dist) {
                                bestSnapX = {
                                    dist,
                                    val: staticP - p,
                                    guide: {
                                        type: 'v',
                                        position: staticP,
                                        start: movingBounds.y,
                                        end: movingBounds.y + movingBounds.height,
                                    },
                                };
                            }
                        });
                    });
                    movingSnapPoints.h.forEach((p) => {
                        staticSnapPoints.h.forEach((staticP) => {
                            const dist = Math.abs(p + finalDy - staticP);
                            if (dist < snapThresholdCanvas && dist < bestSnapY.dist) {
                                bestSnapY = {
                                    dist,
                                    val: staticP - p,
                                    guide: {
                                        type: 'h',
                                        position: staticP,
                                        start: movingBounds.x,
                                        end: movingBounds.x + movingBounds.width,
                                    },
                                };
                            }
                        });
                    });
                });

                if (bestSnapX.guide) {
                    finalDx = bestSnapX.val;
                    activeGuides.push(bestSnapX.guide);
                }
                if (bestSnapY.guide) {
                    finalDy = bestSnapY.val;
                    activeGuides.push(bestSnapY.guide);
                }

                setAlignmentGuides(activeGuides);

                setElements(
                    (prev) =>
                        prev.map((el) => {
                            if (movingElementIds.includes(el.id)) {
                                const startPos = dragStartElementPositions.current.get(el.id);
                                if (!startPos) return el;

                                if (el.type !== 'path' && el.type !== 'arrow' && el.type !== 'line') {
                                    return {
                                        ...el,
                                        x: (startPos as Point).x + finalDx,
                                        y: (startPos as Point).y + finalDy,
                                    };
                                }

                                if (el.type === 'path') {
                                    const startPoints = startPos as Point[];
                                    const newPoints = startPoints.map((p) => ({ x: p.x + finalDx, y: p.y + finalDy }));
                                    const updatedEl: PathElement = { ...el, points: newPoints };
                                    return updatedEl;
                                } else if (el.type === 'arrow' || el.type === 'line') {
                                    const startPoints = startPos as [Point, Point];
                                    const newPoints: [Point, Point] = [
                                        { x: startPoints[0].x + finalDx, y: startPoints[0].y + finalDy },
                                        { x: startPoints[1].x + finalDx, y: startPoints[1].y + finalDy },
                                    ];
                                    const updatedEl = { ...el, points: newPoints };
                                    return updatedEl;
                                }
                            }
                            return el;
                        }),
                    false,
                );
                break;
            }
            case 'selectBox': {
                const newX = Math.min(point.x, startCanvasPoint.x);
                const newY = Math.min(point.y, startCanvasPoint.y);
                const newWidth = Math.abs(point.x - startCanvasPoint.x);
                const newHeight = Math.abs(point.y - startCanvasPoint.y);
                setSelectionBox({ x: newX, y: newY, width: newWidth, height: newHeight });
                break;
            }
        }
    };

    const handleMouseUp = () => {
        if (interactionMode.current) {
            if (interactionMode.current === 'selectBox' && selectionBox) {
                const selectedIds: string[] = [];
                const { x: sx, y: sy, width: sw, height: sh } = selectionBox;

                elements.forEach((element) => {
                    const bounds = getElementBounds(element, elements);
                    const { x: ex, y: ey, width: ew, height: eh } = bounds;

                    if (sx < ex + ew && sx + sw > ex && sy < ey + eh && sy + sh > ey) {
                        const selectable = getSelectableElement(element.id, elements);
                        if (selectable) selectedIds.push(selectable.id);
                    }
                });
                setSelectedElementIds([...new Set(selectedIds)]);
            } else if (interactionMode.current === 'lasso' && lassoPath && lassoPath.length > 2) {
                const selectedIds = elements
                    .filter((el) => {
                        const bounds = getElementBounds(el, elements);
                        const center: Point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
                        return isPointInPolygon(center, lassoPath);
                    })
                    .map((el) => getSelectableElement(el.id, elements)?.id)
                    .filter((id): id is string => !!id);
                setSelectedElementIds((prev) => [...new Set([...prev, ...selectedIds])]);
                setLassoPath(null);
            } else if (
                ['draw', 'drawShape', 'drawArrow', 'drawLine', 'dragElements', 'erase'].some((prefix) =>
                    interactionMode.current?.startsWith(prefix),
                ) ||
                interactionMode.current.startsWith('resize-')
            ) {
                commitAction((els) => els); // This effectively commits the current state to history
            }
        }

        interactionMode.current = null;
        currentDrawingElementId.current = null;
        setSelectionBox(null);
        setLassoPath(null);
        resizeStartInfo.current = null;
        cropStartInfo.current = null;
        setAlignmentGuides([]);
        dragStartElementPositions.current.clear();
    };

    const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
        if (croppingState || editingElement) {
            e.preventDefault();
            return;
        }
        e.preventDefault();
        const { clientX, clientY, deltaX, deltaY, ctrlKey } = e;

        if (ctrlKey || wheelAction === 'zoom') {
            const zoomFactor = 1.05;
            const oldZoom = zoom;
            const newZoom = deltaY < 0 ? oldZoom * zoomFactor : oldZoom / zoomFactor;
            const clampedZoom = Math.max(0.1, Math.min(newZoom, 10));

            const mousePoint = { x: clientX, y: clientY };
            const newPanX = mousePoint.x - (mousePoint.x - panOffset.x) * (clampedZoom / oldZoom);
            const newPanY = mousePoint.y - (mousePoint.y - panOffset.y) * (clampedZoom / oldZoom);

            updateActiveBoard((b) => ({ ...b, zoom: clampedZoom, panOffset: { x: newPanX, y: newPanY } }));
        } else {
            // Panning (wheelAction === 'pan' and no ctrlKey)
            updateActiveBoard((b) => ({ ...b, panOffset: { x: b.panOffset.x - deltaX, y: b.panOffset.y - deltaY } }));
        }
    };


    return {
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleWheel,
        handleAddImageElement,
        getCanvasPoint,
        getSelectableElement,
        interactionMode,
        startPoint,
        currentDrawingElementId,
        resizeStartInfo,
        cropStartInfo,
        dragStartElementPositions,
    };
}
