// Section 1: 導入部 - 単音からの発展
// 楽器の単音スタッカート(B4)にリバーブ、減衰後保続

import("stdfaust.lib");

// 基本パラメータ
freq = hslider("freq", 493.88, 200, 2000, 0.01); // B4 = 493.88Hz
gain = hslider("gain", 0.3, 0, 1, 0.01);
trigger = button("trigger");
sustain_level = hslider("sustain", 0.1, 0, 0.5, 0.01);
reverb_size = hslider("reverb_size", 0.6, 0, 1, 0.01);
reverb_damping = hslider("reverb_damping", 0.5, 0, 1, 0.01);

// エンベロープ
envelope = en.adsr(0.01, 0.3, sustain_level, 2.0, trigger);

// 基本音源（サイン波）
oscillator = os.osc(freq) * envelope * gain;

// リバーブ処理
reverb_l, reverb_r = re.zita_rev1_stereo(reverb_size, 0, reverb_damping, 0, 0, 0, 0, 0);

// ドライ/ウェット比
dry_wet = hslider("dry_wet", 0.7, 0, 1, 0.01);

// ステレオ出力
processed_l = oscillator <: _, reverb_l : _, *(dry_wet) : +;
processed_r = oscillator <: _, reverb_r : _, *(dry_wet) : +;

process = processed_l, processed_r;
