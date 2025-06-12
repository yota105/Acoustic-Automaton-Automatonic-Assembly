# Simple Synthesizer Example

This example shows how to create a basic synthesizer with oscillator controls and real-time visualization.

## Features

- Multiple oscillator types (sine, sawtooth, square)
- Frequency and amplitude controls
- Real-time waveform visualization with Three.js
- ADSR envelope (basic implementation)

## Setup

1. **Copy the modified files to your project:**
   ```bash
   cp examples/synthesizer-example/src/dsp/synthesizer.dsp src/dsp/
   cp examples/synthesizer-example/src/visualizer-synth.ts src/
   ```

2. **Update package.json scripts:**
   ```json
   {
     "scripts": {
       "faust:build": "faust -lang wasm-ib -o public/audio/synthesizer.wasm src/dsp/synthesizer.dsp"
     }
   }
   ```

3. **Install and run:**
   ```bash
   npm install
   npm run dev-with-faust
   ```

## Files Modified

- `src/dsp/synthesizer.dsp` - Faust DSP code for multi-oscillator synth
- `src/visualizer-synth.ts` - Three.js visualization for waveforms
- `src/controller.ts` - Additional UI controls for synth parameters

## Customization Ideas

- Add more oscillator types
- Implement filter controls
- Add reverb/delay effects
- Create keyboard input for note triggering
- Export MIDI sequences

## Dependencies

No additional dependencies required beyond the base template.

## Screenshots

![Synthesizer Interface](screenshots/synth-interface.png)
![Waveform Visualization](screenshots/waveform-viz.png)
