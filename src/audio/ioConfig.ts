// 入出力デバイスの定義・設定ファイル
// 今後、ここで各input/outputの論理名・番号・役割・初期有効状態などを管理

export interface IOConfig {
  id: string;           // 論理ID
  label: string;        // 表示名
  type: "input" | "output";
  enabled: boolean;     // 初期有効状態
  deviceId?: string;    // 実デバイスID（初期は空でOK）
  index: number;        // UIでの番号
}

export const ioConfigList: IOConfig[] = [
  { id: "mic1", label: "マイク1", type: "input", enabled: true, index: 1 },
  { id: "mic2", label: "マイク2", type: "input", enabled: false, index: 2 },
  { id: "lineout", label: "ライン出力", type: "output", enabled: true, index: 1 },
  // 必要に応じて追加
];
