import { saveProject, loadProject } from './model.js';

// Undo and redo, as copies of the project. A change pushes the state from before it; a run of
// changes close together (a knob being turned, notes dragged) counts as one, so Ctrl+Z takes back
// the whole gesture. Where windows are and which are open is not part of it.

const snap = (p) => { const { ui, ...rest } = saveProject(p); return JSON.stringify(rest); };

export function createHistory(S) {
  const back = [], fwd = [];
  let last = snap(S.project);
  let timer = 0, pending = false;
  function settle() { clearTimeout(timer); pending = false; last = snap(S.project); }
  function restore(json) {
    const samples = new Map(S.project.channels.map((c) => [c.id, c.sample]));
    const ui = S.project.ui;
    const fresh = loadProject({ ...JSON.parse(json), ui });
    for (const k of Object.keys(S.project)) delete S.project[k];
    Object.assign(S.project, fresh, { ui });
    for (const c of S.project.channels) c.sample = samples.get(c.id) || null;
    S.afterRestore();
  }
  return {
    changed() {
      if (!pending) {
        back.push(last);
        if (back.length > 100) back.shift();
        fwd.length = 0;
        pending = true;
      }
      clearTimeout(timer);
      timer = setTimeout(settle, 350);
    },
    undo() {
      if (pending) settle();
      if (!back.length) return false;
      fwd.push(last);
      last = back.pop();
      restore(last);
      return true;
    },
    redo() {
      if (pending) settle();
      if (!fwd.length) return false;
      back.push(last);
      last = fwd.pop();
      restore(last);
      return true;
    },
    // after a project is replaced from outside (opened from a file): nothing to undo into
    reset() { back.length = 0; fwd.length = 0; settle(); },
  };
}
