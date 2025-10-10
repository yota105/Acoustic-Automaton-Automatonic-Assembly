import("stdfaust.lib");

// パラメータ
trigger = button("trigger");
beat_type = nentry("beat_type", 1, 1, 4, 1);  // 1=downbeat, 2=strong beat, 3=weak beat, 4=subdivision
volume = hslider("volume", 0.3, 0, 1, 0.01); 

// 拍タイプごとのフラグ（bool → 0 or 1）
is_downbeat = (beat_type == 1);
is_strong   = (beat_type == 2);
is_weak     = (beat_type == 3);
is_subdiv   = (beat_type == 4);

// ========== オリジナルのノイズベース音 ==========
original_attack = 0.0001;
original_decay = 0.08;
original_env = en.ar(original_attack, original_decay, trigger);

white = no.noise;

// オリジナルのゲイン
original_gain = is_downbeat * 1.0
              + is_strong   * 0.65
              + is_weak     * 0.45 
              + is_subdiv   * 0.28;

// オリジナルのEQ設定
original_hp_cutoff = is_downbeat * 1800
                   + is_strong   * 1200
                   + is_weak     * 900 
                   + is_subdiv   * 800;

original_lp_cutoff = is_downbeat * 3300
                   + is_strong   * 2600
                   + is_weak     * 2100
                   + is_subdiv   * 1900;

// オリジナルのフィルタリング
original_hp = fi.highpass(2, original_hp_cutoff, white);
original_filtered = fi.lowpass(2, original_lp_cutoff, original_hp);
original_sound = original_filtered * original_env * original_gain;

// ========== 新しいコツッとした音 ==========
// 超短アタックでコツッとした音
new_attack = 0.0001;  // 極短アタック (0.1ms)
new_decay = 0.035;     // 短いディケイ
new_env = en.ar(new_attack, new_decay, trigger);

// 木製クリック音のための共鳴周波数
resonance_freq = is_downbeat * 3800
               + is_strong   * 3200
               + is_weak     * 2800
               + is_subdiv   * 2400;

// 超短エンベロープでインパルス的に
impulse_env = en.ar(0.00005, 0.002, trigger);
impulse_noise = white * impulse_env;

// 共鳴音（木片の共鳴をシミュレート）
resonance = os.osc(resonance_freq) * new_env * 0.3;

// 高周波バンドパスフィルタで鋭い音を作る
bp_q = 8.0;  // 高Q値で鋭い共鳴
new_bp = fi.resonbp(resonance_freq, bp_q, 1.0, white);
new_sharp = new_bp * impulse_env;

// インパルスノイズと共鳴音をミックス
new_mixed = (impulse_noise * 0.2) + (new_sharp * 0.8) + (resonance * 0.2);

// 高域強調フィルタ
new_hp_cutoff = is_downbeat * 2500
              + is_strong   * 2000
              + is_weak     * 1500
              + is_subdiv   * 1000;

new_lp_cutoff = is_downbeat * 8000
              + is_strong   * 7000
              + is_weak     * 6000
              + is_subdiv   * 5000;

// フィルタリング（高域を残す）
new_hp = fi.highpass(3, new_hp_cutoff, new_mixed);
new_filtered = fi.lowpass(2, new_lp_cutoff, new_hp);

// 新しい音のゲイン
new_gain = is_downbeat * 1.1
         + is_strong   * 0.75
         + is_weak     * 0.5
         + is_subdiv   * 0.3;

new_sound = new_filtered * new_env * new_gain;

// ========== 2つの音を合成 ==========
// オリジナル50% + 新しい音50%
click_sound = (original_sound * 0.4) + (new_sound * 0.6);

// ========== 中音域のリバーブ（控えめ） ==========
// 中音域のみを抽出（500Hz-3000Hz）
mid_freq_low = 500;
mid_freq_high = 3000;
mid_band = fi.highpass(2, mid_freq_low, click_sound) : fi.lowpass(2, mid_freq_high);

// 非常に短いリバーブ（空間感を少し追加）
reverb_mix = 0.07;      // 非常に控えめなミックス（7%）
reverb_size = 0.2;      // 小さい部屋のような響き
reverb_damp = 0.8;      // 高域をやや抑える

// シンプルなフリーバーブ（ステレオ）- 引数の順序を修正
// re.stereo_freeverb(fb1, fb2, damp, spread, signal)
mid_reverb_stereo = mid_band <: re.stereo_freeverb(reverb_size, reverb_size, reverb_damp, 0.5);
mid_reverb_mono = (mid_reverb_stereo :> _) / 2;  // ステレオをモノラルに

// ドライ音とリバーブをミックス
click_with_reverb = click_sound * (1.0 - reverb_mix) + (mid_reverb_mono * reverb_mix * 0.15);

raw_tone = click_with_reverb;

// ソフトクリップ
tone = ma.tanh(raw_tone * 2.5) * volume;

// ステレオ出力（モノラル）
left  = tone;
right = tone;

// ステレオ出力
process = left, right;