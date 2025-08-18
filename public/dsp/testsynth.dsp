import("stdfaust.lib");
freq = hslider("freq",440,50,1000,0.01);
gain = hslider("gain",0.1,0,0.5,0.01);

// シンプルなシンセサイザー（入力不要）
process = os.sawtooth(freq) * gain;
