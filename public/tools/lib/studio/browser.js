import { DRUMS, SYNTH_PRESETS } from './sounds.js';
import { FX } from './effects.js';

// The BROWSER down the left side: everything that can go into the project, in folders. Click an
// instrument or a drum to add it as a channel; drag it onto the channel rack, a pattern onto the
// playlist, an effect onto a mixer slot. Audio files dropped here wait under Your samples.

export const DRAG_TYPE = 'application/x-vz-studio';

export function buildBrowser(S, kit) {
  const { el } = S;
  const tree = el('div', { class: 'st2-tree' });
  const node = el('aside', { class: 'st2-browser' }, el('div', { class: 'st2-browser-head' }, 'Browser'), tree);
  const openIds = new Set(S.project.ui.tree || ['inst', 'drums']);
  const folders = [
    { id: 'inst', label: 'Instruments', items: () => [
      { label: '3-Osc Synth', hint: 'A synth with three oscillators, a filter and envelopes', add: ['synth', 'lead'] },
      { label: 'Drum Synth', hint: 'A drum made on the spot: kick, snare, hat and nine more', add: ['drum', 'kick'] },
      { label: 'Sampler', hint: 'Plays any sound you drop into it, pitched by the piano roll', add: ['sampler'] },
      { label: 'Slicer', hint: 'Cuts the last bars of the song that is playing into slices', add: ['slicer'] },
    ] },
    { id: 'drums', label: 'Drums', items: () => DRUMS.map((d) => ({ label: d.name, hint: `Add a ${d.name.toLowerCase()} channel`, add: ['drum', d.id] })) },
    { id: 'synths', label: 'Synth presets', items: () => SYNTH_PRESETS.map((p) => ({ label: p.name, hint: `Add a 3-Osc Synth set to ${p.name}`, add: ['synth', p.id] })) },
    { id: 'fx', label: 'Effects', items: () => FX.map((f) => ({ label: f.name, hint: `Drag onto a mixer slot, or click to add it to the picked insert`, fx: f.id })) },
    { id: 'patterns', label: 'Patterns', items: () => S.project.patterns.map((p) => ({ label: p.name, color: p.color, hint: 'Click to pick it, drag it onto the playlist', pattern: p.id })) },
    { id: 'samples', label: 'Your samples', items: () => (S.samples.length ? S.samples.map((s) => ({ label: s.name, hint: 'Click to make a sampler channel of it, or drag it onto the rack', sample: s.name })) : [{ label: 'Drop audio files here', hint: 'WAV, MP3, OGG… they stay for this session', empty: true }]) },
  ];
  function act(it) {
    if (it.add) S.addChannel(it.add[0], it.add[1]);
    else if (it.fx) S.addFx(S.mixerInsert, it.fx);
    else if (it.pattern) S.setPattern(it.pattern);
    else if (it.sample) S.addSampler(S.samples.find((s) => s.name === it.sample));
  }
  function render() {
    tree.replaceChildren();
    for (const f of folders) {
      const open = openIds.has(f.id);
      const head = el('div', { class: `st2-node is-folder ${open ? 'is-open' : ''}`, onclick: () => { if (open) openIds.delete(f.id); else openIds.add(f.id); S.project.ui.tree = [...openIds]; S.saveUi(); render(); } }, f.label);
      tree.append(head);
      if (!open) continue;
      for (const it of f.items()) {
        const n = el('div', { class: 'st2-node is-item', 'data-hint': `${it.label}: ${it.hint}`, draggable: it.empty ? 'false' : 'true' },
          it.color ? el('span', { class: 'dot', style: `background:${it.color}` }) : null, it.label);
        if (!it.empty) {
          n.addEventListener('click', () => act(it));
          n.addEventListener('dragstart', (e) => {
            const { label, hint, ...spec } = it;
            e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(spec));
            e.dataTransfer.effectAllowed = 'copy';
          });
        }
        tree.append(n);
      }
    }
  }
  // audio files dropped on the browser become samples for this session
  node.addEventListener('dragover', (e) => { if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) e.preventDefault(); });
  node.addEventListener('drop', (e) => {
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aiff?)$/i.test(f.name));
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    files.forEach((f) => S.importSample(f));
    openIds.add('samples');
  });
  render();
  return { node, render };
}
