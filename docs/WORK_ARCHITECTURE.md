# Work-Centered Architecture Design

**Status**: 🚧 **In Planning**  
**Date**: 2025-08-24  
**Architecture**: Option A - Work-Centered Design  

## 🎯 Architecture Overview

This document defines the work-centered architecture for separating the universal audio-visual engine from specific musical compositions.

### Design Philosophy

- **🎭 Work-Centered**: Musical compositions are the primary focus
- **🏗️ Engine Separation**: Reusable audio-visual engine foundation
- **🎪 Studio Environment**: Integrated creation and performance workspace
- **🔧 Modular Design**: Independent, testable components

## 📁 Directory Structure

```
src/
├── engine/                          # Universal Audio-Visual Engine
│   ├── audio/                      # Audio Processing Engine
│   │   ├── core/                   # Core audio functionality
│   │   │   ├── audioCore.ts        # Base audio initialization
│   │   │   ├── busManager.ts       # Audio routing management
│   │   │   └── testSignalManager.ts # Test signal generation
│   │   ├── processing/             # Audio processing modules
│   │   │   ├── effects/            # Effect processing
│   │   │   ├── synthesis/          # Audio synthesis
│   │   │   └── analysis/           # Audio analysis
│   │   ├── devices/                # Device management
│   │   │   ├── inputManager.ts     # Input device control
│   │   │   ├── outputManager.ts    # Output device control
│   │   │   └── deviceDiscovery.ts  # Device discovery
│   │   └── dsp/                    # DSP framework
│   │       ├── faustWasmLoader.ts  # Faust WebAssembly integration
│   │       └── effectRegistry.ts   # Effect management
│   ├── visual/                     # Visualization Engine
│   │   ├── renderers/              # Rendering systems
│   │   │   ├── threeJSRenderer.ts  # Three.js 3D renderer
│   │   │   ├── p5Renderer.ts       # p5.js creative coding
│   │   │   └── webglRenderer.ts    # WebGL optimization
│   │   ├── effects/                # Visual effects library
│   │   │   ├── particles.ts        # Particle systems
│   │   │   ├── shaders.ts          # Shader effects
│   │   │   └── filters.ts          # Visual filters
│   │   └── managers/               # Management systems
│   │       ├── visualizerManager.ts # Multi-window control
│   │       └── windowController.ts  # Window management
│   ├── timing/                     # Timing & Synchronization
│   │   ├── musicalTimeManager.ts   # High-precision timing
│   │   ├── metronome.ts           # Metronome functionality
│   │   └── scheduler.ts           # Event scheduling
│   └── framework/                  # Work Framework
│       ├── musicalWork.ts         # Work interface definition
│       ├── workManager.ts         # Work lifecycle management
│       ├── section.ts             # Section base class
│       └── eventBus.ts            # Inter-component communication
├── works/                          # Musical Works Collection
│   ├── acoustic-automaton/         # Acoustic Automaton Work
│   │   ├── index.ts               # Work entry point
│   │   ├── sections/              # Section implementations
│   │   │   ├── section1.ts        # Section 1: Introduction
│   │   │   ├── section2.ts        # Section 2: Dynamic Movement
│   │   │   ├── section3.ts        # Section 3: Rotation & Intensification
│   │   │   ├── section4.ts        # Section 4: [Future]
│   │   │   ├── section5.ts        # Section 5: [Future]
│   │   │   └── section6.ts        # Section 6: [Future]
│   │   ├── audio/                 # Work-specific audio processing
│   │   │   ├── detection/         # Audio detection algorithms
│   │   │   │   ├── b4Detection.ts # B4 note detection
│   │   │   │   └── triggerDetection.ts # Trigger detection
│   │   │   ├── synthesis/         # Audio synthesis
│   │   │   │   ├── instanceManager.ts # Audio instance management
│   │   │   │   ├── reverbSystem.ts    # Reverb + sustain system
│   │   │   │   └── spatialAudio.ts    # Spatial audio processing
│   │   │   └── dsp/              # Work-specific Faust DSP
│   │   │       ├── automaton.dsp  # Main synthesizer
│   │   │       ├── spatial.dsp    # Spatial processing
│   │   │       └── effects.dsp    # Custom effects
│   │   ├── visuals/              # Work-specific visualizations
│   │   │   ├── section1Visual.ts  # Section 1 visualization
│   │   │   ├── panelSystem.ts     # 3-panel display system
│   │   │   ├── coordinateSystem.ts # 3D coordinate management
│   │   │   ├── instanceRenderer.ts # Instance visualization
│   │   │   └── flashEffects.ts    # Flash decay effects
│   │   ├── config/               # Work configuration
│   │   │   ├── metadata.json     # Work metadata
│   │   │   ├── sections.json     # Section definitions
│   │   │   ├── timing.json       # Timing configuration
│   │   │   └── instruments.json  # Instrument setup
│   │   └── assets/               # Work-specific assets
│   │       ├── textures/         # Visual textures
│   │       ├── sounds/           # Audio samples
│   │       └── shaders/          # Custom shaders
│   └── template-work/            # Template for new works
│       ├── index.template.ts     # Template entry point
│       ├── sections/            # Template sections
│       └── config/              # Template configuration
└── studio/                       # Creation & Performance Studio
    ├── launcher/                # Work launcher system
    │   ├── workSelector.ts      # Work selection interface
    │   ├── workLoader.ts        # Work loading system
    │   └── launcher.ts          # Main launcher
    ├── monitor/                 # Performance monitoring
    │   ├── performanceMonitor.ts # System performance monitoring
    │   ├── audioMonitor.ts      # Audio system monitoring
    │   └── visualMonitor.ts     # Visual system monitoring
    ├── emergency/               # Emergency controls
    │   ├── emergencyController.ts # Emergency stop/control
    │   ├── safeMode.ts          # Safe mode operation
    │   └── recovery.ts          # System recovery
    └── development/             # Development tools
        ├── workBuilder.ts       # Work creation tools
        ├── debugger.ts          # Debugging utilities
        └── testRunner.ts        # Test execution
```

## 🎭 Musical Work Interface

### Core Interfaces

```typescript
// Work definition interface
export interface MusicalWork {
  metadata: WorkMetadata;
  sections: Section[];
  
  // Lifecycle methods
  prepare(): Promise<void>;    // Preparation phase
  perform(): Promise<void>;    // Start performance
  pause(): Promise<void>;      // Pause performance
  resume(): Promise<void>;     // Resume performance
  stop(): Promise<void>;       // Stop performance
  cleanup(): Promise<void>;    // Cleanup resources
  
  // Work-specific controls
  jumpToSection(sectionId: number): Promise<void>;
  adjustTempo(bpm: number): void;
  setEmergencyMode(enabled: boolean): void;
  
  // Event handlers
  onAudioInput?(input: AudioInputEvent): void;
  onTimingEvent?(event: TimingEvent): void;
  onUserAction?(action: UserAction): void;
}

// Work metadata structure
export interface WorkMetadata {
  title: string;
  composer: string;
  version: string;
  duration: string;          // "12:00" format
  instrumentation: string[]; // ["2 Horn", "1 Trombone", "Electronics"]
  description?: string;
  tags?: string[];
  created: Date;
  modified: Date;
}

// Section definition
export interface Section {
  id: number;
  name: string;
  duration: string;         // "2:00" format
  tempo: number;           // BPM
  timeSignature: [number, number]; // [4, 4]
  
  start(): Promise<void>;
  stop(): Promise<void>;
  onInstrumentTrigger(instrument: string): void;
  onTimingEvent(event: TimingEvent): void;
}
```

### Work Manager System

```typescript
// Work management system
export class WorkManager {
  private availableWorks = new Map<string, MusicalWork>();
  private currentWork: MusicalWork | null = null;
  private workStates = new Map<string, WorkState>();
  
  // Work loading and management
  async loadWork(workName: string): Promise<void>;
  async unloadWork(workName: string): Promise<void>;
  listAvailableWorks(): WorkMetadata[];
  
  // Performance control
  async startPerformance(workName: string): Promise<void>;
  async stopPerformance(): Promise<void>;
  async pausePerformance(): Promise<void>;
  async resumePerformance(): Promise<void>;
  
  // Work-specific controls
  async jumpToSection(sectionId: number): Promise<void>;
  adjustTempo(bpm: number): void;
  setEmergencyMode(enabled: boolean): void;
}
```

## 🎪 Studio Environment

### Launcher System
- **Work Selection**: Browse and select available musical works
- **Work Loading**: Dynamic loading of work modules
- **Configuration**: Per-work settings and preferences
- **Status Display**: Work status and system health

### Performance Monitor
- **Audio Monitoring**: Real-time audio system status
- **Visual Monitoring**: Rendering performance and frame rates
- **Timing Analysis**: Musical timing accuracy measurement
- **Resource Usage**: Memory, CPU, and system resource monitoring

### Emergency Controls
- **Emergency Stop**: Immediate halt of all audio and visual processing
- **Safe Mode**: Minimal functionality mode for troubleshooting
- **Quick Recovery**: Rapid system restart and work reloading
- **Manual Override**: Direct control of engine components

## 🚀 Implementation Strategy

### Phase 1: Framework Migration (Week 1)
1. **Create new directory structure**
2. **Move existing code to engine/ folder**
3. **Implement basic MusicalWork interface**
4. **Create WorkManager foundation**

### Phase 2: Acoustic Automaton Implementation (Week 2)
1. **Implement AcousticAutomaton work class**
2. **Create Section 1-3 implementations**
3. **Migrate work-specific audio processing**
4. **Implement work-specific visualizations**

### Phase 3: Studio Environment (Week 3)
1. **Implement work launcher**
2. **Add performance monitoring**
3. **Create emergency controls**
4. **Add development tools**

### Phase 4: Polish & Testing (Week 4)
1. **Comprehensive testing**
2. **Performance optimization**
3. **Documentation completion**
4. **Rehearsal preparation**

## 💡 Benefits of This Architecture

### For Development
- **Separation of Concerns**: Clear boundaries between engine and works
- **Reusability**: Engine components can be reused across multiple works
- **Maintainability**: Independent testing and development of components
- **Scalability**: Easy addition of new musical works

### For Performance
- **Reliability**: Isolated work logic reduces system-wide failures
- **Hot-swapping**: Potential for live work switching
- **Resource Management**: Better control over memory and CPU usage
- **Emergency Handling**: Robust emergency control systems

### For Future Works
- **Template System**: Standardized work creation process
- **Component Library**: Rich library of audio and visual components
- **Rapid Prototyping**: Quick implementation of new ideas
- **Community Sharing**: Potential for sharing works and components

## 🔧 Configuration Management

### Work Configuration Files
```json
// works/acoustic-automaton/config/metadata.json
{
  "title": "Acoustic Automaton / Automatonic Assembly",
  "composer": "yota105",
  "version": "1.0.0",
  "duration": "12:00",
  "instrumentation": ["2 Horn", "1 Trombone", "Electronics"],
  "description": "Live electronics work with spatial audio processing",
  "tags": ["live-electronics", "spatial-audio", "interactive"],
  "requirements": {
    "audioInputs": 3,
    "audioOutputs": 2,
    "visualDisplays": 1,
    "midiDevices": 0
  }
}

// works/acoustic-automaton/config/sections.json
{
  "sections": [
    {
      "id": 1,
      "name": "導入部",
      "duration": "2:00",
      "tempo": 120,
      "timeSignature": [4, 4],
      "description": "Single note staccato development with reverb sustain"
    },
    {
      "id": 2,
      "name": "動的移動",
      "duration": "2:00", 
      "tempo": 140,
      "timeSignature": [4, 4],
      "description": "Coordinate movement with pitch modulation"
    }
  ]
}
```

## 📚 Documentation Standards

Each work should include:
- **README.md**: Work overview and performance instructions
- **IMPLEMENTATION.md**: Technical implementation details
- **PERFORMANCE_NOTES.md**: Performance and rehearsal guidance
- **API.md**: Work-specific API documentation

## 🎯 Migration Path

### From Current Structure
```
Current: src/audio/, src/visualizers/, src/controller.ts
     ↓
Target:  src/engine/audio/, src/engine/visual/, src/studio/
```

### Compatibility Layer
During migration, maintain compatibility with existing code through adapter pattern until full migration is complete.

---

**Next Steps**: Begin Phase 1 implementation by creating the new directory structure and moving existing code into the engine/ folder.
