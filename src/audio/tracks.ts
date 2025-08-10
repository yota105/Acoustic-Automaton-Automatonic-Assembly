// src/audio/tracks.ts
// Trackレイヤーの最小実装（Step1: Faust Track化 & 互換維持） + 状態永続化(v1)

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
    userVolume?: number; // ユーザー設定の生ボリューム（mute/solo適用前）
    analyser?: AnalyserNode; // メータ用
    lastLevel?: number; // 直近計測レベル(0-1)
}

// --- 永続化 (v1) ----------------------------------------------------------
interface PersistTrackStateV1 { id: string; name: string; userVolume: number; muted: boolean; solo: boolean; }
const TRACK_PERSIST_KEY = 'tracksState/v1';
let loadedTrackState: Record<string, PersistTrackStateV1> = {};
let saveTimer: number | null = null;

function loadTrackStateOnce() {
    if (typeof window === 'undefined') return;
    try {
        const raw = window.localStorage.getItem(TRACK_PERSIST_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && Array.isArray(parsed.tracks)) {
            for (const t of parsed.tracks as PersistTrackStateV1[]) {
                loadedTrackState[t.id] = t;
            }
        }
    } catch { /* ignore */ }
}
loadTrackStateOnce();

function applyPersistentState(track: Track) {
    const st = loadedTrackState[track.id];
    if (!st) return;
    track.name = st.name;
    track.userVolume = st.userVolume;
    track.muted = st.muted;
    track.solo = st.solo;
}

function scheduleSaveTracks() {
    if (typeof window === 'undefined') return;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveTracksState, 120);
}

function saveTracksState() {
    try {
        const data: PersistTrackStateV1[] = tracks.map(t => ({
            id: t.id,
            name: t.name,
            userVolume: t.userVolume ?? 1,
            muted: !!t.muted,
            solo: !!t.solo,
        }));
        window.localStorage.setItem(TRACK_PERSIST_KEY, JSON.stringify({ version: 1, tracks: data }));
    } catch { /* ignore */ }
}

function hookPersistenceEvents() {
    if (typeof document === 'undefined') return;
    document.addEventListener('track-volume-changed', scheduleSaveTracks);
    document.addEventListener('tracks-changed', scheduleSaveTracks); // mute / solo / 追加削除
    document.addEventListener('track-name-changed', scheduleSaveTracks);
}
hookPersistenceEvents();
// -------------------------------------------------------------------------

// Track管理用の配列
const tracks: Track[] = [];

function dispatchTracksChanged() {
    document.dispatchEvent(new CustomEvent('tracks-changed'));
}

function applyMuteSoloState() {
    const anySolo = tracks.some(t => t.solo);
    tracks.forEach(t => {
        const base = t.userVolume ?? 1;
        if (t.muted) {
            t.volumeGain.gain.value = 0;
        } else if (anySolo) {
            t.volumeGain.gain.value = t.solo ? base : 0;
        } else {
            t.volumeGain.gain.value = base;
        }
    });
}

export function setTrackVolume(id: string, vol: number) {
    const track = tracks.find(t => t.id === id);
    if (!track) return;
    track.userVolume = vol;
    applyMuteSoloState();
    document.dispatchEvent(new CustomEvent('track-volume-changed', { detail: { id, vol } }));
}

export function toggleMute(id: string) {
    const track = tracks.find(t => t.id === id);
    if (!track) return;
    track.muted = !track.muted;
    applyMuteSoloState();
    dispatchTracksChanged();
}

export function toggleSolo(id: string) {
    const track = tracks.find(t => t.id === id);
    if (!track) return;
    track.solo = !track.solo;
    applyMuteSoloState();
    dispatchTracksChanged();
}

// Track環境の初期化（Step1: Faust Trackのみ対応）
export function createTrackEnvironment(audioCtx: AudioContext, faustNode: AudioNode): Track {
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
        userVolume: 1,
    };
    applyPersistentState(track);
    tracks.push(track);
    applyMuteSoloState();
    dispatchTracksChanged();
    return track;
}

// Track一覧取得
export function listTracks(): Track[] { return tracks; }

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
        userVolume: 1,
    };
    applyPersistentState(track);
    tracks.push(track);
    applyMuteSoloState();
    dispatchTracksChanged();
    return track;
}

function ensureAnalyser(track: Track, ctx: AudioContext) {
    if (!track.analyser) {
        const an = ctx.createAnalyser();
        an.fftSize = 256;
        an.smoothingTimeConstant = 0.7;
        try { track.volumeGain.connect(an); } catch { /* ignore */ }
        track.analyser = an;
    }
}

export function getTrackLevels(ctx: AudioContext): { id: string; level: number }[] {
    const out: { id: string; level: number }[] = [];
    const tmp = new Uint8Array(256);
    for (const t of tracks) {
        ensureAnalyser(t, ctx);
        if (t.analyser) {
            t.analyser.getByteTimeDomainData(tmp);
            let sum = 0;
            for (let i = 0; i < tmp.length; i++) {
                const v = (tmp[i] - 128) / 128; // -1..1
                sum += v * v;
            }
            const rms = Math.sqrt(sum / tmp.length); // 0..1
            const level = Math.min(1, Math.pow(rms, 0.5));
            t.lastLevel = level;
            out.push({ id: t.id, level });
        }
    }
    return out;
}

export function disposeTrack(id: string) {
    const idx = tracks.findIndex(t => t.id === id);
    if (idx < 0) return;
    try {
        try { tracks[idx].inputNode.disconnect(); } catch { /* ignore */ }
        try { tracks[idx].volumeGain.disconnect(); } catch { /* ignore */ }
    } finally {
        tracks.splice(idx, 1);
        applyMuteSoloState();
        dispatchTracksChanged();
    }
}

export function ensureTrack(id: string): Track | undefined { return tracks.find(t => t.id === id); }

export function setTrackName(id: string, name: string) {
    const track = tracks.find(t => t.id === id);
    if (!track) return;
    if (track.name === name) return;
    track.name = name;
    document.dispatchEvent(new CustomEvent('track-name-changed', { detail: { id, name } }));
}
