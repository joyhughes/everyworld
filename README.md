# Everyworld

A browser re-creation of the idea behind Ken Musgrave's MojoWorld: a whole planet described by a
few numbers, explorable from orbit down to the rocks at your feet. Independent project, not
affiliated with Pandromeda. WebGL2, plain ES modules, no build step.

Live: https://joyhughes.github.io/everyworld/

    python3 serve.py        # http://127.0.0.1:8791/

## How it works

- `src/lattice.js`: a 32-bit shader cannot address a 1 cm feature on a 6000 km planet. JS splits the
  camera's nadir into integer cell plus fraction for each octave, in doubles, and the shader only
  adds a small camera-relative offset.
- `src/graph.js`: terrain is a node graph compiled to GLSL on dual numbers, so each height comes
  with its exact gradient. Sliders write uniforms; only rewiring recompiles.
- `src/shaders.js`: rays march a log-polar height map baked around the camera, and the exact
  fractal only runs in the last few steps. That cut a 720p frame by about 10×.
- `src/world.js`: seed to world, Hyperspace Mixers, world blending, shareable codes.

## Checks

    node tools/lattice-test.mjs     # exact lattice arithmetic
    node tools/verify.mjs <outdir>  # real GPU, real page; needs serve.py running

Time GPU work with a synchronous readback (see verify.mjs). requestAnimationFrame intervals do not
wait for the GPU and overstated the frame rate here by more than 5×.
