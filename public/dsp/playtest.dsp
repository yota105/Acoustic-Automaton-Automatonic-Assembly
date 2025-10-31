import("stdfaust.lib");

// Play button test synthesizer
// Simple sawtooth with ADSR envelope triggered by gate

freq = hslider("frequency[unit:Hz]", 440, 50, 2000, 0.1);
gain = hslider("volume", 0.3, 0, 1, 0.01);

// Envelope parameters
attack = hslider("attack[unit:s]", 0.01, 0.001, 1.0, 0.001);
decay = hslider("decay[unit:s]", 0.1, 0.001, 1.0, 0.001);
sustain = hslider("sustain", 0.7, 0, 1, 0.01);
release = hslider("release[unit:s]", 0.3, 0.001, 2.0, 0.001);

// Gate signal (0 or 1)
gate = button("gate");

// ADSR envelope
env = en.adsr(attack, decay, sustain, release, gate);

// Warm oscillator: sine wave + filtered triangle for warmth
osc_sine = os.osc(freq);
osc_tri = os.triangle(freq) : fi.lowpass(3, freq * 2); // Gentle lowpass
osc = (osc_sine * 0.7) + (osc_tri * 0.3); // Blend for warmth

// Output: oscillator * envelope * gain
process = osc * env * gain;
