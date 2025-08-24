/**
 * 電子音生成システム
 * ボタン操作による電子音の生成と管理
 */

import { SustainedToneManager } from './sustainedToneManager.js';

export interface ElectronicToneConfig {
  frequency: number;        // 周波数 (Hz)
  amplitude: number;        // 音量 (0-1)
  waveform: 'sine' | 'square' | 'sawtooth' | 'triangle';
  minFrequency: number;     // 最小周波数
  maxFrequency: number;     // 最大周波数
}

export interface FrequencyRange {
  min: number;
  max: number;
}

export class ElectronicToneGenerator {
  private config: ElectronicToneConfig;
  private sustainedToneManager: SustainedToneManager;
  private audioContext: AudioContext;
  private isEnabled: boolean = true;
  private callbacks: {
    onToneGenerated?: (toneId: string, frequency: number) => void;
    onParameterChanged?: (parameter: string, value: number) => void;
  } = {};

  constructor(
    audioContext: AudioContext,
    sustainedToneManager: SustainedToneManager,
    config: Partial<ElectronicToneConfig> = {}
  ) {
    this.audioContext = audioContext;
    this.sustainedToneManager = sustainedToneManager;
    this.config = {
      frequency: 493.88,      // B4
      amplitude: 0.6,
      waveform: 'sine',
      minFrequency: 200,      // 約G3
      maxFrequency: 800,      // 約G5
      ...config
    };

    console.log('[ElectronicToneGenerator] Initialized');
  }

  /**
   * 電子音を生成
   */
  generateTone(customConfig?: Partial<ElectronicToneConfig>): string {
    if (!this.isEnabled) {
      console.warn('[ElectronicToneGenerator] Generator is disabled');
      return '';
    }

    const toneConfig = { ...this.config, ...customConfig };

    // 周波数範囲チェック
    const frequency = Math.max(
      toneConfig.minFrequency,
      Math.min(toneConfig.maxFrequency, toneConfig.frequency)
    );

    console.log(`[ElectronicToneGenerator] Generating electronic tone: ${frequency.toFixed(2)}Hz`);

    // 持続音マネージャーに追加
    const toneId = this.sustainedToneManager.addTone(
      frequency,
      'electronic',
      toneConfig.amplitude,
      'electronic'
    );

    if (toneId && this.callbacks.onToneGenerated) {
      this.callbacks.onToneGenerated(toneId, frequency);
    }

    return toneId;
  }

  /**
   * 手動トリガー（現在の設定で音を生成）
   */
  triggerManualTone(): string {
    return this.generateTone();
  }

  /**
   * ランダムな周波数で音を生成
   */
  generateRandomTone(): string {
    const randomFreq = this.config.minFrequency +
      Math.random() * (this.config.maxFrequency - this.config.minFrequency);

    return this.generateTone({ frequency: randomFreq });
  }

  /**
   * 音階に基づく音を生成
   */
  generateScaleTone(noteIndex: number): string {
    // B4を基準とした音階 (半音階)
    const baseFreq = 493.88; // B4
    const semitones = noteIndex - 12; // B4を中心とした相対位置
    const frequency = baseFreq * Math.pow(2, semitones / 12);

    // 範囲内にクランプ
    const clampedFreq = Math.max(
      this.config.minFrequency,
      Math.min(this.config.maxFrequency, frequency)
    );

    return this.generateTone({ frequency: clampedFreq });
  }

  /**
   * 周波数を設定
   */
  setFrequency(frequency: number): void {
    const clampedFreq = Math.max(
      this.config.minFrequency,
      Math.min(this.config.maxFrequency, frequency)
    );

    this.config.frequency = clampedFreq;
    console.log(`[ElectronicToneGenerator] Frequency set to: ${clampedFreq.toFixed(2)}Hz`);

    if (this.callbacks.onParameterChanged) {
      this.callbacks.onParameterChanged('frequency', clampedFreq);
    }
  }

  /**
   * 音量を設定
   */
  setAmplitude(amplitude: number): void {
    this.config.amplitude = Math.max(0, Math.min(1, amplitude));
    console.log(`[ElectronicToneGenerator] Amplitude set to: ${this.config.amplitude}`);

    if (this.callbacks.onParameterChanged) {
      this.callbacks.onParameterChanged('amplitude', this.config.amplitude);
    }
  }

  /**
   * 波形を設定
   */
  setWaveform(waveform: 'sine' | 'square' | 'sawtooth' | 'triangle'): void {
    this.config.waveform = waveform;
    console.log(`[ElectronicToneGenerator] Waveform set to: ${waveform}`);

    if (this.callbacks.onParameterChanged) {
      this.callbacks.onParameterChanged('waveform', 0); // 波形は数値でない
    }
  }

  /**
   * 周波数範囲を設定
   */
  setFrequencyRange(min: number, max: number): void {
    this.config.minFrequency = Math.max(50, min);
    this.config.maxFrequency = Math.min(2000, Math.max(this.config.minFrequency + 50, max));

    // 現在の周波数が範囲外の場合は調整
    if (this.config.frequency < this.config.minFrequency) {
      this.setFrequency(this.config.minFrequency);
    } else if (this.config.frequency > this.config.maxFrequency) {
      this.setFrequency(this.config.maxFrequency);
    }

    console.log(`[ElectronicToneGenerator] Frequency range set to: ${this.config.minFrequency.toFixed(2)}Hz - ${this.config.maxFrequency.toFixed(2)}Hz`);
  }

  /**
   * 周波数をノート名から設定
   */
  setFrequencyFromNote(noteName: string): void {
    const noteFrequencies: { [key: string]: number } = {
      'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
      'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
      'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77
    };

    const frequency = noteFrequencies[noteName];
    if (frequency) {
      this.setFrequency(frequency);
    } else {
      console.warn(`[ElectronicToneGenerator] Unknown note: ${noteName}`);
    }
  }

  /**
   * 現在の周波数をノート名で取得
   */
  getCurrentNoteName(): string {
    const frequency = this.config.frequency;

    // A4 = 440Hzを基準とした計算
    const a4 = 440;
    const semitones = Math.round(12 * Math.log2(frequency / a4));
    const noteNames = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
    const octave = Math.floor((semitones + 9) / 12) + 4;
    const noteIndex = ((semitones % 12) + 12) % 12;

    return `${noteNames[noteIndex]}${octave}`;
  }

  /**
   * 有効/無効を設定
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.log(`[ElectronicToneGenerator] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * 現在の設定を取得
   */
  getConfig(): ElectronicToneConfig {
    return { ...this.config };
  }

  /**
   * 周波数範囲を取得
   */
  getFrequencyRange(): FrequencyRange {
    return {
      min: this.config.minFrequency,
      max: this.config.maxFrequency
    };
  }

  /**
   * プリセット周波数のリストを取得
   */
  getPresetFrequencies(): { name: string; frequency: number }[] {
    return [
      { name: 'B3', frequency: 246.94 },
      { name: 'B4', frequency: 493.88 },
      { name: 'B5', frequency: 987.77 },
      { name: 'C4', frequency: 261.63 },
      { name: 'C5', frequency: 523.25 },
      { name: 'D4', frequency: 293.66 },
      { name: 'D5', frequency: 587.33 },
      { name: 'E4', frequency: 329.63 },
      { name: 'E5', frequency: 659.25 },
      { name: 'F4', frequency: 349.23 },
      { name: 'F5', frequency: 698.46 },
      { name: 'G4', frequency: 392.00 },
      { name: 'G5', frequency: 783.99 }
    ].filter(preset =>
      preset.frequency >= this.config.minFrequency &&
      preset.frequency <= this.config.maxFrequency
    );
  }

  /**
   * コールバック設定
   */
  setCallbacks(callbacks: {
    onToneGenerated?: (toneId: string, frequency: number) => void;
    onParameterChanged?: (parameter: string, value: number) => void;
  }): void {
    this.callbacks = callbacks;
  }

  /**
   * 設定更新
   */
  updateConfig(newConfig: Partial<ElectronicToneConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[ElectronicToneGenerator] Config updated:', this.config);
  }

  /**
   * リソース解放
   */
  dispose(): void {
    this.isEnabled = false;
    this.callbacks = {};
    console.log('[ElectronicToneGenerator] Disposed');
  }
}
