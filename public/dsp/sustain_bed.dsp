// sustain_bed.dsp - Section A sustain texture bed
// Provides a continuously running tone-to-noise layer with controllable texture

import("stdfaust.lib");

freq = hslider("sustain/freq", 493.883, 20, 20000, 0.001);
level = hslider("sustain/level", 1.0, 0, 1, 0.001);
gate = checkbox("sustain/gate");
texture = hslider("sustain/texture", 0.0, 0.0, 1.0, 0.001);
noiseColor = hslider("sustain/noiseColor", 2600, 200, 12000, 1);

attack = hslider("sustain/attack", 0.8, 0.01, 6.0, 0.01);
decay = hslider("sustain/decay", 1.4, 0.05, 8.0, 0.01);
sustainLvl = hslider("sustain/sustain", 0.92, 0, 1, 0.01);
release = hslider("sustain/release", 4.5, 0.1, 20.0, 0.01);

env = en.adsr(attack, decay, sustainLvl, release, gate);

// Soft harmonic stack for the tonal component
fund = os.osc(freq);
second = os.osc(freq * 2.0) * 0.18;
third = os.osc(freq * 3.0) * 0.12;
fifth = os.osc(freq * 5.0) * 0.08;
tone = (fund + second + third + fifth) * 0.7;

// Gentle noise layer with adjustable color
rawNoise = no.noise;
coloredNoise = fi.lowpass(4, noiseColor, rawNoise);

// Texture crossfade (ease curve to soften onset of noise)
textureWeight = pow(texture, 0.65);
toneWeight = 1.0 - textureWeight;
core = (tone * toneWeight) + (coloredNoise * textureWeight);

// Slow evolving amplitude chorus to avoid static tone
lfo1 = os.osc(0.12) * 0.12 + 0.88;
lfo2 = os.osc(0.07) * 0.1 + 0.9;
movement = lfo1 * lfo2;

process = core * movement * env * level;
