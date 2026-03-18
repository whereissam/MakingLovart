import type { Element, Point } from '../types';

export const getElementBounds = (
    element: Element,
    allElements: Element[] = [],
): { x: number; y: number; width: number; height: number } => {
    if (element.type === 'group') {
        const children = allElements.filter((el) => el.parentId === element.id);
        if (children.length === 0) {
            return { x: element.x, y: element.y, width: element.width, height: element.height };
        }
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        children.forEach((child) => {
            const bounds = getElementBounds(child, allElements);
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        });
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    if (element.type === 'image' || element.type === 'shape' || element.type === 'text' || element.type === 'video') {
        return { x: element.x, y: element.y, width: element.width, height: element.height };
    }
    if (element.type === 'arrow' || element.type === 'line') {
        const { points } = element;
        const minX = Math.min(points[0].x, points[1].x);
        const maxX = Math.max(points[0].x, points[1].x);
        const minY = Math.min(points[0].y, points[1].y);
        const maxY = Math.max(points[0].y, points[1].y);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    const { points } = element;
    if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    let minX = points[0].x,
        maxX = points[0].x;
    let minY = points[0].y,
        maxY = points[0].y;
    for (const p of points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

export type Rect = { x: number; y: number; width: number; height: number };
export type Guide = { type: 'v' | 'h'; position: number; start: number; end: number };
export const SNAP_THRESHOLD = 5; // pixels in screen space

// Ray-casting algorithm to check if a point is inside a polygon
export const isPointInPolygon = (point: Point, polygon: Point[]): boolean => {
    let isInside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x,
            yi = polygon[i].y;
        const xj = polygon[j].x,
            yj = polygon[j].y;
        const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
        if (intersect) isInside = !isInside;
    }
    return isInside;
};
