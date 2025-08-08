// 入出力デバイスの定義・設定ファイル
// 今後、ここで各input/outputの論理名・番号・役割・初期有効状態などを管理

export interface IOConfig {
  id: string;           // 論理ID
  label: string;        // 表示名
  type: "input" | "output";
  enabled: boolean;     // 初期有効状態
  deviceId?: string;    // 実デバイスID（初期は空でOK）
  index: number;        // UIでの番号
  volume?: number;      // 初期音量（0.0-1.0）
  routeToSynth?: boolean; // シンセサイザーにルーティングするか
  routeToEffects?: boolean; // エフェクトにルーティングするか
}

// マイクルーティングの設定
export interface MicRoutingConfig {
  micId: string;
  destinations: {
    synth: boolean;
    effects: boolean;
    monitor: boolean;
  };
  gain: number;
}

export const ioConfigList: IOConfig[] = [
  {
    id: "mic1",
    label: "マイク1",
    type: "input",
    enabled: true,
    index: 1,
    volume: 0.8,
    routeToSynth: true,
    routeToEffects: false
  },
  {
    id: "mic2",
    label: "マイク2",
    type: "input",
    enabled: false,
    index: 2,
    volume: 0.8,
    routeToSynth: false,
    routeToEffects: true
  },
  {
    id: "mic3",
    label: "マイク3",
    type: "input",
    enabled: false,
    index: 3,
    volume: 0.6,
    routeToSynth: true,
    routeToEffects: true
  },
  { id: "lineout", label: "ライン出力", type: "output", enabled: true, index: 1 },
  // 必要に応じて追加
];

export const defaultMicRoutingConfig: MicRoutingConfig[] = [
  {
    micId: "mic1",
    destinations: { synth: true, effects: false, monitor: true },
    gain: 1.0
  },
  {
    micId: "mic2",
    destinations: { synth: false, effects: true, monitor: true },
    gain: 1.0
  },
  {
    micId: "mic3",
    destinations: { synth: true, effects: true, monitor: false },
    gain: 0.8
  }
];
