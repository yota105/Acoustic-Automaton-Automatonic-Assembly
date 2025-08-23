import { ioConfigList, IOConfig, MicRoutingConfig, defaultMicRoutingConfig } from "./ioConfig";
import { MicRouter, MicInput } from "./micRouter";
import { createMicTrack } from "../core/tracks";

// 仮想MicTrackの型
type VirtualMicTrack = {
  id: string;
  label: string;
  gainNode: GainNode;
  // ルーティングやテスト用の追加情報もここに拡張可
};

// 入出力デバイスの状態管理クラス
export class InputManager {
  private ioList: IOConfig[] = [];
  private micRouter?: MicRouter;
  private routingConfig: MicRoutingConfig[] = [];

  // 仮想MicTrack管理用
  private virtualMicTracks: VirtualMicTrack[] = [];

  constructor() {
    // 設定ファイルから初期化
    this.ioList = ioConfigList.map(cfg => ({ ...cfg }));
    this.routingConfig = [...defaultMicRoutingConfig];
    // 仮想MicTrack初期化は不要（明示的に作成する）
  }
  /**
   * 仮想MicTrack一覧を取得
   */
  listVirtualMicTracks(): VirtualMicTrack[] {
    return [...this.virtualMicTracks];
  }

  /**
   * 仮想MicTrackを新規作成
   * @param audioContext AudioContext
   * @param id Track ID
   * @param label 表示名
   */
  createVirtualMicTrack(audioContext: AudioContext, id: string, label: string): void {
    // 既に同IDが存在する場合は何もしない
    if (this.virtualMicTracks.some(t => t.id === id)) return;
    // GainNodeのみで構成（物理マイクなし）
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0;
    // Track管理にも追加
    createMicTrack(audioContext, gainNode, id, label);
    this.virtualMicTracks.push({ id, label, gainNode });
    console.log(`[InputManager] Created virtual MicTrack: ${label} (${id})`);
  }

  /**
   * 仮想MicTrackを削除
   */
  removeVirtualMicTrack(id: string): void {
    const idx = this.virtualMicTracks.findIndex(t => t.id === id);
    if (idx >= 0) {
      // GainNodeの切断
      this.virtualMicTracks[idx].gainNode.disconnect();
      this.virtualMicTracks.splice(idx, 1);
      // Track管理からも削除（今後実装: tracks.ts側でremoveTrack等が必要）
      // TODO: tracks.tsにremoveTrack(id)があれば呼ぶ
      console.log(`[InputManager] Removed virtual MicTrack: ${id}`);
    }
  }

  /**
   * 仮想/物理MicTrackのルーティング設定を更新
   * @param micId Track ID
   * @param destinations 出力先
   * @param gain ゲイン
   */
  assignMicTrackRouting(micId: string, destinations: { synth: boolean; effects: boolean; monitor: boolean }, gain: number = 1.0): void {
    this.updateRouting(micId, destinations, gain);
    // ルーティングの実体制御は今後拡張
    console.log(`[InputManager] Assigned routing for MicTrack ${micId}:`, destinations, `gain: ${gain}`);
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
      console.warn("[InputManager] MicRouter not initialized during setupMicInputs, initializing now...");
      // AudioContext を取得して初期化を試行
      const ctx = (window as any).audioCtx;
      if (ctx) {
        this.initMicRouter(ctx);
      } else {
        throw new Error("AudioContext not available for MicRouter initialization");
      }
    }

    if (!this.micRouter) {
      throw new Error("Failed to initialize MicRouter");
    }

    try {
      // デバイス一覧を取得
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');

      console.log(`[InputManager] Found ${audioInputs.length} audio input devices`);
      console.log(`[InputManager] Available devices:`, audioInputs.map(d => ({ id: d.deviceId, label: d.label })));

      // 設定されたマイクのみをセットアップ
      const inputConfigs = this.getInputs();
      console.log(`[InputManager] Input configs:`, inputConfigs.map(c => ({ id: c.id, label: c.label, enabled: c.enabled })));

      for (const config of inputConfigs) {
        if (config.enabled) {
          try {
            // デバイスIDが指定されている場合はそれを使用、なければ最初の利用可能なデバイス
            const deviceId = config.deviceId || (audioInputs[config.index - 1]?.deviceId);

            console.log(`[InputManager] Setting up mic: ${config.id} with deviceId: ${deviceId}`);
            await this.micRouter.addMicInput(config.id, config.label, deviceId);

            // 初期音量を設定
            if (config.volume !== undefined) {
              this.micRouter.setMicVolume(config.id, config.volume);
            }

            console.log(`[InputManager] Setup mic input: ${config.label}`);
            
            // デバイスリスト更新イベントを発火
            document.dispatchEvent(new CustomEvent('mic-devices-updated'));

          } catch (error) {
            console.error(`[InputManager] Failed to setup mic ${config.id}:`, error);
          }
        }
      }

      // デバッグ情報: セットアップ後の状態
      const finalMics = this.micRouter.getMicInputs();
      console.log(`[InputManager] Final mic count after setup: ${finalMics.length}`);

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
            // === Step2: MicTrack生成 ===
            const micInput = this.micRouter.getMicInputs().find(mic => mic.id === micId);
            if (micInput && micInput.gainNode && window.audioCtx) {
              // 既にTrackが存在しない場合のみ生成
              const tracks = (window as any).audioAPI?.listTracks?.() || [];
              if (!tracks.some((t: any) => t.id === micId)) {
                createMicTrack(window.audioCtx, micInput.gainNode, micId, config.label);
              }
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
    // デバッグログ追加
    console.log('[InputManager] getMicInputStatus called');
    console.log('[InputManager] micRouter exists:', !!this.micRouter);
    
    if (!this.micRouter) {
      console.warn('[InputManager] MicRouter not initialized');
      return [];
    }
    
    const list = this.micRouter.getMicInputs();
    console.log('[InputManager] MicRouter returned:', list.length, 'inputs');
    
    // MicRouter の生配列をそのまま返すと外部から破壊される可能性があるのでコピー
    return list.map(m => ({ ...m }));
  }

  /**
   * デバッグ用: 手動でマイク入力を追加（テスト用）
   */
  async addTestMicInput(id: string = 'test-mic', label: string = 'Test Microphone'): Promise<void> {
    if (!this.micRouter) {
      console.error('[InputManager] MicRouter not initialized. Call initMicRouter first.');
      return;
    }

    try {
      console.log(`[InputManager] Adding test mic input: ${id}`);
      await this.micRouter.addMicInput(id, label);
      console.log(`[InputManager] Successfully added test mic: ${id}`);
    } catch (error) {
      console.error(`[InputManager] Failed to add test mic ${id}:`, error);
      throw error;
    }
  }

  /**
   * クリーンアップ
   */
  dispose(): void {
    if (this.micRouter) {
      this.micRouter.dispose();
      this.micRouter = undefined;
    }
    // 仮想MicTrackもクリーンアップ
    for (const v of this.virtualMicTracks) {
      v.gainNode.disconnect();
    }
    this.virtualMicTracks = [];
    console.log("[InputManager] Disposed");
  }
}