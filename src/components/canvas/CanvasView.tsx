import React from 'react';
import type {
    Tool,
    Point,
    Element,
    ImageElement,
    PathElement,
    ShapeElement,
    TextElement,
    ArrowElement,
    LineElement,
    GroupElement,
    VideoElement,
    AssetLibrary,
    AssetCategory,
    AssetItem,
    GenerationHistoryItem,
    ChatAttachment,
} from '../../types';
import type { Rect, Guide } from '../../utils/geometry';
import { getElementBounds } from '../../utils/geometry';
import { generateId } from '../../utils/id';
import { exportCanvas } from '../../utils/canvasExport';
import { KonvaCanvas } from './KonvaCanvas';
import { RemoteCursors } from './RemoteCursors';
import { CollaborationPanel } from '../CollaborationPanel';
import { useCollaborationStore } from '../../stores/useCollaborationStore';
import { Toolbar } from '../Toolbar';
import { PromptBar } from '../PromptBar';
import { Loader } from '../Loader';
import { CanvasSettings } from '../CanvasSettings';
import { WorkspaceSidebar } from '../WorkspaceSidebar';
import { AssetLibraryPanel } from '../AssetLibraryPanel';
import { RightPanel } from '../RightPanel';
import { AssetAddModal } from '../AssetAddModal';
import { loadAssetLibrary, addAsset, removeAsset, renameAsset } from '../../utils/assetStorage';
import { useUIStore } from '../../stores/useUIStore';
import { useAIStore } from '../../stores/useAIStore';
import { useBoardStore } from '../../stores/useBoardStore';
import { useAPIConfigStore } from '../../stores/api-config-store';
import { translations } from '../../translations';

interface CanvasViewProps {
    // Canvas-local state
    activeTool: Tool;
    setActiveTool: (tool: Tool) => void;
    drawingOptions: { strokeColor: string; strokeWidth: string };
    setDrawingOptions: (opts: any) => void;
    selectedElementIds: string[];
    setSelectedElementIds: (ids: string[] | ((prev: string[]) => string[])) => void;
    selectionBox: Rect | null;
    croppingState: { elementId: string; originalElement: ImageElement; cropBox: Rect } | null;
    setCroppingState: (state: any) => void;
    alignmentGuides: Guide[];
    contextMenu: { x: number; y: number; elementId: string | null } | null;
    setContextMenu: (menu: any) => void;
    editingElement: { id: string; text: string } | null;
    setEditingElement: (el: { id: string; text: string } | null) => void;
    lassoPath: Point[] | null;
    assetLibrary: AssetLibrary;
    setAssetLibrary: (updater: (prev: AssetLibrary) => AssetLibrary) => void;
    generationHistory: GenerationHistoryItem[];
    setGenerationHistory: (updater: (prev: GenerationHistoryItem[]) => GenerationHistoryItem[]) => void;
    addAssetModal: any;
    setAddAssetModal: (modal: any) => void;
    svgRef: React.RefObject<SVGSVGElement | null>;
    editingTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
    elementsRef: React.MutableRefObject<Element[]>;
    interactionMode: React.MutableRefObject<string | null>;

    // Handlers
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseUp: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleWheel: (e: React.WheelEvent<SVGSVGElement>) => void;
    handleContextMenu: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleDragOver: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => void;
    handleGenerate: (promptOverride?: string, source?: 'prompt' | 'right') => void;
    handleAddImageElement: (file: File) => Promise<void>;
    handleDeleteElement: (id: string) => void;
    handleCopyElement: (el: Element) => void;
    handleDownloadImage: (el: ImageElement) => void;
    handleSplitImageWithBanana: (el: ImageElement) => void;
    handleUpscaleImageWithBanana: (el: ImageElement) => void;
    handleRemoveBackgroundWithBanana: (el: ImageElement) => void;
    handleStartCrop: (el: ImageElement) => void;
    handleCancelCrop: () => void;
    handleConfirmCrop: () => void;
    handleStopEditing: () => void;
    handlePropertyChange: (id: string, updates: Partial<Element>) => void;
    handleLayerAction: (id: string, action: 'front' | 'back' | 'forward' | 'backward') => void;
    handleRasterizeSelection: () => void;
    handleGroup: () => void;
    handleUngroup: () => void;
    handleAlignSelection: (alignment: string) => void;
    handleUndo: () => void;
    handleRedo: () => void;
    insertImageAgentResult: (result: any) => void;
    saveGenerationToHistory: (payload: any) => void;
    getCanvasPoint: (screenX: number, screenY: number) => Point;
    commitAction: (updater: (prev: Element[]) => Element[]) => void;
    setElements: (updater: (prev: Element[]) => Element[], commit?: boolean) => void;
}

export const CanvasView: React.FC<CanvasViewProps> = (props) => {
    const {
        activeTool,
        setActiveTool,
        drawingOptions,
        setDrawingOptions,
        selectedElementIds,
        setSelectedElementIds,
        selectionBox,
        croppingState,
        setCroppingState,
        alignmentGuides,
        contextMenu,
        setContextMenu,
        editingElement,
        setEditingElement,
        lassoPath,
        assetLibrary,
        setAssetLibrary,
        generationHistory,
        setGenerationHistory,
        addAssetModal,
        setAddAssetModal,
        svgRef,
        editingTextareaRef,
        elementsRef,
        interactionMode,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleWheel,
        handleContextMenu,
        handleDragOver,
        handleDrop,
        handleGenerate,
        handleAddImageElement,
        handleDeleteElement,
        handleCopyElement,
        handleDownloadImage,
        handleSplitImageWithBanana,
        handleUpscaleImageWithBanana,
        handleRemoveBackgroundWithBanana,
        handleStartCrop,
        handleCancelCrop,
        handleConfirmCrop,
        handleStopEditing,
        handlePropertyChange,
        handleLayerAction,
        handleRasterizeSelection,
        handleGroup,
        handleUngroup,
        handleAlignSelection,
        handleUndo,
        handleRedo,
        insertImageAgentResult,
        saveGenerationToHistory,
        getCanvasPoint,
        commitAction,
        setElements,
    } = props;

    // Access stores directly
    const {
        resolvedTheme,
        themePalette,
        canvasBackgroundColor,
        language,
        setLanguage,
        themeMode,
        setThemeMode,
        isSettingsPanelOpen,
        setSettingsPanelOpen: setIsSettingsPanelOpen,
        isLayerMinimized,
        setLayerMinimized: setIsLayerMinimized,
        isInspirationMinimized,
        setInspirationMinimized: setIsInspirationMinimized,
        wheelAction,
        setWheelAction,
        isLoading,
        error,
        setError,
        progressMessage,
        rightPanelWidth,
        setRightPanelWidth,
        isEnhancingPrompt,
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
    } = aiStore;

    const boardStore = useBoardStore();
    const { boards, activeBoardId } = boardStore;
    const activeBoard = boardStore.getActiveBoard();
    const { elements, panOffset, zoom } = activeBoard;

    const apiConfigStore = useAPIConfigStore();

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
    const setIsAutoEnhanceEnabled = aiStore.setAutoEnhanceEnabled;
    const setActiveBoardId = boardStore.switchBoard;
    const handleAddBoard = () => boardStore.addBoard(`Board ${boards.length + 1}`);
    const handleDuplicateBoard = (boardId: string) => boardStore.duplicateBoard(boardId);
    const handleDeleteBoard = (boardId: string) => boardStore.deleteBoard(boardId);
    const handleRenameBoard = (boardId: string, name: string) => boardStore.renameBoard(boardId, name);

    const t = React.useCallback(
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

    // Collaboration
    const collabStore = useCollaborationStore();
    const [isCollabPanelOpen, setCollabPanelOpen] = React.useState(false);

    // Sync elements to collaboration when they change
    React.useEffect(() => {
        if (collabStore.isConnected) {
            collabStore.pushElements(elements);
        }
    }, [elements, collabStore.isConnected]);

    // Sync cursor position on mouse move
    React.useEffect(() => {
        if (!collabStore.isConnected) return;
        const handleMove = (e: MouseEvent) => {
            const canvasPoint = getCanvasPoint(e.clientX, e.clientY);
            collabStore.updateCursor(canvasPoint);
        };
        window.addEventListener('mousemove', handleMove);
        return () => window.removeEventListener('mousemove', handleMove);
    }, [collabStore.isConnected, getCanvasPoint]);

    // Sync selection to collaboration
    React.useEffect(() => {
        if (collabStore.isConnected) {
            collabStore.updateSelection(selectedElementIds);
        }
    }, [selectedElementIds, collabStore.isConnected]);

    // Set up remote change handler to update local board
    React.useEffect(() => {
        collabStore.setOnRemoteChange((remoteElements) => {
            setElements(() => remoteElements, false); // Don't commit to history
        });
    }, [setElements]);

    const selectedSingleImage = React.useMemo<ImageElement | null>(() => {
        if (selectedElementIds.length !== 1) return null;
        const selected = elements.find((el) => el.id === selectedElementIds[0]);
        return selected && selected.type === 'image' ? selected : null;
    }, [elements, selectedElementIds]);

    const activeCharacterLock = React.useMemo(() => {
        if (!activeCharacterLockId) return null;
        return characterLocks.find((lock) => lock.id === activeCharacterLockId) || null;
    }, [activeCharacterLockId, characterLocks]);

    const handleLockCharacterFromSelection = React.useCallback(
        (name?: string) => {
            if (!selectedSingleImage) {
                setError('Please select an image before locking a character.');
                return;
            }
            aiStore.lockCharacterFromImage(selectedSingleImage, name);
        },
        [selectedSingleImage],
    );

    const isSelectionActive = selectedElementIds.length > 0;
    const generateBoardThumbnail = React.useCallback((els: Element[], bgColor: string): string => {
        return ''; // Simplified - implement if needed
    }, []);

    return (
        <div
            className="theme-aware w-screen h-screen flex flex-col font-sans"
            style={{ backgroundColor: themePalette.appBackground }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {isLoading && <Loader progressMessage={progressMessage} />}
            {error && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md shadow-lg flex items-center max-w-lg">
                    <span className="flex-grow">{error}</span>
                    <button
                        onClick={() => setError(null)}
                        className="ml-4 p-1 rounded-full hover:bg-red-200"
                        title={t('common.close')}
                        aria-label={t('common.close')}
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                            ></path>
                        </svg>
                    </button>
                </div>
            )}
            <WorkspaceSidebar
                isOpen={!isLayerMinimized}
                onToggle={() => setIsLayerMinimized(!isLayerMinimized)}
                boards={boards}
                activeBoardId={activeBoardId}
                onSwitchBoard={setActiveBoardId}
                onAddBoard={handleAddBoard}
                onRenameBoard={handleRenameBoard}
                onDuplicateBoard={handleDuplicateBoard}
                onDeleteBoard={handleDeleteBoard}
                generateBoardThumbnail={(els) => generateBoardThumbnail(els, canvasBackgroundColor)}
                elements={elements}
                selectedElementIds={selectedElementIds}
                onSelectElement={(id) => setSelectedElementIds(id ? [id] : [])}
                onToggleVisibility={(id) =>
                    handlePropertyChange(id, { isVisible: !(elements.find((el) => el.id === id)?.isVisible ?? true) })
                }
                onToggleLock={(id) =>
                    handlePropertyChange(id, { isLocked: !(elements.find((el) => el.id === id)?.isLocked ?? false) })
                }
                onRenameElement={(id, name) => handlePropertyChange(id, { name })}
                onReorder={(draggedId, targetId, position) => {
                    commitAction((prev) => {
                        const newElements = [...prev];
                        const draggedIndex = newElements.findIndex((el) => el.id === draggedId);
                        if (draggedIndex === -1) return prev;

                        const [draggedItem] = newElements.splice(draggedIndex, 1);
                        const targetIndex = newElements.findIndex((el) => el.id === targetId);
                        if (targetIndex === -1) {
                            newElements.push(draggedItem);
                            return newElements;
                        }

                        const finalIndex = position === 'before' ? targetIndex : targetIndex + 1;
                        newElements.splice(finalIndex, 0, draggedItem);
                        return newElements;
                    });
                }}
            />
            {/* New Right Panel (multi-function: generate + inspiration) */}
            <RightPanel
                theme={resolvedTheme}
                isMinimized={isInspirationMinimized}
                onToggleMinimize={() => setIsInspirationMinimized(!isInspirationMinimized)}
                library={assetLibrary}
                generationHistory={generationHistory}
                attachments={chatAttachments}
                onRemove={(cat, id) => setAssetLibrary((prev) => removeAsset(prev, cat, id))}
                onRename={(cat, id, name) => setAssetLibrary((prev) => renameAsset(prev, cat, id, name))}
                onGenerate={(nextPrompt) => {
                    setPrompt(nextPrompt);
                    handleGenerate(nextPrompt, 'right');
                }}
                onAddAttachments={handleAddAttachmentFiles}
                onRemoveAttachment={handleRemoveChatAttachment}
                onWidthChange={setRightPanelWidth}
            />
            <CanvasSettings
                isOpen={isSettingsPanelOpen}
                onClose={() => setIsSettingsPanelOpen(false)}
                language={language}
                setLanguage={setLanguage}
                themeMode={themeMode}
                resolvedTheme={resolvedTheme}
                setThemeMode={setThemeMode}
                wheelAction={wheelAction}
                setWheelAction={setWheelAction}
                userApiKeys={userApiKeys}
                onAddApiKey={handleAddApiKey}
                onDeleteApiKey={handleDeleteApiKey}
                onSetDefaultApiKey={handleSetDefaultApiKey}
                modelPreference={modelPreference}
                setModelPreference={setModelPreference}
                t={t}
            />
            <CollaborationPanel
                isOpen={isCollabPanelOpen}
                onClose={() => setCollabPanelOpen(false)}
                isDark={resolvedTheme === 'dark'}
            />
            {/* Collaborate button - top right */}
            <button
                onClick={() => setCollabPanelOpen(true)}
                className={`fixed top-4 right-4 z-20 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium shadow-lg transition ${
                    collabStore.isConnected
                        ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                        : resolvedTheme === 'dark'
                          ? 'border-[#2A3140] bg-[#12151B] text-[#D0D5DD] hover:bg-[#1B2029]'
                          : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
                style={{
                    right: isInspirationMinimized ? '16px' : `${rightPanelWidth + 24}px`,
                    transition: 'right 0.35s',
                }}
            >
                {collabStore.isConnected && <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
                {collabStore.isConnected ? `${collabStore.remoteUsers.length + 1} online` : 'Collaborate'}
            </button>
            <Toolbar
                t={t}
                theme={resolvedTheme}
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                drawingOptions={drawingOptions}
                setDrawingOptions={setDrawingOptions}
                onUpload={handleAddImageElement}
                isCropping={!!croppingState}
                onConfirmCrop={handleConfirmCrop}
                onCancelCrop={handleCancelCrop}
                onSettingsClick={() => setIsSettingsPanelOpen(true)}
                onLayersClick={() => setIsLayerMinimized(!isLayerMinimized)}
                onBoardsClick={() => setIsLayerMinimized(!isLayerMinimized)}
                onAssetsClick={() => setIsInspirationMinimized(!isInspirationMinimized)}
                onUndo={handleUndo}
                onRedo={handleRedo}
                isLayerPanelExpanded={!isLayerMinimized}
                onHeightChange={() => {
                    /* reserved for aligning external buttons under toolbar */
                }}
                onLeftChange={(left) => setToolbarLeft(left)}
                canUndo={boardStore.canUndo()}
                canRedo={boardStore.canRedo()}
                onExport={(format) => {
                    const toExport =
                        selectedElementIds.length > 0
                            ? elements.filter((el) => selectedElementIds.includes(el.id))
                            : elements;
                    exportCanvas(toExport, format);
                }}
            />
            {addAssetModal?.open && (
                <AssetAddModal
                    isOpen={addAssetModal.open}
                    onClose={() => setAddAssetModal(null)}
                    previewDataUrl={addAssetModal.dataUrl}
                    onConfirm={(category, name) => {
                        const newItem: AssetItem = {
                            id: generateId(),
                            name,
                            category,
                            dataUrl: addAssetModal.dataUrl,
                            mimeType: addAssetModal.mimeType,
                            width: addAssetModal.width,
                            height: addAssetModal.height,
                            createdAt: Date.now(),
                        };
                        setAssetLibrary((prev) => addAsset(prev, newItem));
                        setAddAssetModal(null);
                    }}
                />
            )}
            <div
                className="flex-grow relative overflow-hidden"
                style={{
                    paddingRight: `${rightPanelWidth + 32}px`,
                    paddingBottom: croppingState ? '0px' : '96px',
                    transition:
                        'padding-right 0.35s cubic-bezier(0.4, 0, 0.2, 1), padding-bottom 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                <KonvaCanvas
                    elements={elements}
                    selectedElementIds={selectedElementIds}
                    panOffset={panOffset}
                    zoom={zoom}
                    activeTool={activeTool}
                    drawingOptions={drawingOptions}
                    croppingState={croppingState}
                    selectionBox={selectionBox}
                    alignmentGuides={alignmentGuides}
                    lassoPath={lassoPath}
                    editingElement={editingElement}
                    canvasBackgroundColor={canvasBackgroundColor}
                    interactionMode={interactionMode}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onWheel={handleWheel}
                    onContextMenu={handleContextMenu}
                    width={window.innerWidth}
                    height={window.innerHeight}
                />
                {collabStore.isConnected && (
                    <RemoteCursors users={collabStore.remoteUsers} panOffset={panOffset} zoom={zoom} />
                )}
                {contextMenu &&
                    (() => {
                        const hasDrawableSelection = elements.some(
                            (el) => selectedElementIds.includes(el.id) && el.type !== 'image' && el.type !== 'video',
                        );
                        const isGroupable = selectedElementIds.length > 1;
                        const isUngroupable =
                            selectedElementIds.length === 1 &&
                            elements.find((el) => el.id === selectedElementIds[0])?.type === 'group';

                        return (
                            <div
                                style={{ top: contextMenu.y, left: contextMenu.x }}
                                className="absolute z-30 bg-white rounded-md shadow-lg border border-gray-200 text-sm py-1 text-gray-800"
                                onContextMenu={(e) => e.stopPropagation()}
                            >
                                {isGroupable && (
                                    <button
                                        onClick={handleGroup}
                                        className="block w-full text-left px-4 py-1.5 hover:bg-gray-100"
                                    >
                                        {t('contextMenu.group')}
                                    </button>
                                )}
                                {isUngroupable && (
                                    <button
                                        onClick={handleUngroup}
                                        className="block w-full text-left px-4 py-1.5 hover:bg-gray-100"
                                    >
                                        {t('contextMenu.ungroup')}
                                    </button>
                                )}
                                {(isGroupable || isUngroupable) && (
                                    <div className="border-t border-gray-100 my-1"></div>
                                )}

                                {contextMenu.elementId && (
                                    <>
                                        <button
                                            onClick={() => handleLayerAction(contextMenu.elementId!, 'forward')}
                                            className="block w-full text-left px-4 py-1.5 hover:bg-gray-100"
                                        >
                                            {t('contextMenu.bringForward')}
                                        </button>
                                        <button
                                            onClick={() => handleLayerAction(contextMenu.elementId!, 'backward')}
                                            className="block w-full text-left px-4 py-1.5 hover:bg-gray-100"
                                        >
                                            {t('contextMenu.sendBackward')}
                                        </button>
                                        <div className="border-t border-gray-100 my-1"></div>
                                        <button
                                            onClick={() => handleLayerAction(contextMenu.elementId!, 'front')}
                                            className="block w-full text-left px-4 py-1.5 hover:bg-gray-100"
                                        >
                                            {t('contextMenu.bringToFront')}
                                        </button>
                                        <button
                                            onClick={() => handleLayerAction(contextMenu.elementId!, 'back')}
                                            className="block w-full text-left px-4 py-1.5 hover:bg-gray-100"
                                        >
                                            {t('contextMenu.sendToBack')}
                                        </button>
                                    </>
                                )}

                                {hasDrawableSelection && (
                                    <>
                                        <div className="border-t border-gray-100 my-1"></div>
                                        <button
                                            onClick={handleRasterizeSelection}
                                            className="block w-full text-left px-4 py-1.5 hover:bg-gray-100"
                                        >
                                            {t('contextMenu.rasterize')}
                                        </button>
                                    </>
                                )}
                            </div>
                        );
                    })()}
            </div>
            {!croppingState && (
                <div
                    className="absolute bottom-0 left-0 right-0 z-[40] transition-all duration-300 ease-out flex justify-center pointer-events-none"
                    style={{
                        paddingLeft: isLayerMinimized ? '16px' : '260px',
                        paddingRight: `${rightPanelWidth + 24}px`,
                        paddingBottom: '18px',
                    }}
                >
                    <div className="pointer-events-auto w-full max-w-3xl transition-transform hover:-translate-y-0.5 duration-300 drop-shadow-xl">
                        <PromptBar
                            t={t}
                            theme={resolvedTheme}
                            prompt={prompt}
                            setPrompt={setPrompt}
                            onGenerate={() => handleGenerate(undefined, 'prompt')}
                            isLoading={isLoading}
                            isSelectionActive={isSelectionActive}
                            selectedElementCount={selectedElementIds.length}
                            onAddUserEffect={handleAddUserEffect}
                            userEffects={userEffects}
                            onDeleteUserEffect={handleDeleteUserEffect}
                            generationMode={generationMode}
                            setGenerationMode={setGenerationMode}
                            videoAspectRatio={videoAspectRatio}
                            setVideoAspectRatio={setVideoAspectRatio}
                            selectedTextModel={modelPreference.textModel}
                            selectedImageModel={modelPreference.imageModel}
                            selectedVideoModel={modelPreference.videoModel}
                            textModelOptions={dynamicModelOptions.text}
                            imageModelOptions={dynamicModelOptions.image}
                            videoModelOptions={dynamicModelOptions.video}
                            onTextModelChange={(model) => setModelPreference((prev) => ({ ...prev, textModel: model }))}
                            onImageModelChange={(model) =>
                                setModelPreference((prev) => ({ ...prev, imageModel: model }))
                            }
                            onVideoModelChange={(model) =>
                                setModelPreference((prev) => ({ ...prev, videoModel: model }))
                            }
                            canvasElements={elements}
                            attachments={promptAttachments}
                            onAddAttachments={handleAddPromptAttachmentFiles}
                            onRemoveAttachment={handleRemovePromptAttachment}
                            onMentionedElementIds={setMentionedElementIds}
                            onEnhancePrompt={handleEnhancePrompt}
                            isEnhancingPrompt={isEnhancingPrompt}
                            isAutoEnhanceEnabled={isAutoEnhanceEnabled}
                            onAutoEnhanceToggle={() => setIsAutoEnhanceEnabled(!isAutoEnhanceEnabled)}
                            onLockCharacterFromSelection={handleLockCharacterFromSelection}
                            canLockCharacter={!!selectedSingleImage}
                            characterLocks={characterLocks}
                            activeCharacterLockId={activeCharacterLockId}
                            onSetActiveCharacterLock={handleSetActiveCharacterLock}
                            apiConfigs={apiConfigStore.configs}
                            activeApiConfigId={apiConfigStore.activeConfigId}
                            activeApiModelId={apiConfigStore.activeModelId}
                            onApiConfigChange={apiConfigStore.setActiveConfig}
                            onApiModelChange={apiConfigStore.setActiveModel}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
