# Test Commands Reference

## Overview
All test functions have been moved to a console-based command system to keep the UI clean for performance use.

## Quick Start

```javascript
// Initialize audio system first
test("base-audio")

// Run musical time tests
test("musical-time")

// Test AudioWorklet performance
test("phase4-audioworklet")
```

## All Available Commands

### Core System Tests
```javascript
test("base-audio")        // 🔊 Initialize base audio system
test("musical-time")      // 🎼 Musical Time Manager initialization
```

### Performance Tests
```javascript
test("phase4-audioworklet")  // ⚡ AudioWorklet performance test
test("worklet-comparison")   // ⚔️ AudioWorklet vs Main Thread comparison
test("performance-monitor")  // 📊 Performance monitoring display
```

### Memory Management Tests
```javascript
test("memory-optimize")    // 🧠 Phase 4b memory optimization
test("stress-test")       // 🔥 Buffer pooling stress test
```

### Musical Time Manager Tests
```javascript
test("timing-test")       // ⏱️ Musical timing accuracy
test("beat-test")        // 🥁 Simple beat generation
test("mtm-performance")  // 🚀 MTM performance test
test("mtm-tempo")        // 🎵 MTM tempo test
test("mtm-complex")      // 🎼 MTM complex timing test
test("mtm-metronome")    // 🎯 MTM metronome test
```

## Helper Functions

```javascript
testList()    // List all available commands
testHelp()    // Show detailed help
```

## Quick Test Sequences

### Basic Audio Setup
```javascript
test("base-audio")
test("musical-time")
```

### Performance Validation
```javascript
test("performance-monitor")
test("phase4-audioworklet")
test("worklet-comparison")
```

### Memory Optimization
```javascript
test("memory-optimize")
test("stress-test")
```

## Phase 5 Performance Mode

For live performance, all test buttons are hidden. Only the essential "🔊 Enable Test Signals" button remains visible for quick audio initialization.

Access all other tests through the console for debugging and system validation during rehearsals.
