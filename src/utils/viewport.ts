/**
 * Viewport culling — only render elements visible in the current viewport.
 *
 * This gives significant performance improvement at 100+ elements
 * without changing the rendering engine (SVG stays as-is).
 *
 * Usage in CanvasView:
 *   const visibleElements = getVisibleElements(elements, panOffset, zoom, windowWidth, windowHeight);
 *   // Render only visibleElements instead of all elements
 */

import type { Element, Point } from '../types';
import { getElementBounds } from './geometry';

interface ViewportRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Calculate the visible canvas area based on pan offset and zoom level.
 */
export function getViewportBounds(
    panOffset: Point,
    zoom: number,
    screenWidth: number,
    screenHeight: number,
): ViewportRect {
    return {
        x: -panOffset.x / zoom,
        y: -panOffset.y / zoom,
        width: screenWidth / zoom,
        height: screenHeight / zoom,
    };
}

/**
 * Check if an element's bounding box intersects with the viewport.
 * Adds a margin so elements near the edge aren't popped in/out abruptly.
 */
function isElementVisible(
    element: Element,
    viewport: ViewportRect,
    allElements: Element[],
    margin = 200,
): boolean {
    const bounds = getElementBounds(element, allElements);
    const expandedViewport = {
        x: viewport.x - margin,
        y: viewport.y - margin,
        width: viewport.width + margin * 2,
        height: viewport.height + margin * 2,
    };

    return !(
        bounds.x + bounds.width < expandedViewport.x ||
        bounds.x > expandedViewport.x + expandedViewport.width ||
        bounds.y + bounds.height < expandedViewport.y ||
        bounds.y > expandedViewport.y + expandedViewport.height
    );
}

/**
 * Filter elements to only those visible in the current viewport.
 * Returns all elements if there are fewer than the threshold (no point culling small sets).
 */
export function getVisibleElements(
    elements: Element[],
    panOffset: Point,
    zoom: number,
    screenWidth: number,
    screenHeight: number,
    cullingThreshold = 30,
): Element[] {
    // Don't bother culling small element sets
    if (elements.length < cullingThreshold) return elements;

    const viewport = getViewportBounds(panOffset, zoom, screenWidth, screenHeight);

    return elements.filter((el) => {
        // Always render selected/locked/group elements to avoid visual glitches
        if (el.type === 'group') return true;
        return isElementVisible(el, viewport, elements);
    });
}
