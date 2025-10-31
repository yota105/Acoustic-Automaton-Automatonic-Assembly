// tonecue_soft.dsp - Gentle sustained cue for Section A
// Provides a near-sine tone with a warm halo for long holds

import("stdfaust.lib");

// Parameters align with the primary tone cue so existing controllers can be reused
freq = hslider("freq", 493.883, 20, 20000, 0.001);
level = hslider("level", 0.18, 0, 1, 0.001);

// Optional gating for ADSR-style control
// Using a smoothed gate to avoid zipper noise on long sustains
rawGate = button("gate");
gate = si.smoo(rawGate);

attack = hslider("attack", 0.08, 0.001, 2.0, 0.001);
decay = hslider("decay", 0.4, 0.01, 5.0, 0.01);
sustain = hslider("sustain", 0.7, 0, 1.0, 0.01);
release = hslider("release", 1.6, 0.05, 8.0, 0.01);

env = en.adsr(attack, decay, sustain, release, gate);

// Core tone: dominant sine with a hint of the second harmonic for warmth
core = os.osc(freq);
second = os.osc(freq * 2.0) * 0.08;
halo = os.osc(freq * 1.5) * 0.05;

// Envelope-controlled tilt gently brightens on stronger passages
brightness = pow(env, 0.6);
blended = (core * (0.85 + 0.1 * brightness)) + second + (halo * brightness);

// Soft low-pass keeps the tone mellow regardless of register
cutoff = min(freq * 6.0, ma.SR / 3);
softened = fi.lowpass(3, cutoff, blended);

// Minimal saturation to tame peaks without obvious coloration
shaped = ma.tanh(softened * 1.1) / ma.tanh(1.1);

process = shaped * env * level;
