import { LogicInputManager, LogicInput } from '../core/logicInputs';
import { createMicTrack, listTracks } from '../core/tracks';

// ルーティングUI（論理Input単位のルーティング・ゲイン設定UI）
export class RoutingUI {
    private missingGainNodes = new Set<string>(); // ログ制限用
    // private missingMeterElements = new Set<string>(); // （現在未使用）
    private debugInfoLogged = false; // デバッグ情報出力フラグ
    private lastMeterUpdate = 0; // メーター更新時刻制限用
    private meterUpdateInterval = 33; // メーター更新間隔（ミリ秒） - 約30FPS
    private meterValues = new Map<string, number>(); // スムージング用の前回値
    private inputAnalysers = new Map<string, { an: AnalyserNode; data: Uint8Array }>(); // 永続Analyser
    private nullSink?: GainNode; // Destinationへ繋がった無音ノード (pull用)
    
    constructor(
        private logicInputManager: LogicInputManager,
        private container: HTMLElement
    ) { 
        // 既存データのenabledを強制的にfalseに設定 (一時的な修正)
        this.logicInputManager.forceDisableAll();
        
        // デバッグイベントリスナーを追加して、デバイス割り当て変更を詳細にログ
        document.addEventListener('logic-input-assignment-changed', (e: any) => {
            const logicInputId = e.detail?.id;
            if (logicInputId) {
                console.log(`[RoutingUI] Device assignment changed for ${logicInputId}, triggering connection`);
                
                // 現在のLogic Input状態をログ
                const lim = (window as any).logicInputManagerInstance || this.logicInputManager;
                const logicInputs = lim?.list?.() || [];
                const li = logicInputs.find((l: any) => l.id === logicInputId);
                console.log(`[RoutingUI] Logic Input state:`, li);
                
                // 利用可能なマイク一覧をログ
                const im: any = (window as any).inputManager;
                if (im) {
                    const mics = im.getMicInputStatus?.() || [];
                    console.log(`[RoutingUI] Available mics for comparison:`, mics.map((m: any) => ({ id: m.id, label: m.label, hasGainNode: !!m.gainNode })));
                }
                
                // デバイス変更時に即座に接続を試行
                this.connectPhysicalSourceIfAvailable(logicInputId);
            }
        });
    }

    private propagateRouting(input: any) {
        const assignedId = input.assignedDeviceId;
        const im: any = (window as any).inputManager;
        if (assignedId && im) {
            im.updateRouting(assignedId, {
                synth: input.routing.synth,
                effects: input.routing.effects,
                monitor: input.routing.monitor
            }, input.gain);
        }
        const bm: any = (window as any).busManager;
        if (bm) bm.updateLogicInput?.(input);
    }

    private propagateEnable(input: any) {
        const assignedId = input.assignedDeviceId;
        const im: any = (window as any).inputManager;
        if (assignedId && im) {
            try { im.toggleMicInput(assignedId, input.enabled); } catch { /* ignore */ }
        }
        const bm: any = (window as any).busManager;
        if (bm) bm.updateLogicInput?.(input);
        // Track ensure (Phase A)
        if (input.enabled && input.assignedDeviceId && window.audioCtx) {
            const existing = listTracks().find((t: any) => t.id === input.id);
            if (!existing) {
                // 物理マイクのgainNodeに後で接続される前提でプレースホルダGainNode
                const ctx = window.audioCtx as AudioContext;
                const gain = ctx.createGain();
                gain.gain.value = input.gain ?? 1;
                createMicTrack(ctx, gain, input.id, input.label);
            }
        }
    }

    private pendingAttach = new Map<string, number>();
    private attachTimer: number | null = null;

    private scheduleRetry(id: string) {
        if (!this.pendingAttach.has(id)) this.pendingAttach.set(id, 0);
        if (this.attachTimer !== null) return;
        this.attachTimer = window.setInterval(() => {
            const im: any = (window as any).inputManager;
            const bm: any = (window as any).busManager;
            const lim = (window as any).logicInputManagerInstance || this.logicInputManager;
            if (!im || !bm || !lim) return; // 待機
            const logicInputs = lim.list?.() || [];
            let allDone = true;
            this.pendingAttach.forEach((attempts, logicId) => {
                const li = logicInputs.find((l: any) => l.id === logicId);
                if (!li) { this.pendingAttach.delete(logicId); return; }
                const mic = im.getMicInputStatus?.().find((m: any) => m.id === li.assignedDeviceId);
                if (mic && mic.gainNode) {
                    bm.ensureInput?.(li);
                    bm.attachSource?.(li.id, mic.gainNode);
                    bm.updateLogicInput?.(li);
                    this.pendingAttach.delete(logicId);
                    console.log(`[RoutingUI] Successfully attached mic ${li.assignedDeviceId} to ${logicId}`);
                } else {
                    attempts += 1;
                    if (attempts > 25) { // 約5秒(200ms*25)で諦め（短縮）
                        this.pendingAttach.delete(logicId);
                        console.warn(`[RoutingUI] Gave up trying to attach mic for ${logicId} after ${attempts} attempts`);
                    } else {
                        this.pendingAttach.set(logicId, attempts);
                        allDone = false;
                        // ログを間引き
                        if (attempts % 5 === 0) {
                            console.log(`[RoutingUI] Retrying mic attachment for ${logicId} (attempt ${attempts})`);
                        }
                    }
                }
            });
            if (allDone) {
                if (this.attachTimer) {
                    clearInterval(this.attachTimer);
                    this.attachTimer = null;
                }
            }
        }, 200);
    }

    private connectPhysicalSourceIfAvailable(input: any) {
        const bm: any = (window as any).busManager;
        const im: any = (window as any).inputManager;
        if (!bm || !im) {
            console.warn(`[RoutingUI] Required managers not available for ${input.id || input}`);
            return;
        }
        
        // LogicInputManager の正しいインスタンスを取得
        const lim = (window as any).logicInputManagerInstance || this.logicInputManager;
        
        // 最新の Logic Input 情報を取得
        const currentInput = lim?.get?.(input.id) || lim?.list?.()?.find((li: any) => li.id === input.id) || input;
        
        console.log(`[RoutingUI] Attempting connection for ${currentInput.id} -> ${currentInput.assignedDeviceId}`);
        
        if (!currentInput.assignedDeviceId) { 
            console.log(`[RoutingUI] No device assigned to ${currentInput.id}, detaching source`);
            bm.detachSource?.(currentInput.id); 
            return; 
        }
        
        // デバッグ: 利用可能なマイクと選択されたデバイスIDを詳細ログ
        const mics = im.getMicInputStatus?.() || [];
        console.log(`[RoutingUI] Available mics:`, mics.map((m: any) => ({ id: m.id, label: m.label, hasGainNode: !!m.gainNode })));
        console.log(`[RoutingUI] Looking for mic with ID: ${currentInput.assignedDeviceId}`);
        
        const mic = mics.find((m: any) => m.id === currentInput.assignedDeviceId);
        if (mic && mic.gainNode) {
            bm.ensureInput?.(currentInput);
            bm.attachSource?.(currentInput.id, mic.gainNode);
            bm.updateLogicInput?.(currentInput);
            console.log(`[RoutingUI] Successfully attached mic ${currentInput.assignedDeviceId} to ${currentInput.id}`);
        } else {
            console.warn(`[RoutingUI] Mic not found or no gainNode. Mic:`, mic);
            // 後で再試行
            this.scheduleRetry(input.id || input);
        }
    }

    render() {
        const logicInputs = this.logicInputManager.list();
        this.container.innerHTML = '';
        logicInputs.forEach(input => {
            const block = document.createElement('div');
            block.className = 'logic-input-block';
            block.style.border = '1px solid #ccc';
            block.style.padding = '6px 8px';
            block.style.margin = '6px 0';
            block.style.background = '#fff';
            block.style.fontSize = '12px';

            const title = document.createElement('div');
            title.textContent = input.label;
            title.style.fontWeight = 'bold';
            title.style.marginBottom = '4px';
            block.appendChild(title);

            const controls = document.createElement('div');
            controls.style.display = 'flex';
            controls.style.alignItems = 'center';
            controls.style.flexWrap = 'wrap';
            controls.style.gap = '8px';

            // Enable
            const enableLabel = document.createElement('label');
            enableLabel.style.display = 'flex';
            enableLabel.style.alignItems = 'center';
            enableLabel.style.gap = '4px';
            enableLabel.innerHTML = `<input type="checkbox" id="enable-${input.id}" ${input.enabled ? 'checked' : ''}/>Enable`;
            controls.appendChild(enableLabel);

            // Routing checkboxes
            const synthLabel = document.createElement('label');
            synthLabel.innerHTML = `<input type="checkbox" id="route-synth-${input.id}" ${input.routing.synth ? 'checked' : ''}/>Synth`;
            controls.appendChild(synthLabel);

            const fxLabel = document.createElement('label');
            fxLabel.innerHTML = `<input type="checkbox" id="route-effects-${input.id}" ${input.routing.effects ? 'checked' : ''}/>Fx`;
            controls.appendChild(fxLabel);

            const monLabel = document.createElement('label');
            monLabel.innerHTML = `<input type="checkbox" id="route-monitor-${input.id}" ${input.routing.monitor ? 'checked' : ''}/>Mon`;
            controls.appendChild(monLabel);

            // Gain slider + value
            const gainWrapper = document.createElement('div');
            gainWrapper.style.display = 'flex';
            gainWrapper.style.alignItems = 'center';
            gainWrapper.style.gap = '4px';
            gainWrapper.innerHTML = `<span>Gain</span><input type="range" id="gain-${input.id}" min="0" max="2" step="0.01" value="${input.gain}" style="width:80px;"/><span id="gain-val-${input.id}" style="font-family:monospace;">${input.gain.toFixed(2)}</span>`;
            controls.appendChild(gainWrapper);

            block.appendChild(controls);
            this.container.appendChild(block);

            // Event wiring
            block.querySelector<HTMLInputElement>(`#enable-${input.id}`)?.addEventListener('change', (e) => {
                const enabled = (e.target as HTMLInputElement).checked;
                this.logicInputManager.enableInput(input.label, enabled);
                input.enabled = enabled;
                this.propagateEnable(input);
                // 追加: 有効化直後に物理ソース接続を即試行（遅延での無音期間を短縮）
                if (enabled) {
                    this.connectPhysicalSourceIfAvailable(input);
                } else {
                    const bm: any = (window as any).busManager;
                    bm?.detachSource?.(input.id);
                }
            });
            block.querySelector<HTMLInputElement>(`#route-synth-${input.id}`)?.addEventListener('change', (e) => {
                input.routing.synth = (e.target as HTMLInputElement).checked;
                this.logicInputManager.updateRouting(input.id, input.routing, input.gain);
                this.propagateRouting(input);
            });
            block.querySelector<HTMLInputElement>(`#route-effects-${input.id}`)?.addEventListener('change', (e) => {
                input.routing.effects = (e.target as HTMLInputElement).checked;
                this.logicInputManager.updateRouting(input.id, input.routing, input.gain);
                this.propagateRouting(input);
            });
            block.querySelector<HTMLInputElement>(`#route-monitor-${input.id}`)?.addEventListener('change', (e) => {
                input.routing.monitor = (e.target as HTMLInputElement).checked;
                this.logicInputManager.updateRouting(input.id, input.routing, input.gain);
                this.propagateRouting(input);
            });
            block.querySelector<HTMLInputElement>(`#gain-${input.id}`)?.addEventListener('input', (e) => {
                input.gain = parseFloat((e.target as HTMLInputElement).value);
                this.logicInputManager.updateRouting(input.id, input.routing, input.gain);
                const gv = block.querySelector(`#gain-val-${input.id}`);
                if (gv) gv.textContent = input.gain.toFixed(2);
                this.propagateRouting(input);
            });

            // テスト音ボタン群 (TestSignalManager使用)
            const testWrap = document.createElement('div');
            testWrap.style.display = 'flex';
            testWrap.style.gap = '4px';
            testWrap.style.marginTop = '4px';

            function createTestButton(label: string, type: 'tone' | 'noise' | 'impulse') {
                const button = document.createElement('button');
                button.textContent = label;
                button.style.fontSize = '10px';
                button.style.padding = '2px 6px';
                button.addEventListener('click', () => injectTestSignal(type));
                return button;
            }

            const injectTestSignal = async (type: 'tone' | 'noise' | 'impulse') => {
                // Audio Output トグル状態確認
                const toggleAudio = document.getElementById('toggle-audio') as HTMLInputElement;
                if (!toggleAudio?.checked) {
                    alert('Audio Output is OFF. Please turn on "Audio Output" toggle first.');
                    return;
                }

                // Base Audio 未初期化なら要求
                if (!window.audioCtx) {
                    console.warn('[TestSignal] AudioContext not initialized. Enable Test Signals first.');
                    alert('Audio Engine not initialized. Please click "🔊 Enable Test Signals" first.');
                    return;
                }

                // TestSignalManager 確認
                if (!window.testSignalManager) {
                    console.warn('[TestSignal] TestSignalManager not available. Enable Test Signals first.');
                    alert('Test Signal Manager not available. Please click "🔊 Enable Test Signals" first.');
                    return;
                }

                // BusManager 確認 (input 確保用)
                const bm: any = (window as any).busManager;
                if (!bm) {
                    console.warn('[TestSignal] BusManager not available. Enable Test Signals first.');
                    alert('Audio Bus not available. Please click "🔊 Enable Test Signals" first.');
                    return;
                }

                // Input 確保 & ルーティング準備
                bm.ensureInput?.(input);

                // monitor が全て false の場合一時的に monitor = true でルーティング
                const needTempMon = !input.routing.monitor && !input.routing.synth && !input.routing.effects;
                if (needTempMon) {
                    input.routing.monitor = true;
                    bm.updateLogicInput?.(input);
                } else {
                    bm.updateLogicInput?.(input);
                }

                // TestSignalManager でテスト信号開始
                try {
                    await window.testSignalManager.start(type, input.id);

                    // 一時的にmonitorを有効にした場合、信号終了後に戻す
                    if (needTempMon) {
                        const duration = type === 'impulse' ? 100 : 600; // ms
                        setTimeout(() => {
                            input.routing.monitor = false;
                            bm.updateLogicInput?.(input);
                        }, duration + 50); // 余裕をもって復元
                    }
                } catch (error) {
                    console.error(`[TestSignal] Failed to start ${type} signal:`, error);

                    // エラー時もmonitor状態を復元
                    if (needTempMon) {
                        input.routing.monitor = false;
                        bm.updateLogicInput?.(input);
                    }
                }
            };

            testWrap.appendChild(createTestButton('Tone', 'tone'));
            testWrap.appendChild(createTestButton('Noise', 'noise'));
            testWrap.appendChild(createTestButton('Imp', 'impulse'));
            block.appendChild(testWrap);

            // 入力メータ
            const meterOuter = document.createElement('div');
            meterOuter.style.position = 'relative';
            meterOuter.style.height = '6px';
            meterOuter.style.background = '#223';
            meterOuter.style.borderRadius = '2px';
            meterOuter.style.marginTop = '4px';
            const meterFill = document.createElement('div');
            meterFill.style.position = 'absolute'; meterFill.style.left = '0'; meterFill.style.top = '0'; meterFill.style.height = '100%'; meterFill.style.width = '0%'; meterFill.style.background = 'linear-gradient(90deg,#3fa,#0f5)';
            meterFill.setAttribute('data-logic-input-meter', input.id); // datasetからsetAttributeに変更
            meterOuter.appendChild(meterFill);
            block.appendChild(meterOuter);

            this.container.appendChild(block);

            // Event wiring
            block.querySelector<HTMLInputElement>(`#enable-${input.id}`)?.addEventListener('change', (e) => {
                const enabled = (e.target as HTMLInputElement).checked;
                this.logicInputManager.enableInput(input.label, enabled);
                input.enabled = enabled;
                this.propagateEnable(input);
                if (enabled) {
                    this.connectPhysicalSourceIfAvailable(input);
                } else {
                    const bm: any = (window as any).busManager;
                    bm?.detachSource?.(input.id);
                }
            });
            block.querySelector<HTMLInputElement>(`#route-synth-${input.id}`)?.addEventListener('change', (e) => {
                input.routing.synth = (e.target as HTMLInputElement).checked;
                this.logicInputManager.updateRouting(input.id, input.routing, input.gain);
                this.propagateRouting(input);
            });
            block.querySelector<HTMLInputElement>(`#route-effects-${input.id}`)?.addEventListener('change', (e) => {
                input.routing.effects = (e.target as HTMLInputElement).checked;
                this.logicInputManager.updateRouting(input.id, input.routing, input.gain);
                this.propagateRouting(input);
            });
            block.querySelector<HTMLInputElement>(`#route-monitor-${input.id}`)?.addEventListener('change', (e) => {
                input.routing.monitor = (e.target as HTMLInputElement).checked;
                this.logicInputManager.updateRouting(input.id, input.routing, input.gain);
                this.propagateRouting(input);
            });
            block.querySelector<HTMLInputElement>(`#gain-${input.id}`)?.addEventListener('input', (e) => {
                input.gain = parseFloat((e.target as HTMLInputElement).value);
                this.logicInputManager.updateRouting(input.id, input.routing, input.gain);
                const gv = block.querySelector(`#gain-val-${input.id}`);
                if (gv) gv.textContent = input.gain.toFixed(2);
                this.propagateRouting(input);
            });
        });
        // 初期接続試行
        logicInputs.forEach(li => this.connectPhysicalSourceIfAvailable(li));
        // アサイン変更イベントで再試行
        document.addEventListener('logic-input-assignment-changed', (e: any) => {
            const id = e?.detail?.id;
            if (id) {
                const li = this.logicInputManager.list().find(l => l.id === id);
                if (li) {
                    // Track ensure on assignment
                    if (li.enabled && li.assignedDeviceId && window.audioCtx) {
                        const existing = listTracks().find((t: any) => t.id === li.id);
                        if (!existing) {
                            const ctx = window.audioCtx as AudioContext;
                            const gain = ctx.createGain();
                            gain.gain.value = li.gain ?? 1;
                            createMicTrack(ctx, gain, li.id, li.label);
                        }
                    }
                            this.connectPhysicalSourceIfAvailable(li);
                }
            }
        });
        // メータ更新 loop (1つだけセット)
        if (!(window as any)._logicInputMeterLoop) {
            (window as any)._logicInputMeterLoop = true;
            // tmp バッファは per-analyser 保持方式へ移行したため不要
            const loop = () => {
                const now = performance.now();
                
                // 更新頻度制限: 33ms間隔（約30FPS）でのみ実行
                if (now - this.lastMeterUpdate < this.meterUpdateInterval) {
                    requestAnimationFrame(loop);
                    return;
                }
                this.lastMeterUpdate = now;
                
                try {
                    const bm: any = (window as any).busManager; 
                    const ctx: AudioContext | undefined = (window as any).audioCtx;
                    if (bm && ctx) {
                        // 一度だけ詳細デバッグ情報を出力
                        if (!this.debugInfoLogged) {
                            const currentLogicInputs = this.logicInputManager.list();
                            console.group('[RoutingUI] Debug Info - Logic Inputs and Gain Nodes');
                            console.log('Available Logic Inputs:', currentLogicInputs.map(li => ({ id: li.id, label: li.label, enabled: li.enabled })));
                            if (bm.getInputGainNode) {
                                const gainNodeStatus = currentLogicInputs.map(li => ({
                                    id: li.id,
                                    hasGainNode: !!bm.getInputGainNode(li.id),
                                    gainNode: bm.getInputGainNode(li.id)
                                }));
                                console.log('Gain Node Status:', gainNodeStatus);
                                
                                // BusManager内部のinputConnections状態も確認
                                console.log('BusManager inputConnections:', (bm as any).inputConnections);
                            } else {
                                console.warn('BusManager does not have getInputGainNode method');
                            }
                            
                            // メーター要素の存在確認
                            const meterElements = this.container.querySelectorAll('[data-logic-input-meter]');
                            console.log('Found meter elements:', Array.from(meterElements).map(el => el.getAttribute('data-logic-input-meter')));
                            // nullSink 準備
                            if (!this.nullSink) {
                                this.nullSink = ctx.createGain();
                                this.nullSink.gain.value = 0;
                                this.nullSink.connect(ctx.destination);
                                console.log('[RoutingUI] Created nullSink for analyser pull');
                            }
                            
                            console.groupEnd();
                            this.debugInfoLogged = true;
                        }
                        
                        // LogicInputManagerから最新のリストを取得
                        const currentLogicInputs = this.logicInputManager.list();
                        currentLogicInputs.forEach((li: LogicInput) => {
                            const g: GainNode | undefined = bm.getInputGainNode?.(li.id);
                            if (!g) {
                                if (!this.missingGainNodes.has(li.id)) {
                                    console.warn(`[RoutingUI] No gain node found for logic input: ${li.id}. BusManager may not have this input configured.`);
                                    this.missingGainNodes.add(li.id);
                                }
                                return;
                            }
                            // 直接MicRouterからメーターレベルを取得
                            const im: any = (window as any).inputManager;
                            const micRouter = im?.getMicRouter?.();
                            let level = 0;
                            
                            if (micRouter && li.assignedDeviceId) {
                                // Logic Input IDに対応するMicInputを取得
                                const micInput = micRouter.getMicInput(li.id);
                                if (micInput && micInput.gainNode) {
                                    console.log(`[RoutingUI] Using direct MicRouter connection for ${li.id}`);
                                    // MicRouterの実際のaudio nodeから直接メーターを作成
                                    let entry = this.inputAnalysers.get(li.id);
                                    if (!entry) {
                                        const an = ctx.createAnalyser();
                                        an.fftSize = 256;
                                        an.smoothingTimeConstant = 0.5;
                                        const data = new Uint8Array(an.fftSize);
                                        try {
                                            // MicRouterのgainNodeに直接接続
                                            micInput.gainNode.connect(an);
                                            if (this.nullSink) an.connect(this.nullSink); // pull 用
                                            console.log(`[RoutingUI] Attached analyser directly to MicRouter for ${li.id}`);
                                        } catch (e) {
                                            console.warn(`[RoutingUI] Failed to attach analyser to MicRouter for ${li.id}`, e);
                                            return;
                                        }
                                        entry = { an, data };
                                        this.inputAnalysers.set(li.id, entry);
                                    }
                                    
                                    const { an } = entry;
                                    const used = new Uint8Array(an.fftSize);
                                    an.getByteTimeDomainData(used);
                                    let sum = 0;
                                    for (let i = 0; i < used.length; i++) {
                                        const v = (used[i] - 128) / 128;
                                        sum += v * v;
                                    }
                                    const rms = Math.sqrt(sum / used.length);
                                    const rawLevel = Math.min(1, Math.pow(rms, 0.5));
                                    const prevLevel = this.meterValues.get(li.id) || 0;
                                    const smoothingFactor = 0.5;
                                    level = prevLevel * smoothingFactor + rawLevel * (1 - smoothingFactor);
                                    this.meterValues.set(li.id, level);
                                } else {
                                    console.log(`[RoutingUI] No MicRouter connection found for ${li.id}, assignedDeviceId: ${li.assignedDeviceId}`);
                                }
                            }
                            
                            // フォールバック: BusManagerからのメーター取得 (Apply DSP後)
                            if (level === 0 && g) {
                                console.log(`[RoutingUI] Using BusManager fallback for ${li.id}`);
                                // 既存のBusManager経由のロジック
                                let entry = this.inputAnalysers.get(li.id + '_fallback');
                                if (!entry) {
                                    const an = ctx.createAnalyser();
                                    an.fftSize = 256;
                                    an.smoothingTimeConstant = 0.5;
                                    const data = new Uint8Array(an.fftSize);
                                    try {
                                        g.connect(an);
                                        if (this.nullSink) an.connect(this.nullSink);
                                        console.log(`[RoutingUI] Attached fallback analyser for ${li.id}`);
                                    } catch (e) {
                                        console.warn(`[RoutingUI] Failed to attach fallback analyser for ${li.id}`, e);
                                        return;
                                    }
                                    entry = { an, data };
                                    this.inputAnalysers.set(li.id + '_fallback', entry);
                                }
                                
                                const { an } = entry;
                                const used = new Uint8Array(an.fftSize);
                                an.getByteTimeDomainData(used);
                                let sum = 0;
                                for (let i = 0; i < used.length; i++) {
                                    const v = (used[i] - 128) / 128;
                                    sum += v * v;
                                }
                                const rms = Math.sqrt(sum / used.length);
                                const rawLevel = Math.min(1, Math.pow(rms, 0.5));
                                const prevLevel = this.meterValues.get(li.id) || 0;
                                const smoothingFactor = 0.5;
                                level = prevLevel * smoothingFactor + rawLevel * (1 - smoothingFactor);
                                this.meterValues.set(li.id, level);
                            }
                            const fill = this.container.querySelector(`div[data-logic-input-meter="${li.id}"]`) as HTMLDivElement | null;
                            if (fill) {
                                const displayLevel = level < 0.05 ? 0 : level; // ノイズフロア下げ
                                fill.style.width = (displayLevel * 100).toFixed(1) + '%';
                                if (displayLevel > 0.85) fill.style.background = 'linear-gradient(90deg,#f42,#a00)';
                                else if (displayLevel > 0.6) fill.style.background = 'linear-gradient(90deg,#fd4,#a60)';
                                else fill.style.background = 'linear-gradient(90deg,#3fa,#0f5)';
                            }
                        });
                    }
                } catch (error) {
                    console.log('[RoutingUI] Meter loop error:', error);
                }
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        }
    }

    // （テスト用アニメーションは削除済み。本番信号のみを表示）
}
