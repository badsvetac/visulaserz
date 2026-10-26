// The hand in the air, seen by the camera. There is no model and nothing to download: every frame
// is shrunk to 64×48 grey pixels and compared with the one before, and the place where the most
// pixels changed is where the hand is moving. That is enough to play a pad in the air: wave and
// it touches, move and it follows, hold still and it lets go. Nothing is recorded, kept or sent;
// each little frame is thrown away once the next one has been compared with it.

const W = 64, H = 48;
const RATE = 1 / 30;               // frames compared per second, at most

export function createCamera({ onHand, onChange }) {
  let state = navigator.mediaDevices?.getUserMedia ? 'off' : 'unsupported';   // off | asking | on | denied | unsupported
  let stream = null, video = null;
  const work = document.createElement('canvas');
  work.width = W;
  work.height = H;
  const g = work.getContext('2d', { willReadFrequently: true });
  let prev = null, wait = 0, still = 0;
  const hand = { x: 0.5, y: 0.5, present: false, motion: 0 };

  const cam = {
    get state() { return state; },
    get video() { return video; },
    get hand() { return hand; },
    async start() {
      if (stream || state === 'asking') return state === 'on';
      if (state === 'unsupported') { onChange?.(); return false; }
      state = 'asking';
      onChange?.();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' }, audio: false });
        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();
        state = 'on';
      } catch (e) {
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        video = null;
        state = e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : 'unavailable';
      }
      onChange?.();
      return state === 'on';
    },
    stop() {
      stream?.getTracks().forEach((t) => t.stop());     // the camera light goes out
      stream = null;
      video = null;
      prev = null;
      if (state === 'on' || state === 'asking') state = 'off';
      const was = hand.present;
      hand.present = false;
      if (was) onHand?.(hand);
      onChange?.();
    },
    tick(dt) {
      if (!video || video.readyState < 2) return;
      wait -= dt;
      if (wait > 0) return;
      wait = RATE;
      g.drawImage(video, 0, 0, W, H);
      const px = g.getImageData(0, 0, W, H).data;
      const grey = new Float32Array(W * H);
      for (let i = 0; i < grey.length; i++) grey[i] = px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11;
      if (prev) {
        let sx = 0, sy = 0, sw = 0, count = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = y * W + x, d = Math.abs(grey[i] - prev[i]) - 16;   // below 16 levels is sensor noise
            if (d <= 0) continue;
            sx += x * d; sy += y * d; sw += d; count++;
          }
        }
        hand.motion = count / (W * H);
        const moving = hand.motion > 0.012;
        if (moving) {
          // the picture is a mirror for whoever stands in front of it: their right is the right
          const mx = 1 - sx / sw / (W - 1), my = 1 - sy / sw / (H - 1);
          const k = hand.present ? 0.35 : 1;
          hand.x += (mx - hand.x) * k;
          hand.y += (my - hand.y) * k;
          still = 0;
        } else {
          still += RATE;
        }
        // a hand that pauses for a moment is still there; one gone still for a third of a second has left
        hand.present = moving || (hand.present && still < 0.35);
        onHand?.(hand);
      }
      prev = grey;
    },
  };
  return cam;
}
