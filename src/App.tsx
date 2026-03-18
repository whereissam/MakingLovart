import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CanvasView } from './components/canvas/CanvasView';
import type { Tool, Point, Element, ImageElement, AssetLibrary, GenerationHistoryItem } from './types';
import type { Rect, Guide } from './utils/geometry';
import { loadAssetLibrary } from './utils/assetStorage';
import { loadGenerationHistory } from './utils/generationHistory';
import { useUIStore } from './stores/useUIStore';
import { useAIStore } from './stores/useAIStore';
import { useBoardStore } from './stores/useBoardStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useElementActions } from './hooks/useElementActions';
import { useGeneration } from './hooks/useGeneration';
import { useCanvasInteractions } from './hooks/useCanvasInteractions';
import { useImageActions } from './hooks/useImageActions';

const App: React.FC = () => {
    // ── Zustand Stores ──────────────────────────────────────
    const {
        themeMode,
        setThemeMode,
        resolvedTheme,
        themePalette,
        canvasBackgroundColor,
        language,
        setLanguage,
        isSettingsPanelOpen,
        setSettingsPanelOpen: setIsSettingsPanelOpen,
        isAssetPanelOpen,
        setAssetPanelOpen: setIsAssetPanelOpen,
        isLayerMinimized,
        setLayerMinimized: setIsLayerMinimized,
        isInspirationMinimized,
        setInspirationMinimized: setIsInspirationMinimized,
        wheelAction,
        setWheelAction,
        isLoading,
        setIsLoading,
        isEnhancingPrompt,
        error,
        setError,
        progressMessage,
        setProgressMessage,
        toolbarLeft,
        setToolbarLeft,
        rightPanelWidth,
        setRightPanelWidth,
        setSystemTheme,
    } = useUIStore();

    const aiStore = useAIStore();
    const {
        userApiKeys,
        modelPreference,
        dynamicModelOptions,
        generationMode,
        setGenerationMode,
        videoAspectRatio,
        setVideoAspectRatio,
        isAutoEnhanceEnabled,
        userEffects,
        characterLocks,
        activeCharacterLockId,
        prompt,
        setPrompt,
        promptAttachments,
        chatAttachments,
        mentionedElementIds,
        setMentionedElementIds,
        getPreferredApiKey,
    } = aiStore;

    // Aliases for handlers from AI store
    const handleAddUserEffect = aiStore.addUserEffect;
    const handleDeleteUserEffect = aiStore.deleteUserEffect;
    const handleAddApiKey = aiStore.addApiKey;
    const handleDeleteApiKey = aiStore.deleteApiKey;
    const handleSetDefaultApiKey = aiStore.setDefaultApiKey;
    const setModelPreference = aiStore.setModelPreference;
    const handleSetActiveCharacterLock = aiStore.setActiveCharacterLock;
    const handleEnhancePrompt = aiStore.enhancePrompt;
    const handleRemovePromptAttachment = aiStore.removePromptAttachment;
    const handleAddPromptAttachmentFiles = aiStore.addPromptAttachmentFiles;
    const handleRemoveChatAttachment = aiStore.removeChatAttachment;
    const handleAddAttachmentFiles = aiStore.addChatAttachmentFiles;
    const handleAddAttachmentFromCanvas = aiStore.addAttachmentFromCanvas;
    const setIsAutoEnhanceEnabled = aiStore.setAutoEnhanceEnabled;

    // ── Board Store ──────────────────────────────────────
    const boardStore = useBoardStore();
    const { boards, activeBoardId } = boardStore;
    const setActiveBoardId = boardStore.switchBoard;
    const activeBoard = boardStore.getActiveBoard();
    const { elements, history, historyIndex, panOffset, zoom } = activeBoard;

    // ── Canvas-local state ──────────────────────────────────
    const [activeTool, setActiveTool] = useState<Tool>('select');
    const [drawingOptions, setDrawingOptions] = useState({ strokeColor: '#111827', strokeWidth: 5 });
    const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
    const [selectionBox, setSelectionBox] = useState<Rect | null>(null);
    const [croppingState, setCroppingState] = useState<{
        elementId: string;
        originalElement: ImageElement;
        cropBox: Rect;
    } | null>(null);
    const [alignmentGuides, setAlignmentGuides] = useState<Guide[]>([]);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string | null } | null>(null);
    const [assetLibrary, setAssetLibrary] = useState<AssetLibrary>(() => loadAssetLibrary());
    const [generationHistory, setGenerationHistory] = useState<GenerationHistoryItem[]>(() => loadGenerationHistory());
    const [addAssetModal, setAddAssetModal] = useState<{
        open: boolean;
        dataUrl: string;
        mimeType: string;
        width: number;
        height: number;
    } | null>(null);

    // Board persistence is handled by useBoardStore

    const [editingElement, setEditingElement] = useState<{ id: string; text: string } | null>(null);
    const [lassoPath, setLassoPath] = useState<Point[] | null>(null);

    const apiConfigStore = useAPIConfigStore();

    // Listen for system theme changes
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const updateTheme = (event?: MediaQueryListEvent) => {
            setSystemTheme((event ? event.matches : media.matches) ? 'dark' : 'light');
        };
        updateTheme();
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', updateTheme);
            return () => media.removeEventListener('change', updateTheme);
        }
        media.addListener(updateTheme);
        return () => media.removeListener(updateTheme);
    }, [setSystemTheme]);

    // interactionMode, startPoint, currentDrawingElementId, resizeStartInfo,
    // cropStartInfo, dragStartElementPositions are now in useCanvasInteractions
    const elementsRef = useRef(elements);
    const svgRef = useRef<SVGSVGElement>(null);
    const editingTextareaRef = useRef<HTMLTextAreaElement>(null);
    const previousToolRef = useRef<Tool>('select');
    const spacebarDownTime = useRef<number | null>(null);
    elementsRef.current = elements;

    useEffect(() => {
        setSelectedElementIds([]);
        setEditingElement(null);
        setCroppingState(null);
        setSelectionBox(null);
        setPrompt('');
    }, [activeBoardId]);

    useEffect(() => {
        if (!boards.length) return;
        if (!boards.some((board) => board.id === activeBoardId)) {
            setActiveBoardId(boards[0].id);
        }
    }, [boards, activeBoardId]);

    const selectedSingleImage = useMemo<ImageElement | null>(() => {
        if (selectedElementIds.length !== 1) return null;
        const selected = elements.find((el) => el.id === selectedElementIds[0]);
        return selected && selected.type === 'image' ? selected : null;
    }, [elements, selectedElementIds]);

    const activeCharacterLock = useMemo(() => {
        if (!activeCharacterLockId) return null;
        return characterLocks.find((lock) => lock.id === activeCharacterLockId) || null;
    }, [activeCharacterLockId, characterLocks]);

    const handleLockCharacterFromSelection = useCallback(
        (name?: string) => {
            if (!selectedSingleImage) {
                setError('Please select an image before locking a character.');
                return;
            }
            aiStore.lockCharacterFromImage(selectedSingleImage, name);
        },
        [selectedSingleImage],
    );

    const saveGenerationToHistory = useCallback(
        (payload: {
            name?: string;
            dataUrl: string;
            mimeType: string;
            width: number;
            height: number;
            prompt: string;
        }) => {
            const item: GenerationHistoryItem = {
                id: generateId(),
                name: payload.name,
                dataUrl: payload.dataUrl,
                mimeType: payload.mimeType,
                width: payload.width,
                height: payload.height,
                prompt: payload.prompt,
                createdAt: Date.now(),
            };

            setGenerationHistory((prev) => addGenerationHistoryItem(prev, item));
        },
        [],
    );

    const t = useCallback(
        (key: string, ...args: any[]): any => {
            const keys = key.split('.');
            let result: any = translations[language];
            for (const k of keys) {
                result = result?.[k];
            }
            if (typeof result === 'function') {
                return result(...args);
            }
            return result || key;
        },
        [language],
    );

    useEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = resolvedTheme;
        root.style.setProperty('--ui-bg-color', themePalette.uiBgColor);
        root.style.setProperty('--button-bg-color', themePalette.buttonBgColor);
        document.body.style.backgroundColor = themePalette.appBackground;
    }, [resolvedTheme, themePalette]);

    // Board actions from store
    const updateActiveBoard = boardStore.updateActiveBoard;
    const setElements = boardStore.setElements;
    const commitAction = boardStore.commitAction;
    const handleUndo = boardStore.undo;
    const handleRedo = boardStore.redo;

    // Handle drop from AssetLibraryPanel (after commitAction and getCanvasPoint are defined)
    const handleAssetDropRef = useRef<(e: React.DragEvent) => void>();
    handleAssetDropRef.current = (e: React.DragEvent) => {
        const payload = e.dataTransfer.getData('text/plain');
        try {
            const parsed = JSON.parse(payload);
            if (parsed?.__makingAsset && parsed.item) {
                const item: AssetItem = parsed.item as AssetItem;
                const canvasPoint = getCanvasPoint(e.clientX, e.clientY);
                const img = new Image();
                img.onload = () => {
                    const newImage: ImageElement = {
                        id: generateId(),
                        type: 'image',
                        name: item.name || 'Asset',
                        x: canvasPoint.x - img.width / 2,
                        y: canvasPoint.y - img.height / 2,
                        width: img.width,
                        height: img.height,
                        href: item.dataUrl,
                        mimeType: item.mimeType,
                    };
                    commitAction((prev) => [...prev, newImage]);
                    setSelectedElementIds([newImage.id]);
                    setActiveTool('select');
                };
                img.src = item.dataUrl;
            }
        } catch {}
    };

    const getDescendants = useCallback((elementId: string, allElements: Element[]): Element[] => {
        const descendants: Element[] = [];
        const children = allElements.filter((el) => el.parentId === elementId);
        for (const child of children) {
            descendants.push(child);
            if (child.type === 'group') {
                descendants.push(...getDescendants(child.id, allElements));
            }
        }
        return descendants;
    }, []);

    const handleDeleteSelection = useCallback(() => {
        if (selectedElementIds.length === 0) return;
        commitAction((prev) => {
            const idsToDelete = new Set<string>(selectedElementIds);
            selectedElementIds.forEach((id) => {
                getDescendants(id, prev).forEach((desc) => idsToDelete.add(desc.id));
            });
            return prev.filter((el) => !idsToDelete.has(el.id));
        });
        setSelectedElementIds([]);
    }, [selectedElementIds, commitAction, getDescendants]);

    const handleStopEditing = useCallback(() => {
        if (!editingElement) return;
        commitAction((prev) =>
            prev.map((el) =>
                el.id === editingElement.id && el.type === 'text'
                    ? { ...el, text: editingElement.text }
                    : // Persist auto-height change on blur
                      el.id === editingElement.id && el.type === 'text' && editingTextareaRef.current
                      ? { ...el, text: editingElement.text, height: editingTextareaRef.current.scrollHeight }
                      : el,
            ),
        );
        setEditingElement(null);
    }, [commitAction, editingElement]);

    useKeyboardShortcuts({
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
    });

    const {
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleWheel,
        handleAddImageElement,
        getCanvasPoint,
        interactionMode,
    } = useCanvasInteractions({
        elements,
        activeTool,
        setActiveTool,
        drawingOptions,
        selectedElementIds,
        setSelectedElementIds,
        selectionBox,
        setSelectionBox,
        croppingState,
        setCroppingState,
        alignmentGuides,
        setAlignmentGuides,
        editingElement,
        setEditingElement,
        lassoPath,
        setLassoPath,
        panOffset,
        zoom,
        setElements,
        commitAction,
        updateActiveBoard,
        svgRef,
        elementsRef,
        wheelAction,
    });

    const imageActions = useImageActions({
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
    });
    const {
        handleDeleteElement,
        handleCopyElement,
        handleDownloadImage,
        handleSplitImageWithBanana,
        handleUpscaleImageWithBanana,
        handleRemoveBackgroundWithBanana,
        handleStartCrop,
        handleConfirmCrop,
        handleContextMenu,
        handleDrop,
        insertImageAgentResult,
        handleDragOver,
        handleAlignSelection,
        handlePaste,
    } = imageActions;
    const handleCancelCrop = () => setCroppingState(null);

    return (
        <CanvasView
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            drawingOptions={drawingOptions}
            setDrawingOptions={setDrawingOptions}
            selectedElementIds={selectedElementIds}
            setSelectedElementIds={setSelectedElementIds}
            selectionBox={selectionBox}
            croppingState={croppingState}
            setCroppingState={setCroppingState}
            alignmentGuides={alignmentGuides}
            contextMenu={contextMenu}
            setContextMenu={setContextMenu}
            editingElement={editingElement}
            setEditingElement={setEditingElement}
            lassoPath={lassoPath}
            assetLibrary={assetLibrary}
            setAssetLibrary={setAssetLibrary}
            generationHistory={generationHistory}
            setGenerationHistory={setGenerationHistory}
            addAssetModal={addAssetModal}
            setAddAssetModal={setAddAssetModal}
            svgRef={svgRef}
            editingTextareaRef={editingTextareaRef}
            elementsRef={elementsRef}
            interactionMode={interactionMode}
            handleMouseDown={handleMouseDown}
            handleMouseMove={handleMouseMove}
            handleMouseUp={handleMouseUp}
            handleWheel={handleWheel}
            handleContextMenu={handleContextMenu}
            handleDragOver={handleDragOver}
            handleDrop={handleDrop}
            handleGenerate={handleGenerate}
            handleAddImageElement={handleAddImageElement}
            handleDeleteElement={handleDeleteElement}
            handleCopyElement={handleCopyElement}
            handleDownloadImage={handleDownloadImage}
            handleSplitImageWithBanana={handleSplitImageWithBanana}
            handleUpscaleImageWithBanana={handleUpscaleImageWithBanana}
            handleRemoveBackgroundWithBanana={handleRemoveBackgroundWithBanana}
            handleStartCrop={handleStartCrop}
            handleCancelCrop={handleCancelCrop}
            handleConfirmCrop={handleConfirmCrop}
            handleStopEditing={handleStopEditing}
            handlePropertyChange={handlePropertyChange}
            handleLayerAction={handleLayerAction}
            handleRasterizeSelection={handleRasterizeSelection}
            handleGroup={handleGroup}
            handleUngroup={handleUngroup}
            handleAlignSelection={handleAlignSelection}
            handleUndo={handleUndo}
            handleRedo={handleRedo}
            insertImageAgentResult={insertImageAgentResult}
            saveGenerationToHistory={saveGenerationToHistory}
            getCanvasPoint={getCanvasPoint}
            commitAction={commitAction}
            setElements={setElements}
        />
    );
};

export default App;
