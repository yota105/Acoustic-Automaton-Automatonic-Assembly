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
    }
}
