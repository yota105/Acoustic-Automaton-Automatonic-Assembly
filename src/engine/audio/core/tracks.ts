// src/audio/tracks.ts
// Trackレイヤーの最小実装（Step1: Faust Track化 & 互換維持） + 状態永続化(v1)
// + Step(次): per-track insert FX チェーン MVP 追加

import { createEffectInstance, EffectInstance } from '../effects/effectRegistry';

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
    insertEffects?: EffectInstance[]; // 追加: 挿入エフェクトチェーン（順序保持）
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
    console.log(`[Tracks] Applying mute/solo state. Any solo: ${anySolo}`);

    tracks.forEach(t => {
        const base = t.userVolume ?? 1;
        let newGain = 0;

        if (t.muted) {
            newGain = 0;
        } else if (anySolo) {
            newGain = t.solo ? base : 0;
        } else {
            newGain = base;
        }

        console.log(`[Tracks] Track ${t.id}: userVolume=${base}, muted=${t.muted}, solo=${t.solo} -> gain=${newGain}`);
        t.volumeGain.gain.value = newGain;
    });
}

export function setTrackVolume(id: string, vol: number) {
    const track = tracks.find(t => t.id === id);
    if (!track) return;

    // 音量制御診断ログ
    console.log(`[Tracks] Setting volume for ${id}: ${vol} (current gain: ${track.volumeGain.gain.value})`);

    track.userVolume = vol;
    applyMuteSoloState();

    // 設定後の確認
    console.log(`[Tracks] After volume set - user: ${track.userVolume}, actual gain: ${track.volumeGain.gain.value}, muted: ${track.muted}, solo: ${track.solo}`);

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

// Trackエフェクトチェーン再構築
function rebuildTrackInsertChain(track: Track) {
    // 既存接続解除
    try { track.inputNode.disconnect(); } catch { /* ignore */ }
    track.insertEffects?.forEach(fx => { try { fx.node.disconnect(); } catch { /* ignore */ } });
    // 有効な(非bypass)ノード列を構築
    const active: AudioNode[] = [];
    (track.insertEffects || []).forEach(fx => { if (!fx.bypass) active.push(fx.node); });
    let prev: AudioNode = track.inputNode;
    active.forEach(n => { try { prev.connect(n); prev = n; } catch { /* ignore */ } });
    try { prev.connect(track.volumeGain); } catch { /* ignore */ }
    document.dispatchEvent(new CustomEvent('track-effects-changed', { detail: { trackId: track.id, effects: listTrackEffectsMeta(track.id) } }));
}

async function ensureAudioCtx(): Promise<AudioContext> {
    const ctx = (window as any).audioCtx as AudioContext | undefined;
    if (!ctx) throw new Error('audioCtx 未初期化');
    return ctx;
}

export async function addTrackEffect(trackId: string, refId: string) {
    const track = tracks.find(t => t.id === trackId);
    if (!track) throw new Error('Track not found');
    const ctx = await ensureAudioCtx();
    if (!track.insertEffects) track.insertEffects = [];
    const inst = await createEffectInstance(refId, ctx);
    track.insertEffects.push(inst);
    rebuildTrackInsertChain(track);
    return { id: inst.id, refId: inst.refId, bypass: inst.bypass, kind: inst.kind };
}

export function removeTrackEffect(effectId: string) {
    for (const track of tracks) {
        const list = track.insertEffects;
        if (!list) continue;
        const idx = list.findIndex(fx => fx.id === effectId);
        if (idx >= 0) {
            const [inst] = list.splice(idx, 1);
            try { inst.dispose(); } catch { /* ignore */ }
            rebuildTrackInsertChain(track);
            return true;
        }
    }
    return false;
}

export function toggleTrackEffectBypass(effectId: string) {
    for (const track of tracks) {
        const list = track.insertEffects; if (!list) continue;
        const inst = list.find(fx => fx.id === effectId);
        if (inst) {
            inst.bypass = !inst.bypass;
            rebuildTrackInsertChain(track);
            return inst.bypass;
        }
    }
    return undefined;
}

export function moveTrackEffect(trackId: string, effectId: string, newIndex: number) {
    const track = tracks.find(t => t.id === trackId);
    if (!track || !track.insertEffects) return false;
    const idx = track.insertEffects.findIndex(fx => fx.id === effectId);
    if (idx < 0) return false;
    const [inst] = track.insertEffects.splice(idx, 1);
    if (newIndex < 0) newIndex = 0;
    if (newIndex > track.insertEffects.length) newIndex = track.insertEffects.length;
    track.insertEffects.splice(newIndex, 0, inst);
    rebuildTrackInsertChain(track);
    return true;
}

export function listTrackEffectsMeta(trackId: string) {
    const track = tracks.find(t => t.id === trackId);
    if (!track || !track.insertEffects) return [];
    return track.insertEffects.map((fx, i) => ({ id: fx.id, refId: fx.refId, bypass: fx.bypass, index: i, kind: fx.kind }));
}

// 効率用: effectId -> trackId 検索
export function findTrackIdByEffect(effectId: string): string | undefined {
    for (const t of tracks) {
        if (t.insertEffects?.some(fx => fx.id === effectId)) return t.id;
    }
    return undefined;
}

// Track環境の初期化（Step1: Faust Trackのみ対応）
export function createTrackEnvironment(audioCtx: AudioContext, faustNode: AudioNode): Track {
    console.log('[Tracks] Creating Faust track environment...');

    // 既存の接続を一旦切断（重複接続防止）
    try {
        faustNode.disconnect();
        console.log('[Tracks] Disconnected existing Faust node connections');
    } catch (error) {
        console.log('[Tracks] No existing connections to disconnect');
    }

    const volumeGain = audioCtx.createGain();
    faustNode.connect(volumeGain);
    console.log('[Tracks] Connected Faust node to volume gain');

    if ((window as any).busManager?.getEffectsInputNode) {
        try {
            volumeGain.connect((window as any).busManager.getEffectsInputNode());
            console.log('[Tracks] Connected volume gain to busManager');
        } catch (error) {
            console.warn('[Tracks] Failed to connect to busManager:', error);
        }
    }
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
        insertEffects: []
    };
    applyPersistentState(track);
    tracks.push(track);
    applyMuteSoloState();
    dispatchTracksChanged();

    console.log(`[Tracks] Faust track created. Volume gain: ${track.volumeGain.gain.value}`);
    return track;
}

// Track一覧取得
export function listTracks(): Track[] { return tracks; }

// MicTrack生成API（Step2）
export function createMicTrack(audioCtx: AudioContext, micNode: AudioNode, id: string, label: string): Track {
    const volumeGain = audioCtx.createGain();
    micNode.connect(volumeGain);
    if ((window as any).busManager?.getEffectsInputNode) {
        try { volumeGain.connect((window as any).busManager.getEffectsInputNode()); } catch { }
    }
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
        insertEffects: []
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

// 診断機能
export function diagnoseTrackVolume(id?: string) {
    console.log('\n=== Track Volume Diagnostic ===');

    const targetTracks = id ? tracks.filter(t => t.id === id) : tracks;

    if (targetTracks.length === 0) {
        console.log('No tracks found');
        return;
    }

    const anySolo = tracks.some(t => t.solo);
    console.log(`Global solo state: ${anySolo}`);

    targetTracks.forEach(track => {
        console.log(`\nTrack: ${track.id} (${track.name})`);
        console.log(`  userVolume: ${track.userVolume}`);
        console.log(`  muted: ${track.muted}`);
        console.log(`  solo: ${track.solo}`);
        console.log(`  gain.value: ${track.volumeGain.gain.value}`);
        console.log(`  kind: ${track.kind}`);
        console.log(`  insertEffects: ${track.insertEffects?.length || 0}`);

        // AudioNode接続状態の確認
        try {
            const checkConnections = (node: AudioNode, depth: number = 0) => {
                if (depth > 3) return; // 深さ制限
                console.log(`${'  '.repeat(depth + 2)}Node: ${node.constructor.name}`);
                if ('gain' in node) {
                    console.log(`${'  '.repeat(depth + 2)}  gain: ${(node as GainNode).gain.value}`);
                }
            };
            checkConnections(track.inputNode);
            checkConnections(track.volumeGain);
        } catch (e) {
            console.log(`  Connection check error: ${e}`);
        }
    });

    console.log('=== End Track Diagnostic ===\n');
}

// 強制リセット機能
export function resetTrackVolume(id: string) {
    const track = tracks.find(t => t.id === id);
    if (!track) return false;

    console.log(`[Tracks] Resetting volume for ${id}`);
    track.userVolume = 1;
    track.muted = false;
    track.solo = false;
    applyMuteSoloState();

    return true;
}

// 汎用Track追加関数
export function addTrack(track: Track): void {
    tracks.push(track);
    applyPersistentState(track);
    applyMuteSoloState();
    dispatchTracksChanged();
    console.log(`[Tracks] Track added: ${track.id} (${track.kind})`);
}

// 汎用Track削除関数  
export function removeTrack(trackId: string): boolean {
    const index = tracks.findIndex(t => t.id === trackId);
    if (index === -1) {
        console.warn(`[Tracks] Track not found for removal: ${trackId}`);
        return false;
    }

    const track = tracks[index];

    // 音声接続を切断
    try { track.inputNode.disconnect(); } catch { /* ignore */ }
    try { track.volumeGain.disconnect(); } catch { /* ignore */ }

    // Insert effectsを破棄
    track.insertEffects?.forEach(fx => {
        try { fx.dispose(); } catch { /* ignore */ }
    });

    // trackを配列から削除
    tracks.splice(index, 1);

    applyMuteSoloState();
    dispatchTracksChanged();
    console.log(`[Tracks] Track removed: ${trackId}`);
    return true;
}

// 汎用Track生成関数（EffectInstance対応）
export function createGenericTrack(config: {
    id?: string;
    name: string;
    kind: TrackKind;
    audioContext: AudioContext;
    effectInstance?: EffectInstance;
    inputNode?: AudioNode;
}): Track {
    const { audioContext, effectInstance, inputNode } = config;

    // inputNodeの決定
    let trackInputNode: AudioNode;
    if (inputNode) {
        trackInputNode = inputNode;
    } else if (effectInstance) {
        trackInputNode = effectInstance.node;
    } else {
        // フォールバック：無音ノード
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        trackInputNode = silentGain;
    }

    // Volume gain作成
    const volumeGain = audioContext.createGain();
    volumeGain.gain.value = 1;

    // 基本接続: inputNode → volumeGain
    trackInputNode.connect(volumeGain);

    // busManagerへの接続
    if ((window as any).busManager?.getEffectsInputNode) {
        try {
            volumeGain.connect((window as any).busManager.getEffectsInputNode());
            console.log(`[Tracks] ✅ Connected new track to busManager effectsInput`);
            console.log(`[Tracks] 🔍 Track: ${config.name} (${config.kind})`);
            console.log(`[Tracks] 🔍 VolumeGain: ${volumeGain.constructor.name}, gain=${volumeGain.gain.value}`);
        } catch (error) {
            console.warn('[Tracks] ❌ Failed to connect to busManager:', error);
        }
    } else {
        console.warn('[Tracks] ⚠️ busManager or getEffectsInputNode not available');
        console.log('[Tracks] 🔍 Available busManager methods:',
            (window as any).busManager ? Object.getOwnPropertyNames(Object.getPrototypeOf((window as any).busManager)) : 'busManager not found');
    }

    const track: Track = {
        id: config.id || `${config.kind}_${Date.now()}`,
        name: config.name,
        kind: config.kind,
        inputNode: trackInputNode,
        volumeGain,
        outputNode: volumeGain,
        dspChain: effectInstance ? [{ id: effectInstance.id, node: effectInstance.node }] : [],
        muted: false,
        solo: false,
        userVolume: 1,
        insertEffects: []
    };

    return track;
}

// オーディオチェーン再構築（公開関数）
export function rebuildTrackChain(trackId: string) {
    const track = tracks.find(t => t.id === trackId);
    if (!track) {
        console.warn(`[Tracks] Track not found for rebuild: ${trackId}`);
        return false;
    }

    console.log(`[Tracks] Rebuilding audio chain for track: ${trackId}`);

    // 既存の接続を切断
    try { track.inputNode.disconnect(); } catch { /* ignore */ }

    // Track内部チェーンを再構築
    rebuildTrackInsertChain(track);

    // busManagerとの接続も確認
    if ((window as any).busManager?.getEffectsInputNode) {
        try {
            track.volumeGain.connect((window as any).busManager.getEffectsInputNode());
            console.log(`[Tracks] Reconnected ${trackId} to busManager`);
        } catch (error) {
            console.warn(`[Tracks] Failed to reconnect to busManager:`, error);
        }
    }

    return true;
}

// グローバル関数として公開（デバッグ用）
declare global {
    interface Window {
        listTracks: () => Track[];
        addTrack: (track: Track) => void;
        removeTrack: (trackId: string) => boolean;
        createGenericTrack: (options: {
            name: string;
            kind: TrackKind;
            refId?: string;
            userVolume?: number;
            setupDSP?: (track: Track) => Promise<void>;
        }) => Promise<Track>;
    }
}

(window as any).listTracks = listTracks;
(window as any).addTrack = addTrack;
(window as any).removeTrack = removeTrack;
(window as any).createGenericTrack = createGenericTrack;

console.log('🎛️ Tracks global functions registered');
