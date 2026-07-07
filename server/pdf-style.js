const { rgb } = require('pdf-lib');

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

// Sonar rating palette (A green → E red).
const RATING_HEX = { A: '#00AA63', B: '#B0D513', C: '#EABE06', D: '#ED7D20', E: '#D02F3A' };
const RATING_COLORS = Object.fromEntries(Object.entries(RATING_HEX).map(([k, v]) => [k, hex(v)]));

const SONAR = { blue: hex('#4B9FD5'), ink: hex('#262931'), subtle: hex('#666666') };
const PAGE = { width: 595.28, height: 841.89, margin: 48 };

module.exports = { RATING_COLORS, RATING_HEX, SONAR, PAGE, hex };
