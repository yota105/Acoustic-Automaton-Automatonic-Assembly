// tonecue.dsp - Section A tone cue generator
// Generates sine tones with flexible envelope and pitch control

import("stdfaust.lib");

// Parameters
freq = hslider("freq", 493.883, 20, 20000, 0.001);
gate = button("gate");
level = hslider("level", 0.22, 0, 1, 0.001);

// Envelope parameters (flexible for different phases)
attack = hslider("attack", 0.02, 0.001, 1.0, 0.001);    // Fast attack (20ms default)
decay = hslider("decay", 0.8, 0.1, 5.0, 0.01);          // Soft decay (800ms default)
sustain = hslider("sustain", 0.85, 0, 1.0, 0.01);       // High sustain level (85% default)
release = hslider("release", 1.5, 0.1, 10.0, 0.01);     // Long release (1.5s default)

// ADSR envelope
env = en.adsr(attack, decay, sustain, release, gate);

// Simple harmonic brass model with gentle saturation to add bite
fund = os.osc(freq);
second = os.osc(freq * 2.0);
third = os.osc(freq * 3.0);
fifth = os.osc(freq * 5.0);

// Brighten partial mix as the envelope opens to mimic brass breath pressure
brightness = pow(env, 0.5);
partialMix = (fund * 0.72)
           + (second * (0.22 + 0.12 * brightness))
           + (third * (0.12 + 0.08 * brightness))
           + (fifth * 0.05 * brightness);

// Gentle low-pass focus keeps upper partials soft while following pitch
cutoff = min(freq * 6.0, ma.SR / 3);
smoothed = fi.lowpass(2, cutoff, partialMix);

// Mild waveshaping adds a touch of brass-like rasp without harshness
colored = ma.tanh(smoothed * (0.9 + 0.35 * brightness));

process = colored * env * level;
