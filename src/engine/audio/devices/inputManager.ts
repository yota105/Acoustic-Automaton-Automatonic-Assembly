import { ioConfigList, IOConfig, MicRoutingConfig, defaultMicRoutingConfig } from "./ioConfig";
import { MicRouter, MicInput } from "./micRouter";
import { createMicTrack } from "../core/tracks";
import { ConnectionManager } from "./connectionManager";

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
  private connectionManager: ConnectionManager;

  // 仮想MicTrack管理用
  private virtualMicTracks: VirtualMicTrack[] = [];

  constructor() {
    // 設定ファイルから初期化
    this.ioList = ioConfigList.map(cfg => ({ ...cfg }));
    this.routingConfig = [...defaultMicRoutingConfig];
    // 仮想MicTrack初期化は不要(明示的に作成する)

    // ConnectionManager初期化
    this.connectionManager = new ConnectionManager();
    // InputManagerの参照を設定(循環参照になるが実行時は問題なし)
    this.connectionManager.setInputManager(this);
    console.log('[InputManager] ConnectionManager initialized and configured');
  }

  /**
   * BusManagerへLogic Input情報と物理ソースを登録
   */
  private registerLogicInputWithBusManager(
    logicInputId: string,
    micInput: MicInput | undefined,
    context: 'new-connection' | 'channel-update'
  ): void {
    console.log(`🔧 [InputManager.registerLogicInputWithBusManager] START (${context})`);
    console.log(`   - Logic Input: ${logicInputId}`);
    console.log(`   - MicInput exists: ${!!micInput}`);
    console.log(`   - GainNode exists: ${!!(micInput?.gainNode)}`);

    // 重要: 新しいトラックベースシステムでは、マイクは直接BusManagerに接続しません
    // マイク音声はPerformanceTrackManager経由でのみルーティングされます
    console.log(`⚠️ [InputManager] Skipping BusManager connection for ${logicInputId} (track-based routing only)`);
    console.log(`   ℹ️ Mic will only output audio when performance cues trigger track gates`);

    return;

    /* 以下のコードは無効化(トラックベースシステムでは使用しない)
    if (!micInput || !micInput.gainNode) {
      console.warn(`[InputManager] Cannot attach Logic Input ${logicInputId} to BusManager (${context}) - gain node missing`);
      return;
    }

    const busManager = (window as any).busManager;
    console.log(`   - BusManager available: ${!!busManager}`);
    if (!busManager) {
      console.warn(`[InputManager] BusManager not available (${context}), skipping Logic Input registration`);
      return;
    }

    const logicInputManager = (window as any).logicInputManagerInstance;
    console.log(`   - LogicInputManager available: ${!!logicInputManager}`);
    if (!logicInputManager || typeof logicInputManager.list !== 'function') {
      console.warn(`[InputManager] LogicInputManager instance missing or invalid (${context})`);
      return;
    }

    const logicInputs = logicInputManager.list();
    const logicInput = logicInputs.find((input: any) => input.id === logicInputId);
    console.log(`   - Logic Input found in list: ${!!logicInput}`);
    if (!logicInput) {
      console.warn(`[InputManager] Logic Input ${logicInputId} not found in LogicInputManager list (${context})`);
      return;
    }

    try {
      console.log(`   - Calling busManager.ensureInput...`);
      busManager.ensureInput(logicInput);
      console.log(`   - Calling busManager.updateLogicInput...`);
      busManager.updateLogicInput(logicInput);
      console.log(`   - Calling busManager.attachSource...`);
      busManager.attachSource(logicInputId, micInput.gainNode);
      console.log(`✅ [InputManager] Logic Input ${logicInputId} attached to BusManager (${context})`);
    } catch (error) {
      console.error(`[InputManager] Failed to attach Logic Input ${logicInputId} to BusManager (${context})`, error);
    }
    */
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
    // ConnectionManagerを使用して接続リクエスト
    console.log(`🔌 [InputManager] Requesting connection via ConnectionManager:`);
    console.log(`   - Logic Input: ${logicInputId}`);
    console.log(`   - Device ID: ${newDeviceId}`);
    console.log(`   - Channel: ${channelIndex !== undefined ? `CH${channelIndex + 1}` : 'Mono/All'}`);

    try {
      await this.connectionManager.requestConnection(
        logicInputId,
        newDeviceId,
        channelIndex,
        1 // 通常優先度
      );
      console.log(`✅ [InputManager] Connection request completed for ${logicInputId}`);
    } catch (error) {
      console.error(`❌ [InputManager] Connection request failed for ${logicInputId}:`, error);
      throw error;
    }
  }

  /**
   * 内部接続処理 (ConnectionManager から呼び出される)
   * @internal
   */
  async _executeDeviceConnection(logicInputId: string, newDeviceId: string | null, channelIndex?: number): Promise<void> {
    console.log(`🔧 [InputManager._executeDeviceConnection] START`);
    console.log(`   - Logic Input: ${logicInputId}`);
    console.log(`   - Device ID: ${newDeviceId}`);
    console.log(`   - Channel: ${channelIndex !== undefined ? `CH${channelIndex + 1}` : 'Mono/All'}`);

    // MicRouterが未初期化の場合、自動的にBase Audioを初期化
    if (!this.micRouter) {
      console.warn(`⚠️ [InputManager] MicRouter not initialized, initializing Base Audio automatically...`);

      try {
        // ensureBaseAudio()を呼び出してBase Audioを初期化
        const { ensureBaseAudio } = await import('../core/audioCore');
        await ensureBaseAudio();

        // 初期化完了を待つ
        await new Promise(resolve => setTimeout(resolve, 100));

        if (!this.micRouter) {
          console.error(`❌ [InputManager] Failed to initialize MicRouter automatically`);
          throw new Error("[InputManager] MicRouter initialization failed");
        }

        console.log(`✅ [InputManager] Base Audio initialized automatically for Logic Input connection`);
      } catch (error) {
        console.error(`❌ [InputManager] Failed to initialize Base Audio:`, error);
        throw new Error("[InputManager] Failed to initialize audio system automatically");
      }
    }

    const channelLabel = channelIndex !== undefined ? ` CH${channelIndex + 1}` : '';
    console.log(`[InputManager] Executing device connection for ${logicInputId} to ${newDeviceId}${channelLabel}`);

    // 既存の接続を確認
    const existingInput = this.micRouter.getMicInput(logicInputId);

    if (existingInput && existingInput.deviceId === newDeviceId) {
      console.log(`[InputManager] Reconfiguring existing connection for ${logicInputId} to new channel ${channelIndex}`);
      this.micRouter.removeMicInput(logicInputId);
    } else if (existingInput) {
      // 異なるデバイスまたは新規接続の場合、既存接続を削除
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
      console.log(`🔍 [InputManager] After addMicInput, checking connection:`);
      console.log(`   - newInput exists: ${!!newInput}`);
      console.log(`   - newInput.gainNode exists: ${!!(newInput?.gainNode)}`);

      if (newInput && newInput.gainNode) {
        if (channelIndex !== undefined && newInput.channelIndex !== undefined && newInput.channelIndex !== channelIndex) {
          console.warn(`[InputManager] Channel fallback detected for ${logicInputId}: requested CH${channelIndex + 1}, using CH${newInput.channelIndex + 1}`);
          const lim = (window as any).logicInputManagerInstance;
          try {
            lim?.assignChannel?.(logicInputId, newInput.channelIndex);
            document.dispatchEvent(new CustomEvent('logic-input-channel-fallback', {
              detail: {
                logicInputId,
                requestedChannelIndex: channelIndex,
                actualChannelIndex: newInput.channelIndex,
                availableChannels: newInput.channelCount,
                deviceId: newInput.deviceId
              }
            }));
          } catch (error) {
            console.warn(`[InputManager] Failed to propagate channel fallback for ${logicInputId}`, error);
          }
        }
        console.log(`[InputManager] Successfully connected ${logicInputId} to device ${newDeviceId}${channelLabel}`);
        if (newInput.stream) {
          console.log(`[InputManager] New input stream active:`, newInput.stream.active);
          console.log(`[InputManager] New input stream tracks:`, newInput.stream.getTracks().length);
          console.log(`[InputManager] Channel index:`, newInput.channelIndex);
        }

        console.log(`🎯 [InputManager] About to call registerLogicInputWithBusManager...`);
        this.registerLogicInputWithBusManager(logicInputId, newInput, 'new-connection');
        console.log(`🎯 [InputManager] registerLogicInputWithBusManager completed`);
      } else {
        throw new Error(`Failed to create valid connection for ${logicInputId}`);
      }
    } else {
      console.log(`[InputManager] Disconnected ${logicInputId} from device`);

      // BusManagerからLogic Inputの物理ソースを切断
      if (window.busManager) {
        console.log(`[InputManager] Detaching physical source for Logic Input ${logicInputId} from BusManager`);
        window.busManager.detachSource(logicInputId);
      }
    }

    // UI更新イベントを発火
    document.dispatchEvent(new CustomEvent('mic-devices-updated'));
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

    let permissionProbe: MediaStream | null = null;
    try {
      // ブラウザにマイク権限を要求（ラベル取得のため）
      permissionProbe = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      console.error('[InputManager] Failed to obtain microphone permission:', error);
      throw error;
    } finally {
      // 取得したストリームを即停止
      if (permissionProbe) {
        permissionProbe.getTracks().forEach(track => track.stop());
      }
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

      const resolveDeviceId = (config: IOConfig): string | undefined => {
        // 1. 設定済みdeviceIdが現行デバイス一覧に存在すれば優先
        if (config.deviceId) {
          const exactMatch = audioInputs.find(device => device.deviceId === config.deviceId);
          if (exactMatch) {
            return exactMatch.deviceId;
          }
        }

        // 2. ラベル一致（部分一致）を試みる
        if (config.label) {
          const normalizedLabel = config.label.toLowerCase();
          const labelMatch = audioInputs.find(device => device.label.toLowerCase().includes(normalizedLabel));
          if (labelMatch) {
            console.log(`[InputManager] Matched device by label for ${config.id}: ${labelMatch.label}`);
            return labelMatch.deviceId;
          }
        }

        // 3. index順にフォールバック
        const indexCandidate = audioInputs[config.index - 1];
        if (indexCandidate) {
          console.log(`[InputManager] Using index fallback for ${config.id}: ${indexCandidate.label}`);
          return indexCandidate.deviceId;
        }

        // 4. 最後の手段として最初のデバイス
        if (audioInputs[0]) {
          console.warn(`[InputManager] Falling back to first available device for ${config.id}: ${audioInputs[0].label}`);
          return audioInputs[0].deviceId;
        }

        console.warn(`[InputManager] No audio input devices available for ${config.id}`);
        return undefined;
      };

      for (const config of inputConfigs) {
        if (config.enabled) {
          try {
            // デバイスID解決（指定ID→ラベル→インデックス→先頭）
            const deviceId = resolveDeviceId(config);

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