import { el } from '../util.js';

// The Perform rack's Tools group: a key for each tool on the desk, lit while that tool is out on
// the stage. A click takes it out or puts it away; the dashed key opens the market's tool shelf.
export function buildToolTray({ unit, registry, desk, openShelf, icon }) {
  const row = el('div', { class: 'keys tool-tray' });
  const shelfBtn = el('button', { class: 'key key-market', type: 'button', title: 'More tools in the market (K, then Tools)', onclick: () => openShelf() }, icon('add'), el('span', {}, 'Tools'));
  const group = el('div', { class: 'group stage-group tool-tray-group', role: 'group', 'aria-label': 'Tools' },
    el('div', { class: 'group-legend' }, 'Tools · drag them anywhere'), row);
  const grid = unit.querySelector('.stage-grid') || unit;
  grid.prepend(group);

  function render() {
    const keys = registry.desk.map((e) => {
      const on = desk.isOpen(e.id);
      return el('button', {
        class: `key ${on ? 'is-active' : ''}`, type: 'button', 'aria-pressed': String(on),
        title: on ? `Put ${e.name} away` : `Take ${e.name} out onto the stage`, onclick: () => desk.toggle(e.id),
      }, el('span', { class: 'led' }), el('span', {}, e.name));
    });
    row.replaceChildren(...keys, shelfBtn);
    if (!keys.length) row.prepend(el('span', { class: 'tool-tray-empty' }, 'Your desk is empty.'));
  }
  for (const type of ['change', 'desk', 'catalog']) registry.addEventListener(type, render);
  render();
}
