/**
 * リハーサル用音量検出システム
 * 奏者の演奏を検出し、持続音生成をトリガーする
 */

export interface TriggerEvent {
  id: string;
  instrument: string;
  frequency: number;
  amplitude: number;
  timestamp: number;
}

export interface TriggerDetectionConfig {
  threshold: number;        // 検出閾値 (0.01 - 0.5)
  minDuration: number;      // 最小持続時間 (ms)
  instruments: string[];    // 対象楽器 ['horn1', 'horn2', 'trombone']
  enabled: boolean;         // 検出有効/無効
}

export class TriggerDetection {
  private config: TriggerDetectionConfig;
  private analyserNodes: Map<string, AnalyserNode>;
  private audioContext: AudioContext;
  private isMonitoring: boolean = false;
  private monitoringInterval: number | null = null;
  private callbacks: Array<(event: TriggerEvent) => void> = [];
  private lastTriggerTime: Map<string, number> = new Map();

  constructor(audioContext: AudioContext, config: Partial<TriggerDetectionConfig> = {}) {
    this.audioContext = audioContext;
    this.config = {
      threshold: 0.1,
      minDuration: 100,
      instruments: ['horn1', 'horn2', 'trombone'],
      enabled: true,
      ...config
    };
    this.analyserNodes = new Map();
    this.setupAnalysers();
  }

  private setupAnalysers(): void {
    this.config.instruments.forEach(instrument => {
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      this.analyserNodes.set(instrument, analyser);
      console.log(`[TriggerDetection] Created analyser for ${instrument}`);
    });
  }

  /**
   * 楽器の入力ノードを接続
   */
  connectInput(instrument: string, inputNode: AudioNode): void {
    const analyser = this.analyserNodes.get(instrument);
    if (analyser) {
      inputNode.connect(analyser);
      console.log(`[TriggerDetection] Connected ${instrument} input to analyser`);
    } else {
      console.warn(`[TriggerDetection] No analyser found for ${instrument}`);
    }
  }

  /**
   * 音量検出を開始
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    console.log('[TriggerDetection] Started monitoring');

    // 10ms間隔で音量をチェック
    this.monitoringInterval = window.setInterval(() => {
      if (this.config.enabled) {
        this.checkAllInstruments();
      }
    }, 10);
  }

  /**
   * 音量検出を停止
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    console.log('[TriggerDetection] Stopped monitoring');
  }

  /**
   * 全楽器の音量をチェック
   */
  private checkAllInstruments(): void {
    this.config.instruments.forEach(instrument => {
      const triggerEvent = this.detectTrigger(instrument);
      if (triggerEvent) {
        this.notifyTrigger(triggerEvent);
      }
    });
  }

  /**
   * 特定楽器の音量検出
   */
  private detectTrigger(instrument: string): TriggerEvent | null {
    const analyser = this.analyserNodes.get(instrument);
    if (!analyser) return null;

    // 音量データを取得
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    // RMS計算で音量を求める
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length) / 255; // 0-1に正規化

    // 閾値チェック
    if (rms > this.config.threshold) {
      const now = Date.now();
      const lastTrigger = this.lastTriggerTime.get(instrument) || 0;

      // 最小間隔チェック
      if (now - lastTrigger > this.config.minDuration) {
        this.lastTriggerTime.set(instrument, now);

        // 基本周波数を分析（簡易版）
        const frequency = this.estimateFrequency(dataArray, instrument);

        return {
          id: `trigger_${instrument}_${now}`,
          instrument,
          frequency,
          amplitude: rms,
          timestamp: now
        };
      }
    }

    return null;
  }

  /**
   * 簡易的な周波数推定
   */
  private estimateFrequency(frequencyData: Uint8Array, instrument: string): number {
    // 楽器別の基本周波数（作品仕様に基づく）
    const baseFrequencies = {
      'horn1': 493.88,  // B4
      'horn2': 493.88,  // B4
      'trombone': 493.88 // B4 (作品では同じ音高)
    };

    // より高度な周波数分析は後で実装
    // 現在は基本周波数を返す
    return baseFrequencies[instrument as keyof typeof baseFrequencies] || 493.88;
  }

  /**
   * トリガーイベントを通知
   */
  private notifyTrigger(event: TriggerEvent): void {
    console.log(`[TriggerDetection] Trigger detected:`, event);
    this.callbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('[TriggerDetection] Callback error:', error);
      }
    });
  }

  /**
   * トリガーイベントのコールバック登録
   */
  onTrigger(callback: (event: TriggerEvent) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * コールバック削除
   */
  removeTriggerCallback(callback: (event: TriggerEvent) => void): void {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * 設定更新
   */
  updateConfig(newConfig: Partial<TriggerDetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[TriggerDetection] Config updated:', this.config);
  }

  /**
   * 現在の設定を取得
   */
  getConfig(): TriggerDetectionConfig {
    return { ...this.config };
  }

  /**
   * 閾値を設定
   */
  setThreshold(value: number): void {
    this.config.threshold = Math.max(0.01, Math.min(0.5, value));
    console.log(`[TriggerDetection] Threshold set to: ${this.config.threshold}`);
  }

  /**
   * 検出有効/無効の切り替え
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    console.log(`[TriggerDetection] Detection ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * リソース解放
   */
  dispose(): void {
    this.stopMonitoring();
    this.analyserNodes.clear();
    this.callbacks = [];
    this.lastTriggerTime.clear();
    console.log('[TriggerDetection] Disposed');
  }
}
