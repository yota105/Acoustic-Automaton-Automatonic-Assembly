import("stdfaust.lib");

freq = hslider("freq",200,50,2000,0.01);
gain = hslider("gain",0.3,0,0.5,0.01);
mix = hslider("input_mix",0.5,0,1,0.01);

attack = hslider("env/attack",0.02,0.001,2.0,0.001);
decay = hslider("env/decay",0.05,0.001,2.0,0.001);
sustain = hslider("env/sustain",0.8,0,1,0.01);
release = hslider("env/release",0.4,0.005,3.0,0.001);

gateRaw = hslider("gate",1,0,1,1);
gate = si.smoo(gateRaw);

env = en.adsr(attack, decay, sustain, release, gate);

synth = os.sawtooth(freq) * gain * env;
mic_input = _ * mix;

process = mic_input + synth;