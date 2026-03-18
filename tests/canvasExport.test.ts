import { describe, it, expect } from 'vitest';
import { exportToSVG } from '../src/utils/canvasExport';
import type { Element, ImageElement, ShapeElement, TextElement } from '../src/types';

const makeImage = (id: string, x = 0, y = 0): ImageElement => ({
    id,
    type: 'image',
    x,
    y,
    width: 100,
    height: 100,
    href: 'data:image/png;base64,abc',
    mimeType: 'image/png',
});

const makeRect = (id: string, x = 0, y = 0): ShapeElement => ({
    id,
    type: 'shape',
    shapeType: 'rectangle',
    x,
    y,
    width: 50,
    height: 50,
    strokeColor: '#000',
    strokeWidth: 2,
    fillColor: '#ff0000',
});

const makeText = (id: string, x = 0, y = 0): TextElement => ({
    id,
    type: 'text',
    x,
    y,
    width: 200,
    height: 30,
    text: 'Hello World',
    fontSize: 16,
    fontColor: '#333',
});

describe('exportToSVG', () => {
    it('should return empty SVG for no elements', () => {
        const svg = exportToSVG([]);
        expect(svg).toContain('<svg');
        expect(svg).toContain('</svg>');
    });

    it('should include image elements', () => {
        const svg = exportToSVG([makeImage('img1', 10, 20)]);
        expect(svg).toContain('<image');
        expect(svg).toContain('data:image/png;base64,abc');
    });

    it('should include shape elements', () => {
        const svg = exportToSVG([makeRect('r1', 0, 0)]);
        expect(svg).toContain('<rect');
        expect(svg).toContain('fill="#ff0000"');
    });

    it('should include text elements', () => {
        const svg = exportToSVG([makeText('t1')]);
        expect(svg).toContain('Hello World');
        expect(svg).toContain('foreignObject');
    });

    it('should respect background option', () => {
        const svg = exportToSVG([makeRect('r1')], { background: '#000000' });
        expect(svg).toContain('fill="#000000"');
    });

    it('should filter hidden elements', () => {
        const hidden: Element = { ...makeRect('r1'), isVisible: false };
        const svg = exportToSVG([hidden]);
        // Background rect exists, but no shape rect with fill="#ff0000"
        expect(svg).not.toContain('fill="#ff0000"');
    });

    it('should handle multiple elements', () => {
        const elements: Element[] = [makeImage('i1'), makeRect('r1', 50, 50), makeText('t1', 100, 100)];
        const svg = exportToSVG(elements);
        expect(svg).toContain('<image');
        expect(svg).toContain('<rect');
        expect(svg).toContain('foreignObject');
    });
});
