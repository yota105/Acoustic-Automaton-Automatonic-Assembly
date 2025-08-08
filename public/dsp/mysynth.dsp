import("stdfaust.lib");
freq = hslider("freq",200,50,1000,0.01);
gain = hslider("gain",0.5,0,0.5,0.01);
mix = hslider("input_mix",0.5,0,1,0.01);

// マイク入力とオシレーターをミックス
synth = os.sawtooth(freq) * gain;
mic_input = _ * mix;  // マイク入力にミックスレベルを適用

process = mic_input + synth;