/**
 * Collaboration Store — Real-time multiplayer canvas editing via Yjs
 *
 * Architecture:
 * - Yjs Doc holds shared state (elements array)
 * - Y.Array<Element> syncs canvas elements across clients (CRDT)
 * - Awareness protocol tracks cursors + selections per user
 * - WebSocket provider handles networking
 *
 * Usage:
 *   1. Start WebSocket server: npx y-websocket
 *   2. Call useCollaborationStore.getState().connect('ws://localhost:1234', 'room-name')
 *   3. Elements sync automatically via onRemoteChange callback
 */

import { create } from 'zustand';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { Element, Point } from '../types';

const COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

export interface CollaborationUser {
    clientId: number;
    name: string;
    color: string;
    cursor: Point | null;
    selectedElementIds: string[];
}

interface CollaborationState {
    // Connection
    isConnected: boolean;
    roomId: string | null;
    localClientId: number | null;
    localUserName: string;
    localColor: string;

    // Remote users
    remoteUsers: CollaborationUser[];

    // Yjs internals (not reactive — accessed via getState())
    doc: Y.Doc | null;
    provider: WebsocketProvider | null;
    yElements: Y.Array<any> | null;

    // Callbacks
    onRemoteChange: ((elements: Element[]) => void) | null;

    // Actions
    connect: (wsUrl: string, roomId: string, userName?: string) => void;
    disconnect: () => void;
    setOnRemoteChange: (callback: (elements: Element[]) => void) => void;

    // Push local state to shared doc
    pushElements: (elements: Element[]) => void;
    updateCursor: (position: Point | null) => void;
    updateSelection: (selectedIds: string[]) => void;
}

export const useCollaborationStore = create<CollaborationState>((set, get) => ({
    isConnected: false,
    roomId: null,
    localClientId: null,
    localUserName: `User ${Math.floor(Math.random() * 1000)}`,
    localColor: COLORS[Math.floor(Math.random() * COLORS.length)],
    remoteUsers: [],
    doc: null,
    provider: null,
    yElements: null,
    onRemoteChange: null,

    connect: (wsUrl, roomId, userName) => {
        const { provider: existingProvider } = get();
        if (existingProvider) {
            get().disconnect();
        }

        const doc = new Y.Doc();
        const yElements = doc.getArray<any>('elements');

        const provider = new WebsocketProvider(wsUrl, roomId, doc, {
            connect: true,
        });

        const localName = userName || get().localUserName;
        const localColor = get().localColor;

        // Set local awareness state
        provider.awareness.setLocalStateField('user', {
            name: localName,
            color: localColor,
            cursor: null,
            selectedElementIds: [],
        });

        // Listen for connection status
        provider.on('status', ({ status }: { status: string }) => {
            set({ isConnected: status === 'connected' });
        });

        // Listen for remote element changes
        yElements.observe(() => {
            const { onRemoteChange } = get();
            if (onRemoteChange) {
                const elements = yElements.toArray() as Element[];
                onRemoteChange(elements);
            }
        });

        // Listen for awareness changes (remote cursors/selections)
        provider.awareness.on('change', () => {
            const states = provider.awareness.getStates();
            const localId = doc.clientID;
            const users: CollaborationUser[] = [];

            states.forEach((state, clientId) => {
                if (clientId === localId) return;
                const user = state.user;
                if (!user) return;
                users.push({
                    clientId,
                    name: user.name || `User ${clientId}`,
                    color: user.color || COLORS[clientId % COLORS.length],
                    cursor: user.cursor || null,
                    selectedElementIds: user.selectedElementIds || [],
                });
            });

            set({ remoteUsers: users });
        });

        set({
            doc,
            provider,
            yElements,
            roomId,
            localClientId: doc.clientID,
            localUserName: localName,
            isConnected: false, // Will become true via status event
        });
    },

    disconnect: () => {
        const { provider, doc } = get();
        if (provider) {
            provider.disconnect();
            provider.destroy();
        }
        if (doc) {
            doc.destroy();
        }
        set({
            isConnected: false,
            roomId: null,
            localClientId: null,
            doc: null,
            provider: null,
            yElements: null,
            remoteUsers: [],
        });
    },

    setOnRemoteChange: (callback) => {
        set({ onRemoteChange: callback });
    },

    pushElements: (elements) => {
        const { doc, yElements } = get();
        if (!doc || !yElements) return;

        doc.transact(() => {
            yElements.delete(0, yElements.length);
            yElements.push(elements.map(el => ({ ...el })));
        });
    },

    updateCursor: (position) => {
        const { provider } = get();
        if (!provider) return;
        provider.awareness.setLocalStateField('user', {
            ...provider.awareness.getLocalState()?.user,
            cursor: position,
        });
    },

    updateSelection: (selectedIds) => {
        const { provider } = get();
        if (!provider) return;
        provider.awareness.setLocalStateField('user', {
            ...provider.awareness.getLocalState()?.user,
            selectedElementIds: selectedIds,
        });
    },
}));
