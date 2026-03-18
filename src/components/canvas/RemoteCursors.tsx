/**
 * RemoteCursors — Renders remote users' cursors and selections on the canvas.
 * Displayed as an HTML overlay on top of the Konva canvas.
 */

import React from 'react';
import type { Point } from '../../types';
import type { CollaborationUser } from '../../stores/useCollaborationStore';

interface RemoteCursorsProps {
    users: CollaborationUser[];
    panOffset: Point;
    zoom: number;
}

export const RemoteCursors: React.FC<RemoteCursorsProps> = ({ users, panOffset, zoom }) => {
    return (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            {users.map((user) => {
                if (!user.cursor) return null;

                // Convert canvas coordinates to screen coordinates
                const screenX = user.cursor.x * zoom + panOffset.x;
                const screenY = user.cursor.y * zoom + panOffset.y;

                return (
                    <div
                        key={user.clientId}
                        className="absolute transition-transform duration-75"
                        style={{
                            transform: `translate(${screenX}px, ${screenY}px)`,
                        }}
                    >
                        {/* Cursor arrow */}
                        <svg
                            width="16"
                            height="20"
                            viewBox="0 0 16 20"
                            fill="none"
                            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
                        >
                            <path
                                d="M0 0L16 12L8 12L4 20L0 0Z"
                                fill={user.color}
                            />
                            <path
                                d="M0 0L16 12L8 12L4 20L0 0Z"
                                stroke="white"
                                strokeWidth="1"
                                strokeLinejoin="round"
                            />
                        </svg>
                        {/* User name label */}
                        <div
                            className="ml-4 -mt-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium text-white shadow-sm"
                            style={{ backgroundColor: user.color }}
                        >
                            {user.name}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
