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

click_attack = 0.0005;
click_decay = 0.03;
click_env = en.ar(click_attack, click_decay, trigger);

// 基本クリック音: ノイズベース
white = no.noise;

click_gain = is_downbeat * 1.0
           + is_strong   * 0.65
           + is_weak     * 0.45 
           + is_subdiv   * 0.28;  

// 拍タイプ別のEQ設定（カットオフ周波数）
hp_cutoff = is_downbeat * 1600
          + is_strong   * 1200
          + is_weak     * 900 
          + is_subdiv   * 600;

lp_cutoff = is_downbeat * 3000
          + is_strong   * 2600
          + is_weak     * 2100
          + is_subdiv   * 1700;

// フィルタリング
click_hp = fi.highpass(2, hp_cutoff, white);
click_filtered = fi.lowpass(2, lp_cutoff, click_hp); 

// エンベロープと音量
click_sound = click_filtered * click_env * click_gain;

raw_tone = click_sound;

// ソフトクリップ
tone = ma.tanh(raw_tone * 2.5) * volume;

// ステレオ出力（モノラル）
left  = tone;
right = tone;

// ステレオ出力
process = left, right;