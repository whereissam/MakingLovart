/**
 * Canvas Export Utilities — PNG, SVG, and PDF export
 */

import type { Element, Point } from '../types';

interface ExportOptions {
    format: 'png' | 'svg' | 'pdf';
    scale?: number; // default 2 for retina
    background?: string;
    padding?: number;
}

function getElementsBounds(elements: Element[]): { x: number; y: number; width: number; height: number } {
    if (elements.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const el of elements) {
        if (el.type === 'path') {
            for (const p of el.points) {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            }
        } else if (el.type === 'arrow' || el.type === 'line') {
            for (const p of el.points) {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            }
        } else {
            minX = Math.min(minX, el.x);
            minY = Math.min(minY, el.y);
            maxX = Math.max(maxX, el.x + el.width);
            maxY = Math.max(maxY, el.y + el.height);
        }
    }

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function elementToSVG(el: Element, offsetX: number, offsetY: number): string {
    switch (el.type) {
        case 'image':
            return `<image href="${el.href}" x="${el.x + offsetX}" y="${el.y + offsetY}" width="${el.width}" height="${el.height}" />`;
        case 'video':
            // Videos can't be exported to SVG; show placeholder
            return `<rect x="${el.x + offsetX}" y="${el.y + offsetY}" width="${el.width}" height="${el.height}" fill="#1a1a2e" rx="8" />
                    <text x="${el.x + offsetX + el.width / 2}" y="${el.y + offsetY + el.height / 2}" text-anchor="middle" fill="#999" font-size="14">Video</text>`;
        case 'path': {
            const d = el.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x + offsetX} ${p.y + offsetY}`).join(' ');
            return `<path d="${d}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${el.strokeOpacity ?? 1}" />`;
        }
        case 'shape': {
            const tx = el.x + offsetX;
            const ty = el.y + offsetY;
            if (el.shapeType === 'rectangle') {
                return `<rect x="${tx}" y="${ty}" width="${el.width}" height="${el.height}" rx="${el.borderRadius ?? 0}" fill="${el.fillColor}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" />`;
            }
            if (el.shapeType === 'circle') {
                return `<ellipse cx="${tx + el.width / 2}" cy="${ty + el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}" fill="${el.fillColor}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" />`;
            }
            if (el.shapeType === 'triangle') {
                return `<polygon points="${tx + el.width / 2},${ty} ${tx},${ty + el.height} ${tx + el.width},${ty + el.height}" fill="${el.fillColor}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" />`;
            }
            return '';
        }
        case 'text':
            return `<foreignObject x="${el.x + offsetX}" y="${el.y + offsetY}" width="${el.width}" height="${el.height}">
                <div xmlns="http://www.w3.org/1999/xhtml" style="font-size:${el.fontSize}px;color:${el.fontColor};word-break:break-word;font-family:sans-serif;line-height:1.2">${el.text.replace(/\n/g, '<br/>')}</div>
            </foreignObject>`;
        case 'arrow': {
            const [start, end] = el.points;
            const angle = Math.atan2(end.y - start.y, end.x - start.x);
            const headLen = el.strokeWidth * 4;
            const h1 = { x: end.x - headLen * Math.cos(angle - Math.PI / 6), y: end.y - headLen * Math.sin(angle - Math.PI / 6) };
            const h2 = { x: end.x - headLen * Math.cos(angle + Math.PI / 6), y: end.y - headLen * Math.sin(angle + Math.PI / 6) };
            return `<line x1="${start.x + offsetX}" y1="${start.y + offsetY}" x2="${end.x + offsetX}" y2="${end.y + offsetY}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" />
                    <polygon points="${end.x + offsetX},${end.y + offsetY} ${h1.x + offsetX},${h1.y + offsetY} ${h2.x + offsetX},${h2.y + offsetY}" fill="${el.strokeColor}" />`;
        }
        case 'line': {
            const [s, e] = el.points;
            return `<line x1="${s.x + offsetX}" y1="${s.y + offsetY}" x2="${e.x + offsetX}" y2="${e.y + offsetY}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-linecap="round" />`;
        }
        case 'group':
            return ''; // groups are virtual containers
        default:
            return '';
    }
}

export function exportToSVG(elements: Element[], options: Partial<ExportOptions> = {}): string {
    const padding = options.padding ?? 20;
    const background = options.background ?? '#ffffff';
    const bounds = getElementsBounds(elements);

    const width = bounds.width + padding * 2;
    const height = bounds.height + padding * 2;
    const offsetX = -bounds.x + padding;
    const offsetY = -bounds.y + padding;

    const svgElements = elements
        .filter(el => el.isVisible !== false)
        .map(el => elementToSVG(el, offsetX, offsetY))
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${background}" />
  ${svgElements}
</svg>`;
}

export async function exportToPNG(elements: Element[], options: Partial<ExportOptions> = {}): Promise<Blob> {
    const scale = options.scale ?? 2;
    const svgString = exportToSVG(elements, options);
    const bounds = getElementsBounds(elements);
    const padding = options.padding ?? 20;
    const width = bounds.width + padding * 2;
    const height = bounds.height + padding * 2;

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Could not get canvas context'));

            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0);

            canvas.toBlob(
                blob => blob ? resolve(blob) : reject(new Error('Failed to create blob')),
                'image/png',
            );
        };
        img.onerror = () => reject(new Error('Failed to render SVG to image'));
        img.src = dataUrl;
    });
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadText(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    downloadBlob(blob, filename);
}

export async function exportCanvas(
    elements: Element[],
    format: 'png' | 'svg' = 'png',
    filename?: string,
): Promise<void> {
    const visibleElements = elements.filter(el => el.isVisible !== false);
    if (visibleElements.length === 0) return;

    const timestamp = new Date().toISOString().slice(0, 10);
    const name = filename ?? `canvas-${timestamp}`;

    if (format === 'svg') {
        const svg = exportToSVG(visibleElements);
        downloadText(svg, `${name}.svg`, 'image/svg+xml');
    } else {
        const blob = await exportToPNG(visibleElements);
        downloadBlob(blob, `${name}.png`);
    }
}
