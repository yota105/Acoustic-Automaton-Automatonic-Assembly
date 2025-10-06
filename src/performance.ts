/**
 * Performance Page - Acoustic Automaton Live Electronics Performance System
 * 
 * 作品用メインパフォーマンスページのコントロールシステム
 * Phase 5 Live Electronics Performance System
 */

// Performance state management
interface PerformanceState {
  isPlaying: boolean;
  isPaused: boolean;
  startTime: number | null;
  elapsedTime: number;
  activeTracks: number;
}

class PerformanceController {
  private state: PerformanceState = {
    isPlaying: false,
    isPaused: false,
    startTime: null,
    elapsedTime: 0,
    activeTracks: 0
  };

  private logElement: HTMLElement | null = null;
  private updateInterval: number | null = null;

  constructor() {
    this.initializeUI();
    this.setupEventListeners();
    this.startTimeUpdater();
    this.log('🎪 Performance Controller initialized');
  }

  private initializeUI(): void {
    this.logElement = document.getElementById('log-output');
    this.updateStatusDisplay();
  }

  private setupEventListeners(): void {
    // Play button
    const playBtn = document.getElementById('play-btn');
    playBtn?.addEventListener('click', () => this.handlePlay());

    // Pause button
    const pauseBtn = document.getElementById('pause-btn');
    pauseBtn?.addEventListener('click', () => this.handlePause());

    // Stop button
    const stopBtn = document.getElementById('stop-btn');
    stopBtn?.addEventListener('click', () => this.handleStop());

    // Reset button
    const resetBtn = document.getElementById('reset-btn');
    resetBtn?.addEventListener('click', () => this.handleReset());

    this.log('🎛️ Event listeners registered');
  }

  private handlePlay(): void {
    this.log('▶️ Play button pressed');
    
    if (!this.state.isPlaying) {
      if (this.state.isPaused) {
        // Resume from pause
        this.state.isPaused = false;
        this.state.isPlaying = true;
        this.log('⏯️ Resuming performance from pause');
      } else {
        // Start new performance
        this.state.isPlaying = true;
        this.state.startTime = Date.now();
        this.state.elapsedTime = 0;
        this.log('🚀 Starting new performance');
      }

      // TODO: Phase 5 integration
      this.log('🎵 [TODO] Initialize TrackManager');
      this.log('🎛️ [TODO] Initialize LiveMixer');
      this.log('🥁 [TODO] Start Click Track');
      this.log('🎹 [TODO] Initialize Internal Synthesizer');
      
      this.updateStatusDisplay();
    } else {
      this.log('⚠️ Performance is already playing');
    }
  }

  private handlePause(): void {
    this.log('⏸️ Pause button pressed');
    
    if (this.state.isPlaying && !this.state.isPaused) {
      this.state.isPaused = true;
      this.state.isPlaying = false;
      this.log('⏸️ Performance paused');
      
      // TODO: Phase 5 integration
      this.log('🔇 [TODO] Mute all tracks');
      this.log('⏱️ [TODO] Pause MusicalTimeManager');
      this.log('🎛️ [TODO] Save current mixer state');
      
      this.updateStatusDisplay();
    } else if (this.state.isPaused) {
      this.log('⚠️ Performance is already paused');
    } else {
      this.log('⚠️ Cannot pause - performance is not playing');
    }
  }

  private handleStop(): void {
    this.log('⏹️ Stop button pressed');
    
    if (this.state.isPlaying || this.state.isPaused) {
      this.state.isPlaying = false;
      this.state.isPaused = false;
      this.log('🛑 Performance stopped');
      
      // TODO: Phase 5 integration
      this.log('🔇 [TODO] Stop all audio processing');
      this.log('🎛️ [TODO] Reset LiveMixer to default state');
      this.log('⏹️ [TODO] Stop MusicalTimeManager');
      this.log('🎹 [TODO] Reset Internal Synthesizer');
      
      this.updateStatusDisplay();
    } else {
      this.log('⚠️ Performance is not currently running');
    }
  }

  private handleReset(): void {
    this.log('🔄 Reset button pressed');
    
    // Reset all state
    this.state.isPlaying = false;
    this.state.isPaused = false;
    this.state.startTime = null;
    this.state.elapsedTime = 0;
    this.state.activeTracks = 0;
    
    this.log('🔄 Performance system reset');
    
    // TODO: Phase 5 integration
    this.log('🗑️ [TODO] Dispose all TrackManager tracks');
    this.log('🔄 [TODO] Reset LiveMixer to initial state');
    this.log('⏰ [TODO] Reset MusicalTimeManager');
    this.log('🎹 [TODO] Reset Internal Synthesizer parameters');
    this.log('🧹 [TODO] Clear audio buffers');
    
    this.updateStatusDisplay();
    this.log('✅ System ready for new performance');
  }

  private startTimeUpdater(): void {
    this.updateInterval = window.setInterval(() => {
      if (this.state.isPlaying && this.state.startTime) {
        this.state.elapsedTime = Date.now() - this.state.startTime;
        this.updateStatusDisplay();
      }
    }, 100); // Update every 100ms
  }

  private updateStatusDisplay(): void {
    // Performance State
    const stateElement = document.getElementById('performance-state');
    if (stateElement) {
      if (this.state.isPlaying) {
        stateElement.textContent = 'Playing';
        stateElement.style.color = '#4CAF50';
      } else if (this.state.isPaused) {
        stateElement.textContent = 'Paused';
        stateElement.style.color = '#FF9800';
      } else {
        stateElement.textContent = 'Stopped';
        stateElement.style.color = '#f44336';
      }
    }

    // Elapsed Time
    const timeElement = document.getElementById('elapsed-time');
    if (timeElement) {
      const minutes = Math.floor(this.state.elapsedTime / 60000);
      const seconds = Math.floor((this.state.elapsedTime % 60000) / 1000);
      timeElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Active Tracks
    const tracksElement = document.getElementById('active-tracks');
    if (tracksElement) {
      tracksElement.textContent = this.state.activeTracks.toString();
    }

    // Audio Status
    const audioElement = document.getElementById('audio-status');
    if (audioElement) {
      if (this.state.isPlaying) {
        audioElement.textContent = 'Active';
        audioElement.style.color = '#4CAF50';
      } else {
        audioElement.textContent = 'Ready';
        audioElement.style.color = '#607D8B';
      }
    }
  }

  private log(message: string): void {
    const now = new Date();
    const timestamp = now.toTimeString().split(' ')[0];
    const logMessage = `[${timestamp}] ${message}`;
    
    console.log(logMessage);
    
    if (this.logElement) {
      this.logElement.innerHTML += logMessage + '<br>';
      this.logElement.scrollTop = this.logElement.scrollHeight;
    }
  }

  // Public API for Phase 5 integration
  public getState(): PerformanceState {
    return { ...this.state };
  }

  public setActiveTracks(count: number): void {
    this.state.activeTracks = count;
    this.updateStatusDisplay();
    this.log(`🎵 Active tracks updated: ${count}`);
  }

  public dispose(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.log('🗑️ Performance Controller disposed');
  }
}

// Global performance controller instance
let performanceController: PerformanceController;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  performanceController = new PerformanceController();
  
  // Make it globally accessible for integration
  (window as any).performanceController = performanceController;
  
  console.log('🎪 Acoustic Automaton Performance System ready');
  console.log('🎯 Phase 5 integration points prepared');
});

// Export for module integration
export { PerformanceController };
export type { PerformanceState };
