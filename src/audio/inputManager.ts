import { ioConfigList, IOConfig, MicRoutingConfig, defaultMicRoutingConfig } from "./ioConfig";
import { MicRouter, MicInput } from "./micRouter";

// 入出力デバイスの状態管理クラス
export class InputManager {
  private ioList: IOConfig[] = [];
  private micRouter?: MicRouter;
  private routingConfig: MicRoutingConfig[] = [];

  constructor() {
    // 設定ファイルから初期化
    this.ioList = ioConfigList.map(cfg => ({ ...cfg }));
    this.routingConfig = [...defaultMicRoutingConfig];
  }

  /**
   * マイクルーターを初期化
   */
  initMicRouter(audioContext: AudioContext): void {
    if (this.micRouter) {
      this.micRouter.dispose();
    }
    this.micRouter = new MicRouter(audioContext);
    console.log("[InputManager] MicRouter initialized");
  }

  /**
   * マイクルーターを取得
   */
  getMicRouter(): MicRouter | undefined {
    return this.micRouter;
  }

  /**
   * 利用可能なマイクデバイスを取得してマイクルーターに追加
   */
  async setupMicInputs(): Promise<void> {
    if (!this.micRouter) {
      throw new Error("MicRouter not initialized");
    }

    try {
      // デバイス一覧を取得
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');

      console.log(`[InputManager] Found ${audioInputs.length} audio input devices`);

      // 設定されたマイクのみをセットアップ
      for (const config of this.getInputs()) {
        if (config.enabled) {
          try {
            // デバイスIDが指定されている場合はそれを使用、なければ最初の利用可能なデバイス
            const deviceId = config.deviceId || (audioInputs[config.index - 1]?.deviceId);

            await this.micRouter.addMicInput(config.id, config.label, deviceId);

            // 初期音量を設定
            if (config.volume !== undefined) {
              this.micRouter.setMicVolume(config.id, config.volume);
            }

            console.log(`[InputManager] Setup mic input: ${config.label}`);

          } catch (error) {
            console.error(`[InputManager] Failed to setup mic ${config.id}:`, error);
          }
        }
      }

    } catch (error) {
      console.error("[InputManager] Failed to setup mic inputs:", error);
      throw error;
    }
  }

  /**
   * マイクルーターを出力ノードに接続
   */
  connectMicRouterToOutput(outputNode: AudioNode): void {
    if (this.micRouter) {
      this.micRouter.connectOutput(outputNode);
      console.log("[InputManager] Connected MicRouter to output");
    }
  }

  /**
   * マイクの有効/無効を切り替え
   */
  async toggleMicInput(micId: string, enabled: boolean): Promise<void> {
    // 設定を更新
    const config = this.ioList.find(io => io.id === micId);
    if (config) {
      config.enabled = enabled;
    }

    // マイクルーターを更新
    if (this.micRouter) {
      if (enabled) {
        // マイクを有効にする
        const existingMic = this.micRouter.getMicInputs().find(mic => mic.id === micId);
        if (!existingMic && config) {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            const deviceId = config.deviceId || (audioInputs[config.index - 1]?.deviceId);

            await this.micRouter.addMicInput(config.id, config.label, deviceId);
            if (config.volume !== undefined) {
              this.micRouter.setMicVolume(config.id, config.volume);
            }
          } catch (error) {
            console.error(`Failed to enable mic ${micId}:`, error);
          }
        } else {
          this.micRouter.setMicEnabled(micId, true);
        }
      } else {
        // マイクを無効にする
        this.micRouter.setMicEnabled(micId, false);
      }
    }
  }

  /**
   * マイクの音量を設定
   */
  setMicVolume(micId: string, volume: number): void {
    // 設定を更新
    const config = this.ioList.find(io => io.id === micId);
    if (config) {
      config.volume = volume;
    }

    // マイクルーターを更新
    if (this.micRouter) {
      this.micRouter.setMicVolume(micId, volume);
    }
  }

  /**
   * ルーティング設定を更新
   */
  updateRouting(micId: string, destinations: { synth: boolean; effects: boolean; monitor: boolean }, gain: number = 1.0): void {
    // 設定を更新
    const routeConfig = this.routingConfig.find(r => r.micId === micId);
    if (routeConfig) {
      routeConfig.destinations = { ...destinations };
      routeConfig.gain = gain;
    } else {
      this.routingConfig.push({ micId, destinations: { ...destinations }, gain });
    }

    // マイクルーターを更新（実装は今後拡張）
    console.log(`[InputManager] Updated routing for ${micId}:`, destinations, `gain: ${gain}`);
  }

  getInputs() {
    return this.ioList.filter(io => io.type === "input");
  }

  getOutputs() {
    return this.ioList.filter(io => io.type === "output");
  }

  setEnabled(id: string, enabled: boolean) {
    const io = this.ioList.find(io => io.id === id);
    if (io) io.enabled = enabled;
  }

  setDeviceId(id: string, deviceId: string) {
    const io = this.ioList.find(io => io.id === id);
    if (io) io.deviceId = deviceId;
  }

  /**
   * ルーティング設定を取得
   */
  getRoutingConfig(): MicRoutingConfig[] {
    return [...this.routingConfig];
  }

  /**
   * 現在のマイク入力状態を取得
   */
  getMicInputStatus(): MicInput[] {
    return this.micRouter?.getMicInputs() || [];
  }

  /**
   * クリーンアップ
   */
  dispose(): void {
    if (this.micRouter) {
      this.micRouter.dispose();
      this.micRouter = undefined;
    }
    console.log("[InputManager] Disposed");
  }
}