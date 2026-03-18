import { describe, it, expect, beforeEach } from 'vitest';
import { useBoardStore } from '../src/stores/useBoardStore';

describe('useBoardStore', () => {
    beforeEach(() => {
        localStorage.clear();
        // Reset to initial state
        const initial = useBoardStore.getState();
        useBoardStore.setState({
            boards: [{ id: 'b1', name: 'Board 1', elements: [], history: [[]], historyIndex: 0, panOffset: { x: 0, y: 0 }, zoom: 1, canvasBackgroundColor: '#FFFFFF' }],
            activeBoardId: 'b1',
        });
    });

    it('should have initial board', () => {
        const { boards } = useBoardStore.getState();
        expect(boards.length).toBeGreaterThanOrEqual(1);
    });

    it('should add a board', () => {
        const id = useBoardStore.getState().addBoard('Test Board');
        expect(id).toBeTruthy();
        const { boards, activeBoardId } = useBoardStore.getState();
        expect(boards.some(b => b.name === 'Test Board')).toBe(true);
        expect(activeBoardId).toBe(id);
    });

    it('should rename a board', () => {
        useBoardStore.getState().renameBoard('b1', 'Renamed');
        const board = useBoardStore.getState().boards.find(b => b.id === 'b1');
        expect(board?.name).toBe('Renamed');
    });

    it('should delete a board and create new one if last', () => {
        useBoardStore.getState().deleteBoard('b1');
        const { boards } = useBoardStore.getState();
        expect(boards.length).toBe(1); // Creates new default board
        expect(boards[0].name).toBe('Board 1');
    });

    it('should switch boards', () => {
        useBoardStore.getState().addBoard('Board 2');
        const { boards } = useBoardStore.getState();
        const b2 = boards.find(b => b.name === 'Board 2');

        useBoardStore.getState().switchBoard(b2!.id);
        expect(useBoardStore.getState().activeBoardId).toBe(b2!.id);
    });

    it('should commit actions to history', () => {
        useBoardStore.getState().commitAction((prev) => [
            ...prev,
            { id: 'el1', type: 'text', x: 0, y: 0, width: 100, height: 30, text: 'Hello', fontSize: 16, fontColor: '#000' } as any,
        ]);

        const board = useBoardStore.getState().getActiveBoard();
        expect(board.elements).toHaveLength(1);
        expect(board.historyIndex).toBe(1);
    });

    it('should undo and redo', () => {
        useBoardStore.getState().commitAction((prev) => [
            ...prev,
            { id: 'el1', type: 'text', x: 0, y: 0, width: 100, height: 30, text: 'Hello', fontSize: 16, fontColor: '#000' } as any,
        ]);

        expect(useBoardStore.getState().getActiveBoard().elements).toHaveLength(1);

        useBoardStore.getState().undo();
        expect(useBoardStore.getState().getActiveBoard().elements).toHaveLength(0);

        useBoardStore.getState().redo();
        expect(useBoardStore.getState().getActiveBoard().elements).toHaveLength(1);
    });

    it('should cap history at MAX_HISTORY_SIZE', () => {
        for (let i = 0; i < 60; i++) {
            useBoardStore.getState().commitAction((prev) => [
                ...prev,
                { id: `el${i}`, type: 'text', x: i, y: 0, width: 100, height: 30, text: `Item ${i}`, fontSize: 16, fontColor: '#000' } as any,
            ]);
        }

        const board = useBoardStore.getState().getActiveBoard();
        expect(board.history.length).toBeLessThanOrEqual(50);
    });

    it('should duplicate a board', () => {
        useBoardStore.getState().duplicateBoard('b1');
        const { boards } = useBoardStore.getState();
        expect(boards).toHaveLength(2);
        expect(boards[1].name).toContain('copy');
    });

    it('should set pan offset', () => {
        useBoardStore.getState().setPanOffset({ x: 100, y: 200 });
        const board = useBoardStore.getState().getActiveBoard();
        expect(board.panOffset).toEqual({ x: 100, y: 200 });
    });

    it('should set zoom', () => {
        useBoardStore.getState().setZoom(2.5);
        const board = useBoardStore.getState().getActiveBoard();
        expect(board.zoom).toBe(2.5);
    });
});
