import { LogicInputManager } from './logicInputs';
import { createMicTrack, listTracks } from './tracks';

// ルーティングUI（論理Input単位のルーティング・ゲイン設定UI）
export class RoutingUI {
    constructor(
        private logicInputManager: LogicInputManager,
        private container: HTMLElement
    ) { }

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
            if (!im || !bm) return; // 待機
            const logicInputs = this.logicInputManager.list();
            let allDone = true;
            this.pendingAttach.forEach((attempts, logicId) => {
                const li = logicInputs.find(l => l.id === logicId);
                if (!li) { this.pendingAttach.delete(logicId); return; }
                const mic = im.getMicInputStatus?.().find((m: any) => m.id === li.assignedDeviceId);
                if (mic && mic.gainNode) {
                    bm.ensureInput?.(li);
                    bm.attachSource?.(li.id, mic.gainNode);
                    bm.updateLogicInput?.(li);
                    this.pendingAttach.delete(logicId);
                } else {
                    attempts += 1;
                    if (attempts > 50) { // 約10秒(200ms*50)で諦め
                        this.pendingAttach.delete(logicId);
                    } else {
                        this.pendingAttach.set(logicId, attempts);
                        allDone = false;
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
        if (!bm || !im) return;
        if (!input.assignedDeviceId) { bm.detachSource?.(input.id); return; }
        const mic = im.getMicInputStatus?.().find((m: any) => m.id === input.assignedDeviceId);
        if (mic && mic.gainNode) {
            bm.ensureInput?.(input);
            bm.attachSource?.(input.id, mic.gainNode);
            bm.updateLogicInput?.(input);
        } else {
            // 後で再試行
            this.scheduleRetry(input.id);
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

            // テスト音ボタン群
            const testWrap = document.createElement('div');
            testWrap.style.display = 'flex';
            testWrap.style.gap = '4px';
            testWrap.style.marginTop = '4px';
            function mk(label: string, fn: () => void) { const b = document.createElement('button'); b.textContent = label; b.style.fontSize = '10px'; b.style.padding = '2px 6px'; b.addEventListener('click', fn); return b; }
            const inject = (type: 'tone' | 'noise' | 'impulse') => {
                // AudioContext 未初期化なら apply DSP を要求
                if (!window.audioCtx) {
                    console.warn('[TestSignal] AudioContext not initialized. Apply DSP first.');
                    alert('Audio Engine not initialized. Please click "Apply DSP" first.');
                    return;
                }
                const bm: any = (window as any).busManager;
                if (!bm) {
                    console.warn('[TestSignal] BusManager not available. Apply DSP first.');
                    alert('Audio Bus not available. Please click "Apply DSP" first.');
                    return;
                }
                // ensure input
                bm.ensureInput?.(input);
                // monitor が全て false の場合一時的に monitor = true でルーティング
                let tempMon = false;
                if (!input.routing.monitor && !input.routing.synth && !input.routing.effects) {
                    input.routing.monitor = true; tempMon = true;
                    bm.updateLogicInput?.(input);
                } else {
                    bm.updateLogicInput?.(input);
                }
                const g: GainNode | undefined = bm.getInputGainNode?.(input.id);
                if (!g) {
                    console.warn('[TestSignal] Input gain node not available for', input.id);
                    return;
                }
                const ctx = window.audioCtx as AudioContext;
                if (type === 'tone') {
                    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 440; const eg = ctx.createGain(); eg.gain.value = 0.35; osc.connect(eg).connect(g); osc.start(); osc.stop(ctx.currentTime + 0.6); osc.onended = () => { try { osc.disconnect(); eg.disconnect(); } catch { } if (tempMon) { input.routing.monitor = false; bm.updateLogicInput?.(input); } };
                } else if (type === 'noise') {
                    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate); const data = buf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.25; const src = ctx.createBufferSource(); src.buffer = buf; src.connect(g); src.start(); src.stop(ctx.currentTime + 0.6); src.onended = () => { try { src.disconnect(); } catch { } if (tempMon) { input.routing.monitor = false; bm.updateLogicInput?.(input); } };
                } else if (type === 'impulse') {
                    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate); const data = buf.getChannelData(0); data[0] = 1; const src = ctx.createBufferSource(); src.buffer = buf; src.connect(g); src.start(); src.stop(ctx.currentTime + 0.1); src.onended = () => { try { src.disconnect(); } catch { } if (tempMon) { input.routing.monitor = false; bm.updateLogicInput?.(input); } };
                }
            };
            testWrap.appendChild(mk('Tone', () => inject('tone')));
            testWrap.appendChild(mk('Noise', () => inject('noise')));
            testWrap.appendChild(mk('Imp', () => inject('impulse')));
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
            meterFill.dataset.logicInputMeter = input.id;
            meterOuter.appendChild(meterFill);
            block.appendChild(meterOuter);

            this.container.appendChild(block);

            // Event wiring
            block.querySelector<HTMLInputElement>(`#enable-${input.id}`)?.addEventListener('change', (e) => {
                const enabled = (e.target as HTMLInputElement).checked;
                this.logicInputManager.enableInput(input.label, enabled);
                input.enabled = enabled;
                this.propagateEnable(input);
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
            const tmp = new Uint8Array(256);
            const loop = () => {
                try {
                    const bm: any = (window as any).busManager; const ctx: AudioContext | undefined = (window as any).audioCtx;
                    if (bm && ctx) {
                        logicInputs.forEach(li => {
                            const g: GainNode | undefined = bm.getInputGainNode?.(li.id);
                            if (!g) return;
                            // 簡易: analyser を逐次生成 (負荷低) → 最適化余地
                            const an = ctx.createAnalyser(); an.fftSize = 256; try { g.connect(an); } catch { }
                            an.getByteTimeDomainData(tmp);
                            let sum = 0; for (let i = 0; i < tmp.length; i++) { const v = (tmp[i] - 128) / 128; sum += v * v; }
                            const rms = Math.sqrt(sum / tmp.length);
                            const level = Math.min(1, Math.pow(rms, 0.5));
                            const fill = this.container.querySelector(`div[data-logic-input-meter="${li.id}"]`) as HTMLDivElement | null;
                            if (fill) {
                                fill.style.width = (level * 100).toFixed(1) + '%';
                                if (level > 0.85) fill.style.background = 'linear-gradient(90deg,#f42,#a00)';
                                else if (level > 0.6) fill.style.background = 'linear-gradient(90deg,#fd4,#a60)';
                                else fill.style.background = 'linear-gradient(90deg,#3fa,#0f5)';
                            }
                            try { g.disconnect(an); } catch { }
                        });
                    }
                } catch { }
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        }
    }
}
