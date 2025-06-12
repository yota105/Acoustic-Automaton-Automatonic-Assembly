import { ioConfigList, IOConfig } from "./ioConfig";

// 入出力デバイスの状態管理クラス
export class InputManager {
  private ioList: IOConfig[] = [];
  constructor() {
    // 設定ファイルから初期化
    this.ioList = ioConfigList.map(cfg => ({ ...cfg }));
  }
  getInputs() {
    return this.ioList.filter(io => io.type === "input");
  }
  getOutputs() {
    return this.ioList.filter(io => io.type === "output");
  }
  setEnabled(id: string, enabled: boolean) {
    const io = this.ioList.find(io => io.id === id);
    if (io) io.enabled = enabled;
  }
  setDeviceId(id: string, deviceId: string) {
    const io = this.ioList.find(io => io.id === id);
    if (io) io.deviceId = deviceId;
  }
  // ...今後: AudioNode管理やルーティングも追加...
}