import { useCallback } from 'react';
import type { Element, ImageElement, VideoElement, GroupElement } from '../types';
import type { Rect } from '../utils/geometry';
import { getElementBounds } from '../utils/geometry';
import { rasterizeElements } from '../utils/rasterize';
import { generateId } from '../utils/id';

interface ElementActionsParams {
    elements: Element[];
    selectedElementIds: string[];
    commitAction: (updater: (prev: Element[]) => Element[]) => void;
    setSelectedElementIds: (ids: string[]) => void;
    setContextMenu: (menu: { x: number; y: number; elementId: string | null } | null) => void;
    setIsLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    getSelectionBounds: (selectionIds: string[]) => Rect;
}

export function useElementActions({
    elements,
    selectedElementIds,
    commitAction,
    setSelectedElementIds,
    setContextMenu,
    setIsLoading,
    setError,
    getSelectionBounds,
}: ElementActionsParams) {
    const handlePropertyChange = useCallback(
        (elementId: string, updates: Partial<Element>) => {
            commitAction((prev) =>
                prev.map((el) => (el.id === elementId ? { ...el, ...updates } : el)) as Element[],
            );
        },
        [commitAction],
    );

    const handleLayerAction = useCallback(
        (elementId: string, action: 'front' | 'back' | 'forward' | 'backward') => {
            commitAction((prev) => {
                const elementsCopy = [...prev];
                const index = elementsCopy.findIndex((el) => el.id === elementId);
                if (index === -1) return elementsCopy;

                const [element] = elementsCopy.splice(index, 1);

                if (action === 'front') {
                    elementsCopy.push(element);
                } else if (action === 'back') {
                    elementsCopy.unshift(element);
                } else if (action === 'forward') {
                    const newIndex = Math.min(elementsCopy.length, index + 1);
                    elementsCopy.splice(newIndex, 0, element);
                } else if (action === 'backward') {
                    const newIndex = Math.max(0, index - 1);
                    elementsCopy.splice(newIndex, 0, element);
                }
                return elementsCopy;
            });
            setContextMenu(null);
        },
        [commitAction, setContextMenu],
    );

    const handleRasterizeSelection = useCallback(async () => {
        const elementsToRasterize = elements.filter(
            (el) => selectedElementIds.includes(el.id) && el.type !== 'image' && el.type !== 'video',
        ) as Exclude<Element, ImageElement | VideoElement>[];

        if (elementsToRasterize.length === 0) return;

        setContextMenu(null);
        setIsLoading(true);
        setError(null);

        try {
            let minX = Infinity,
                minY = Infinity;
            elementsToRasterize.forEach((element) => {
                const bounds = getElementBounds(element);
                minX = Math.min(minX, bounds.x);
                minY = Math.min(minY, bounds.y);
            });

            const { href, mimeType, width, height } = await rasterizeElements(elementsToRasterize);

            const newImage: ImageElement = {
                id: generateId(),
                type: 'image',
                name: 'Rasterized Image',
                x: minX - 10,
                y: minY - 10,
                width,
                height,
                href,
                mimeType,
            };

            const idsToRemove = new Set(elementsToRasterize.map((el) => el.id));

            commitAction((prev) => {
                const remainingElements = prev.filter((el) => !idsToRemove.has(el.id));
                return [...remainingElements, newImage];
            });

            setSelectedElementIds([newImage.id]);
        } catch (err) {
            const error = err as Error;
            setError(`Failed to rasterize selection: ${error.message}`);
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [elements, selectedElementIds, commitAction, setSelectedElementIds, setContextMenu, setIsLoading, setError]);

    const handleGroup = useCallback(() => {
        const selectedElements = elements.filter((el) => selectedElementIds.includes(el.id));
        if (selectedElements.length < 2) return;

        const bounds = getSelectionBounds(selectedElementIds);
        const newGroupId = generateId();

        const newGroup: GroupElement = {
            id: newGroupId,
            type: 'group',
            name: 'Group',
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
        };

        commitAction((prev) => {
            const updatedElements = prev.map((el) =>
                selectedElementIds.includes(el.id) ? { ...el, parentId: newGroupId } : el,
            );
            return [...updatedElements, newGroup];
        });

        setSelectedElementIds([newGroupId]);
        setContextMenu(null);
    }, [elements, selectedElementIds, commitAction, setSelectedElementIds, setContextMenu, getSelectionBounds]);

    const handleUngroup = useCallback(() => {
        if (selectedElementIds.length !== 1) return;
        const groupId = selectedElementIds[0];
        const group = elements.find((el) => el.id === groupId);
        if (!group || group.type !== 'group') return;

        const childrenIds: string[] = [];
        commitAction((prev) => {
            return prev
                .map((el) => {
                    if (el.parentId === groupId) {
                        childrenIds.push(el.id);
                        return { ...el, parentId: undefined };
                    }
                    return el;
                })
                .filter((el) => el.id !== groupId);
        });

        setSelectedElementIds(childrenIds);
        setContextMenu(null);
    }, [elements, selectedElementIds, commitAction, setSelectedElementIds, setContextMenu]);

    return {
        handlePropertyChange,
        handleLayerAction,
        handleRasterizeSelection,
        handleGroup,
        handleUngroup,
    };
}
