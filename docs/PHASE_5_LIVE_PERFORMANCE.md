# Phase 5: Live Electronics Performance System

**Status**: 🚧 **Active Development**  
**Priority**: 🔥 **Critical - Rehearsal Deadline**  
**Start Date**: 2025-08-23  
**Target Rehearsal**: ASAP  

## 🎯 Mission Critical Goals

### 🚨 **Immediate Requirements (仮リハーサル対応)**
- **✅ 動作確認**: プログラムが安定して動作する
- **🎛️ ライブミキシング**: UR22C 2入力 + 内部音源 → ステレオ出力
- **🎵 リアルタイム音響生成**: 動的計算によるライブエレクトロニクス
- **🔧 現地テスト対応**: 簡単な設定変更とデバッグ機能

### 🎪 **Performance Setup**
```
[UR22C Input 1] ──┐
[UR22C Input 2] ──┼─► [Software Mixer] ──► [Effects Chain] ──► [Stereo Out]
[Internal Synth] ──┘                      [Real-time DSP]
```

## 🎵 **Composition Implementation: Sections 1-3 (2 minutes)**

### **🎪 Acoustic Automaton / Automatonic Assembly**
**Target**: First 2 minutes (Sections 1-3) for rehearsal testing

#### **Section 1: Introduction**
**Audio Processing**:
- **Input**: 3 instruments (2 Horn + 1 Trombone) - B4 staccato detection (no pitch detection initially)
- **Reverb**: Compact reverb, minimal spread
- **Sustain Mechanism**: Natural decay transition to sustain (experimentation needed)
- **Electronic Synthesis**: Random/manual generation timing (selectable for testing)
- **Instance Management**: Audio object accumulation and persistence

**Visual Processing**:
- **3-Panel Split**: Vertical screen division for instrument correspondence
- **Flash Decay**: White flash on instrument trigger, various decay curves for testing
- **Axis Lines**: Thin white lines, future color implementation planned
- **Instance Generation**: Starting from (0,0,0) coordinates
- **Technology**: P5.js with 3D coordinate system, screen-size based

#### **Section 2: Dynamic Movement**
**Audio Processing**:
- **Coordinate Movement**: Numerical control with physics simulation planning
- **Pitch Modulation**: Coordinate-linked pitch changes
- **Panning**: Coordinate-based stereo positioning

**Visual Processing**:
- **Point Movement**: Dynamic coordinate animation
- **3D Rendering**: P5.js WebGL implementation

#### **Section 3: Rotation & Intensification**
**Audio Processing**:
- **Spatial Rotation**: 3D coordinate transformation affecting all pitches
- **Free Pitch Input**: Arbitrary performer pitch mixing (no detection constraint)
- **Intensity Increase**: Instance count and volume scaling
- **Randomness Control**: Distribution manipulation and spread control

**Visual Processing**:
- **Space Rotation**: Full 3D environment rotation
- **4D Space Exploration**: Pseudo-4D rendering feasibility testing

## 🛠️ **Technical Implementation Strategy**

### **Core System Architecture**
```typescript
interface CompositionEngine {
  // Audio Management
  audioInstances: AudioInstance[];
  reverbProcessor: ReverbNode;
  spatialPanner: SpatialAudioManager;
  
  // Visual Management  
  visualRenderer: P5Renderer;
  coordinateSpace: CoordinateSystem3D;
  
  // Section Control
  currentSection: number;
  sectionTimer: Timer;
  
  // Testing Interface
  manualTriggers: ManualControlPanel;
  parameterExperimentation: ParameterTestSuite;
}

class AudioInstance {
  id: string;
  coordinates: [number, number, number];
  pitch: number;
  amplitude: number;
  sustainNode: AudioNode;
  panNode: PannerNode;
  
  updatePosition(x: number, y: number, z: number): void;
  modifyPitch(factor: number): void;
  fadeToSustain(): void;
}

class SpatialAudioManager {
  updatePanning(instance: AudioInstance): void;
  apply3DRotation(angle: number, axis: 'x' | 'y' | 'z'): void;
  distributeRandomly(instances: AudioInstance[], spread: number): void;
}
```

### **P5.js Visual System**
```javascript
class VisualRenderer {
  setup() {
    createCanvas(windowWidth, windowHeight, WEBGL);
    // 3-panel vertical division setup
    this.setupCoordinateSystem();
  }
  
  draw() {
    // Section-based rendering
    this.renderSection(currentSection);
    this.updateInstanceVisuals();
    this.renderAxisLines();
  }
  
  triggerFlash(instrumentIndex, decayType) {
    // White flash with configurable decay curves
  }
  
  updateCoordinates(instances) {
    // 3D coordinate movement with future 4D exploration
  }
}
```

## 📋 Implementation Roadmap

### **Phase 5a: Core Live System (Priority: 🔥 Critical)**
**Timeline**: 1-2 weeks  
**Goal**: 仮リハーサル用最小限動作システム

#### 5a.1: Input Management System
- [x] **UR22C Integration**: Existing audio system ready ✅
- [ ] **Virtual 3rd Input**: Internal synthesizer as 3rd source
- [ ] **Input Level Monitoring**: Real-time level meters
- [ ] **Emergency Input Switching**: Backup input routing

#### 5a.2: Software Mixer Core
```typescript
interface LiveMixer {
  inputs: {
    input1: AudioInput;     // UR22C Left
    input2: AudioInput;     // UR22C Right  
    internal: AudioInput;   // Internal synth
  };
  
  channels: {
    setGain(channel: number, gain: number): void;
    setPan(channel: number, pan: number): void;
    setSolo(channel: number, solo: boolean): void;
    setMute(channel: number, mute: boolean): void;
  };
  
  effects: {
    addEffect(channel: number, effect: DSPEffect): void;
    bypassEffect(effectId: string, bypass: boolean): void;
  };
  
  master: {
    setMasterGain(gain: number): void;
    enableLimiter(enable: boolean): void;
  };
}
```

#### 5a.3: Real-time Audio Generation
- [ ] **Dynamic Sound Synthesis**: Faust-based real-time generation
- [ ] **Parameter Control**: Live parameter automation
- [ ] **Preset Management**: Quick sound switching
- [ ] **Performance Automation**: Timeline-based control

#### 5a.4: Live Control Interface
- [ ] **Emergency UI**: Large, touch-friendly controls
- [ ] **Performance Monitoring**: CPU, Audio dropouts, Latency
- [ ] **Quick Settings**: Gain, Effects on/off, Emergency stop
- [ ] **Visual Feedback**: Level meters, Status indicators

### **Phase 5b: Rehearsal Support Tools (Priority: 🟡 Medium)**
**Timeline**: Parallel development  
**Goal**: リハーサル効率化

#### 5b.1: Testing & Debugging
- [ ] **Audio Path Visualization**: Signal flow diagram
- [ ] **Performance Diagnostics**: Real-time system health
- [ ] **Recording Capability**: Rehearsal recording for review
- [ ] **Emergency Recovery**: Auto-restart, Safe mode

#### 5b.2: Venue Adaptation
- [ ] **Audio Settings Profiles**: Different venue configurations
- [ ] **Latency Compensation**: Room delay adjustment
- [ ] **Monitor Setup**: Headphone/speaker switching
- [ ] **Mobile Control**: Tablet/phone remote control

## 🛠️ Technical Architecture

### **Core Audio Pipeline**
```typescript
// Live Performance Audio Graph
class LivePerformanceEngine {
  private inputNodes: Map<string, AudioNode> = new Map();
  private mixerChannels: MixerChannel[] = [];
  private effectsChain: EffectsProcessor;
  private masterOutput: AudioDestinationNode;
  
  async initialize() {
    // Initialize UR22C inputs
    await this.setupAudioInputs();
    
    // Create internal synthesizer
    await this.createInternalSynth();
    
    // Setup mixer channels
    this.createMixerChannels();
    
    // Initialize effects processing
    await this.initializeEffects();
  }
  
  startPerformance() {
    // Start real-time processing
    this.connectAudioGraph();
    this.startAutomation();
    this.enableMonitoring();
  }
}
```

### **Mixer Channel Implementation**
```typescript
class MixerChannel {
  private inputGain: GainNode;
  private panNode: StereoPannerNode;
  private effectsChain: AudioNode[];
  private outputGain: GainNode;
  
  constructor(
    context: AudioContext,
    input: AudioNode,
    channelId: string
  ) {
    this.setupSignalChain(context, input);
  }
  
  setGain(value: number) {
    this.inputGain.gain.setValueAtTime(value, this.context.currentTime);
  }
  
  addEffect(effect: AudioNode) {
    this.insertEffect(effect);
  }
}
```

### **Emergency Features**
```typescript
interface EmergencyControls {
  // Panic button - stop all audio immediately
  emergencyStop(): void;
  
  // Safe restart with minimal setup
  safeRestart(): Promise<void>;
  
  // Bypass all effects, direct signal path
  bypassAllEffects(): void;
  
  // Switch to backup audio configuration
  activateBackupConfig(): void;
}
```

## 🧪 Testing Strategy

### **Pre-Rehearsal Testing Checklist**
- [ ] **Audio Input Test**: UR22C both inputs working
- [ ] **Latency Test**: Acceptable real-time performance
- [ ] **Mixer Test**: All channels, panning, effects
- [ ] **Internal Synth Test**: Sound generation working
- [ ] **Performance Test**: 30+ minute stability test
- [ ] **Emergency Test**: Panic buttons, recovery procedures

### **Rehearsal Day Workflow**
1. **🔧 Setup (15 min)**
   - Connect UR22C
   - Test inputs 1 & 2
   - Verify output levels
   
2. **🎵 Sound Check (20 min)**
   - Input level adjustment
   - Internal synth test
   - Effects chain test
   - Master output adjustment
   
3. **🎭 Performance Test (30+ min)**
   - Full performance simulation
   - Monitor system stability
   - Test emergency controls
   
4. **📝 Documentation (10 min)**
   - Note any issues
   - Record settings that work
   - Plan improvements

### **Emergency Procedures**
- **Audio Dropout**: Emergency stop → Safe restart
- **High CPU**: Disable non-essential effects
- **Input Problems**: Switch to internal-only mode
- **System Crash**: Quick restart with backup configuration

## 📊 Success Metrics

### **Minimum Viable Performance**
- [ ] **Stability**: No crashes during 30+ min operation
- [ ] **Latency**: <50ms total system latency (acceptable for live electronics)
- [ ] **Audio Quality**: No dropouts, artifacts, or distortion
- [ ] **Control Responsiveness**: UI controls respond within 100ms

### **Ideal Performance Targets**
- [ ] **Professional Latency**: <25ms (leveraging Phase 4 AudioWorklet)
- [ ] **Extended Stability**: 2+ hours continuous operation
- [ ] **Performance Monitoring**: Real-time system health display
- [ ] **Quick Recovery**: <30 seconds from crash to operational

## 🚨 Risk Mitigation

### **High-Risk Areas**
1. **UR22C Driver Issues**: Test thoroughly, have backup audio device
2. **Real-time Processing**: CPU spikes during complex calculations
3. **Browser Audio Limitations**: Memory leaks, garbage collection pauses
4. **Venue Environment**: Unknown audio hardware, network issues

### **Backup Plans**
1. **Audio Hardware**: USB audio device backup, built-in audio fallback
2. **Performance Mode**: Simplified effects, pre-rendered sections
3. **Platform Backup**: Standalone application option
4. **Manual Override**: Direct parameter control, bypass automation

## 📅 Development Schedule

### **Week 1: Core Implementation**
- **Day 1-2**: Software mixer implementation
- **Day 3-4**: Internal synthesizer integration
- **Day 5-6**: Live control interface
- **Day 7**: Testing and debugging

### **Week 2: Rehearsal Preparation**
- **Day 1-2**: Performance optimization
- **Day 3-4**: Emergency features and recovery
- **Day 5-6**: Comprehensive testing
- **Day 7**: Documentation and setup procedures

### **Rehearsal Week**
- **Setup and testing**
- **Performance simulation**
- **Issue identification and quick fixes**
- **Documentation of working configurations**

## 🎯 Post-Rehearsal Evolution

Based on rehearsal results:
- **Phase 5c**: Enhanced performance features
- **Phase 5d**: Advanced live control systems
- **Phase 6**: Full production-ready system

## 📝 Documentation Requirements

- [ ] **Setup Guide**: Step-by-step UR22C configuration
- [ ] **Performance Manual**: Live operation procedures
- [ ] **Troubleshooting Guide**: Common issues and solutions
- [ ] **Emergency Procedures**: Quick reference for problems
- [x] **Test Commands Reference**: Console-based testing system ([TEST_COMMANDS.md](./TEST_COMMANDS.md))

## 🧪 Development Testing

All test functions have been moved to a console-based command system for clean UI:

### Quick Start Testing
```javascript
test("base-audio")        // Initialize audio system
test("musical-time")      // Setup musical timing
test("phase4-audioworklet") // Test performance system
```

### Available Commands
- `testHelp()` - Show detailed help
- `testList()` - List all commands  
- `test("command-name")` - Execute specific test

See [TEST_COMMANDS.md](./TEST_COMMANDS.md) for complete reference.

---

**Note**: This phase prioritizes **working over perfect**. The goal is a stable, testable system for rehearsal validation, with refinement happening in subsequent iterations based on real-world testing feedback.
