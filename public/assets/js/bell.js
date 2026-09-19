// Synthesised debate bell (no audio files needed).
let ctx;
export function ring(times = 1) {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  for (let i = 0; i < times; i++) {
    const t = ctx.currentTime + i * 0.35;
    [880, 1320].forEach((freq, k) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(k ? 0.12 : 0.3, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1);
    });
  }
}
