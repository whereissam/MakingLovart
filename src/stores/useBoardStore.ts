import { create } from 'zustand';
import type { Board, Element, Point } from '../types';
import { generateId } from '../utils/id';

const BOARDS_STORAGE_KEY = 'boards.v1';
const ACTIVE_BOARD_STORAGE_KEY = 'boards.activeId.v1';
const MAX_HISTORY_SIZE = 50;

// ── Command-pattern history ────────────────────────────────────

interface HistoryCommand {
    /** Apply the command (redo) — returns new elements */
    execute: (elements: Element[]) => Element[];
    /** Reverse the command (undo) — returns previous elements */
    undo: (elements: Element[]) => Element[];
}

/**
 * Create a command from a snapshot diff.
 * Stores only the before/after state, not the full element arrays.
 * For small changes this is more memory-efficient than full snapshots
 * since we only diff what changed.
 */
function createSnapshotCommand(before: Element[], after: Element[]): HistoryCommand {
    // Optimization: if few elements changed, store only the diff
    const changedIds = new Set<string>();
    const removedIds = new Set<string>();
    const addedElements: Element[] = [];

    const beforeMap = new Map(before.map(el => [el.id, el]));
    const afterMap = new Map(after.map(el => [el.id, el]));

    // Find added/modified elements
    for (const [id, el] of afterMap) {
        const prev = beforeMap.get(id);
        if (!prev) {
            addedElements.push(el);
            changedIds.add(id);
        } else if (prev !== el) {
            changedIds.add(id);
        }
    }

    // Find removed elements
    for (const id of beforeMap.keys()) {
        if (!afterMap.has(id)) {
            removedIds.add(id);
            changedIds.add(id);
        }
    }

    // If more than half the elements changed, store full snapshots (cheaper)
    if (changedIds.size > before.length * 0.5 || changedIds.size > 50) {
        return {
            execute: () => after,
            undo: () => before,
        };
    }

    // Store only the diff
    const beforeDiff = before.filter(el => changedIds.has(el.id) || removedIds.has(el.id));
    const afterDiff = after.filter(el => changedIds.has(el.id));
    const beforeOrder = before.map(el => el.id);
    const afterOrder = after.map(el => el.id);

    return {
        execute: (current) => {
            // Apply forward: remove old versions, add new versions, restore order
            const currentMap = new Map(current.map(el => [el.id, el]));
            // Remove elements that were removed in this command
            for (const id of removedIds) {
                currentMap.delete(id);
            }
            // Update/add elements that changed
            for (const el of afterDiff) {
                currentMap.set(el.id, el);
            }
            // Restore order
            return afterOrder
                .map(id => currentMap.get(id))
                .filter((el): el is Element => !!el);
        },
        undo: (current) => {
            const currentMap = new Map(current.map(el => [el.id, el]));
            // Remove added elements
            for (const el of addedElements) {
                currentMap.delete(el.id);
            }
            // Restore previous versions
            for (const el of beforeDiff) {
                currentMap.set(el.id, el);
            }
            // Restore order
            return beforeOrder
                .map(id => currentMap.get(id))
                .filter((el): el is Element => !!el);
        },
    };
}

// Per-board command history (not stored in Board — kept in memory only)
const boardHistories = new Map<string, {
    undoStack: HistoryCommand[];
    redoStack: HistoryCommand[];
    baseElements: Element[]; // The initial state before any commands
}>();

function getBoardHistory(boardId: string, initialElements: Element[]) {
    if (!boardHistories.has(boardId)) {
        boardHistories.set(boardId, {
            undoStack: [],
            redoStack: [],
            baseElements: initialElements,
        });
    }
    return boardHistories.get(boardId)!;
}

// ── Board creation / loading ──────────────────────────────────

const createNewBoard = (name: string): Board => ({
    id: generateId(),
    name,
    elements: [],
    history: [[]], // Legacy field — kept for backward compat with localStorage
    historyIndex: 0,
    panOffset: { x: 0, y: 0 },
    zoom: 1,
    canvasBackgroundColor: '#FFFFFF',
});

const loadBoardsFromStorage = (): Board[] => {
    try {
        const raw = localStorage.getItem(BOARDS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (!Array.isArray(parsed) || parsed.length === 0) {
            return [createNewBoard('Board 1')];
        }
        const boards = parsed.filter(
            (board: any): board is Board =>
                !!board &&
                typeof board.id === 'string' &&
                typeof board.name === 'string' &&
                Array.isArray(board.elements),
        );
        return boards.length > 0 ? boards : [createNewBoard('Board 1')];
    } catch {
        return [createNewBoard('Board 1')];
    }
};

const loadActiveBoardId = (): string => {
    try {
        return localStorage.getItem(ACTIVE_BOARD_STORAGE_KEY) || '';
    } catch {
        return '';
    }
};

// ── Store interface ───────────────────────────────────────────

interface BoardState {
    boards: Board[];
    activeBoardId: string;

    getActiveBoard: () => Board;
    canUndo: () => boolean;
    canRedo: () => boolean;

    // Board CRUD
    addBoard: (name: string) => string;
    duplicateBoard: (boardId: string) => void;
    renameBoard: (boardId: string, name: string) => void;
    deleteBoard: (boardId: string) => void;
    switchBoard: (boardId: string) => void;

    // Active board mutations
    updateActiveBoard: (updater: (board: Board) => Board) => void;
    setElements: (updater: (prev: Element[]) => Element[], commit?: boolean) => void;
    commitAction: (updater: (prev: Element[]) => Element[]) => void;
    undo: () => void;
    redo: () => void;

    // Pan & zoom
    setPanOffset: (offset: Point) => void;
    setZoom: (zoom: number) => void;
}

export const useBoardStore = create<BoardState>((set, get) => {
    const initialBoards = loadBoardsFromStorage();
    const initialActiveId = loadActiveBoardId();

    const persist = () => {
        const { boards, activeBoardId } = get();
        // Don't persist full history to localStorage — only current elements
        const boardsForStorage = boards.map(b => ({
            ...b,
            history: [b.elements], // Only store current state, not full history
            historyIndex: 0,
        }));
        localStorage.setItem(BOARDS_STORAGE_KEY, JSON.stringify(boardsForStorage));
        if (activeBoardId) {
            localStorage.setItem(ACTIVE_BOARD_STORAGE_KEY, activeBoardId);
        }
    };

    return {
        boards: initialBoards,
        activeBoardId: initialActiveId || initialBoards[0]?.id || '',

        getActiveBoard: () => {
            const { boards, activeBoardId } = get();
            return boards.find((b) => b.id === activeBoardId) ?? boards[0];
        },

        canUndo: () => {
            const board = get().getActiveBoard();
            const history = getBoardHistory(board.id, board.elements);
            return history.undoStack.length > 0;
        },

        canRedo: () => {
            const board = get().getActiveBoard();
            const history = getBoardHistory(board.id, board.elements);
            return history.redoStack.length > 0;
        },

        addBoard: (name) => {
            const newBoard = createNewBoard(name);
            set((state) => ({
                boards: [...state.boards, newBoard],
                activeBoardId: newBoard.id,
            }));
            persist();
            return newBoard.id;
        },

        duplicateBoard: (boardId) => {
            const { boards } = get();
            const source = boards.find((b) => b.id === boardId);
            if (!source) return;
            const newBoard: Board = {
                ...source,
                id: generateId(),
                name: `${source.name} (copy)`,
                history: [source.elements],
                historyIndex: 0,
            };
            set((state) => ({
                boards: [...state.boards, newBoard],
                activeBoardId: newBoard.id,
            }));
            persist();
        },

        renameBoard: (boardId, name) => {
            set((state) => ({
                boards: state.boards.map((b) => (b.id === boardId ? { ...b, name } : b)),
            }));
            persist();
        },

        deleteBoard: (boardId) => {
            boardHistories.delete(boardId); // Clean up history
            set((state) => {
                const remaining = state.boards.filter((b) => b.id !== boardId);
                if (remaining.length === 0) {
                    const newBoard = createNewBoard('Board 1');
                    return { boards: [newBoard], activeBoardId: newBoard.id };
                }
                const newActiveId = state.activeBoardId === boardId ? remaining[0].id : state.activeBoardId;
                return { boards: remaining, activeBoardId: newActiveId };
            });
            persist();
        },

        switchBoard: (boardId) => {
            set({ activeBoardId: boardId });
            localStorage.setItem(ACTIVE_BOARD_STORAGE_KEY, boardId);
        },

        updateActiveBoard: (updater) => {
            set((state) => ({
                boards: state.boards.map((board) => (board.id === state.activeBoardId ? updater(board) : board)),
            }));
            persist();
        },

        setElements: (updater, commit = true) => {
            const board = get().getActiveBoard();
            const prevElements = board.elements;
            const newElements = updater(prevElements);

            if (commit) {
                // Create a command and push to undo stack
                const history = getBoardHistory(board.id, prevElements);
                const command = createSnapshotCommand(prevElements, newElements);
                history.undoStack.push(command);
                history.redoStack = []; // Clear redo on new action
                // Cap history size
                if (history.undoStack.length > MAX_HISTORY_SIZE) {
                    history.undoStack.shift();
                }
            }

            get().updateActiveBoard((b) => ({
                ...b,
                elements: newElements,
                historyIndex: commit ? (b.historyIndex + 1) : b.historyIndex,
            }));
        },

        commitAction: (updater) => {
            get().setElements(updater, true);
        },

        undo: () => {
            const board = get().getActiveBoard();
            const history = getBoardHistory(board.id, board.elements);

            if (history.undoStack.length === 0) return;

            const command = history.undoStack.pop()!;
            history.redoStack.push(command);

            const newElements = command.undo(board.elements);
            get().updateActiveBoard((b) => ({
                ...b,
                elements: newElements,
                historyIndex: Math.max(0, b.historyIndex - 1),
            }));
        },

        redo: () => {
            const board = get().getActiveBoard();
            const history = getBoardHistory(board.id, board.elements);

            if (history.redoStack.length === 0) return;

            const command = history.redoStack.pop()!;
            history.undoStack.push(command);

            const newElements = command.execute(board.elements);
            get().updateActiveBoard((b) => ({
                ...b,
                elements: newElements,
                historyIndex: b.historyIndex + 1,
            }));
        },

        setPanOffset: (offset) => {
            get().updateActiveBoard((board) => ({ ...board, panOffset: offset }));
        },

        setZoom: (zoom) => {
            get().updateActiveBoard((board) => ({ ...board, zoom }));
        },
    };
});
