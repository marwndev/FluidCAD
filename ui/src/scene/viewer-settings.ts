import { UserPreferences } from '../api';

export interface ViewerSettings {
  cameraMode: 'perspective' | 'orthographic';
  showGrid: boolean;
  /** The world axis lines through the origin. Off for hosts that want the
   *  model alone on the surface (an embed, a captured still). */
  showAxes: boolean;
  sectionView: boolean;
  sketchLockCamera: boolean;
}

type Listener = (settings: ViewerSettings) => void;

const defaults: ViewerSettings = {
  cameraMode: 'orthographic',
  showGrid: true,
  showAxes: true,
  sectionView: true,
  sketchLockCamera: true,
};

class ViewerSettingsStore {
  current: ViewerSettings = { ...defaults };
  private listeners = new Set<Listener>();

  update(partial: Partial<ViewerSettings>): void {
    Object.assign(this.current, partial);
    for (const fn of this.listeners) fn(this.current);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const viewerSettings = new ViewerSettingsStore();

export function applyPreferences(prefs: UserPreferences): void {
  viewerSettings.update({
    showGrid: prefs.showGrid,
    cameraMode: prefs.cameraMode,
  });
}
