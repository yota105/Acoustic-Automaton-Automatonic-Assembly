import("stdfaust.lib");

// Simple Reverb Effect
// Based on Freeverb algorithm

// Parameters
roomSize = hslider("reverb/roomSize", 0.5, 0, 1, 0.01) : si.smoo;
damping = hslider("reverb/damping", 0.5, 0, 1, 0.01) : si.smoo;
wet = hslider("reverb/wet", 0.3, 0, 1, 0.01) : si.smoo;
dry = hslider("reverb/dry", 0.7, 0, 1, 0.01) : si.smoo;
width = hslider("reverb/width", 1.0, 0, 1, 0.01) : si.smoo;

// Freeverb implementation
reverb = re.mono_freeverb(roomSize, damping, 0.5);

// Stereo processing with width control
process = _ <: (reverb * wet), (_ * dry) :> _;
