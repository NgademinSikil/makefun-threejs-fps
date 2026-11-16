// The look plan, in one place. Ember Yard at dusk: deep slate, warm amber sun,
// teal Vanguard (the player's team) against crimson opponents. Every colour in the
// game and the page CSS is one of these names.
export const PALETTE = {
  canvas: '#171a21',
  surface: '#22262e',
  hairline: '#333945',
  ink: '#ece7db',
  muted: '#9aa3ad',
  accent: '#f0a830',
  teal: '#2dd4bf',
  crimson: '#f43f5e',
  sky: '#2b3242',
  ground: '#484e57',
  crate: '#6b5a3e',
  container: '#7a4a35',
};

export function shade(name) {
  return PALETTE[name];
}
