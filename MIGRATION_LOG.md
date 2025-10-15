## 2025-10-16

- Logic Input reconnects currently leave the associated BusManager routing muted on the second enable. MicRouter connections come back, but `busManager.updateLogicInput` is seeing `enabled:false` and keeps the gain at 0. Workaround: avoid toggling Enable off/on between takes; real fix needs LogicInputManager state pushed before reattaching the BusManager source.

