// Original procedural score. No samples or third-party recordings.
export function scoreSamples(duration, rate = 24000) {
  const data = new Float32Array(Math.ceil(duration * rate));
  const chords = [
    [48, 55, 60, 64, 67],
    [45, 52, 57, 60, 64],
    [41, 48, 53, 57, 60],
    [43, 50, 55, 59, 62],
  ];
  for (let beat = 0; beat < duration / 0.5; beat++) {
    const start = beat * 0.5,
      chord = chords[Math.floor(beat / 8) % 4],
      note = chord[(beat * 3) % chord.length] + 12,
      freq = 440 * 2 ** ((note - 69) / 12);
    for (let i = 0; i < Math.min(rate * 2.2, data.length - start * rate); i++) {
      const t = i / rate,
        envelope = (1 - Math.exp(-t * 80)) * Math.exp(-t * 3);
      data[Math.floor(start * rate) + i] +=
        (Math.sin(t * freq * 2 * Math.PI) +
          0.24 * Math.sin(t * freq * 4 * Math.PI)) *
        envelope *
        0.1;
    }
  }
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    data[i] *= Math.min(1, t / 0.8, (duration - t) / 1.5);
  }
  return data;
}
