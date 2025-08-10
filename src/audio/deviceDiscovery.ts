// Audio device discovery & watching + persistence(v1) & enable toggle
export interface SimpleDeviceInfo { id: string; label: string; enabled: boolean; kind: 'input' | 'output'; }

const DEVICE_KEY = 'audioDevices/v1';

export class DeviceDiscovery {
    private devices: SimpleDeviceInfo[] = [];
    private permissionTried = false;
    private saveTimer: number | null = null;

    constructor() {
        if (navigator?.mediaDevices) {
            navigator.mediaDevices.addEventListener('devicechange', () => {
                this.enumerate();
            });
        }
        this.loadPersisted();
    }

    private scheduleSave() {
        if (typeof window === 'undefined') return;
        if (this.saveTimer) window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => this.save(), 150);
    }

    private save() {
        try {
            window.localStorage.setItem(DEVICE_KEY, JSON.stringify({ version: 1, devices: this.devices }));
        } catch { /* ignore */ }
    }

    private loadPersisted() {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(DEVICE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (parsed && parsed.version === 1 && Array.isArray(parsed.devices)) {
                this.devices = parsed.devices as SimpleDeviceInfo[];
            }
        } catch { /* ignore */ }
    }

    async ensurePermission() {
        if (this.permissionTried) return;
        this.permissionTried = true;
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch { /* ignore permission denial */ }
    }

    async enumerate() {
        try {
            await this.ensurePermission();
            const devs = await navigator.mediaDevices.enumerateDevices();
            const list: SimpleDeviceInfo[] = devs.filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput').map(d => ({
                id: d.deviceId || crypto.randomUUID(),
                label: d.label || (d.kind === 'audioinput' ? 'Audio Input' : 'Audio Output'),
                enabled: this.devices.find(x => x.id === d.deviceId)?.enabled ?? true,
                kind: d.kind === 'audioinput' ? 'input' : 'output'
            }));
            this.devices = list;
            this.scheduleSave();
            document.dispatchEvent(new CustomEvent('audio-devices-updated'));
        } catch (e) {
            console.warn('[DeviceDiscovery] enumerate failed', e);
        }
    }

    listInputs(): SimpleDeviceInfo[] { return this.devices.filter(d => d.kind === 'input'); }
    listOutputs(): SimpleDeviceInfo[] { return this.devices.filter(d => d.kind === 'output'); }

    setDeviceEnabled(id: string, enabled: boolean) {
        const d = this.devices.find(dev => dev.id === id);
        if (!d) return;
        if (d.enabled === enabled) return;
        d.enabled = enabled;
        this.scheduleSave();
        document.dispatchEvent(new CustomEvent('audio-device-enabled-changed', { detail: { id, enabled } }));
    }
}
