# リバーブ確認用デバッグコマンド

## コンソールで実行

```javascript
// リバーブの状態を確認
function checkReverb() {
    const busManager = window.busManager;
    if (!busManager) {
        console.log('BusManager not found');
        return;
    }
    
    console.log('\n=== Reverb Debug ===');
    
    // チェーン情報
    const chain = busManager.getEffectsChainMeta();
    console.log('Effects chain:', chain);
    
    const reverbItem = chain.find(e => e.refId === 'reverb');
    if (!reverbItem) {
        console.log('❌ Reverb not in chain!');
        return;
    }
    
    console.log('✅ Reverb found:', reverbItem);
    
    // パラメータ取得
    const chainItems = busManager['chainItems'];
    const item = chainItems.find(i => i.id === reverbItem.id);
    
    if (item && item.node) {
        const node = item.node;
        console.log('Reverb node:', node);
        
        if (node.getParams) {
            const params = node.getParams();
            console.log('Reverb parameters:');
            params.forEach(p => {
                console.log(`  ${p.address}: ${p.value} (${p.min} - ${p.max})`);
            });
        }
    }
    
    // 接続確認
    const effectsBus = busManager.getEffectsInputNode();
    console.log('Effects bus:', effectsBus);
    console.log('Effects bus gain:', effectsBus.gain.value);
}

checkReverb();
```

## テスト手順

1. マイクをEnableにする
2. カウントダウンが0秒になるまで待つ
3. マイクに向かって声を出す
4. **期待される結果:**
   - 声がエコーのように残る
   - 空間的な広がりが感じられる
   - wet=1.0 (100%)なので、原音がほとんど聞こえず、リバーブ成分のみ聞こえるはず

5. もし聞こえない場合、コンソールで:
   ```javascript
   checkReverb()
   ```

## リバーブパラメータの調整

```javascript
// リバーブを極端に設定してテスト
function testExtremeReverb() {
    const busManager = window.busManager;
    const chain = busManager.getEffectsChainMeta();
    const reverbItem = chain.find(e => e.refId === 'reverb');
    
    if (reverbItem) {
        const item = busManager['chainItems'].find(i => i.id === reverbItem.id);
        if (item && item.node && item.node.setParamValue) {
            const node = item.node;
            // 極端な設定
            node.setParamValue('/reverb/reverb_roomSize', 1.0);  // 最大
            node.setParamValue('/reverb/reverb_damping', 0.0);   // 減衰なし
            node.setParamValue('/reverb/reverb_wet', 1.0);       // 100%
            node.setParamValue('/reverb/reverb_dry', 0.0);       // 0%
            node.setParamValue('/reverb/reverb_width', 1.0);     // 最大
            console.log('✅ Extreme reverb settings applied');
            console.log('   This should make the reverb VERY obvious');
        }
    }
}

testExtremeReverb();
```

## オーディオ接続の確認

```javascript
// 接続チェーン全体を表示
function checkAudioPath() {
    console.log('\n=== Audio Path Debug ===');
    
    const inputManager = window.inputManager;
    const micRouter = inputManager?.getMicRouter?.();
    
    if (micRouter) {
        const micInputs = micRouter.getMicInputs();
        console.log(`Mic inputs: ${micInputs.length}`);
        
        micInputs.forEach(mic => {
            console.log(`\n${mic.id}:`);
            console.log(`  - Stream active: ${mic.stream?.active}`);
            console.log(`  - Source exists: ${!!mic.source}`);
            console.log(`  - Analyser exists: ${!!mic.analyser}`);
        });
    }
    
    const busManager = window.busManager;
    console.log('\nBus connections:');
    console.log('  - effectsBus:', busManager.getEffectsInputNode());
    console.log('  - effectsBus gain:', busManager.getEffectsInputNode().gain.value);
    
    const gateManager = window.micInputGateManager;
    if (gateManager) {
        console.log('\nGate manager:');
        console.log('  - Initialized:', gateManager['audioContext'] !== null);
        console.log('  - Destination node:', gateManager['destinationNode']);
    }
}

checkAudioPath();
```
