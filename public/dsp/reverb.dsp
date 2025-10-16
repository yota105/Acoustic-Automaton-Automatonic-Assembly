import("stdfaust.lib");

// Parameters
roomSize = hslider("reverb/roomSize", 0.5, 0, 1, 0.01) : si.smoo;
damping = hslider("reverb/damping", 0.5, 0, 1, 0.01) : si.smoo;
wet = hslider("reverb/wet", 0.3, 0, 1, 0.01) : si.smoo;
dry = hslider("reverb/dry", 0.7, 0, 1, 0.01) : si.smoo;

// 異なるディレイタイムでステレオ感を演出
reverbL = re.mono_freeverb(roomSize, damping, 0.5);
reverbR = re.mono_freeverb(roomSize * 1.01, damping * 0.99, 0.5); // 微妙に異なるパラメータ

process = _ <: (reverbL * wet), (reverbR * wet), (_ * dry <: _, _) :> _, _;