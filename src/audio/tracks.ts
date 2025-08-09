// src/audio/tracks.ts
// Trackレイヤーの最小実装（Step1: Faust Track化 & 互換維持）

// TrackKind型・DSPUnit・Trackインターフェースは IMPLEMENTATION_PLAN.md に準拠
export type TrackKind = 'mic' | 'faust' | 'sample' | 'bus' | 'controller' | 'midi' | 'custom';

export interface DSPUnit {
    id: string;
    node: AudioNode;
    getParamJSON?(): Promise<any>;
    setParam?(addr: string, v: number): void;
}

export interface Track {
    id: string;
    name: string;
    kind: TrackKind;
    inputNode: AudioNode;
    volumeGain: GainNode;
    outputNode: AudioNode; // = volumeGain
    dspChain: DSPUnit[];
    muted: boolean;
    solo: boolean;
}

// Track管理用の配列
const tracks: Track[] = [];

// Track環境の初期化（Step1: Faust Trackのみ対応）
export function createTrackEnvironment(audioCtx: AudioContext, faustNode: AudioNode): Track {
    // volume/mute/soloのためのGainNode
    const volumeGain = audioCtx.createGain();
    faustNode.connect(volumeGain);

    const track: Track = {
        id: 'faust1',
        name: 'Faust Synth',
        kind: 'faust',
        inputNode: faustNode,
        volumeGain,
        outputNode: volumeGain,
        dspChain: [{ id: 'faust1', node: faustNode }],
        muted: false,
        solo: false,
    };
    tracks.push(track);
    return track;
}

// Track一覧取得
export function listTracks(): Track[] {
    return tracks;
}

// 既存window.faustNodeとの互換維持用（Step1: 既存UI壊さないための暫定）
// 必要に応じてここでラップやプロキシを追加


// MicTrack生成API（Step2）
export function createMicTrack(audioCtx: AudioContext, micNode: AudioNode, id: string, label: string): Track {
    const volumeGain = audioCtx.createGain();
    micNode.connect(volumeGain);
    const track: Track = {
        id,
        name: label,
        kind: 'mic',
        inputNode: micNode,
        volumeGain,
        outputNode: volumeGain,
        dspChain: [],
        muted: false,
        solo: false,
    };
    tracks.push(track);
    return track;
}
