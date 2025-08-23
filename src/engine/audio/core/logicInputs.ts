// 論理Inputリストの管理・編集・保存 (v3 persistence 拡張)
export interface LogicInput {
    id: string;
    label: string;
    assignedDeviceId: string | null;
    routing: { synth: boolean; effects: boolean; monitor: boolean; };
    gain: number;
    enabled: boolean; // Added enabled property
    trackId?: string | null; // 生成されたTrack参照
    order?: number; // 並び順 (v3 追加)
    trackMixSnapshot?: { userVolume?: number; muted?: boolean; solo?: boolean; }; // Track未生成時に保持するミックス状態 (将来統合用)
}

interface PersistV2 extends Omit<LogicInput, 'trackId' | 'order' | 'trackMixSnapshot'> { trackId?: string | null; }
interface PersistV3 extends Omit<LogicInput, 'trackMixSnapshot'> { trackMixSnapshot?: LogicInput['trackMixSnapshot']; }

export class LogicInputManager {
    private inputs: LogicInput[] = [];
    private storageKeyV3 = 'logicInputs/v3';
    private storageKey = 'logicInputs/v2'; // 旧v2 (migration用)
    private legacyKey = 'logicInputs/v1';
    private saveTimer: number | null = null;
    private onDisposeTrack?: (trackId: string) => void;

    constructor() {
        this.load();
    }

    private scheduleSave() {
        if (typeof window === 'undefined') return;
        if (this.saveTimer) window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => this.save(), 150);
    }

    private save() {
        try {
            const data: PersistV3[] = this.inputs.map(i => ({
                id: i.id,
                label: i.label,
                assignedDeviceId: i.assignedDeviceId,
                routing: i.routing,
                gain: i.gain,
                enabled: i.enabled,
                trackId: i.trackId ?? null,
                order: i.order,
                trackMixSnapshot: i.trackMixSnapshot
            }));
            window.localStorage.setItem(this.storageKeyV3, JSON.stringify({ version: 3, inputs: data }));
        } catch { /* ignore */ }
    }

    load() {
        if (typeof window === 'undefined') return;
        // v3 優先
        try {
            const raw = window.localStorage.getItem(this.storageKeyV3);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.version === 3 && Array.isArray(parsed.inputs)) {
                    this.inputs = this.dedupV3(parsed.inputs as PersistV3[]).map(o => ({ ...o }));
                    this.normalizeOrder();
                    return;
                }
            }
        } catch { /* ignore */ }
        // fallback v2
        try {
            const raw = window.localStorage.getItem(this.storageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.version === 2 && Array.isArray(parsed.inputs)) {
                    const v2 = this.dedup(parsed.inputs as PersistV2[]).map(o => ({ ...o }));
                    this.inputs = v2.map((o, idx) => ({ ...o, order: idx, trackMixSnapshot: undefined, enabled: o.enabled ?? false }));
                    this.scheduleSave(); // v3 形式で保存
                    return;
                }
            }
        } catch { /* ignore */ }
        // fallback v1
        try {
            const raw = window.localStorage.getItem(this.legacyKey);
            if (!raw) return;
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                const migrated = this.dedup(arr).map((o: any, idx: number) => ({ ...o, trackId: null, order: idx, enabled: false } as LogicInput));
                this.inputs = migrated;
                this.scheduleSave();
            }
        } catch { /* ignore */ }
    }

    private dedup(arr: PersistV2[]): LogicInput[] {
        const seen = new Set<string>();
        const out: LogicInput[] = [];
        for (const o of arr) {
            if (!o || typeof o.id !== 'string') continue;
            const label = typeof o.label === 'string' ? o.label : '';
            if (label && seen.has(label)) continue;
            seen.add(label);
            out.push({ ...o, enabled: o.enabled ?? false });
        }
        return out;
    }

    private dedupV3(arr: PersistV3[]): LogicInput[] {
        // v3 では重複ラベル許可するか後で検討。現状は従来通りラベル重複スキップ。
        const seen = new Set<string>();
        const out: LogicInput[] = [];
        for (const o of arr) {
            if (!o || typeof o.id !== 'string') continue;
            const label = typeof o.label === 'string' ? o.label : '';
            if (label && seen.has(label)) continue;
            seen.add(label);
            out.push({ ...o, enabled: o.enabled ?? false });
        }
        return out;
    }

    private normalizeOrder() {
        // order 欠損や重複をインデックスで再割当
        this.inputs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        this.inputs.forEach((i, idx) => { i.order = idx; });
    }

    list(): LogicInput[] { return this.inputs; }

    add(input: Omit<LogicInput, 'id'> & { id?: string } | (Omit<LogicInput, 'id' | 'enabled'> & { id?: string })): LogicInput {
        const id = (input as any).id || `input${this.inputs.length + 1}`;
        const logicInput: LogicInput = { ...(input as any), id, enabled: false, trackId: (input as any).trackId ?? null };
        console.log(`[LogicInputManager] Adding input ${id} with enabled: ${logicInput.enabled}`); // デバッグ
        if (logicInput.order == null) logicInput.order = this.inputs.length;
        this.inputs.push(logicInput);
        this.scheduleSave();
        return logicInput;
    }

    // デバッグ用: 全てのenabledをfalseに強制設定
    forceDisableAll() {
        console.log('[LogicInputManager] Force disabling all inputs');
        this.inputs.forEach(input => {
            console.log(`[LogicInputManager] Input ${input.id}: enabled ${input.enabled} -> false`);
            input.enabled = false;
        });
        this.scheduleSave();
    }

    reorder(id: string, newIndex: number) {
        const idx = this.inputs.findIndex(i => i.id === id);
        if (idx < 0) return;
        const [item] = this.inputs.splice(idx, 1);
        if (newIndex < 0) newIndex = 0;
        if (newIndex > this.inputs.length) newIndex = this.inputs.length;
        this.inputs.splice(newIndex, 0, item);
        this.normalizeOrder();
        this.scheduleSave();
        document.dispatchEvent(new CustomEvent('logic-inputs-reordered', { detail: { id, newIndex } }));
    }

    updateTrackMixSnapshot(logicInputId: string, snapshot: LogicInput['trackMixSnapshot']) {
        const input = this.inputs.find(i => i.id === logicInputId);
        if (!input) return;
        input.trackMixSnapshot = { ...(input.trackMixSnapshot || {}), ...snapshot };
        this.scheduleSave();
        document.dispatchEvent(new CustomEvent('logic-input-mix-snapshot-changed', { detail: { id: logicInputId, snapshot: input.trackMixSnapshot } }));
    }

    setTrackId(logicInputId: string, trackId: string | null) {
        const input = this.inputs.find(i => i.id === logicInputId);
        if (input) { input.trackId = trackId; this.scheduleSave(); }
    }

    remove(id: string) {
        const li = this.inputs.find(i => i.id === id);
        this.inputs = this.inputs.filter(i => i.id !== id);
        this.normalizeOrder();
        this.scheduleSave();
        if (li?.trackId && this.onDisposeTrack) {
            this.onDisposeTrack(li.trackId);
        }
    }

    assignDevice(logicInputId: string, deviceId: string | null) {
        const input = this.inputs.find(i => i.id === logicInputId);
        if (input) {
            input.assignedDeviceId = deviceId;
            this.scheduleSave();
        }
    }

    updateRouting(logicInputId: string, routing: LogicInput['routing'], gain: number) {
        const input = this.inputs.find(i => i.id === logicInputId);
        if (input) {
            input.routing = routing;
            input.gain = gain;
            this.scheduleSave();
        }
    }

    enableInput(indexOrLabel: number | string, enabled: boolean) {
        let input: LogicInput | undefined;
        if (typeof indexOrLabel === 'number') { input = this.inputs[indexOrLabel]; }
        else { input = this.inputs.find(i => i.label === indexOrLabel || i.id === indexOrLabel); }
        if (input) { input.enabled = enabled; this.scheduleSave(); }
    }

    setLabel(logicInputId: string, label: string) {
        const input = this.inputs.find(i => i.id === logicInputId);
        if (!input) return;
        if (input.label === label) return;
        input.label = label;
        this.scheduleSave();
        document.dispatchEvent(new CustomEvent('logic-input-label-changed', { detail: { id: logicInputId, label } }));
    }

    setTrackDisposer(fn: (trackId: string) => void) { this.onDisposeTrack = fn; }

    getInputs() { return this.inputs; }
}
