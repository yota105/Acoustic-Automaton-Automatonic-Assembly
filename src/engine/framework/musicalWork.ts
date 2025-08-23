/**
 * Musical Work Framework
 * Core interfaces for work-centered architecture
 */

// Event types for work communication
export interface AudioInputEvent {
  channel: string;           // 'horn1', 'horn2', 'trombone'
  frequency?: number;        // Detected frequency (if available)
  amplitude: number;         // Input amplitude
  timestamp: number;         // High-precision timestamp
  rawData?: Float32Array;    // Raw audio data
}

export interface TimingEvent {
  type: 'beat' | 'measure' | 'section-change' | 'tempo-change';
  timestamp: number;
  data: any;
}

export interface UserAction {
  type: string;
  target?: string;
  data?: any;
  timestamp: number;
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
  requirements?: {
    audioInputs: number;
    audioOutputs: number;
    visualDisplays: number;
    midiDevices: number;
  };
}

// Section definition interface
export interface Section {
  id: number;
  name: string;
  duration: string;         // "2:00" format
  tempo: number;           // BPM
  timeSignature: [number, number]; // [4, 4]
  description?: string;
  
  // Lifecycle methods
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  
  // Event handlers
  onInstrumentTrigger(instrument: string): void;
  onTimingEvent(event: TimingEvent): void;
}

// Work state enumeration
export enum WorkState {
  UNLOADED = 'unloaded',
  LOADING = 'loading',
  READY = 'ready',
  PREPARING = 'preparing',
  PERFORMING = 'performing',
  PAUSED = 'paused',
  STOPPING = 'stopping',
  ERROR = 'error'
}

// Main Musical Work interface
export interface MusicalWork {
  readonly metadata: WorkMetadata;
  readonly sections: Section[];
  readonly state: WorkState;
  
  // Lifecycle methods
  load(): Promise<void>;       // Load work resources
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
  getCurrentSection(): Section | null;
  
  // Event handlers (optional)
  onAudioInput?(input: AudioInputEvent): void;
  onTimingEvent?(event: TimingEvent): void;
  onUserAction?(action: UserAction): void;
  
  // State change callback
  onStateChange?(oldState: WorkState, newState: WorkState): void;
}

// Base Section implementation
export abstract class BaseSection implements Section {
  constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly duration: string,
    public readonly tempo: number,
    public readonly timeSignature: [number, number],
    public readonly description?: string
  ) {}
  
  protected isActive = false;
  
  async start(): Promise<void> {
    console.log(`🎵 Starting Section ${this.id}: ${this.name}`);
    this.isActive = true;
    await this.onStart();
  }
  
  async stop(): Promise<void> {
    console.log(`⏹️ Stopping Section ${this.id}: ${this.name}`);
    this.isActive = false;
    await this.onStop();
  }
  
  async pause(): Promise<void> {
    console.log(`⏸️ Pausing Section ${this.id}: ${this.name}`);
    await this.onPause();
  }
  
  async resume(): Promise<void> {
    console.log(`▶️ Resuming Section ${this.id}: ${this.name}`);
    await this.onResume();
  }
  
  // Abstract methods for subclasses to implement
  protected abstract onStart(): Promise<void>;
  protected abstract onStop(): Promise<void>;
  protected abstract onPause(): Promise<void>;
  protected abstract onResume(): Promise<void>;
  
  // Default implementations (can be overridden)
  onInstrumentTrigger(instrument: string): void {
    console.log(`🎺 Instrument trigger: ${instrument} in ${this.name}`);
  }
  
  onTimingEvent(event: TimingEvent): void {
    console.log(`⏱️ Timing event: ${event.type} in ${this.name}`);
  }
}

// Work configuration interface
export interface WorkConfig {
  autoStart?: boolean;
  emergencyMode?: boolean;
  debugMode?: boolean;
  performanceMode?: boolean;
}
