// Double-precision camera. Position in km from the planet centre; the shader only ever
// sees altitude, the local up vector and small camera-relative offsets.
const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const add = (a, b, k = 1) => [a[0]+b[0]*k, a[1]+b[1]*k, a[2]+b[2]*k];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const rotate = (v, axis, ang) => { // Rodrigues
  const c = Math.cos(ang), s = Math.sin(ang), d = dot(axis, v), x = cross(axis, v);
  return [v[0]*c + x[0]*s + axis[0]*d*(1-c), v[1]*c + x[1]*s + axis[1]*d*(1-c), v[2]*c + x[2]*s + axis[2]*d*(1-c)];
};
export const v3 = { dot, add, norm, cross, rotate };

export class Camera {
  constructor(radius) {
    this.R = radius; this.fov = 50 * Math.PI / 180;
    this.pos = [0, 0, radius * 3]; this.fwd = [0, 0, -1]; this.camUp = [0, 1, 0];
    this.ground = 0; this.walk = false; this.eye = 0.0017; this.flight = null;
    this.derive();
  }
  derive() {
    const r = Math.hypot(...this.pos);
    this.up = [this.pos[0]/r, this.pos[1]/r, this.pos[2]/r];
    this.alt = r - this.R;
    this.fwd = norm(this.fwd);
    this.right = norm(cross(this.fwd, this.camUp));
    this.camUp = cross(this.right, this.fwd);
    this.altAboveGround = Math.max(this.alt - this.ground, 1e-5);
  }
  // 0 at the surface (horizon stays level) to 1 in orbit (free rotation).
  get orbital() { return Math.min(Math.max((this.alt / this.R - .05) / .25, 0), 1); }
  level(k) {
    const r = cross(this.fwd, this.up), l = Math.hypot(...r);
    if (l < .05) return;
    const target = cross([r[0]/l, r[1]/l, r[2]/l], this.fwd);
    this.camUp = norm(add(this.camUp, target, k));
  }
  look(dYaw, dPitch) {
    const axis = this.orbital > .5 ? this.camUp : this.up;
    this.fwd = rotate(this.fwd, axis, -dYaw);
    this.camUp = rotate(this.camUp, axis, -dYaw);
    this.derive();
    const f2 = rotate(this.fwd, this.right, -dPitch);
    if (this.orbital > .5 || Math.abs(dot(f2, this.up)) < .996) { this.fwd = f2; this.camUp = rotate(this.camUp, this.right, -dPitch); }
    this.derive();
  }
  // Rotates camera and view around the planet centre; drag in orbit spins the globe under you.
  orbit(dx, dy) {
    const a = cross(this.up, this.camUp), axis1 = Math.hypot(...a) > .01 ? norm(a) : this.right;
    const spin = (axis, ang) => { this.pos = rotate(this.pos, axis, ang); this.fwd = rotate(this.fwd, axis, ang); this.camUp = rotate(this.camUp, axis, ang); };
    spin(this.camUp, -dx); this.derive(); spin(this.right, dy);
    this.derive();
  }
  move(fwd, side, rise) {
    const speed = this.altAboveGround;
    let v = add(add(this.fwd.map(c => c * fwd * speed), this.right, side * speed), this.up, rise * speed);
    this.pos = add(this.pos, v);
    const r = this.R + this.ground + .0002, l = Math.hypot(...this.pos);
    if (l < r) this.pos = this.pos.map(c => c * r / l);
    this.derive();
  }
  // Moves toward the surface or away, keeping altitude the natural scale of the motion.
  dolly(k) {
    const d = this.altAboveGround * (k - 1);
    this.pos = add(this.pos, this.up, d);
    const r = this.R + this.ground + .0002, l = Math.hypot(...this.pos);
    if (l < r) this.pos = this.pos.map(c => c * r / l);
    this.derive();
  }
  // Rotate about the view axis (tilt / roll).
  roll(a) { this.camUp = rotate(this.camUp, this.fwd, a); this.derive(); }
  yaw(a) { this.fwd = rotate(this.fwd, this.camUp, -a); this.derive(); }
  pitch(a) { this.fwd = rotate(this.fwd, this.right, a); this.camUp = rotate(this.camUp, this.right, a); this.derive(); }
  // Instrument readings relative to the local horizon, in radians.
  get pitchAngle() { return Math.asin(Math.max(-1, Math.min(1, dot(this.fwd, this.up)))); }
  get rollAngle() { return Math.atan2(-dot(this.right, this.up), dot(this.camUp, this.up)); }
  get heading() {
    const north = norm(add([0, 1, 0], this.up, -this.up[1])), east = cross(north, this.up);
    const f = norm(add(this.fwd, this.up, -dot(this.fwd, this.up)));
    return Math.atan2(dot(f, east), dot(f, north));
  }
  // Moves to a new position, carrying the orientation along the sphere (parallel transport),
  // so level flight follows the planet's curve.
  transport(newPos) {
    const u0 = this.up; this.pos = newPos; this.derive();
    const ax = cross(u0, this.up), s = Math.hypot(...ax);
    if (s > 1e-15) { const a = Math.atan2(s, dot(u0, this.up)), n = ax.map(c => c / s); this.fwd = rotate(this.fwd, n, a); this.camUp = rotate(this.camUp, n, a); }
    this.derive();
  }
  frame(dt) {
    if (this.flight) {
      const f = this.flight; f.t = Math.min(f.t + dt / f.dur, 1);
      const s = f.t * f.t * (3 - 2 * f.t), ang = f.ang * s;
      const dir = f.ang > 1e-9 ? rotate(f.fromDir, f.axis, ang) : f.fromDir;
      // log-altitude, with an arc up over long hops
      const arc = Math.sin(Math.PI * s) * f.ang * this.R * .4;
      const alt = Math.exp(Math.log(f.fromAlt) * (1 - s) + Math.log(f.toAlt) * s) + arc;
      const baseH = f.fromH + (f.toH - f.fromH) * s;
      this.pos = dir.map(c => c * (this.R + baseH + alt));
      this.fwd = norm(add(this.fwd, f.toFwd ? add(f.toFwd, this.fwd, -1) : [0, 0, 0], Math.min(dt * 2.4, 1)));
      this.derive();
      if (f.t >= 1) this.flight = null;
    }
    if (this.autoLevel !== false) this.level(Math.min(dt * 3, 1) * (1 - this.orbital));
    this.derive();
  }
  flyTo(point, targetAlt, groundH, toFwd, dur = 3) {
    const fromDir = this.up.slice(), toDir = norm(point);
    const a = cross(fromDir, toDir), sn = Math.hypot(...a), ang = Math.atan2(sn, dot(fromDir, toDir));
    this.flight = { t: 0, dur, fromDir, axis: sn > 1e-12 ? a.map(c => c / sn) : [1, 0, 0], ang, fromAlt: Math.max(this.altAboveGround, 1e-4), toAlt: targetAlt, fromH: this.ground, toH: groundH, toFwd };
  }
  place(dir, altKm, heading = 0, pitch = 0) {
    this.pos = norm(dir).map(c => c * (this.R + altKm)); this.derive();
    const north = norm(add([0, 1, 0], this.up, -dot([0, 1, 0], this.up)));
    const east = norm(cross(north, this.up));
    const h = [north[0]*Math.cos(heading)+east[0]*Math.sin(heading), north[1]*Math.cos(heading)+east[1]*Math.sin(heading), north[2]*Math.cos(heading)+east[2]*Math.sin(heading)];
    this.fwd = norm(add(h.map(c => c * Math.cos(pitch)), this.up, Math.sin(pitch)));
    this.camUp = this.up.slice();
    this.derive();
    const r = cross(this.fwd, this.up);
    if (Math.hypot(...r) > 1e-3) this.camUp = norm(cross(norm(r), this.fwd));
    this.derive();
  }
}
