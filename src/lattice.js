// Exact per-octave noise lattice.
// A float32 shader cannot address a 1 cm feature on a 6000 km planet, so JS (doubles)
// splits the camera's nadir point into integer cell + fraction for every octave.
// The shader then adds only the small camera-relative offset. See GLSL `sn()`.

export const SLOTS = 320;

// Per-octave rotations break up lattice alignment; the same matrices are emitted to GLSL.
function rot(ax, ay, az, ang) {
  const l = Math.hypot(ax, ay, az); ax /= l; ay /= l; az /= l;
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  return [t*ax*ax+c, t*ax*ay-s*az, t*ax*az+s*ay,
          t*ax*ay+s*az, t*ay*ay+c, t*ay*az-s*ax,
          t*ax*az-s*ay, t*ay*az+s*ax, t*az*az+c];
}
export const ROT = [rot(1,2,3,0.7), rot(-2,1,1,1.1), rot(3,-1,2,1.9), rot(1,1,-3,2.6)];

export const lat = {
  buf: new ArrayBuffer(SLOTS * 32),
};
lat.f = new Float32Array(lat.buf, 0, SLOTS * 4);
lat.i = new Int32Array(lat.buf, SLOTS * 16, SLOTS * 4);

// Writes one octave into the table. Pure so tests can compare against direct evaluation.
export function latticeEntry(s, f, k) {
  const R = ROT[k & 3];
  const px = f * (R[0]*s[0] + R[1]*s[1] + R[2]*s[2]);
  const py = f * (R[3]*s[0] + R[4]*s[1] + R[5]*s[2]);
  const pz = f * (R[6]*s[0] + R[7]*s[1] + R[8]*s[2]);
  const w = (px + py + pz) / 3;
  const x = px + w, y = py + w, z = pz + w;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  return { F: [x - ix, y - iy, z - iz], I: [ix, iy, iz] };
}

// Fills `oct` entries starting at `slot` for a fractal with base frequency f0.
export function fillSlots(slot, oct, s0, f0, lac, seed) {
  let f = f0, sd = Math.imul(seed | 0, 2654435761) | 0;
  for (let k = 0; k < oct; k++) {
    const e = latticeEntry(s0, f, k), o = (slot + k) * 4;
    lat.f[o] = e.F[0]; lat.f[o+1] = e.F[1]; lat.f[o+2] = e.F[2]; lat.f[o+3] = f;
    sd = (Math.imul(sd, 1103515245) + 12345) | 0;
    // `|0` is exact mod 2^32 for integers below 2^53; the hash only sees the wrapped value.
    lat.i[o] = (e.I[0] + (sd & 0xffff)) | 0;
    lat.i[o+1] = (e.I[1] + ((sd >>> 8) & 0xffff)) | 0;
    lat.i[o+2] = (e.I[2] + ((sd >>> 16) & 0xffff)) | 0;
    lat.i[o+3] = 0;
    f *= lac;
  }
}
