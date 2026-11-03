# Everyworld

A browser re-creation of Ken Musgrave's MojoWorld: whole planets described by a few numbers,
explorable from orbit down to the rocks at your feet. Independent project, not affiliated with
Pandromeda. WebGL2, plain ES modules, no build step.

Live: https://joyhughes.github.io/everyworld/

    python3 serve.py        # http://127.0.0.1:8791/

## What is here, after the MojoWorld 3 manual

- **Viewer layout**: menu bar, the RTR (real-time render), the ViewPane control bar (Preview
  Style, Walk / Fly / UFO, Pause / Jump, Crop Window, Camera with Render Options), the Hyperspace
  Mixer with its two- and six-pip dice, and the Panel Toolbar.
- **JogNav**: pop-up trackball under the RTR, four flat arrows, the up/down arrow with the
  **10K** and **2m** targets, and the field-of-view arc. Shift+double-click also stands you at 2 m.
- **RandomCam**: six-pip die (anywhere lit), two-pip die (near here), the ViewStack, and Walk /
  Fly / UFO altitude bands (5 m, about 10 km, 500 km).
- **Walk** rides on stilts at a fixed height above the terrain. **Fly** and **UFO** use keys to
  accelerate and the mouse as a stick, with Gentle / Intermediate / Extreme sensitivity (right-click
  the icon) and the panic keys Space, L and B.
- **Panels**: Settings (named mixer combinations), Time (Day and Year dials), Log (travelogue with
  thumbnails, places and movies), Movie (record, trim, play), Uplink Queue (batch stills, movies
  and six-face QTVR panoramas), Navigation Console (compass, artificial horizon, GPS globe, FOV).
- **Camera render** paints into the RTR with the black Render Status Bar, its phases and ten
  orange dots; Save writes a PNG. The Crop Window limits and zooms the render.
- **Planet Wizard**: eight element slots (Land Texture, Land Material, Water, Sun, Moon, Stars,
  Rings, Atmosphere) with libraries, dice and a Zip Render preview.
- **Generator**: hot buttons open editor windows built as control stacks (Stars, Sun, Moon, Sky,
  Land, Land Material, Water, Rings, Parameter Bomb) and the MojoGraph function graph editor.
- Not included: plants and forests, rivers, imported objects, PhotoBillboards, Layout Mode.

## Staying light on the GPU

- At most one frame is ever in flight (a fence gates submission), so the browser never queues
  work faster than the GPU drains it.
- Motion frames are capped at the target rate and sized from a GPU timer to use about half of
  each frame interval. Resolution drops instead of the frame rate.
- Refinement runs in strips sized from a learned per-row cost profile (near ground costs far
  more than sky), a few milliseconds per display frame, and stops completely when finished or
  after about 15 seconds of GPU time.
- Preview Quality (View menu): Low, Medium, High or Automatic. Automatic starts Low on integrated
  or mobile GPUs and steps down if motion cannot keep up. Wireframe and Textured (no clouds)
  preview styles are cheaper still.

## How it works

- `src/lattice.js`: JS splits the camera's nadir into integer cell plus fraction for each octave,
  in doubles, so float32 shaders stay exact to about 2 mm on a 6000 km planet.
- `src/graph.js`: terrain is a node graph compiled to GLSL on dual numbers.
- `src/shaders.js`: rays march a log-polar height map baked around the camera; the exact fractal
  runs only in the last few steps.
- `src/app.js` pacing, modes and movies; `src/render.js` paced photo renders and the Uplink
  Queue; `src/viewer.js`, `src/panels.js`, `src/wizard.js`, `src/generator.js` the interface.

## Checks

    node tools/lattice-test.mjs     # exact lattice arithmetic
    node tools/verify.mjs <outdir>  # 51 checks on the real GPU through the real page
    node tools/tour.mjs <outdir>    # screenshots of each feature

Time GPU work with a synchronous readback (see verify.mjs). requestAnimationFrame intervals do not
wait for the GPU and overstated the frame rate here by more than 5×.
