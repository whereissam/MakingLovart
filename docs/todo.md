# MakingLovart — TODO

Architecture score: **7/10** (updated 2026-03-18 — improved from 3.5 → 5 → 7)

---

## P0 — Critical ✅ DONE

### [x] Extract canvas logic from App.tsx
App.tsx: **3375 → 468 lines (86% reduction)**. Target was <400, achieved ~468.

- [x] Move `getElementBounds`, `isPointInPolygon`, snapping logic → `utils/geometry.ts`
- [x] Move `rasterizeElement`, `rasterizeElements`, `rasterizeMask` → `utils/rasterize.ts`
- [x] Move mouse/touch handlers → `hooks/useCanvasInteractions.ts`
- [x] Move keyboard shortcuts → `hooks/useKeyboardShortcuts.ts`
- [x] Move element CRUD (delete, copy, property change, layer reorder) → `hooks/useElementActions.ts`
- [x] Move `handleGenerate` orchestration → `hooks/useGeneration.ts`
- [x] Move group/ungroup/align/rasterize selection → `hooks/useElementActions.ts`
- [x] Move image/crop/banana handlers → `hooks/useImageActions.ts`
- [x] Move SVG canvas rendering JSX → `components/canvas/CanvasView.tsx`
- [x] App.tsx is now a thin layout shell + hook wiring

### [x] Merge the dual API-key systems (partial)
Two systems still exist but are now both Zustand stores with clear separation:
- `useAIStore` → `UserApiKey[]` for provider-level key management
- `useAPIConfigStore` → `APIConfig[]` for endpoint configuration

Done:
- [x] Migrated `api-config-store` from React hooks to Zustand (globally shared)
- [x] Merged `store/` into `stores/`, `api-types/` into `types/`, `api-utils/` into `services/`
- [x] `CanvasSettings` uses Zustand store directly (no more prop drilling)
- [x] Deleted old `store/`, `api-types/`, `api-utils/` directories

Remaining (nice-to-have):
- [ ] Unify `AIProvider` and `ProviderType` into one type
- [ ] Merge the two key systems into one store

### [x] Fix `stores/` vs `store/` naming collision
- [x] All stores in `src/stores/`

---

## P1 — Important ✅ DONE

### [x] Create `useBoardStore` (Zustand)
- [x] Move `boards`, `activeBoardId` → `stores/useBoardStore.ts`
- [x] Move `createNewBoard`, `loadBoardsFromStorage`, board CRUD handlers
- [x] Move localStorage persistence for boards
- [x] Elements, history, panOffset, zoom derived from active board

### [x] Deduplicate shared utilities
- [x] Extract `generateId` → `utils/id.ts`
- [x] Extract `getElementIcon` → `components/shared/elementIcon.tsx`

### [x] Add `src/` directory structure
- [x] All source under `src/`

```
src/
  index.tsx
  App.tsx
  types/
    canvas.ts          # Element, Point, Tool, Board
    ai.ts              # AIProvider, UserApiKey, ModelPreference
    assets.ts          # AssetItem, AssetLibrary
    index.ts           # re-exports
  stores/
  hooks/
  services/
  utils/
  components/
    canvas/            # CanvasView, ContextMenu, ElementToolbar, Overlays
    sidebar/           # WorkspaceSidebar, LayerPanel, BoardPanel
    toolbar/           # Toolbar
    prompt/            # PromptBar, RichPromptEditor, QuickPrompts, MentionList
    panels/            # CanvasSettings, RightPanel, InspirationPanel, AssetLibrary
    config/            # ConfigForm, ConfigList, ConfigSelector
    workflow/          # NodeWorkflowPanel, nodeflow/*
    shared/            # ErrorBoundary, Loader, icons
```

### [x] Configure path aliases
- [x] `tsconfig.json`: `"paths": { "@/*": ["./src/*"] }`
- [x] `vite.config.ts`: `resolve.alias` points to `src/`
- [ ] Replace relative imports with `@/` aliases (optional cleanup)

---

## P2 — Cleanup ✅ DONE

### [x] Remove dead code
- [x] `utils/historyManager.ts` — removed
- [x] `utils/canvasEngine.ts` — removed
- [x] `utils/collaboration.ts` — removed
- [x] `inferCapabilitiesByProvider` re-aliasing — removed

### [x] Standardize language in code
- [x] All user-facing error/progress messages in services + hooks converted to English
- [x] Fixed garbled Chinese characters in `useImageActions.ts`
- [ ] Component UI labels still in Chinese (by design — supports bilingual via `translations.ts`)

### [x] Improve undo/redo history
- [x] Added `MAX_HISTORY_SIZE = 50` cap in `useBoardStore` to prevent memory bloat
- [x] Full command-pattern undo/redo implemented in `useBoardStore`
  - Commands stored as forward/reverse operations instead of full `Element[]` snapshots
  - Smart diffing: stores only changed elements when <50% modified, full snapshot otherwise
  - Per-board undo/redo stacks (in-memory, not serialized to localStorage)
  - `canUndo()` / `canRedo()` methods on store
  - Backward-compatible API — `commitAction` and `setElements` work the same

### Future ✅ ALL DONE
- [x] Migrate to canvas rendering engine — `KonvaCanvas.tsx`, GPU-accelerated via Konva
- [x] Full command-pattern undo/redo — diff-based commands in `useBoardStore`
- [x] Real-time collaboration (Yjs) — `useCollaborationStore`, `RemoteCursors`, `CollaborationPanel`

---

## P3 — Features ✅ DONE

### [x] Export capabilities
- [x] Added export button to Toolbar (download icon, exports PNG)
- [x] Supports exporting selected elements or full canvas
- [x] `utils/canvasExport.ts` provides `exportCanvas()`, `exportToSVG()`, `exportToPNG()`

### [x] Backend proxy for API keys
- [x] `server/index.ts` — Bun-native proxy server (`bun run server`)
- [x] `services/proxyClient.ts` — frontend proxy detection + routing
- [x] Set `VITE_API_PROXY_URL` env var to enable proxy mode
- [ ] Wire proxy into existing services (requires updating geminiService/aiGateway to use proxyFetch)

### [x] Improve test coverage
6 test files, **52 tests** passing:
- [x] `useUIStore.test.ts` — theme, language, panels, loading state
- [x] `useAIStore.test.ts` — API keys, model prefs, effects, prompt
- [x] `useBoardStore.test.ts` — boards, elements, history, undo/redo, zoom/pan
- [x] `canvasExport.test.ts` — SVG export for all element types
- [x] `geometry.test.ts` — bounds calculation, point-in-polygon
- [x] `proxyClient.test.ts` — proxy mode detection
- [ ] Component tests (PromptBar, Toolbar) — future
- [ ] E2E tests with Playwright — future

---

## Completed ✓

- [x] Install Zustand, create `useUIStore` + `useAIStore`
- [x] Wire stores into App.tsx (removed ~378 lines)
- [x] Install Tailwind CSS v4 properly (removed CDN)
- [x] Add ESLint + Prettier
- [x] Add `.env` to `.gitignore`
- [x] Add `ErrorBoundary` component
- [x] Add test framework (Vitest) + 30 passing tests
- [x] Create `utils/canvasExport.ts` (PNG/SVG export)
- [x] Create `server/index.ts` (backend API proxy)
- [x] Move all source code under `src/` directory
- [x] Merge `store/` into `stores/`, `api-types/` into `types/`, `api-utils/` into `services/`
- [x] Delete dead `src/App.tsx` and `src/components/LayerPanel.tsx` duplicates
- [x] Extract `getElementBounds`, `isPointInPolygon` → `utils/geometry.ts`
- [x] Extract `rasterizeElement`, `rasterizeElements`, `rasterizeMask` → `utils/rasterize.ts`
- [x] Deduplicate `generateId` → `utils/id.ts`
- [x] Remove `inferCapabilitiesByProvider` re-aliasing in App.tsx
- [x] Remove dead scaffold files (historyManager, canvasEngine, collaboration)
- [x] Configure `@/` path alias in `tsconfig.json` + `vite.config.ts`
- [x] Update `tsconfig.json` paths to point to `src/`
- [x] Create `useBoardStore` (Zustand) — boards, elements, history, undo/redo, pan/zoom
- [x] Move board CRUD handlers to `useBoardStore`
- [x] Remove `createNewBoard`, `loadBoardsFromStorage` from App.tsx
- [x] Migrate `api-config-store` from React hooks to Zustand
- [x] `CanvasSettings` uses Zustand store directly (removed prop drilling)
- [x] Extract keyboard shortcuts → `hooks/useKeyboardShortcuts.ts`
- [x] Extract element actions → `hooks/useElementActions.ts`
- [x] Extract `handleGenerate` → `hooks/useGeneration.ts`
- [x] Extract mouse/touch handlers → `hooks/useCanvasInteractions.ts`
- [x] Extract image/crop/banana handlers → `hooks/useImageActions.ts`
- [x] Extract full JSX rendering → `components/canvas/CanvasView.tsx`
- [x] **App.tsx reduced from 3375 → 468 lines (86% reduction)**
- [x] Deduplicate `getElementIcon` → `components/shared/elementIcon.tsx`
