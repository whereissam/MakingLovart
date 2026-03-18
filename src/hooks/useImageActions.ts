import { useCallback, useEffect, useRef } from 'react';
import type {
    Element,
    ImageElement,
    PathElement,
    AssetItem,
    AssetCategory,
    AssetLibrary,
    GenerationHistoryItem,
    Point,
    ChatAttachment,
} from '../types';
import type { Rect } from '../utils/geometry';
import { getElementBounds } from '../utils/geometry';
import { rasterizeElement, rasterizeMask } from '../utils/rasterize';
import { editImage, generateImageFromText, generateVideo, enhancePromptWithGemini } from '../services/geminiService';
import { splitImageByBanana, runBananaImageAgent } from '../services/bananaService';
import { generateId } from '../utils/id';
import { fileToDataUrl } from '../utils/fileUtils';
import { loadGenerationHistory, addGenerationHistoryItem } from '../utils/generationHistory';
import { useUIStore } from '../stores/useUIStore';
import { useAIStore } from '../stores/useAIStore';

interface ImageActionsParams {
    elements: Element[];
    selectedElementIds: string[];
    commitAction: (updater: (prev: Element[]) => Element[]) => void;
    setElements: (updater: (prev: Element[]) => Element[], commit?: boolean) => void;
    setSelectedElementIds: (ids: string[]) => void;
    setActiveTool: (tool: any) => void;
    editingElement: { id: string; text: string } | null;
    setEditingElement: (el: { id: string; text: string } | null) => void;
    croppingState: any;
    setCroppingState: (state: any) => void;
    contextMenu: any;
    setContextMenu: (menu: any) => void;
    getCanvasPoint: (screenX: number, screenY: number) => Point;
    svgRef: React.RefObject<SVGSVGElement | null>;
    elementsRef: React.MutableRefObject<Element[]>;
    editingTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
    handleAddImageElement: (file: File) => Promise<void>;
    assetLibrary: AssetLibrary;
    setAssetLibrary: (updater: (prev: AssetLibrary) => AssetLibrary) => void;
    generationHistory: GenerationHistoryItem[];
    setGenerationHistory: (updater: (prev: GenerationHistoryItem[]) => GenerationHistoryItem[]) => void;
    addAssetModal: any;
    setAddAssetModal: (modal: any) => void;
    getDescendants: (id: string, allElements: Element[]) => Element[];
}

export function useImageActions(params: ImageActionsParams) {
    const {
        elements,
        selectedElementIds,
        commitAction,
        setElements,
        setSelectedElementIds,
        setActiveTool,
        editingElement,
        setEditingElement,
        croppingState,
        setCroppingState,
        contextMenu,
        setContextMenu,
        getCanvasPoint,
        svgRef,
        elementsRef,
        editingTextareaRef,
        handleAddImageElement,
        assetLibrary,
        setAssetLibrary,
        generationHistory,
        setGenerationHistory,
        addAssetModal,
        setAddAssetModal,
        getDescendants,
    } = params;

    const { setIsLoading, setError, setProgressMessage } = useUIStore();
    const aiStore = useAIStore();

    const handleDeleteElement = (id: string) => {
        commitAction((prev) => {
            const idsToDelete = new Set([id]);
            getDescendants(id, prev).forEach((desc) => idsToDelete.add(desc.id));
            return prev.filter((el) => !idsToDelete.has(el.id));
        });
        setSelectedElementIds((prev) => prev.filter((selId) => selId !== id));
    };

    const handleCopyElement = (elementToCopy: Element) => {
        commitAction((prev) => {
            const elementsToCopy = [elementToCopy, ...getDescendants(elementToCopy.id, prev)];
            const idMap = new Map<string, string>();

            // FIX: Refactored element creation to use explicit switch cases for each element type.
            // This helps TypeScript correctly infer the return type of the map function as Element[],
            // preventing type errors caused by spreading a discriminated union.
            const newElements: Element[] = elementsToCopy.map((el): Element => {
                const newId = generateId();
                idMap.set(el.id, newId);
                const dx = 20 / zoom;
                const dy = 20 / zoom;

                switch (el.type) {
                    case 'path':
                        return { ...el, id: newId, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
                    case 'arrow':
                        return {
                            ...el,
                            id: newId,
                            points: [
                                { x: el.points[0].x + dx, y: el.points[0].y + dy },
                                { x: el.points[1].x + dx, y: el.points[1].y + dy },
                            ] as [Point, Point],
                        };
                    case 'line':
                        return {
                            ...el,
                            id: newId,
                            points: [
                                { x: el.points[0].x + dx, y: el.points[0].y + dy },
                                { x: el.points[1].x + dx, y: el.points[1].y + dy },
                            ] as [Point, Point],
                        };
                    case 'image':
                        return { ...el, id: newId, x: el.x + dx, y: el.y + dy };
                    case 'shape':
                        return { ...el, id: newId, x: el.x + dx, y: el.y + dy };
                    case 'text':
                        return { ...el, id: newId, x: el.x + dx, y: el.y + dy };
                    case 'group':
                        return { ...el, id: newId, x: el.x + dx, y: el.y + dy };
                    case 'video':
                        return { ...el, id: newId, x: el.x + dx, y: el.y + dy };
                }
            });

            // FIX: Refactored parentId assignment to use an explicit switch statement.
            // This ensures TypeScript can correctly track the types within the Element union
            // and avoids errors when returning the new array of elements.
            const finalNewElements: Element[] = newElements.map((el): Element => {
                const parentId = el.parentId ? idMap.get(el.parentId) : undefined;
                switch (el.type) {
                    case 'image':
                        return { ...el, parentId };
                    case 'path':
                        return { ...el, parentId };
                    case 'shape':
                        return { ...el, parentId };
                    case 'text':
                        return { ...el, parentId };
                    case 'arrow':
                        return { ...el, parentId };
                    case 'line':
                        return { ...el, parentId };
                    case 'group':
                        return { ...el, parentId };
                    case 'video':
                        return { ...el, parentId };
                }
            });

            setSelectedElementIds([idMap.get(elementToCopy.id)!]);
            return [...prev, ...finalNewElements];
        });
    };

    const handleDownloadImage = (element: ImageElement) => {
        const link = document.createElement('a');
        link.href = element.href;
        link.download = `canvas-image-${element.id}.${element.mimeType.split('/')[1] || 'png'}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const resolveImageSize = (
        dataUrl: string,
        fallback: { width: number; height: number },
    ): Promise<{ width: number; height: number }> =>
        new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.onerror = () => resolve(fallback);
            img.src = dataUrl;
        });

    const insertImageAgentResult = async (
        source: ImageElement,
        dataUrl: string,
        nameSuffix: string,
        resizeByScale?: number,
        outputMimeType?: string,
    ) => {
        const rawSize = await resolveImageSize(dataUrl, { width: source.width, height: source.height });
        const scale = resizeByScale && resizeByScale > 0 ? resizeByScale : 1;
        const width = Math.max(1, rawSize.width / scale);
        const height = Math.max(1, rawSize.height / scale);

        const newImage: ImageElement = {
            id: generateId(),
            type: 'image',
            name: `${source.name || 'Image'} / ${nameSuffix}`,
            x: source.x + 24,
            y: source.y + 24,
            width,
            height,
            href: dataUrl,
            mimeType: outputMimeType || source.mimeType,
        };

        commitAction((prev) => [...prev, newImage]);
        setSelectedElementIds([newImage.id]);
    };

    const handleSplitImageWithBanana = async (element: ImageElement) => {
        try {
            setIsLoading(true);
            setError(null);
            setProgressMessage('BANANA is splitting the image into layers...');

            const layers = await splitImageByBanana({
                href: element.href,
                mimeType: element.mimeType,
            });

            const normalizedLayers = await Promise.all(
                layers.map(async (layer) => {
                    if (layer.width > 0 && layer.height > 0) return layer;
                    const size = await resolveImageSize(layer.dataUrl, {
                        width: element.width,
                        height: element.height,
                    });
                    return { ...layer, width: size.width, height: size.height };
                }),
            );

            const insertedIds: string[] = [];
            const hideOriginalAfterSplit = true;
            commitAction((prev) => {
                const sourceIndex = prev.findIndex((el) => el.id === element.id);
                const groupId = generateId();

                const newLayerElements: ImageElement[] = normalizedLayers.map((layer, idx) => {
                    const id = generateId();
                    insertedIds.push(id);
                    return {
                        id,
                        type: 'image',
                        name: `${element.name || 'Image'} / ${layer.name || `Layer ${idx + 1}`}`,
                        x: element.x + layer.offsetX,
                        y: element.y + layer.offsetY,
                        width: layer.width || element.width,
                        height: layer.height || element.height,
                        href: layer.dataUrl,
                        mimeType: 'image/png',
                        parentId: groupId,
                    };
                });

                const minX = Math.min(...newLayerElements.map((layer) => layer.x));
                const minY = Math.min(...newLayerElements.map((layer) => layer.y));
                const maxX = Math.max(...newLayerElements.map((layer) => layer.x + layer.width));
                const maxY = Math.max(...newLayerElements.map((layer) => layer.y + layer.height));
                const groupElement: GroupElement = {
                    id: groupId,
                    type: 'group',
                    name: `${element.name || 'Image'} / Banana Group`,
                    x: minX,
                    y: minY,
                    width: Math.max(1, maxX - minX),
                    height: Math.max(1, maxY - minY),
                };

                const next = [...prev];
                if (sourceIndex >= 0) {
                    next.splice(sourceIndex + 1, 0, ...newLayerElements, groupElement);
                } else {
                    next.push(...newLayerElements, groupElement);
                }
                if (hideOriginalAfterSplit) {
                    const idx = next.findIndex((el) => el.id === element.id);
                    if (idx >= 0) {
                        next[idx] = { ...next[idx], isVisible: false };
                    }
                }
                return next;
            });

            if (insertedIds.length > 0) {
                setSelectedElementIds(insertedIds);
                setProgressMessage(`BANANA created ${insertedIds.length} layers.`);
            } else {
                setProgressMessage('');
            }
        } catch (err) {
            const error = err as Error;
            setError(`BANANA split failed: ${error.message}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => setProgressMessage(''), 1200);
        }
    };

    const handleUpscaleImageWithBanana = async (element: ImageElement) => {
        try {
            setIsLoading(true);
            setError(null);
            setProgressMessage('BANANA Agent is removing background...');
            const result = await runBananaImageAgent({ href: element.href, mimeType: element.mimeType }, 'upscale', {
                scale: 2,
            });
            await insertImageAgentResult(element, result.dataUrl, 'Upscaled x2', 2, result.mimeType);
            setProgressMessage('Upscale completed.');
        } catch (err) {
            const error = err as Error;
            setError(`BANANA upscale failed: ${error.message}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => setProgressMessage(''), 1200);
        }
    };

    const handleRemoveBackgroundWithBanana = async (element: ImageElement) => {
        try {
            setIsLoading(true);
            setError(null);
            setProgressMessage('BANANA Agent is removing background...');
            const result = await runBananaImageAgent(
                { href: element.href, mimeType: element.mimeType },
                'remove-background',
            );
            await insertImageAgentResult(element, result.dataUrl, 'Background Removed', undefined, result.mimeType);
            setProgressMessage('Background removal completed.');
        } catch (err) {
            const error = err as Error;
            setError(`BANANA background removal failed: ${error.message}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => setProgressMessage(''), 1200);
        }
    };

    const handleStartCrop = (element: ImageElement) => {
        setActiveTool('select');
        setCroppingState({
            elementId: element.id,
            originalElement: { ...element },
            cropBox: { x: element.x, y: element.y, width: element.width, height: element.height },
        });
    };

    const handleCancelCrop = () => setCroppingState(null);

    const handleConfirmCrop = () => {
        if (!croppingState) return;
        const { elementId, cropBox } = croppingState;
        const elementToCrop = elementsRef.current.find((el) => el.id === elementId) as ImageElement;

        if (!elementToCrop) {
            handleCancelCrop();
            return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = cropBox.width;
            canvas.height = cropBox.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                setError('Failed to create canvas context for cropping.');
                handleCancelCrop();
                return;
            }
            const sx = cropBox.x - elementToCrop.x;
            const sy = cropBox.y - elementToCrop.y;
            ctx.drawImage(img, sx, sy, cropBox.width, cropBox.height, 0, 0, cropBox.width, cropBox.height);
            const newHref = canvas.toDataURL(elementToCrop.mimeType);

            commitAction((prev) =>
                prev.map((el) => {
                    if (el.id === elementId && el.type === 'image') {
                        const updatedEl: ImageElement = {
                            ...el,
                            href: newHref,
                            x: cropBox.x,
                            y: cropBox.y,
                            width: cropBox.width,
                            height: cropBox.height,
                        };
                        return updatedEl;
                    }
                    return el;
                }),
            );
            handleCancelCrop();
        };
        img.onerror = () => {
            setError('Failed to load image for cropping.');
            handleCancelCrop();
        };
        img.src = elementToCrop.href;
    };

    useEffect(() => {
        if (editingElement && editingTextareaRef.current) {
            setTimeout(() => {
                if (editingTextareaRef.current) {
                    editingTextareaRef.current.focus();
                    editingTextareaRef.current.select();
                }
            }, 0);
        }
    }, [editingElement]);

    useEffect(() => {
        if (editingElement && editingTextareaRef.current) {
            const textarea = editingTextareaRef.current;
            textarea.style.height = 'auto';
            const newHeight = textarea.scrollHeight;
            textarea.style.height = '';

            const currentElement = elementsRef.current.find((el) => el.id === editingElement.id);
            if (currentElement && currentElement.type === 'text' && currentElement.height !== newHeight) {
                setElements(
                    (prev) =>
                        prev.map((el) =>
                            el.id === editingElement.id && el.type === 'text' ? { ...el, height: newHeight } : el,
                        ),
                    false,
                );
            }
        }
    }, [editingElement?.text, setElements]);

    const handleGenerate = useGeneration({
        elements,
        selectedElementIds,
        commitAction,
        setSelectedElementIds,
        svgRef,
        getCanvasPoint,
        saveGenerationToHistory,
        setActiveTool,
    });

    const handleRunNodeWorkflow = async (opts: {
        autoEnhance: boolean;
        enhanceMode: PromptEnhanceMode;
        stylePreset?: string;
    }) => {
        let finalPrompt = prompt;
        if (opts.autoEnhance && prompt.trim()) {
            const enhanced = await handleEnhancePrompt({
                prompt,
                mode: opts.enhanceMode,
                stylePreset: opts.stylePreset,
            });
            if (enhanced.enhancedPrompt?.trim()) {
                finalPrompt = enhanced.enhancedPrompt.trim();
                setPrompt(finalPrompt);
            }
        }
        await handleGenerate(finalPrompt);
    };

    const handleCanvasImageDragStart = useCallback((image: ImageElement, e: React.DragEvent<SVGGElement>) => {
        const payload = {
            id: image.id,
            name: image.name,
            href: image.href,
            mimeType: image.mimeType,
        };
        e.dataTransfer.setData('application/x-canvas-image', JSON.stringify(payload));
        e.dataTransfer.setData('text/plain', image.name || image.id);
        e.dataTransfer.effectAllowed = 'copy';
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);
    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            const text = e.dataTransfer.getData('text/plain');
            if (text && handleAssetDropRef.current) {
                handleAssetDropRef.current(e);
                return;
            }
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleAddImageElement(e.dataTransfer.files[0]);
            }
        },
        [handleAddImageElement],
    );

    // handlePropertyChange, handleLayerAction, handleRasterizeSelection,
    // handleGroup, handleUngroup are provided by useElementActions (after getSelectionBounds)

    const handleContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
        e.preventDefault();
        setContextMenu(null);
        const target = e.target as SVGElement;
        const elementId = target.closest('[data-id]')?.getAttribute('data-id');
        setContextMenu({ x: e.clientX, y: e.clientY, elementId: elementId || null });
    };

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (e.clipboardData?.files[0]?.type.startsWith('image/')) {
                e.preventDefault();
                handleAddImageElement(e.clipboardData.files[0]);
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [handleAddImageElement]);

    const getSelectionBounds = useCallback((selectionIds: string[]): Rect => {
        const selectedElements = elementsRef.current.filter((el) => selectionIds.includes(el.id));
        if (selectedElements.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        selectedElements.forEach((el) => {
            const bounds = getElementBounds(el, elementsRef.current);
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        });

        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }, []);

    const { handlePropertyChange, handleLayerAction, handleRasterizeSelection, handleGroup, handleUngroup } =
        useElementActions({
            elements,
            selectedElementIds,
            commitAction,
            setSelectedElementIds,
            setContextMenu,
            setIsLoading,
            setError,
            getSelectionBounds,
        });

    const handleAlignSelection = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
        const selectedElements = elementsRef.current.filter((el) => selectedElementIds.includes(el.id));
        if (selectedElements.length < 2) return;

        const selectionBounds = getSelectionBounds(selectedElementIds);
        const { x: minX, y: minY, width, height } = selectionBounds;
        const maxX = minX + width;
        const maxY = minY + height;

        const selectionCenterX = minX + width / 2;
        const selectionCenterY = minY + height / 2;

        commitAction((prev) => {
            const elementsToUpdate = new Map<string, { dx: number; dy: number }>();

            selectedElements.forEach((el) => {
                const bounds = getElementBounds(el, prev);
                let dx = 0;
                let dy = 0;

                switch (alignment) {
                    case 'left':
                        dx = minX - bounds.x;
                        break;
                    case 'center':
                        dx = selectionCenterX - (bounds.x + bounds.width / 2);
                        break;
                    case 'right':
                        dx = maxX - (bounds.x + bounds.width);
                        break;
                    case 'top':
                        dy = minY - bounds.y;
                        break;
                    case 'middle':
                        dy = selectionCenterY - (bounds.y + bounds.height / 2);
                        break;
                    case 'bottom':
                        dy = maxY - (bounds.y + bounds.height);
                        break;
                }

                if (dx !== 0 || dy !== 0) {
                    const elementsToMove = [el, ...getDescendants(el.id, prev)];
                    elementsToMove.forEach((elementToMove) => {
                        if (!elementsToUpdate.has(elementToMove.id)) {
                            elementsToUpdate.set(elementToMove.id, { dx, dy });
                        }
                    });
                }
            });
            return prev.map((el): Element => {
                const delta = elementsToUpdate.get(el.id);
                if (!delta) {
                    return el;
                }

                const { dx, dy } = delta;

                switch (el.type) {
                    case 'image':
                    case 'shape':
                    case 'text':
                    case 'group':
                    case 'video':
                        return { ...el, x: el.x + dx, y: el.y + dy };
                    case 'arrow':
                    case 'line':
                        return {
                            ...el,
                            points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) as [Point, Point],
                        };
                    case 'path':
                        return { ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
                }
            });
        });
    };

    const isElementVisible = useCallback((element: Element, allElements: Element[]): boolean => {
        if (element.isVisible === false) return false;
        if (element.parentId) {
            const parent = allElements.find((el) => el.id === element.parentId);
            if (parent) {
                return isElementVisible(parent, allElements);
            }
        }
        return true;
    }, []);

    const isSelectionActive = selectedElementIds.length > 0;
    const singleSelectedElement =
        selectedElementIds.length === 1 ? elements.find((el) => el.id === selectedElementIds[0]) : null;

    let cursor = 'default';
    if (croppingState) cursor = 'default';
    else if (interactionMode.current === 'pan') cursor = 'grabbing';
    else if (activeTool === 'pan') cursor = 'grab';
    else if (
        ['draw', 'erase', 'rectangle', 'circle', 'triangle', 'arrow', 'line', 'text', 'highlighter', 'lasso'].includes(
            activeTool,
        )
    )
        cursor = 'crosshair';

    // Board Management — delegated to useBoardStore
    const handleAddBoard = () => boardStore.addBoard(`Board ${boards.length + 1}`);
    const handleDuplicateBoard = (boardId: string) => boardStore.duplicateBoard(boardId);
    const handleDeleteBoard = (boardId: string) => boardStore.deleteBoard(boardId);
    const handleRenameBoard = (boardId: string, name: string) => boardStore.renameBoard(boardId, name);

    const generateBoardThumbnail = useCallback((elements: Element[], bgColor: string): string => {
        const THUMB_WIDTH = 120;
        const THUMB_HEIGHT = 80;

        if (elements.length === 0) {
            const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}"><rect width="100%" height="100%" fill="${bgColor}" /></svg>`;
            return `data:image/svg+xml;base64,${btoa(emptySvg)}`;
        }

        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        elements.forEach((el) => {
            const bounds = getElementBounds(el, elements);
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        });

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;

        if (contentWidth <= 0 || contentHeight <= 0) {
            const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}"><rect width="100%" height="100%" fill="${bgColor}" /></svg>`;
            return `data:image/svg+xml;base64,${btoa(emptySvg)}`;
        }

        const scale = Math.min(THUMB_WIDTH / contentWidth, THUMB_HEIGHT / contentHeight) * 0.9;
        const dx = (THUMB_WIDTH - contentWidth * scale) / 2 - minX * scale;
        const dy = (THUMB_HEIGHT - contentHeight * scale) / 2 - minY * scale;

        const svgContent = elements
            .map((el) => {
                if (el.type === 'path') {
                    const pathData = el.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                    return `<path d="${pathData}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${el.strokeOpacity || 1}" />`;
                }
                if (el.type === 'image') {
                    return `<image href="${el.href}" x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" />`;
                }
                // Add other element types for more accurate thumbnails if needed
                return '';
            })
            .join('');

        const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}"><rect width="100%" height="100%" fill="${bgColor}" /><g transform="translate(${dx} ${dy}) scale(${scale})">${svgContent}</g></svg>`;
        return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(fullSvg)))}`;
    }, []);

    return {
        handleDeleteElement,
        handleCopyElement,
        handleDownloadImage,
        insertImageAgentResult,
        handleSplitImageWithBanana,
        handleUpscaleImageWithBanana,
        handleRemoveBackgroundWithBanana,
        handleStartCrop,
        handleCancelCrop,
        handleConfirmCrop,
        handleGenerate,
        handleRunNodeWorkflow,
        handleCanvasImageDragStart,
        handleDragOver,
        handleDrop,
        handleContextMenu,
        handlePaste,
        handleAlignSelection,
        handleAddBoard,
        handleDuplicateBoard,
        handleDeleteBoard,
        handleRenameBoard,
    };
}
