import { describe, it, expect } from 'vitest';
import { getElementBounds, isPointInPolygon, SNAP_THRESHOLD } from '../src/utils/geometry';
import type { ImageElement, ShapeElement, PathElement, ArrowElement } from '../src/types';

describe('getElementBounds', () => {
    it('should return bounds for image element', () => {
        const el: ImageElement = { id: '1', type: 'image', x: 10, y: 20, width: 100, height: 50, href: '', mimeType: 'image/png' };
        const bounds = getElementBounds(el);
        expect(bounds).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    });

    it('should return bounds for shape element', () => {
        const el: ShapeElement = { id: '2', type: 'shape', shapeType: 'rectangle', x: 5, y: 5, width: 200, height: 100, strokeColor: '#000', strokeWidth: 2, fillColor: '#fff' };
        const bounds = getElementBounds(el);
        expect(bounds).toEqual({ x: 5, y: 5, width: 200, height: 100 });
    });

    it('should return bounds for path element', () => {
        const el: PathElement = { id: '3', type: 'path', x: 0, y: 0, points: [{ x: 10, y: 10 }, { x: 50, y: 30 }, { x: 20, y: 60 }], strokeColor: '#000', strokeWidth: 2 };
        const bounds = getElementBounds(el);
        expect(bounds.x).toBe(10);
        expect(bounds.y).toBe(10);
        expect(bounds.width).toBe(40);
        expect(bounds.height).toBe(50);
    });

    it('should return bounds for arrow element', () => {
        const el: ArrowElement = { id: '4', type: 'arrow', x: 0, y: 0, points: [{ x: 0, y: 0 }, { x: 100, y: 50 }], strokeColor: '#000', strokeWidth: 2 };
        const bounds = getElementBounds(el);
        expect(bounds).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    });

    it('should return zero bounds for empty path', () => {
        const el: PathElement = { id: '5', type: 'path', x: 0, y: 0, points: [], strokeColor: '#000', strokeWidth: 2 };
        const bounds = getElementBounds(el);
        expect(bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });
});

describe('isPointInPolygon', () => {
    const square = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
    ];

    it('should return true for point inside polygon', () => {
        expect(isPointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    });

    it('should return false for point outside polygon', () => {
        expect(isPointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
    });

    it('should return false for point far outside', () => {
        expect(isPointInPolygon({ x: -50, y: -50 }, square)).toBe(false);
    });
});

describe('SNAP_THRESHOLD', () => {
    it('should be a positive number', () => {
        expect(SNAP_THRESHOLD).toBeGreaterThan(0);
    });
});
