// A point near the camera, reached via (I,F)+offset, must land in the same cell at the
// same fractional position as direct double-precision evaluation. Checked at every octave
// out to millimetre scale on a 6371 km planet.
import { latticeEntry, ROT } from '../src/lattice.js';
const R = 6371, s0 = [0.3, 0.5, 0], n = Math.hypot(...s0.slice(0,2), 0.8); 
const s = [0.3/n, 0.5/n, 0.8/n]; let worst = 0, fails = 0;
for (let k = 0; k < 32; k++) {
  const f = 1.7 * 2 ** k, M = ROT[k & 3];
  const e = latticeEntry(s, f, k);
  const off = 1 / f * 3.3; // move a few cells at this octave
  const d = [off*.6, -off*.3, off*.74];
  const q = s.map((v, i) => v + d[i]);
  const direct = latticeEntry(q, f, k);
  const p = [0,1,2].map(i => f*(M[i*3]*d[0]+M[i*3+1]*d[1]+M[i*3+2]*d[2]));
  const w = (p[0]+p[1]+p[2])/3;
  for (let i = 0; i < 3; i++) {
    const x = Math.fround(Math.fround(e.F[i]) + Math.fround(p[i] + w)); // what float32 sees
    const fl = Math.floor(x), cell = e.I[i] + fl, fr = x - fl;
    const err = Math.abs((cell + fr) - (direct.I[i] + direct.F[i]));
    worst = Math.max(worst, err); if (err > 1e-5) fails++;
  }
}
console.log(`lattice: worst cell-space error ${worst.toExponential(2)} at 32 octaves, wavelength ${(R/(1.7*2**31)*1e6).toFixed(2)} mm; fails ${fails}`);
process.exit(fails ? 1 : 0);
