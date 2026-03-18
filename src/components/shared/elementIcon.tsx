import React from 'react';
import type { Element } from '../../types';

const commonProps = {
    width: '16',
    height: '16',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
};

export const getElementIcon = (element: Element): React.ReactNode => {
    switch (element.type) {
        case 'image':
            return <svg {...commonProps}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>;
        case 'video':
            return <svg {...commonProps}><path d="m22 8-6 4 6 4V8Z" /><rect x="2" y="6" width="14" height="12" rx="2" ry="2" /></svg>;
        case 'text':
            return <svg {...commonProps}><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>;
        case 'shape':
            switch (element.shapeType) {
                case 'rectangle': return <svg {...commonProps}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg>;
                case 'circle': return <svg {...commonProps}><circle cx="12" cy="12" r="10" /></svg>;
                case 'triangle': return <svg {...commonProps}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>;
            }
            break;
        case 'group':
            return <svg {...commonProps}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>;
        case 'path':
            return <svg {...commonProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>;
        case 'arrow':
            return <svg {...commonProps}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>;
        case 'line':
            return <svg {...commonProps}><line x1="5" y1="19" x2="19" y2="5" /></svg>;
        default:
            return <svg {...commonProps}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>;
    }
    return <svg {...commonProps}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>;
};
