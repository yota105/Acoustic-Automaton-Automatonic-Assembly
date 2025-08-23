import("stdfaust.lib");

// メトロノーム - 音楽的時間軸の可視化・可聴化
// 重要度に応じて異なる音色とピッチを使用

// パラメータ
trigger = button("trigger");           // トリガー信号
beat_type = nentry("beat_type", 1, 1, 4, 1);  // 1=downbeat, 2=strong beat, 3=weak beat, 4=subdivision
volume = hslider("volume", 0.3, 0, 1, 0.01);  // 音量

// 音色設定 - 重要度に応じた周波数とエンベロープ
freq = beat_type : ba.selectn(4, (
    880,   // 1: downbeat (小節頭) - 高い音
    660,   // 2: strong beat (強拍) - 中高音
    440,   // 3: weak beat (弱拍) - 中音
    330    // 4: subdivision (細分化) - 低音
));

// エンベロープ - 重要度に応じた長さと形状
attack = beat_type : ba.selectn(4, (
    0.01,  // downbeat - 鋭いアタック
    0.015, // strong beat
    0.02,  // weak beat
    0.005  // subdivision - 非常に短い
));

decay = beat_type : ba.selectn(4, (
    0.3,   // downbeat - 長い減衰
    0.2,   // strong beat
    0.15,  // weak beat
    0.05   // subdivision - 短い減衰
));

// トリガーエンベロープ
env = en.ar(attack, decay, trigger);

// 基本波形 - サイン波とクリック音のミックス
sine_wave = os.osc(freq) * 0.7;
click = no.noise * en.ar(0.001, 0.01, trigger) * 0.3;

// 音色合成
tone = (sine_wave + click) * env * volume;

// フィルタリング - 重要度に応じたフィルタ
filter_freq = beat_type : ba.selectn(4, (
    8000,  // downbeat - 明るい音
    6000,  // strong beat
    4000,  // weak beat
    2000   // subdivision - こもった音
));

filtered_tone = fi.lowpass(2, filter_freq, tone);

// ステレオ出力
process = filtered_tone, filtered_tone;
