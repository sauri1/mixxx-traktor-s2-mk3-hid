# mixxx-traktor-s2-mk3-hid
Mixxx hid mapping for NI Traktor Kontrol s2 mk3

Based on Traktor s2 mk2 configuration in Mixxx forum: https://www.mixxx.org/forums/viewtopic.php?f=7&t=9385

- MacOS: works
- Linux: unknown
- Windows: won't work. Please leave message for any hints why windows is not working.

# non-obvious controller commands

- shift + [grid]: set gridpoint to current play location
- shift + [cue]: go to beginning of track
- [FX1> / [FX2]: toggle Deck 1 FX1 / FX2 on/off, when FX1/FX2 is on, deck 1 quick filter effect is off
- [FX3> / [FX4]: toggle Deck 2 FX1 / FX2 on/off, when FX1/FX2 is on, deck 2 quick filter effect is off
- left shift + [FX1/FX2/FX3]: toggle FX1 effects 1/2/3 on/off
- right shift + [FX1/FX2/FX3]: toggle FX2 effects 1/2/3 on/off


# user settings in beginning of file

```
// Transport buttons (FLX/REV) can have 2 possible functions:
// 1. "NORMAL": FLX change slip mode, REV plays track in revense
// 2. "LOOP": mark loop start with FLX, mark loop end with REV
TransportButtonMode = "NORMAL";

// Hotcue/Samples can have 2 possible functions:
// 1. "NORMAL": HOTCUE show hotcues and SAMPLES show samples in 8 buttons (not yet implemented)
// 2. "LOOP": mark loop start with HOTCUE, mark loop end with SAMPLES
HotcueSamplesButtonMode = "NORMAL";

HotCueColor = "LIGHTBLUE";

// start pad mode (if HotcueSamplesButtonMode = "NORMAL")
// 1 = HOTCUES
// 2 = SAMPLES
PadMode = 1;

// Play and cue buttons darken out completely instead of staying dim
PlayCueDark = false;

// false for dimmer led color, true for brighter
BrightLowColor = false;
```
