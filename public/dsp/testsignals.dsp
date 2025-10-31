import("stdfaust.lib");
// Test signals DSP: selectable tone / noise / impulse with simple params
select = hslider("test/select",0,0,2,1); // 0:tone 1:noise 2:impulse
freq = hslider("test/freq",440,50,4000,1);
level = hslider("test/level",0.3,0,1,0.01);
// Basic sources
sig_tone = os.sawtooth(freq) * level;
sig_noise = no.noise * level;
// Simple impulse: one sample pulse each trigger length
sig_imp = ba.impulsify(1) * level;
process = (select==0)*sig_tone + (select==1)*sig_noise + (select==2)*sig_imp;
