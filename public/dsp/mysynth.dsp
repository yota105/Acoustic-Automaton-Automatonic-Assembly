import("stdfaust.lib");

freq = hslider("freq",200,50,2000,0.01);
gain = hslider("gain",0.3,0,0.5,0.01);
mix = hslider("input_mix",0.5,0,1,0.01);

attack = hslider("env/attack",0.03,0.001,2.0,0.001);
decay = hslider("env/decay",0.12,0.001,2.0,0.001);
sustain = hslider("env/sustain",0.65,0,1,0.01);
release = hslider("env/release",0.55,0.005,3.0,0.001);

vibrato_depth = hslider("tone/vibrato_depth",0.008,0,0.05,0.001);
vibrato_rate = hslider("tone/vibrato_rate",5.2,0.5,9.0,0.1);
cutoff_base = hslider("tone/cutoff_base",850,200,3500,1);
cutoff_env = hslider("tone/cutoff_env",1900,0,5000,1);
brass_peak_mix = hslider("tone/brass_peak_mix",0.18,0,0.5,0.01);
brass_peak_q = hslider("tone/brass_peak_q",4.8,1.0,8.0,0.1);
saturation = hslider("tone/saturation",2.1,0.5,4.0,0.1);

gateRaw = hslider("gate",1,0,1,1);
gate = si.smoo(gateRaw);

env = en.adsr(attack, decay, sustain, release, gate);

vibrato = os.osc(vibrato_rate) * vibrato_depth * (env ^ 0.8);
mod_freq = freq * (1 + vibrato);

osc_primary = os.sawtooth(mod_freq);
osc_lower = os.sawtooth(mod_freq * 0.5);
osc_square = os.square(mod_freq * 1.01);
raw_wave = (osc_primary * 0.7) + (osc_lower * 0.2) + (osc_square * 0.3);
normalized_wave = raw_wave / 1.2;

cutoff = min(cutoff_base + (cutoff_env * env), ma.SR/2 - 200);
core_filtered = fi.lowpass(3, cutoff, normalized_wave);
brass_peak = fi.resonbp(cutoff * 1.1, brass_peak_q, 1.0, normalized_wave);
tone_core = core_filtered * (1 - brass_peak_mix) + brass_peak * brass_peak_mix;

saturated = ma.tanh(tone_core * saturation) / ma.tanh(saturation);
synth = saturated * gain * env;
mic_input = _ * mix;

process = mic_input + synth;