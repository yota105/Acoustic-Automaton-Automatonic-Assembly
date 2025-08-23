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
   * チャンネル指定付きでデバイス接続を更新
   * @param logicInputId Logic Input ID
   * @param newDeviceId 新しいデバイスID
   * @param channelIndex チャンネルインデックス (0=L/CH1, 1=R/CH2, etc.)
   */
  async updateDeviceConnectionWithChannel(logicInputId: string, newDeviceId: string | null, channelIndex?: number): Promise<void> {
    if (!this.micRouter) {
      console.warn("[InputManager] MicRouter not initialized, cannot update device connection");
      return;
    }

    const channelLabel = channelIndex !== undefined ? ` CH${channelIndex + 1}` : '';
    console.log(`[InputManager] Updating device connection for ${logicInputId} to ${newDeviceId}${channelLabel}`);

    try {
      // 既存の接続を確認
      const existingInput = this.micRouter.getMicInput(logicInputId);
      
      if (existingInput && existingInput.deviceId === newDeviceId) {
        // 同じデバイスでチャンネルのみ変更の場合、接続を維持してチャンネル分割のみ更新
        console.log(`[InputManager] Same device, updating channel only for ${logicInputId}`);
        
        // チャンネル情報を更新
        existingInput.channelIndex = channelIndex;
        
        // ラベルを更新
        const config = this.ioList.find(cfg => cfg.deviceId === newDeviceId);
        const baseLabel = config?.label || `マイク (${logicInputId})`;
        existingInput.label = baseLabel + channelLabel;
        
        // チャンネル分割の再構築
        if (existingInput.channelSplitter) {
          existingInput.channelSplitter.disconnect();
        }
        
        if (existingInput.source && existingInput.gainNode) {
          // 既存の接続を一旦切断
          existingInput.source.disconnect();
          
          if (channelIndex !== undefined && existingInput.source.channelCount > 1) {
            // チャンネル分割を再構築
            const channelSplitter = this.micRouter.getAudioContext().createChannelSplitter(existingInput.source.channelCount);
            const channelMerger = this.micRouter.getAudioContext().createChannelMerger(1);
            
            if (channelIndex < existingInput.source.channelCount) {
              existingInput.source.connect(channelSplitter);
              channelSplitter.connect(channelMerger, channelIndex, 0);
              channelMerger.connect(existingInput.gainNode);
              existingInput.channelSplitter = channelSplitter;
              console.log(`[InputManager] Rebuilt channel splitter for channel ${channelIndex}`);
            } else {
              existingInput.source.connect(existingInput.gainNode);
              console.warn(`[InputManager] Channel ${channelIndex} not available, using all channels`);
            }
          } else {
            // チャンネル指定なしまたはモノラル
            existingInput.source.connect(existingInput.gainNode);
            existingInput.channelSplitter = undefined;
            console.log(`[InputManager] Connected without channel splitting`);
          }
        }
        
        console.log(`[InputManager] Successfully updated channel for ${logicInputId} to ${channelIndex}`);
        return;
      }
      
      // 異なるデバイスまたは新規接続の場合、既存接続を削除
      if (existingInput) {
        console.log(`[InputManager] Removing existing connection for ${logicInputId}`);
        this.micRouter.removeMicInput(logicInputId);
      }
      
      if (newDeviceId) {
        // 新しいデバイスに接続
        const config = this.ioList.find(cfg => cfg.deviceId === newDeviceId);
        const baseLabel = config?.label || `マイク (${logicInputId})`;
        const fullLabel = baseLabel + channelLabel;
        
        console.log(`[InputManager] Adding new connection: ${logicInputId} -> ${newDeviceId}${channelLabel} (${fullLabel})`);
        await this.micRouter.addMicInput(logicInputId, fullLabel, newDeviceId, channelIndex);
        
        // デバイス接続成功をテスト
        const newInput = this.micRouter.getMicInput(logicInputId);
        if (newInput && newInput.gainNode) {
          console.log(`[InputManager] Successfully connected ${logicInputId} to device ${newDeviceId}${channelLabel}`);
          if (newInput.stream) {
            console.log(`[InputManager] New input stream active:`, newInput.stream.active);
            console.log(`[InputManager] New input stream tracks:`, newInput.stream.getTracks().length);
            console.log(`[InputManager] Channel index:`, newInput.channelIndex);
          }
        } else {
          console.error(`[InputManager] Failed to create valid connection for ${logicInputId}`);
        }
      } else {
        console.log(`[InputManager] Disconnected ${logicInputId} from device`);
      }

      // UI更新イベントを発火
      document.dispatchEvent(new CustomEvent('mic-devices-updated'));
    } catch (error) {
      console.error(`[InputManager] Failed to update device connection for ${logicInputId}:`, error);
      // エラー詳細をログ
      if (error instanceof Error) {
        console.error(`[InputManager] Error details:`, error.message);
        console.error(`[InputManager] Error stack:`, error.stack);
      }
    }
  }

  /**
   * 特定のLogic Inputのデバイス接続を更新
   * @param logicInputId Logic Input ID
   * @param newDeviceId 新しいデバイスID
   */
  async updateDeviceConnection(logicInputId: string, newDeviceId: string | null): Promise<void> {
    // 後方互換性のため、チャンネル指定なしで呼び出し
    return this.updateDeviceConnectionWithChannel(logicInputId, newDeviceId);
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
    // 頻繁な呼び出しのためログを完全に無効化
    // console.log('[InputManager] getMicInputStatus called');
    // console.log('[InputManager] micRouter exists:', !!this.micRouter);

    if (!this.micRouter) {
      console.warn('[InputManager] MicRouter not initialized');
      return [];
    }

    const list = this.micRouter.getMicInputs();
    // console.log('[InputManager] MicRouter returned:', list.length, 'inputs');

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