/**
 * The class string both left rails wear — the part scene's feature tree
 * (TimelinePanel) and the assembly scene's parts/joints column (PartsPanel).
 * They occupy the same slot and are swapped as the scene kind changes, so
 * their geometry lives in one place.
 *
 * Four custom properties place it, all defaulting to the desktop app's own
 * layout so an unset host gets today's behaviour:
 *
 * - `--fluidcad-editor-width`  the code editor's width, when one is open
 * - `--fluidcad-chrome-top`    the host chrome above the scene (toolbars)
 * - `--fluidcad-panel-inset-top` / `--fluidcad-panel-inset-bottom`
 *   room an embedding host has claimed inside the viewport for its own
 *   overlays. The scene still fills the frame — only the floating panels
 *   step aside — so a page can set copy over the top of the viewport, or
 *   controls along its bottom, without the rail running underneath.
 */
export const RAIL_PANEL_CLASS =
  'absolute left-[calc(var(--fluidcad-editor-width,0px)+1.5rem)] ' +
  'top-[calc(var(--fluidcad-chrome-top,104px)+var(--fluidcad-panel-inset-top,0px)+12px)] ' +
  'bottom-[calc(var(--fluidcad-panel-inset-bottom,0px)+1.5rem)] ' +
  'w-[220px] z-[99] flex flex-col gap-1 select-none hidden';
