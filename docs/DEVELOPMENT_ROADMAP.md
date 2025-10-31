# Development Roadmap

## Project Status Overview

### Current Implementation Status (2025-08-20)

#### ✅ Completed Phases

##### Phase 1: Base Audio Architecture Separation
**Status**: ✅ **Complete**
- **Implementation**: `src/audio/audioCore.ts`
- **Key Features**:
  - Two-stage initialization: `ensureBaseAudio()` → `applyFaustDSP()`
  - DSP-independent audio functionality
  - Event-driven state management (`'audio-base-ready'`)
  - Backward compatibility with legacy `initAudio()`

##### Phase 2: TestSignalManager Integration
**Status**: ✅ **Complete**
- **Implementation**: `src/audio/testSignalManager.ts`
- **Key Features**:
  - Unified test signal API (tone/noise/impulse)
  - Direct Logic Input injection
  - Automatic routing management
  - Memory-efficient buffer caching
  - Click-noise prevention with proper envelopes

##### Phase 3: RoutingUI Integration
**Status**: ✅ **Complete**
- **Implementation**: `src/audio/routingUI.ts`
- **Key Features**:
  - TestSignalManager API adoption
  - Improved error handling for uninitialized audio
  - Temporary monitor activation with auto-restore
  - Enhanced user guidance and feedback

#### 🚧 Current Focus

##### Output Assignment & Routing Readiness
**Status**: 🚧 **Active** (2025-10-16)
- **Goal**: Deliver a dependable main/monitor output path so performers hear the right mix by default.
- **Focus Areas**:
  - BusManager extensions for explicit main and monitor buses
  - Early routing UI stub to expose assignment without full matrix editor
  - Sink device selection where available (`setSinkId` fallback strategy)
- **Tasks**:
  - [ ] Stand up interim main/monitor bus objects in `BusManager`
  - [ ] Auto-connect Faust output to the main bus and route monitors based on performer defaults
  - [ ] Surface routing configuration in Controller UI for smoke testing
  - [ ] Draft migration notes for downstream Output Routing System work

##### Play Button → Audible Playback
**Status**: 🚧 **Active** (2025-10-16)
- **Goal**: Guarantee that pressing the Player/Controller play button produces audible output every time.
- **Focus Areas**:
  - CompositionPlayer initialization on all control surfaces
  - Audio engine readiness handshake before playback triggers
  - End-to-end verification (Player request → audio emission)
- **Tasks**:
  - [ ] Ensure `CompositionPlayer` boots on Controller flows that dispatch playback
  - [ ] Block playback UI until `audio-base-ready` and Faust routing confirm
  - [ ] Add integration test or manual checklist for play button smoke tests
  - [ ] Document troubleshooting guidance in `PLAYER_PLAYBACK_CONTROL.md`

##### Input Connection Stabilization & Cross-Page State Sync
**Status**: 🚧 **In Planning** (2025-10-15)
- **Goal**: Fix unstable input connections and enable seamless state sharing between Performance/Controller
- **Documentation**: [CROSS_PAGE_STATE_SYNC.md](./CROSS_PAGE_STATE_SYNC.md)
- **Problem 1**: Logic Input device connections are unstable
  - Devices connect/disconnect inconsistently
  - Channel selection unreliable
  - No retry logic for connection failures
- **Problem 2**: Performance and Controller don't share configuration
  - Settings reset on page transitions
  - Audio stops when navigating between pages
  - No persistent state management
- **Tasks**:
  - [ ] Implement ConnectionManager with request queuing
  - [ ] Add retry logic for getUserMedia failures
  - [ ] Improve permission error handling
  - [ ] Create SharedStateManager with localStorage persistence
  - [ ] Implement BroadcastChannel for cross-page synchronization
  - [ ] Enable seamless audio continuation across page transitions

##### Work-Centered Architecture Migration
**Status**: 🚧 **Planning** (2025-08-24)
- **Goal**: Separate universal engine from musical compositions
- **Documentation**: [WORK_ARCHITECTURE.md](./WORK_ARCHITECTURE.md)
- **Actions**:
  - Create `engine/`, `works/`, `studio/` structure
  - Implement MusicalWork interface framework
  - Migrate existing code to engine foundation
  - Create Acoustic Automaton work implementation

##### Documentation Standardization
**Status**: ✅ **Complete**
- **Goal**: Ensure consistency across all documentation files
- **Actions**:
  - Consolidate implementation status across docs
  - Create feature-specific documentation
  - Update README to reflect current capabilities
  - Establish documentation maintenance workflow

### Upcoming Development Phases

#### Phase 4: Performance Optimization
**Priority**: 🔥 **High**
**Timeline**: Q3 2025

##### AudioWorklet Migration
- **Goal**: Reduce audio latency from ~20ms to <10ms
- **Tasks**:
  - Migrate TestSignalManager to AudioWorklet
  - Implement AudioWorklet-based effect processing
  - Optimize buffer management
- **Benefits**: Lower latency, improved CPU efficiency

##### Memory Optimization
- **Goal**: Reduce memory usage from ~150MB to <100MB
- **Tasks**:
  - Optimize Faust WebAssembly loading
  - Implement smart buffer recycling
  - Reduce duplicate audio nodes

#### Phase 5: Advanced Audio Features
**Priority**: � **Critical** *(priority raised 2025-10-16)*
**Timeline**: Q4 2025

##### Output Routing System
**Status**: � **In Progress** (spec complete 2025-10-15, implementation accelerated 2025-10-16)
- **Goal**: Flexible multi-output routing for main and monitor mixes
- **Documentation**: [OUTPUT_ROUTING_REQUIREMENTS.md](./OUTPUT_ROUTING_REQUIREMENTS.md)
- **Features**:
  - Main Output (stereo, audience-facing)
  - Monitor Outputs x3 (performer foldback + click)
  - Routing matrix UI in Logic Inputs panel
  - MonitorMixerMatrix for automatic performer mix creation
- **Tasks**:
  - [ ] Extend BusManager with mainOutput and monitorOutputs
  - [ ] Implement MonitorMixerMatrix class
  - [ ] Create RoutingMatrixUI component
  - [ ] Integrate with Track system
  - [ ] Support output device assignment (setSinkId)

##### MIDI Synchronization
- **Goal**: DAW integration and external device sync
- **Features**:
  - MIDI clock send/receive
  - MIDI CC parameter mapping
  - Transport control (play/stop/record)
- **Implementation**: `src/audio/midiSync.ts`

##### Recording System
- **Goal**: High-quality audio recording and export
- **Features**:
  - Multi-track recording
  - Real-time mixdown
  - Export formats: WAV, MP3, FLAC
- **Implementation**: `src/audio/recordingManager.ts`

#### Phase 6: Multi-Device Synchronization
**Priority**: 🟡 **Medium**
**Timeline**: Q1 2026

##### Network Audio Synchronization
- **Technologies**: WebRTC, WebSocket
- **Features**:
  - Multiple device coordination
  - Network latency compensation
  - Distributed performance capabilities

#### Phase 7: Live DSP Development
**Priority**: 🟡 **Medium**
**Timeline**: Q2 2026

##### Real-time Faust Compilation
- **Goal**: Live coding capabilities
- **Features**:
  - In-browser Faust compilation
  - Hot-swapping of DSP modules
  - Live parameter tweaking
- **Implementation**: Browser-based Faust compiler integration

### Visualization System Roadmap

#### Current Status
- ✅ Multi-window support
- ✅ Three.js 3D visualization
- ✅ p5.js creative coding integration
- ✅ Audio-reactive visualizations

#### Planned Enhancements

##### Advanced Visualization Features
- **VR/AR Support**: WebXR integration for immersive experiences
- **AI-Generated Visuals**: Machine learning-driven visual generation
- **Collaborative Visuals**: Multi-user visual sessions

##### Performance Improvements
- **WebGPU Migration**: Next-generation graphics API adoption
- **Shader Optimization**: Custom shader development for audio reactivity
- **Frame Rate Optimization**: 120fps+ target for high-refresh displays

### Technical Debt and Refactoring

#### Priority Refactoring Tasks

##### Code Organization
- **Module Boundaries**: Clear separation of concerns
- **Type Safety**: Complete TypeScript coverage
- **Error Handling**: Consistent error management strategy

##### Testing Infrastructure
- **Unit Tests**: Comprehensive test coverage for audio modules
- **Integration Tests**: End-to-end audio flow testing
- **Performance Tests**: Automated latency and memory benchmarks

### Platform Expansion

#### Desktop Enhancements
- **Native Audio APIs**: ASIO, CoreAudio, ALSA integration
- **Hardware Integration**: Dedicated audio interface support
- **Plugin System**: VST3/AU plugin hosting

#### Mobile Support
- **iOS/Android**: Tauri mobile platform support
- **Touch Interface**: Mobile-optimized UI
- **Background Audio**: Continued audio processing when backgrounded

### Community and Ecosystem

#### Open Source Strategy
- **Plugin Architecture**: Third-party effect/synthesizer development
- **Template Distribution**: Reusable project templates
- **Community Presets**: Shared DSP and visualization presets

#### Documentation and Education
- **Tutorial Series**: Progressive learning materials
- **API Documentation**: Comprehensive developer reference
- **Video Tutorials**: Visual learning resources

### Success Metrics

#### Performance Targets
- **Latency**: <5ms end-to-end (current: ~20ms)
- **CPU Usage**: <10% average (current: ~25%)
- **Memory**: <75MB average (current: ~150MB)
- **Frame Rate**: 60fps+ consistent (visualization)

#### User Experience Goals
- **Startup Time**: <2 seconds to audio-ready
- **UI Responsiveness**: <16ms for all interactions
- **Crash Rate**: <0.1% (target: zero critical crashes)

#### Community Metrics
- **GitHub Stars**: 1000+ (current: TBD)
- **Active Contributors**: 10+ regular contributors
- **Plugin Ecosystem**: 50+ community-created plugins

### Risk Assessment

#### Technical Risks
- **Browser Compatibility**: Web Audio API evolution
- **Performance Limitations**: Browser-based audio processing limits
- **Platform Differences**: OS-specific audio behavior

#### Mitigation Strategies
- **Progressive Enhancement**: Graceful degradation for unsupported features
- **Native Fallbacks**: Tauri-based native audio processing
- **Comprehensive Testing**: Cross-platform automated testing

### Conclusion

This roadmap represents an ambitious but achievable path toward creating a world-class audio-visual application. The strong foundation established in Phases 1-3 provides a solid base for advanced features and optimizations.

Regular roadmap reviews (quarterly) will ensure alignment with community needs and technological advances.
