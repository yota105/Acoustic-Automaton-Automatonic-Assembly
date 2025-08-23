# Logic Input メーター機能 デバッグコマンド

## ブラウザコンソールで実行するデバッグコマンド

### 1. Logic Inputsの一覧確認
```javascript
// LogicInputManagerの状態確認
window.routingUI?.logicInputManager?.list()
```

### 2. BusManagerの状態確認
```javascript
// BusManagerが存在するか確認
console.log('BusManager:', window.busManager);
console.log('BusManager methods:', window.busManager ? Object.getOwnPropertyNames(Object.getPrototypeOf(window.busManager)) : 'Not found');
```

### 3. 各Logic InputのGain Node確認
```javascript
// 各Logic InputのGain Nodeが存在するか確認
if (window.busManager && window.routingUI) {
    const inputs = window.routingUI.logicInputManager.list();
    inputs.forEach(input => {
        const gainNode = window.busManager.getInputGainNode?.(input.id);
        console.log(`Input ${input.id}: ${gainNode ? 'Has GainNode' : 'No GainNode'}`);
    });
}
```

### 4. AudioContextの状態確認
```javascript
// AudioContextが正常に動作しているか確認
console.log('AudioContext:', window.audioCtx);
console.log('AudioContext state:', window.audioCtx?.state);
```

### 5. メーター要素の存在確認
```javascript
// メーター要素が存在するか確認
const meters = document.querySelectorAll('[data-meter-id]');
console.log('Found meter elements:', meters.length);
meters.forEach(meter => {
    console.log(`Meter for: ${meter.getAttribute('data-meter-id')}`);
});
```

## テスト手順

1. 上記のコマンドをブラウザコンソールで順番に実行
2. Logic Inputs / Routing画面でメーターが動くか確認
3. マイク入力がある場合、音声レベルが視覚的に表示されるか確認
4. 問題があれば、どのステップで失敗するかを報告
