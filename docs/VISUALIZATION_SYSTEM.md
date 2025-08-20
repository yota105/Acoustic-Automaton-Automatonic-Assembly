# Visualization System Documentation

## Overview

The visualization system provides real-time audio-reactive graphics using multiple rendering technologies in a multi-window architecture.

## Architecture

### Core Components

#### VisualizerManager
**ファイル**: `src/visualizers/visualizerManager.ts`

```typescript
class VisualizerManager {
  createWindow(type: 'threejs' | 'p5js'): void
  destroyWindow(windowId: string): void
  updateAudioData(frequencyData: Float32Array, timeData: Float32Array): void
}
```

**責務**:
- Multiple visualizer window management
- Audio data distribution to active visualizers
- Window lifecycle management
- Cross-window synchronization

#### Three.js Visualizer
**ファイル**: `src/visualizers/threeJSVisualizer.ts`

**機能**:
- 3D graphics rendering
- Audio-reactive particle systems
- Real-time shader effects
- Camera control and animation

#### p5.js Visualizer
**ファイル**: `src/visualizers/p5Visualizer.ts`

**機能**:
- Creative coding interface
- 2D/3D sketch rendering
- Interactive visual programming
- Community sketch sharing

### Window Management

#### Multi-Window Architecture
```typescript
interface VisualizerWindow {
  id: string;
  type: 'threejs' | 'p5js';
  window: Window;
  renderer: VisualizerRenderer;
  audioAnalyzer: AudioAnalyzer;
}
```

#### Window Controller
**ファイル**: `src/visualizers/windowController.ts`

- Tauri window API integration
- Window positioning and sizing
- Focus management
- Screen layout optimization

### Audio Integration

#### Audio Analyzer
```typescript
class AudioAnalyzer {
  getFrequencyData(): Float32Array
  getTimeData(): Float32Array
  getSpectralCentroid(): number
  getSpectralRolloff(): number
  getBeat(): BeatInfo
}
```

#### Real-time Data Flow
```
Audio Context
    ↓
AnalyserNode (FFT)
    ↓
AudioAnalyzer (feature extraction)
    ↓
VisualizerManager (data distribution)
    ↓
Individual Visualizers (rendering)
```

### Rendering Technologies

#### Three.js Integration

##### Scene Graph
```typescript
// Basic scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, width/height, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
```

##### Audio-Reactive Components
- **Particle Systems**: Frequency-based particle emission
- **Geometry Deformation**: Audio-driven mesh manipulation
- **Lighting Effects**: Dynamic lighting based on audio features
- **Camera Movement**: Automatic camera animation

##### Shader Programming
```glsl
// Fragment shader example for audio reactivity
uniform float uAudioLevel;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec3 color = vec3(vUv, sin(uTime + uAudioLevel * 10.0));
  gl_FragColor = vec4(color, 1.0);
}
```

#### p5.js Integration

##### Sketch Management
```typescript
// p5.js sketch structure
const sketch = (p: p5) => {
  p.setup = () => {
    p.createCanvas(800, 600, p.WEBGL);
  };
  
  p.draw = () => {
    p.background(0);
    drawAudioReactiveElements(audioData);
  };
};
```

##### Creative Coding Features
- **Dynamic Drawing**: Real-time sketch modification
- **Interactive Elements**: Mouse/keyboard interaction
- **Generative Art**: Algorithm-based visual generation
- **Community Integration**: Sketch sharing and remixing

### Performance Optimization

#### Rendering Performance
- **Frame Rate Target**: 60fps minimum, 120fps preferred
- **GPU Utilization**: WebGL/WebGPU optimization
- **Memory Management**: Efficient buffer handling
- **LOD System**: Level-of-detail for complex scenes

#### Audio Processing Optimization
- **FFT Optimization**: Efficient frequency analysis
- **Feature Caching**: Repeated calculation avoidance
- **Smooth Interpolation**: Audio data smoothing for stable visuals

### Visual Effects Library

#### Built-in Effects

##### Spectrum Visualizers
- **Bar Chart**: Classic frequency bar display
- **Circular Spectrum**: Radial frequency visualization
- **Waveform**: Time-domain audio display
- **Spectrogram**: Time-frequency analysis display

##### Particle Effects
- **Audio Particles**: Frequency-driven particle systems
- **Trail Effects**: Motion blur and particle trails
- **Explosion Effects**: Beat-synchronized particle bursts
- **Flowing Particles**: Smooth particle movement

##### 3D Visualizations
- **Audio Landscape**: 3D terrain based on frequency data
- **Geometric Reactivity**: Shape morphing and scaling
- **Volumetric Effects**: 3D audio-reactive volumes
- **Spatial Audio**: 3D positioned audio visualization

### User Interface

#### Visualizer Controls
```typescript
interface VisualizerControls {
  effect: string;
  sensitivity: number;
  colorScheme: string;
  animationSpeed: number;
  customParameters: Record<string, any>;
}
```

#### Real-time Parameter Control
- **Slider Controls**: Continuous parameter adjustment
- **Color Pickers**: Dynamic color scheme selection
- **Preset Management**: Save/load visualizer configurations
- **MIDI Mapping**: External controller integration

### Customization and Extensibility

#### Plugin Architecture
```typescript
interface VisualizerPlugin {
  name: string;
  type: 'effect' | 'renderer' | 'analyzer';
  initialize(context: VisualizerContext): void;
  update(audioData: AudioData): void;
  render(context: RenderContext): void;
}
```

#### Custom Shader Support
- **Fragment Shader Editor**: Live shader editing
- **Uniform Binding**: Audio data to shader uniforms
- **Shader Presets**: Community-shared shaders
- **Hot Reloading**: Real-time shader updates

### Integration with Audio System

#### Audio Data Pipeline
```typescript
// Audio system integration
export function connectVisualizer(audioContext: AudioContext) {
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  
  // Connect to audio output
  window.busManager.getEffectsOutputNode().connect(analyser);
  
  // Start visualization loop
  startVisualizationLoop(analyser);
}
```

#### Synchronization
- **Audio-Visual Sync**: Frame-accurate synchronization
- **Latency Compensation**: Visual delay adjustment
- **Buffer Management**: Smooth audio data delivery

### Future Enhancements

#### Advanced Features
- **VR/AR Support**: WebXR integration for immersive visualization
- **AI-Generated Visuals**: Machine learning-driven visual generation
- **Collaborative Visualization**: Multi-user visual sessions
- **Live Streaming**: Real-time visual broadcast

#### Technology Roadmap
- **WebGPU Migration**: Next-generation graphics API
- **Web Workers**: Offloaded visualization processing
- **WASM Integration**: High-performance visualization modules
- **Native Rendering**: Tauri-based native graphics acceleration

### Development Guidelines

#### Best Practices
- **Modular Design**: Reusable visualization components
- **Performance First**: Frame rate prioritization
- **Responsive Design**: Adaptive to different screen sizes
- **Accessibility**: Visual accessibility considerations

#### Testing Strategy
- **Visual Regression Testing**: Automated visual validation
- **Performance Benchmarking**: Frame rate and memory testing
- **Cross-Platform Testing**: Consistent behavior across platforms
- **User Experience Testing**: Usability validation

### API Reference

#### Core Classes
```typescript
// Main visualization classes
class VisualizerManager { /* ... */ }
class ThreeJSVisualizer { /* ... */ }
class P5JSVisualizer { /* ... */ }
class AudioAnalyzer { /* ... */ }
class WindowController { /* ... */ }
```

#### Events
- `'visualizer-created'` - New visualizer window created
- `'visualizer-destroyed'` - Visualizer window closed
- `'audio-data-update'` - New audio analysis data available
- `'visualizer-error'` - Visualization error occurred

### Community and Ecosystem

#### Preset Sharing
- **Community Presets**: User-created visualizer configurations
- **Rating System**: Community-driven quality assessment
- **Version Control**: Preset evolution tracking

#### Developer Resources
- **Tutorial Documentation**: Step-by-step visualization guides
- **Example Gallery**: Demonstration visualizations
- **API Documentation**: Complete developer reference
- **Community Forums**: Developer discussion and support
