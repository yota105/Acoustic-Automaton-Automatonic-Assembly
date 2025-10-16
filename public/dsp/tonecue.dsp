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

// Pure sine tone with envelope
process = os.osc(freq) * env * level;
