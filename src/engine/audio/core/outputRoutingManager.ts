const OUTPUT_ROUTING_EVENT = 'output-routing-changed';
const MAX_MONITORS = 3;

export type OutputTarget = 'main' | `monitor${number}`;
export type OutputState = 'default' | 'custom' | 'disabled' | 'error';

export interface OutputAssignment {
    target: OutputTarget;
    label: string;
    state: OutputState;
    deviceId: string | null;
    error?: string;
}

interface ChannelState extends OutputAssignment {
    gain: GainNode;
    connectedToCtx: boolean;
    mediaDest?: MediaStreamAudioDestinationNode;
    mediaConnected: boolean;
    audioEl?: HTMLAudioElement;
}

interface OutputRoutingOptions {
    monitorCount?: number;
    meterNode?: AudioNode;
}

export class OutputRoutingManager {
    private readonly channels = new Map<OutputTarget, ChannelState>();
    private hiddenContainer: HTMLElement | null = null;
    private readonly monitorCount: number;

    constructor(private readonly ctx: AudioContext, private readonly sourceNode: AudioNode, options: OutputRoutingOptions = {}) {
        this.monitorCount = Math.max(0, Math.min(MAX_MONITORS, options.monitorCount ?? 0));

        if (options.meterNode) {
            try {
                this.sourceNode.connect(options.meterNode);
            } catch {
                /* ignore connection errors */
            }
        }

        this.createChannel('main', 'Main Output', true);

        for (let i = 0; i < this.monitorCount; i++) {
            const id = `monitor${i + 1}` as OutputTarget;
            this.createChannel(id, `Monitor ${i + 1}`, false);
        }

        this.emitState();
    }

    public getAssignments(): OutputAssignment[] {
        return Array.from(this.channels.values()).map(channel => ({
            target: channel.target,
            label: channel.label,
            state: channel.state,
            deviceId: channel.deviceId,
            error: channel.error,
        }));
    }

    public async assign(target: OutputTarget, rawDeviceId: string): Promise<OutputAssignment> {
        const channel = this.channels.get(target);
        if (!channel) {
            throw new Error(`Unknown output target: ${target}`);
        }

        let deviceId = rawDeviceId ?? '';
        if (target === 'main' && deviceId === 'disabled') {
            deviceId = 'default';
        }

        try {
            if (deviceId === '' || deviceId === 'default') {
                this.disconnectMedia(channel);
                this.connectToCtx(channel);
                channel.deviceId = 'default';
                channel.state = 'default';
                channel.error = undefined;
            } else if (deviceId === 'disabled') {
                this.disconnectMedia(channel);
                this.disconnectFromCtx(channel);
                channel.deviceId = null;
                channel.state = 'disabled';
                channel.error = undefined;
            } else {
                await this.routeToDevice(channel, deviceId);
            }
        } catch (error) {
            const message = (error as Error)?.message ?? String(error);
            console.warn(`[OutputRouting] assignment failed for ${target}:`, message);
            this.disconnectMedia(channel);
            this.connectToCtx(channel);
            channel.deviceId = 'default';
            channel.state = 'error';
            channel.error = message;
        }

        this.emitState();
        return {
            target: channel.target,
            label: channel.label,
            state: channel.state,
            deviceId: channel.deviceId,
            error: channel.error,
        };
    }

    private createChannel(id: OutputTarget, label: string, connectToCtx: boolean) {
        const gain = this.ctx.createGain();
        gain.gain.value = 1;

        try {
            this.sourceNode.connect(gain);
        } catch {
            /* ignore connection errors */
        }

        const state: ChannelState = {
            target: id,
            label,
            state: connectToCtx ? 'default' : 'disabled',
            deviceId: connectToCtx ? 'default' : null,
            error: undefined,
            gain,
            connectedToCtx: false,
            mediaConnected: false,
        };

        if (connectToCtx) {
            this.connectToCtx(state);
        }

        this.channels.set(id, state);
    }

    private ensureContainer(): HTMLElement | null {
        if (typeof document === 'undefined') return null;
        if (this.hiddenContainer && document.body.contains(this.hiddenContainer)) {
            return this.hiddenContainer;
        }
        const container = document.createElement('div');
        container.id = 'output-routing-sinks';
        container.style.position = 'fixed';
        container.style.width = '0';
        container.style.height = '0';
        container.style.overflow = 'hidden';
        container.style.pointerEvents = 'none';
        container.style.opacity = '0';
        document.body.appendChild(container);
        this.hiddenContainer = container;
        return container;
    }

    private ensureAudioElement(channel: ChannelState): HTMLAudioElement | null {
        if (typeof document === 'undefined') return null;
        const container = this.ensureContainer();
        if (!container) return null;

        if (channel.audioEl && container.contains(channel.audioEl)) {
            return channel.audioEl;
        }

        const audio = channel.audioEl ?? document.createElement('audio');
        audio.autoplay = true;
        audio.loop = false;
        audio.controls = false;
        audio.muted = false;
        audio.style.display = 'none';
        audio.dataset.outputChannel = channel.target;

        container.appendChild(audio);
        channel.audioEl = audio;
        return audio;
    }

    private ensureMediaDestination(channel: ChannelState): MediaStreamAudioDestinationNode {
        if (!channel.mediaDest) {
            channel.mediaDest = this.ctx.createMediaStreamDestination();
        }
        if (!channel.mediaConnected) {
            try {
                channel.gain.connect(channel.mediaDest);
                channel.mediaConnected = true;
            } catch {
                /* ignore connection errors */
            }
        }
        return channel.mediaDest;
    }

    private connectToCtx(channel: ChannelState) {
        if (channel.connectedToCtx) return;
        try {
            channel.gain.connect(this.ctx.destination);
            channel.connectedToCtx = true;
        } catch {
            /* ignore connection errors */
        }
    }

    private disconnectFromCtx(channel: ChannelState) {
        if (!channel.connectedToCtx) return;
        try {
            channel.gain.disconnect(this.ctx.destination);
        } catch {
            /* ignore disconnection errors */
        }
        channel.connectedToCtx = false;
    }

    private disconnectMedia(channel: ChannelState) {
        if (channel.mediaDest && channel.mediaConnected) {
            try {
                channel.gain.disconnect(channel.mediaDest);
            } catch {
                /* ignore disconnection errors */
            }
            channel.mediaConnected = false;
        }

        if (channel.audioEl) {
            try {
                channel.audioEl.pause();
            } catch {
                /* ignore */
            }
            channel.audioEl.srcObject = null;
        }
    }

    private async routeToDevice(channel: ChannelState, deviceId: string) {
        const audio = this.ensureAudioElement(channel);
        if (!audio) {
            throw new Error('Unable to create audio sink element');
        }

        const mediaDest = this.ensureMediaDestination(channel);
        if (audio.srcObject !== mediaDest.stream) {
            audio.srcObject = mediaDest.stream;
        }

        const setSink = (audio as any).setSinkId as ((sinkId: string) => Promise<void>) | undefined;
        if (typeof setSink !== 'function') {
            throw new Error('setSinkId unsupported in this browser');
        }

        this.disconnectFromCtx(channel);

        try {
            await setSink.call(audio, deviceId);
        } catch (error) {
            throw new Error(`setSinkId failed: ${(error as Error)?.message ?? error}`);
        }

        try {
            await audio.play();
        } catch (error) {
            console.warn('[OutputRouting] audio element play() rejected', error);
        }

        channel.deviceId = deviceId;
        channel.state = 'custom';
        channel.error = undefined;
    }

    private emitState() {
        if (typeof document === 'undefined') return;
        const detail = this.getAssignments();
        document.dispatchEvent(new CustomEvent(OUTPUT_ROUTING_EVENT, { detail }));
    }
}

export const OUTPUT_ROUTING_CHANGED_EVENT = OUTPUT_ROUTING_EVENT;
