export function editImpact(before, after) {
  return {
    delta: Math.round((after.duration - before.duration) * 1000) / 1000,
    narrationChanged: before.narration !== after.narration,
    removesVoice: !!before.audio && before.narration !== after.narration,
  };
}
// Only these fields can change during visual replacement, regardless of model output.
export function visualOnly(before, candidate) {
  return {
    ...before,
    visual: candidate.visual,
    art: candidate.art,
    accent: candidate.accent,
    image: candidate.image,
  };
}
