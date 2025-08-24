// Section 3: 軸回転と音数・音圧の増加
// 空間ごと回転し、全ての音高が変化、音数と音圧が増す

import("stdfaust.lib");

// 基本パラメータ
base_freq = hslider("base_freq", 493.88, 200, 2000, 0.01);
pitch_mod = hslider("pitch_mod", 0, -24, 24, 0.01); // より広い範囲
x_coord = hslider("x_coord", 0, -1, 1, 0.001);
y_coord = hslider("y_coord", 0, -1, 1, 0.001);
rotation_angle = hslider("rotation", 0, 0, 6.28, 0.001); // 0 to 2π
gain = hslider("gain", 0.5, 0, 1, 0.01); // より高いゲイン
trigger = button("trigger");
density = hslider("density", 3, 1, 8, 1); // 音の密度

// 回転変換
cos_r = cos(rotation_angle);
sin_r = sin(rotation_angle);
rotated_x = x_coord * cos_r - y_coord * sin_r;
rotated_y = x_coord * sin_r + y_coord * cos_r;

// 回転による音高変調
rotation_pitch_mod = rotation_angle * 2; // 回転角度に比例
coordinate_pitch_mod = (rotated_x + rotated_y) * 6; // 座標による変調

// 最終周波数
final_freq = base_freq * pow(2, (pitch_mod + rotation_pitch_mod + coordinate_pitch_mod)/12);

// 複数レイヤーの音源（密度に応じて）
layer1 = os.osc(final_freq) * 0.4;
layer2 = os.osc(final_freq * 1.007) * 0.3; // 微細デチューン
layer3 = os.sawtooth(final_freq * 0.5) * 0.2; // サブオクターブ
layer4 = os.triangle(final_freq * 1.5) * 0.1; // 高次倍音

// 密度による音源選択とミックス
active_layers = min(density, 4);
mixed_layers = select2(active_layers >= 1, 0, layer1) +
               select2(active_layers >= 2, 0, layer2) +
               select2(active_layers >= 3, 0, layer3) +
               select2(active_layers >= 4, 0, layer4);

// 動的エンベロープ（回転速度に応じて）
attack_time = 0.05 + abs(rotation_angle * 0.01);
release_time = 1.0 + abs(rotated_y) * 2.0;
envelope = en.adsr(attack_time, 0.3, 0.3, release_time, trigger);

// エフェクト処理
processed_signal = mixed_layers * envelope * gain;

// 回転に応じたディストーション
distortion_amount = abs(rotation_angle) * 0.1;
distorted = ef.cubicnl(distortion_amount, 0) : processed_signal;

// 動的フィルター（複数バンド）
lowpass_freq = 1000 + rotated_y * 800;
highpass_freq = 200 + abs(rotated_x) * 300;
filtered = fi.highpass(1, highpass_freq) : fi.lowpass(2, lowpass_freq) : distorted;

// 複雑なリバーブ（回転空間感）
reverb_size = 0.7 + abs(rotation_angle) * 0.1;
reverb_damping = 0.4;
reverb_l, reverb_r = re.zita_rev1_stereo(reverb_size, 0, reverb_damping, 0, 0, 0, 0, 0);

// 回転に応じたステレオ配置
pan_rotation = rotation_angle + rotated_x;
pan_pos = (sin(pan_rotation) + 1) * 0.5; // 円形パンニング
left_gain = sqrt(1 - pan_pos);
right_gain = sqrt(pan_pos);

// ドライ/ウェット比（密度に応じて）
dry_wet = 0.3 + density * 0.05;

// 最終ミックス
dry_l = filtered * left_gain;
dry_r = filtered * right_gain;
wet_l = filtered <: reverb_l * dry_wet;
wet_r = filtered <: reverb_r * dry_wet;

// 音圧増加のためのコンプレッション
compressed_l = co.compressor_mono(3, -12, 0.1, 0.1) : (dry_l + wet_l);
compressed_r = co.compressor_mono(3, -12, 0.1, 0.1) : (dry_r + wet_r);

process = compressed_l, compressed_r;
