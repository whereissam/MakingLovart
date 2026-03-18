import { useEffect } from 'react';
import type { Tool, Element } from '../types';

interface KeyboardShortcutsParams {
    editingElement: { id: string; text: string } | null;
    handleStopEditing: () => void;
    handleUndo: () => void;
    handleRedo: () => void;
    selectedElementIds: string[];
    commitAction: (updater: (prev: Element[]) => Element[]) => void;
    setSelectedElementIds: (ids: string[]) => void;
    activeTool: Tool;
    setActiveTool: (tool: Tool) => void;
    getDescendants: (id: string, allElements: Element[]) => Element[];
    spacebarDownTime: React.MutableRefObject<number | null>;
    previousToolRef: React.MutableRefObject<Tool>;
}

export function useKeyboardShortcuts({
    editingElement,
    handleStopEditing,
    handleUndo,
    handleRedo,
    selectedElementIds,
    commitAction,
    setSelectedElementIds,
    activeTool,
    setActiveTool,
    getDescendants,
    spacebarDownTime,
    previousToolRef,
}: KeyboardShortcutsParams) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (editingElement) {
                if (e.key === 'Escape') handleStopEditing();
                return;
            }

            const target = e.target as HTMLElement;
            const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                handleUndo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
                e.preventDefault();
                handleRedo();
                return;
            }

            if (!isTyping && (e.key === 'Delete' || e.key === 'Backspace') && selectedElementIds.length > 0) {
                e.preventDefault();
                commitAction((prev) => {
                    const idsToDelete = new Set(selectedElementIds);
                    selectedElementIds.forEach((id) => {
                        getDescendants(id, prev).forEach((desc) => idsToDelete.add(desc.id));
                    });
                    return prev.filter((el) => !idsToDelete.has(el.id));
                });
                setSelectedElementIds([]);
                return;
            }

            if (e.key === ' ' && !isTyping) {
                e.preventDefault();
                if (spacebarDownTime.current === null) {
                    spacebarDownTime.current = Date.now();
                    previousToolRef.current = activeTool;
                    setActiveTool('pan');
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === ' ' && !editingElement) {
                const target = e.target as HTMLElement;
                const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
                if (isTyping || spacebarDownTime.current === null) return;

                e.preventDefault();

                const duration = Date.now() - spacebarDownTime.current;
                spacebarDownTime.current = null;

                const toolBeforePan = previousToolRef.current;

                if (duration < 200) {
                    if (toolBeforePan === 'pan') {
                        setActiveTool('select');
                    } else if (toolBeforePan === 'select') {
                        setActiveTool('pan');
                    } else {
                        setActiveTool('select');
                    }
                } else {
                    setActiveTool(toolBeforePan);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [
        handleUndo,
        handleRedo,
        selectedElementIds,
        editingElement,
        activeTool,
        commitAction,
        getDescendants,
        handleStopEditing,
    ]);
}
