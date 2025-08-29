/**
 * リハーサル統合システム
 * 音量検出、持続音管理、電子音生成を統合
 */

import { TriggerDetection, TriggerEvent } from './triggerDetection.js';
import { SustainedToneManager } from './sustainedToneManager.js';
import { ElectronicToneGenerator } from './electronicToneGenerator.js';

export interface RehearsalSystemConfig {
  triggerThreshold: number;
  maxInstances: number;
  pitchRangeMin: number;
  pitchRangeMax: number;
  sustainLevel: number;
  reverbAmount: number;
  enabled: boolean;
}

export interface RehearsalSystemCallbacks {
  onToneTriggered?: (event: TriggerEvent, toneId: string) => void;
  onElectronicToneGenerated?: (toneId: string, frequency: number) => void;
  onParameterChanged?: (parameter: string, value: number) => void;
  onSystemStatusChanged?: (status: string) => void;
}

export class RehearsalSystem {
  private audioContext: AudioContext;
  private triggerDetection: TriggerDetection;
  private sustainedToneManager: SustainedToneManager;
  private electronicToneGenerator: ElectronicToneGenerator;
  private config: RehearsalSystemConfig;
  private callbacks: RehearsalSystemCallbacks = {};
  private isInitialized: boolean = false;

  constructor(audioContext: AudioContext, outputNode: AudioNode, config: Partial<RehearsalSystemConfig> = {}) {
    this.audioContext = audioContext;

    // デフォルト設定
    this.config = {
      triggerThreshold: 0.1,
      maxInstances: 10,
      pitchRangeMin: 200,
      pitchRangeMax: 800,
      sustainLevel: 0.8,
      reverbAmount: 0.3,
      enabled: true,
      ...config
    };

    // コンポーネント初期化
    this.sustainedToneManager = new SustainedToneManager(audioContext, outputNode, {
      maxInstances: this.config.maxInstances,
      sustainLevel: this.config.sustainLevel,
      reverbAmount: this.config.reverbAmount
    });

    this.triggerDetection = new TriggerDetection(audioContext, {
      threshold: this.config.triggerThreshold,
      instruments: ['horn1', 'horn2', 'trombone'],
      enabled: this.config.enabled
    });

    this.electronicToneGenerator = new ElectronicToneGenerator(audioContext, this.sustainedToneManager, {
      minFrequency: this.config.pitchRangeMin,
      maxFrequency: this.config.pitchRangeMax
    });

    this.setupEventHandlers();
    console.log('[RehearsalSystem] Initialized');
  }

  /**
   * イベントハンドラーのセットアップ
   */
  private setupEventHandlers(): void {
    // トリガー検出イベント
    this.triggerDetection.onTrigger((event: TriggerEvent) => {
      if (this.config.enabled) {
        this.handleTriggerEvent(event);
      }
    });

    // 持続音マネージャーのコールバック
    this.sustainedToneManager.setCallbacks({
      onToneAdded: (tone) => {
        console.log(`[RehearsalSystem] Tone added: ${tone.instrument} @ ${tone.frequency.toFixed(2)}Hz`);
      },
      onToneRemoved: (toneId) => {
        console.log(`[RehearsalSystem] Tone removed: ${toneId}`);
      },
      onMaxInstancesReached: () => {
        console.log('[RehearsalSystem] Max instances reached, oldest tone removed');
        if (this.callbacks.onSystemStatusChanged) {
          this.callbacks.onSystemStatusChanged('Max instances reached');
        }
      }
    });

    // 電子音生成器のコールバック
    this.electronicToneGenerator.setCallbacks({
      onToneGenerated: (toneId, frequency) => {
        console.log(`[RehearsalSystem] Electronic tone generated: ${frequency.toFixed(2)}Hz`);
        if (this.callbacks.onElectronicToneGenerated) {
          this.callbacks.onElectronicToneGenerated(toneId, frequency);
        }
      }
    });
  }

  /**
   * トリガーイベントの処理
   */
  private handleTriggerEvent(event: TriggerEvent): void {
    console.log(`[RehearsalSystem] Processing trigger from ${event.instrument}`);

    // 持続音を生成
    const toneId = this.sustainedToneManager.addTone(
      event.frequency,
      event.instrument,
      event.amplitude,
      'acoustic'
    );

    if (this.callbacks.onToneTriggered) {
      this.callbacks.onToneTriggered(event, toneId);
    }
  }

  /**
   * マイク入力を接続
   */
  connectMicInput(instrument: string, inputNode: AudioNode): void {
    this.triggerDetection.connectInput(instrument, inputNode);
    console.log(`[RehearsalSystem] Connected mic input for ${instrument}`);
  }

  /**
   * システム開始
   */
  start(): void {
    if (this.isInitialized) {
      console.warn('[RehearsalSystem] Already started');
      return;
    }

    this.triggerDetection.startMonitoring();
    this.isInitialized = true;

    console.log('[RehearsalSystem] Started monitoring');
    if (this.callbacks.onSystemStatusChanged) {
      this.callbacks.onSystemStatusChanged('System started');
    }
  }

  /**
   * システム停止
   */
  stop(): void {
    if (!this.isInitialized) {
      console.warn('[RehearsalSystem] Not started');
      return;
    }

    this.triggerDetection.stopMonitoring();
    this.sustainedToneManager.removeAllTones(true);
    this.isInitialized = false;

    console.log('[RehearsalSystem] Stopped monitoring');
    if (this.callbacks.onSystemStatusChanged) {
      this.callbacks.onSystemStatusChanged('System stopped');
    }
  }

  /**
   * 電子音を手動生成
   */
  triggerElectronicTone(frequency?: number): string {
    if (frequency) {
      this.electronicToneGenerator.setFrequency(frequency);
    }
    return this.electronicToneGenerator.triggerManualTone();
  }

  /**
   * ランダム電子音を生成
   */
  triggerRandomElectronicTone(): string {
    return this.electronicToneGenerator.generateRandomTone();
  }

  /**
   * 全ての音を停止
   */
  stopAllTones(fadeOut: boolean = true): void {
    this.sustainedToneManager.removeAllTones(fadeOut);
    console.log('[RehearsalSystem] All tones stopped');
  }

  /**
   * 特定楽器の音を停止
   */
  stopTonesFromInstrument(instrument: string, fadeOut: boolean = true): void {
    this.sustainedToneManager.removeTonesFromInstrument(instrument, fadeOut);
    console.log(`[RehearsalSystem] Stopped tones from ${instrument}`);
  }

  // === パラメーター設定メソッド ===

  /**
   * 検出閾値を設定
   */
  setTriggerThreshold(threshold: number): void {
    this.config.triggerThreshold = threshold;
    this.triggerDetection.setThreshold(threshold);
    console.log(`[RehearsalSystem] Trigger threshold set to: ${threshold}`);

    if (this.callbacks.onParameterChanged) {
      this.callbacks.onParameterChanged('triggerThreshold', threshold);
    }
  }

  /**
   * 最大インスタンス数を設定
   */
  setMaxInstances(count: number): void {
    this.config.maxInstances = count;
    this.sustainedToneManager.setMaxInstances(count);
    console.log(`[RehearsalSystem] Max instances set to: ${count}`);

    if (this.callbacks.onParameterChanged) {
      this.callbacks.onParameterChanged('maxInstances', count);
    }
  }

  /**
   * 音高範囲を設定
   */
  setPitchRange(min: number, max: number): void {
    this.config.pitchRangeMin = min;
    this.config.pitchRangeMax = max;
    this.electronicToneGenerator.setFrequencyRange(min, max);
    console.log(`[RehearsalSystem] Pitch range set to: ${min.toFixed(2)}Hz - ${max.toFixed(2)}Hz`);

    if (this.callbacks.onParameterChanged) {
      this.callbacks.onParameterChanged('pitchRangeMin', min);
      this.callbacks.onParameterChanged('pitchRangeMax', max);
    }
  }

  /**
   * 電子音の周波数を設定
   */
  setElectronicToneFrequency(frequency: number): void {
    this.electronicToneGenerator.setFrequency(frequency);
    console.log(`[RehearsalSystem] Electronic tone frequency set to: ${frequency.toFixed(2)}Hz`);
  }

  /**
   * 電子音の音量を設定
   */
  setElectronicToneAmplitude(amplitude: number): void {
    this.electronicToneGenerator.setAmplitude(amplitude);
    console.log(`[RehearsalSystem] Electronic tone amplitude set to: ${amplitude}`);
  }

  /**
   * システム有効/無効を設定
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.triggerDetection.setEnabled(enabled);
    this.electronicToneGenerator.setEnabled(enabled);
    console.log(`[RehearsalSystem] System ${enabled ? 'enabled' : 'disabled'}`);

    if (this.callbacks.onSystemStatusChanged) {
      this.callbacks.onSystemStatusChanged(enabled ? 'System enabled' : 'System disabled');
    }
  }

  // === 情報取得メソッド ===

  /**
   * 現在のアクティブ音数を取得
   */
  getActiveTonesCount(): number {
    return this.sustainedToneManager.getActiveTonesCount();
  }

  /**
   * 全てのアクティブ音を取得
   */
  getAllActiveTones() {
    return this.sustainedToneManager.getAllTones();
  }

  /**
   * 現在の設定を取得
   */
  getConfig(): RehearsalSystemConfig {
    return { ...this.config };
  }

  /**
   * システムの状態を取得
   */
  getSystemStatus() {
    return {
      isInitialized: this.isInitialized,
      enabled: this.config.enabled,
      activeTonesCount: this.getActiveTonesCount(),
      triggerThreshold: this.config.triggerThreshold,
      maxInstances: this.config.maxInstances,
      pitchRange: {
        min: this.config.pitchRangeMin,
        max: this.config.pitchRangeMax
      }
    };
  }

  /**
   * 電子音生成器の設定を取得
   */
  getElectronicToneConfig() {
    return this.electronicToneGenerator.getConfig();
  }

  /**
   * プリセット周波数を取得
   */
  getPresetFrequencies() {
    return this.electronicToneGenerator.getPresetFrequencies();
  }

  /**
   * コールバック設定
   */
  setCallbacks(callbacks: RehearsalSystemCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 設定更新
   */
  updateConfig(newConfig: Partial<RehearsalSystemConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // 各コンポーネントに反映
    this.triggerDetection.updateConfig({
      threshold: this.config.triggerThreshold,
      enabled: this.config.enabled
    });

    this.sustainedToneManager.updateConfig({
      maxInstances: this.config.maxInstances,
      sustainLevel: this.config.sustainLevel,
      reverbAmount: this.config.reverbAmount
    });

    this.electronicToneGenerator.updateConfig({
      minFrequency: this.config.pitchRangeMin,
      maxFrequency: this.config.pitchRangeMax
    });

    console.log('[RehearsalSystem] Config updated:', this.config);
  }

  /**
   * リソース解放
   */
  dispose(): void {
    this.stop();
    this.triggerDetection.dispose();
    this.sustainedToneManager.dispose();
    this.electronicToneGenerator.dispose();
    this.callbacks = {};
    console.log('[RehearsalSystem] Disposed');
  }
}
