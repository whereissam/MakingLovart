/**
 * CollaborationPanel — Connect to a room, see online users, manage collaboration.
 */

import React, { useState } from 'react';
import { useCollaborationStore } from '../stores/useCollaborationStore';

interface CollaborationPanelProps {
    isOpen: boolean;
    onClose: () => void;
    isDark: boolean;
}

export const CollaborationPanel: React.FC<CollaborationPanelProps> = ({ isOpen, onClose, isDark }) => {
    const {
        isConnected,
        roomId,
        localUserName,
        localColor,
        remoteUsers,
        connect,
        disconnect,
    } = useCollaborationStore();

    const [wsUrl, setWsUrl] = useState('ws://localhost:1234');
    const [room, setRoom] = useState('lovart-room');
    const [userName, setUserName] = useState(localUserName);

    if (!isOpen) return null;

    const handleConnect = () => {
        connect(wsUrl, room, userName);
    };

    const allUsers = [
        { clientId: 0, name: localUserName, color: localColor, cursor: null, selectedElementIds: [], isLocal: true },
        ...remoteUsers.map(u => ({ ...u, isLocal: false })),
    ];

    const inputClass = `w-full rounded-xl border px-3 py-2 text-sm outline-none transition ${
        isDark
            ? 'border-[#2A3140] bg-[#161A22] text-[#F3F4F6] placeholder:text-[#667085]'
            : 'border-[#E4E7EC] bg-white text-[#344054] placeholder:text-[#98A2B3]'
    }`;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className={`relative w-[380px] rounded-[24px] border p-5 shadow-2xl ${
                    isDark ? 'border-[#2A3140] bg-[#12151B]' : 'border-[#E4E7EC] bg-white'
                }`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h3 className={`text-lg font-semibold ${isDark ? 'text-[#F3F4F6]' : 'text-[#101828]'}`}>
                        Collaborate
                    </h3>
                    <button
                        onClick={onClose}
                        className={`flex h-8 w-8 items-center justify-center rounded-xl border transition ${
                            isDark ? 'border-[#2A3140] text-[#98A2B3] hover:bg-[#1B2029]' : 'border-[#E4E7EC] text-[#667085] hover:bg-[#F9FAFB]'
                        }`}
                    >
                        x
                    </button>
                </div>

                {!isConnected ? (
                    <div className="space-y-3">
                        <input
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            placeholder="Your name"
                            className={inputClass}
                        />
                        <input
                            value={wsUrl}
                            onChange={(e) => setWsUrl(e.target.value)}
                            placeholder="WebSocket URL"
                            className={inputClass}
                        />
                        <input
                            value={room}
                            onChange={(e) => setRoom(e.target.value)}
                            placeholder="Room name"
                            className={inputClass}
                        />
                        <button
                            onClick={handleConnect}
                            disabled={!wsUrl.trim() || !room.trim()}
                            className={`w-full rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                                isDark
                                    ? 'bg-[#F3F4F6] text-[#111827] hover:bg-white disabled:bg-[#3A4458] disabled:text-[#98A2B3]'
                                    : 'bg-[#111827] text-white hover:bg-[#0F172A] disabled:bg-[#D0D5DD]'
                            }`}
                        >
                            Connect
                        </button>
                        <p className={`text-xs ${isDark ? 'text-[#667085]' : 'text-[#98A2B3]'}`}>
                            Start a WebSocket server first: <code className="rounded bg-black/10 px-1">npx y-websocket</code>
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Connection status */}
                        <div className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                            isDark ? 'border-[#123524] bg-[#0D2818]' : 'border-[#BBF7D0] bg-[#F0FDF4]'
                        }`}>
                            <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                <span className={`text-sm font-medium ${isDark ? 'text-[#75E0A7]' : 'text-[#166534]'}`}>
                                    Connected to <strong>{roomId}</strong>
                                </span>
                            </div>
                            <button
                                onClick={disconnect}
                                className={`rounded-lg px-2 py-1 text-xs font-medium transition ${
                                    isDark ? 'text-[#FDA29B] hover:bg-[#3A1616]' : 'text-[#DC2626] hover:bg-[#FEF2F2]'
                                }`}
                            >
                                Disconnect
                            </button>
                        </div>

                        {/* Online users */}
                        <div>
                            <h4 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-[#667085]' : 'text-[#98A2B3]'}`}>
                                Online ({allUsers.length})
                            </h4>
                            <div className="space-y-1.5">
                                {allUsers.map((user) => (
                                    <div
                                        key={user.clientId}
                                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${
                                            isDark ? 'bg-[#161A22]' : 'bg-[#F8FAFC]'
                                        }`}
                                    >
                                        <div
                                            className="h-3 w-3 rounded-full"
                                            style={{ backgroundColor: user.color }}
                                        />
                                        <span className={`text-sm ${isDark ? 'text-[#F3F4F6]' : 'text-[#344054]'}`}>
                                            {user.name}
                                        </span>
                                        {user.isLocal && (
                                            <span className={`ml-auto text-[10px] ${isDark ? 'text-[#667085]' : 'text-[#98A2B3]'}`}>
                                                (you)
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
