/**
 * Performance Page - Acoustic Automaton Live Electronics Performance System
 * 
 * 作品用メインパフォーマンスページのコントロールシステム
 * Phase 5 Live Electronics Performance System
 */

import { CompositionPlayer } from './performance/compositionPlayer';
import { ensureBaseAudio, applyFaustDSP } from './engine/audio/core/audioCore';
import { composition } from './works/composition';
import { setupAudioControlPanels } from './ui/audioControlPanels';
import { applyAuthGuard } from './auth/authGuard';
import { createTrackEnvironment, listTracks } from './engine/audio/core/tracks';

// 認証ガードを最初に適用
applyAuthGuard();

type MasterFxJob = { action: 'add' | 'remove' | 'move' | 'bypass' | 'clear'; payload?: any };

const masterFxQueue: MasterFxJob[] = [];

function enqueueMasterFx(job: MasterFxJob) {
  if ((window as any).busManager?.enqueueFxOp) {
    (window as any).busManager.enqueueFxOp(job.action, job.payload);
  } else {
    masterFxQueue.push(job);
    console.log('[Performance MasterFXQueue] queued', job);
  }
}

document.addEventListener('audio-engine-initialized', () => {
  if (!(window as any).busManager) return;
  if (!masterFxQueue.length) return;

  console.log('[Performance MasterFXQueue] flushing', masterFxQueue.length);
  masterFxQueue.splice(0).forEach(job => {
    (window as any).busManager.enqueueFxOp(job.action, job.payload);
  });
  (window as any).busManager.flushFxOps?.();
});

// Performance state management
interface PerformanceState {
  isPlaying: boolean;
  isPaused: boolean;
  startTime: number | null;
  elapsedTime: number;
  activeTracks: number;
  currentSection: string | null;
  currentBar: number;
  currentBeat: number;
  currentTempo: number;
  sectionElapsedTime: number;  // セクション内経過時間
}

class PerformanceController {
  private state: PerformanceState = {
    isPlaying: false,
    isPaused: false,
    startTime: null,
    elapsedTime: 0,
    activeTracks: 0,
    currentSection: null,
    currentBar: 1,
    currentBeat: 1,
    currentTempo: 60,
    sectionElapsedTime: 0
  };

  private logElement: HTMLElement | null = null;
  private updateInterval: number | null = null;
  private compositionPlayer: CompositionPlayer | null = null;
  private audioContext: AudioContext | null = null;
  private isStarting: boolean = false;
  private sectionStartTimestamp: number | null = null;
  private lastBroadcastSectionId: string | null = null;
  private lastBroadcastSectionName: string = '';
  private lastBroadcastElapsedSeconds: number | null = null;

  constructor() {
    this.initializeUI();
    this.setupEventListeners();
    this.startTimeUpdater();
    this.log('🎪 Performance Controller initialized');
  }

  private initializeUI(): void {
    this.logElement = document.getElementById('log-output');

    // セクション選択を動的に生成
    this.populateSectionSelect();

    this.updateStatusDisplay();
  }

  /**
   * セクション選択ドロップダウンを作成
   */
  private populateSectionSelect(): void {
    const sectionSelect = document.getElementById('section-select') as HTMLSelectElement;
    if (!sectionSelect) return;

    const sections = composition.sections ?? [];

    sectionSelect.innerHTML = '<option value="">-- Select Section (or start from beginning) --</option>';

    sections.forEach(section => {
      const option = document.createElement('option');
      option.value = section.id;
      option.textContent = section.name ?? section.id;
      sectionSelect.appendChild(option);
    });

    const firstSectionId = this.getFirstSectionId();
    if (firstSectionId) {
      sectionSelect.value = firstSectionId;
      this.state.currentSection = firstSectionId;
      this.state.sectionElapsedTime = 0;
      this.updateStatusDisplay();
    }
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

  private async ensureAudioEngineReady(): Promise<void> {
    if (!this.audioContext) {
      this.log('🔧 Initializing Audio System...');
      await ensureBaseAudio();
      const globalAudio = window as any;
      this.audioContext = globalAudio.audioCtx || globalAudio.audioContext || null;
      if (globalAudio.audioCtx && !globalAudio.audioContext) {
        globalAudio.audioContext = globalAudio.audioCtx;
      }
      if (!this.audioContext) {
        throw new Error('AudioContext initialization failed');
      }
    }

    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (error) {
        this.log(`⚠️ AudioContext resume failed: ${(error as Error).message}`);
      }
    }

    if (!window.faustNode) {
      this.log('🎚️ Loading Faust DSP for playback...');
      await applyFaustDSP();
    }

    if (window.faustNode && this.audioContext) {
      const hasTrack = listTracks().some(t => t.inputNode === window.faustNode);
      if (!hasTrack) {
        const track = createTrackEnvironment(this.audioContext, window.faustNode);
        if ((window as any).busManager?.getEffectsInputNode) {
          try { track.volumeGain.disconnect(); } catch { /* ignore */ }
          try { track.volumeGain.connect((window as any).busManager.getEffectsInputNode()); } catch { /* ignore */ }
        }
        this.log('🎚️ Faust track registered for playback');
      }
    }
  }

  private async handlePlay(): Promise<void> {
    this.log('▶️ Play button pressed');

    if (!this.state.isPlaying && !this.isStarting) {
      try {
        await this.ensureAudioEngineReady();
        this.log('✅ Audio System ready');

        // CompositionPlayerの初期化
        if (!this.compositionPlayer && this.audioContext) {
          this.log('🎼 Initializing CompositionPlayer...');
          this.compositionPlayer = new CompositionPlayer(this.audioContext);
          await this.compositionPlayer.initialize();

          // CompositionPlayerのイベントリスナーを設定
          this.compositionPlayer.on('state-change', (state: any) => {
            this.updateFromCompositionPlayer(state);
          });

          this.compositionPlayer.on('section-change', (data: any) => {
            this.log(`🎬 Section changed to: ${data.sectionId}`);
            this.sectionStartTimestamp = Date.now();
            this.state.sectionElapsedTime = 0;
            this.state.currentSection = data.sectionId;
            this.updateStatusDisplay();
            this.broadcastPlayerStatus(true);
          });

          this.compositionPlayer.on('beat', (_data: any) => {
            // 拍ごとの更新（必要に応じて）
          });

          this.log('✅ CompositionPlayer initialized');
        }

        // セクション選択
        const sectionSelect = document.getElementById('section-select') as HTMLSelectElement;
        let selectedSection = sectionSelect?.value;

        const firstSectionId = this.getFirstSectionId();
        if ((!selectedSection || selectedSection === '') && firstSectionId) {
          selectedSection = firstSectionId;
          if (sectionSelect) {
            sectionSelect.value = firstSectionId;
          }
        }

        if (selectedSection) {
          this.state.currentSection = selectedSection;
          this.state.sectionElapsedTime = 0;
          this.updateStatusDisplay();
        }

        if (this.state.isPaused) {
          // Resume from pause
          this.state.isPaused = false;
          this.state.isPlaying = true;
          if (this.compositionPlayer) {
            await this.compositionPlayer.play();
          }
          this.log('⏯️ Resuming performance from pause');
        } else {
          this.isStarting = true;
          const countdownSeconds = 3;

          // カウントダウンの開始
          await this.runCountdown(countdownSeconds, selectedSection || undefined);

          if (!this.isStarting) {
            this.log('⚠️ Performance start aborted before countdown completion');
            this.isStarting = false;
            return;
          }

          // Start new performance after countdown
          this.state.isPlaying = true;
          this.state.startTime = Date.now();
          this.state.elapsedTime = 0;

          if (this.compositionPlayer) {
            await this.compositionPlayer.play(selectedSection || undefined);
          }
          this.isStarting = false;
          this.log('🚀 Starting new performance');

          if (selectedSection) {
            this.log(`📍 Starting from section: ${selectedSection}`);
          }
        }

        this.updateStatusDisplay();

      } catch (error) {
        this.log(`❌ Error starting playback: ${error}`);
        console.error(error);
        this.state.isPlaying = false;
        this.isStarting = false;
        this.updateStatusDisplay();
      }
    } else {
      this.log('⚠️ Performance is already playing');
    }
  }

  private handlePause(): void {
    this.log('⏸️ Pause button pressed');

    if (this.state.isPlaying && !this.state.isPaused) {
      this.state.isPaused = true;
      this.state.isPlaying = false;

      if (this.compositionPlayer) {
        this.compositionPlayer.pause();
      }

      this.log('⏸️ Performance paused');
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
      this.state.startTime = null;
      this.state.elapsedTime = 0;
      this.state.sectionElapsedTime = 0;
      this.isStarting = false;
      this.sectionStartTimestamp = null;

      if (this.compositionPlayer) {
        this.compositionPlayer.stop();
      }

      this.log('🛑 Performance stopped');
      this.updateStatusDisplay();
      this.broadcastPlayerStatus(true);
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
    this.state.currentSection = null;
    this.state.currentBar = 1;
    this.state.currentBeat = 1;
    this.state.sectionElapsedTime = 0;
    this.isStarting = false;
    this.sectionStartTimestamp = null;

    if (this.compositionPlayer) {
      this.compositionPlayer.stop();
    }

    this.log('🔄 Performance system reset');
    this.updateStatusDisplay();
    this.log('✅ System ready for new performance');
    this.broadcastPlayerStatus(true);
  }

  /**
   * CompositionPlayerの状態からコントローラーの状態を同期
   */
  private updateFromCompositionPlayer(playerState: any, triggerDisplay: boolean = true): void {
    const previousSection = this.state.currentSection;
    const reportedElapsed = typeof playerState.sectionElapsedTime === 'number'
      ? Math.max(0, playerState.sectionElapsedTime)
      : null;

    this.state.currentSection = playerState.currentSection;
    this.state.currentBar = playerState.currentBar;
    this.state.currentBeat = playerState.currentBeat;
    this.state.currentTempo = playerState.currentTempo;
    this.state.isPlaying = playerState.isPlaying;

    const sectionChanged = !!playerState.currentSection && playerState.currentSection !== previousSection;

    if (playerState.isPlaying) {
      if (sectionChanged || this.sectionStartTimestamp === null) {
        this.sectionStartTimestamp = Date.now() - (reportedElapsed ?? 0) * 1000;
      } else if (reportedElapsed !== null && this.sectionStartTimestamp !== null) {
        const computed = this.computeSectionElapsedFromTimestamp();
        if (Math.abs(computed - reportedElapsed) > 0.5) {
          this.sectionStartTimestamp = Date.now() - reportedElapsed * 1000;
        }
      }

      if (this.sectionStartTimestamp !== null) {
        this.state.sectionElapsedTime = this.computeSectionElapsedFromTimestamp();
      } else if (reportedElapsed !== null) {
        this.state.sectionElapsedTime = reportedElapsed;
      }
    } else {
      if (reportedElapsed !== null) {
        this.state.sectionElapsedTime = reportedElapsed;
        this.sectionStartTimestamp = Date.now() - reportedElapsed * 1000;
      } else if (sectionChanged) {
        this.state.sectionElapsedTime = 0;
        this.sectionStartTimestamp = null;
      }
    }

    if (triggerDisplay) {
      this.updateStatusDisplay();
    }

    if (sectionChanged) {
      this.broadcastPlayerStatus(true);
    }
  }

  private computeSectionElapsedFromTimestamp(): number {
    if (this.sectionStartTimestamp === null) {
      return this.state.sectionElapsedTime;
    }
    return Math.max(0, (Date.now() - this.sectionStartTimestamp) / 1000);
  }

  private startTimeUpdater(): void {
    this.updateInterval = window.setInterval(() => {
      if (this.state.isPlaying && this.state.startTime) {
        this.state.elapsedTime = Date.now() - this.state.startTime;
      }

      // CompositionPlayerの状態も更新
      if (this.compositionPlayer) {
        const playerState = this.compositionPlayer.getState();
        this.updateFromCompositionPlayer(playerState, false);

        if (this.state.isPlaying && this.sectionStartTimestamp !== null) {
          this.state.sectionElapsedTime = this.computeSectionElapsedFromTimestamp();
        }
      }

      this.updateStatusDisplay();
      this.broadcastPlayerStatus();
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

    const playBtn = document.getElementById('play-btn') as HTMLButtonElement | null;
    const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement | null;
    const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement | null;

    if (playBtn) {
      playBtn.disabled = this.state.isPlaying || this.isStarting;
      playBtn.textContent = this.state.isPaused ? 'Resume' : 'Play';
    }

    if (pauseBtn) {
      pauseBtn.disabled = !this.state.isPlaying;
    }

    if (stopBtn) {
      stopBtn.disabled = !this.state.isPlaying && !this.state.isPaused && !this.isStarting;
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

    // Current Section
    const sectionElement = document.getElementById('current-section');
    if (sectionElement) {
      if (this.state.currentSection) {
        // セクション名とセクション内経過時間を表示
        const sectionMinutes = Math.floor(this.state.sectionElapsedTime / 60);
        const sectionSeconds = Math.floor(this.state.sectionElapsedTime % 60);
        const timeStr = `${sectionMinutes}:${sectionSeconds.toString().padStart(2, '0')}`;
        const sectionName = this.getSectionNameById(this.state.currentSection) ?? this.state.currentSection;
        sectionElement.textContent = `${sectionName} (${timeStr})`;
      } else {
        sectionElement.textContent = '--';
      }
    }

    // Musical Time (Bar/Beat)
    const musicalTimeElement = document.getElementById('musical-time');
    if (musicalTimeElement) {
      musicalTimeElement.textContent = `Bar ${this.state.currentBar}, Beat ${this.state.currentBeat}`;
    }

    // Current Tempo
    const tempoElement = document.getElementById('current-tempo');
    if (tempoElement) {
      tempoElement.textContent = `${this.state.currentTempo} BPM`;
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

  private getFirstSectionId(): string | null {
    return composition.sections && composition.sections.length > 0
      ? composition.sections[0].id
      : null;
  }

  private getSectionNameById(sectionId: string): string | undefined {
    const section = composition.sections?.find(sec => sec.id === sectionId);
    return section?.name ?? section?.id;
  }

  private async runCountdown(seconds: number, targetSectionId?: string): Promise<void> {
    for (let remaining = seconds; remaining > 0; remaining--) {
      const message = `Performance starts in ${remaining}...`;
      this.log(`⏳ ${message}`);
      this.broadcastPerformanceMessage({
        type: 'countdown',
        secondsRemaining: remaining,
        sectionId: targetSectionId ?? null,
        message,
        timestamp: Date.now()
      });
      await this.delay(1000);

      if (!this.isStarting) {
        this.log('⏹️ Countdown cancelled');
        this.broadcastPerformanceMessage({
          type: 'countdown-cancelled',
          sectionId: targetSectionId ?? null,
          timestamp: Date.now()
        });
        return;
      }
    }

    this.broadcastPerformanceMessage({
      type: 'countdown',
      secondsRemaining: 0,
      sectionId: targetSectionId ?? null,
      message: 'Performance starting!',
      timestamp: Date.now()
    });
    this.log('🚦 Countdown complete');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private broadcastPerformanceMessage(payload: Record<string, any>): void {
    try {
      const channel = new BroadcastChannel('performance-control');
      channel.postMessage(payload);
      channel.close();
    } catch (error) {
      console.error('❌ Failed to broadcast performance message:', error);
    }
  }

  private broadcastPlayerStatus(force: boolean = false): void {
    const sectionId = this.state.currentSection;
    const sectionName = sectionId ? (this.getSectionNameById(sectionId) ?? sectionId) : '';

    if (force || sectionId !== this.lastBroadcastSectionId || sectionName !== this.lastBroadcastSectionName) {
      this.broadcastPerformanceMessage({
        type: 'current-section',
        target: 'all',
        data: {
          id: sectionId,
          name: sectionName
        },
        timestamp: Date.now()
      });

      this.broadcastPerformanceMessage({
        type: 'rehearsal-mark',
        target: 'all',
        data: {
          mark: sectionName || '--'
        },
        timestamp: Date.now()
      });

      this.lastBroadcastSectionId = sectionId ?? null;
      this.lastBroadcastSectionName = sectionName;
    }

    const rawElapsedMs = Number.isFinite(this.state.elapsedTime) && this.state.elapsedTime !== null
      ? this.state.elapsedTime
      : 0;
    let elapsedSeconds = Math.max(0, Math.floor(rawElapsedMs / 1000));

    if (!this.state.isPlaying && !this.state.isPaused && !sectionId) {
      elapsedSeconds = 0;
    }

    if (force || this.lastBroadcastElapsedSeconds !== elapsedSeconds) {
      this.broadcastPerformanceMessage({
        type: 'elapsed-time',
        target: 'all',
        data: {
          seconds: elapsedSeconds,
          sectionSeconds: Number.isFinite(this.state.sectionElapsedTime)
            ? Math.max(0, Math.floor(this.state.sectionElapsedTime))
            : 0
        },
        timestamp: Date.now()
      });

      this.lastBroadcastElapsedSeconds = elapsedSeconds;
    }
  }
}

// Global performance controller instance
let performanceController: PerformanceController;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  performanceController = new PerformanceController();

  // Make it globally accessible for integration
  (window as any).performanceController = performanceController;

  console.log('🎪 Acoustic Automaton Performance System ready');
  console.log('🎯 Phase 5 integration points prepared');

  try {
    await setupAudioControlPanels({ enqueueMasterFx });
    console.log('🧩 Audio control panels attached to performance page');
  } catch (error) {
    console.error('⚠️ Failed to initialize audio control panels on performance page', error);
  }
});

// Export for module integration
export { PerformanceController };
export type { PerformanceState };
