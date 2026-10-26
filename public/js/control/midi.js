// MIDI controllers through Web MIDI. Every input's messages come out as one shape:
// { src, kind: 'cc' | 'note' | 'bend', ch, num, value (0..1), on (notes) }, where `src` names the
// control (not the device), so a mapping keeps working when the controller is plugged into
// another port. The browser asks for permission the first time; after that it reconnects alone.

export function createMidi({ onMessage, onChange }) {
  let access = null;
  let state = navigator.requestMIDIAccess ? 'off' : 'unsupported';   // off | asking | on | denied | unsupported

  function parse(data) {
    const status = data[0] & 0xf0, ch = (data[0] & 0x0f) + 1;
    if (status === 0xb0) onMessage({ src: `midi:cc:${ch}:${data[1]}`, kind: 'cc', ch, num: data[1], value: data[2] / 127 });
    else if (status === 0x90 && data[2] > 0) onMessage({ src: `midi:note:${ch}:${data[1]}`, kind: 'note', ch, num: data[1], value: data[2] / 127, on: true });
    else if (status === 0x80 || status === 0x90) onMessage({ src: `midi:note:${ch}:${data[1]}`, kind: 'note', ch, num: data[1], value: 0, on: false });
    else if (status === 0xe0) onMessage({ src: `midi:bend:${ch}`, kind: 'bend', ch, num: 0, value: ((data[2] << 7) | data[1]) / 16383 });
  }
  function wire() {
    for (const input of access.inputs.values()) input.onmidimessage = (e) => parse(e.data);
    onChange?.();
  }

  const midi = {
    get state() { return state; },
    get devices() { return access ? [...access.inputs.values()].filter((i) => i.state === 'connected').map((i) => i.name || 'MIDI device') : []; },
    async connect() {
      if (!navigator.requestMIDIAccess) { state = 'unsupported'; onChange?.(); return false; }
      if (access) return true;
      state = 'asking';
      onChange?.();
      try {
        access = await navigator.requestMIDIAccess({ sysex: false });
        state = 'on';
        access.onstatechange = wire;          // a controller plugged in later is heard at once
        wire();
        return true;
      } catch {
        state = 'denied';
        onChange?.();
        return false;
      }
    },
    // On page load: reconnect only if the browser already allows it, so nothing pops up.
    async resume() {
      try {
        const p = await navigator.permissions?.query({ name: 'midi' });
        if (p?.state === 'granted') return midi.connect();
      } catch { /* this browser cannot say */ }
      return false;
    },
    // what a message is called in the list of mappings
    describe(src) {
      const [, kind, ch, num] = src.split(':');
      if (kind === 'cc') return `CC ${num} · ch ${ch}`;
      if (kind === 'note') return `Note ${noteName(Number(num))} · ch ${ch}`;
      return `Pitch bend · ch ${ch}`;
    },
  };
  return midi;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
