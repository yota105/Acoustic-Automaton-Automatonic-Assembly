// Section 2: 点の座標移動に伴う音高変化
// インスタンスの音高が座標に応じて変化

import("stdfaust.lib");

// 基本パラメータ
base_freq = hslider("base_freq", 493.88, 200, 2000, 0.01); // B4ベース
pitch_mod = hslider("pitch_mod", 0, -12, 12, 0.01); // セミトーン単位
x_coord = hslider("x_coord", 0, -1, 1, 0.001); // X座標 (-1 to 1)
y_coord = hslider("y_coord", 0, -1, 1, 0.001); // Y座標 (-1 to 1)
gain = hslider("gain", 0.3, 0, 1, 0.01);
trigger = button("trigger");
sustain_level = hslider("sustain", 0.2, 0, 0.5, 0.01);

// 座標による音高変調
// X座標: ピッチベンド効果 (-200 to +200 cents)
// Y座標: ハーモニクス効果 (基音の倍音への移行)
pitch_bend_cents = x_coord * 200; // ±200セント
harmonic_factor = 1 + (y_coord + 1) * 0.5; // 1.0 to 2.0 (オクターブまで)

// 最終周波数計算
final_freq = base_freq * pow(2, pitch_mod/12) * pow(2, pitch_bend_cents/1200) * harmonic_factor;

// エンベロープ（セクション1より長め）
envelope = en.adsr(0.02, 0.5, sustain_level, 3.0, trigger);

// 複数オシレーター（リッチな音色）
osc1 = os.osc(final_freq) * 0.6;
osc2 = os.osc(final_freq * 1.01) * 0.3; // わずかにデチューン
osc3 = os.triangle(final_freq * 0.5) * 0.1; // サブオクターブ

mixed_osc = (osc1 + osc2 + osc3) * envelope * gain;

// 動的フィルター（Y座標で制御）
cutoff_freq = 800 + y_coord * 1200; // 800Hz-2000Hz
filtered = fi.lowpass(2, cutoff_freq, mixed_osc);

// リバーブ（セクション1より控えめ）
reverb_size = hslider("reverb_size", 0.4, 0, 1, 0.01);
reverb_damping = hslider("reverb_damping", 0.6, 0, 1, 0.01);
reverb_l, reverb_r = re.zita_rev1_stereo(reverb_size, 0, reverb_damping, 0, 0, 0, 0, 0);

// ステレオ配置（X座標でパンニング）
pan_pos = (x_coord + 1) * 0.5; // 0 to 1
left_gain = sqrt(1 - pan_pos);
right_gain = sqrt(pan_pos);

// ドライ/ウェット
dry_wet = hslider("dry_wet", 0.5, 0, 1, 0.01);

// 最終出力
dry_l = filtered * left_gain;
dry_r = filtered * right_gain;
wet_l = filtered <: reverb_l * dry_wet;
wet_r = filtered <: reverb_r * dry_wet;

process = (dry_l + wet_l), (dry_r + wet_r);
