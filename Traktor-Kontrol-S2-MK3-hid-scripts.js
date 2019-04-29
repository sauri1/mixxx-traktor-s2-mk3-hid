/****************************************************************/
/*      Traktor Kontrol S2 MK3 HID controller script v0.01      */
/*      Copyright (C) 2019, Antti Puranen                       */
/*      Based on:                                               */
/*      Traktor Kontrol S2 MK2 HID controller script v1.03      */
/*      Copyright (C) 2017, douteiful                           */
/*      Traktor Kontrol S4 MK2 HID controller script v1.00      */
/*      Copyright (C) 2015, the Mixxx Team                      */
/*      but feel free to tweak this to your heart's content!    */
/*      For Mixxx version 2.2.0                                 */
/****************************************************************/

// TODO:
// * hotcues and samples logic
// * faster scroll with shift + jogwheel works but is quirky; play stops after scrolling
// * jogwheel seems to be wonky
// * all colors to controller.LEDColors
// * functionality for two buttons under browse, currently directory button shows directory in full screen, other maybe for preview?
// * mic

// Resources
// https://www.mixxx.org/wiki/doku.php/mixxxcontrols
// https://github.com/mixxxdj/mixxx/tree/master/res/controllers

// ==== Friendly User Configuration ====
// The Directory buttons, can have 1 possible function:
// 1. "NORMAL": show song list in full screen
DirectoryButtonMode = "NORMAL";

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

TraktorS2MK3 = new function() {
  this.controller = new HIDController();
  // TODO: Decide if these should be part of this.controller instead.
  this.partial_packet = Object();
  this.divisor_map = Object();

  this.controller.LEDColors = {
    "high": 0x0F,
    "mid": 0x0A,

    "on": 0x0F,
    "off": 0x00,

    "red1": 0x04,
    "red2": 0x05,
    "highred": 0x06,
    "pink": 0x07,
    "darkred1": 0x08,
    "darkred2": 0x09,

    "lightgreen": 0x18,
    "lightblue": 0x29
  };

  if (BrightLowColor) {
      this.controller.LEDColors.low = "0x05";
  } else {
      this.controller.LEDColors.low = "0x04";
  }

  this.DirectoryButtonMode = DirectoryButtonMode;
  this.TransportButtonMode = TransportButtonMode;
  this.HotcueSamplesButtonMode = HotcueSamplesButtonMode;

  this.HotCueColor = this.controller.LEDColors[HotCueColor.toLowerCase()];

  // When true, packets will not be sent to the controller.  Good for doing mass updates.
  this.controller.freeze_lights = false;

  // The controller has a single quantize button, and we remember its state independent of
  // other channels.  (The user may toggle channel quantize in the GUI)
  this.controller.master_quantize = false;
  // Previous values, used for calculating deltas for encoder knobs.
  this.controller.prev_pregain = {"[Channel1]" : 0,
                                  "[Channel2]" : 0,
                                  "[Channel3]" : 0,
                                  "[Channel4]" : 0};
  this.controller.prev_browseL = 0;
  this.controller.prev_browseR = 0;
  this.controller.prev_loopmove = {"[Channel1]" : 0,
                                   "[Channel2]" : 0};
  this.controller.prev_loopsize = {"[Channel1]" : 0,
                                   "[Channel2]" : 0};
  this.controller.shift_pressed = {"[Channel1]" : false,
                                   "[Channel2]" : false};
  // this.controller.padmode = {"[Channel1]" : PadMode,
  //                            "[Channel2]" : PadMode};
  this.controller.wheelTouchInertiaTimer = {"[Channel1]" : 0,
                                            "[Channel2]" : 0,
                                            "[Channel3]" : 0,
                                            "[Channel4]" : 0};

  // TODO: convert to Object()s for easier logic.
  this.controller.last_tick_val = [0, 0];
  this.controller.last_tick_time = [0.0, 0.0];
  this.controller.sync_enabled_time = Object();

  this.controller.HotcueSamplesMode = {"[Channel1]" : PadMode,
                                       "[Channel2]" : PadMode};

}

TraktorS2MK3.registerInputPackets = function() {
  // selfnote: remember to check packet length
  MessageShort = new HIDPacket("shortmessage", [0x01], 20, this.shortMessageCallback);
  MessageLong = new HIDPacket("longmessage", [0x02], 39, this.longMessageCallback);

  // Values in the short message are all buttons, except the jog wheels.
  // An exclamation point indicates a specially-handled function.  Everything else is a standard
  // Mixxx control object name.
  // "[Channel1]" and "[Channel2]" refer to the left deck or right deck, and may be Channel1 or 3 depending
  // on the deck switch state.  These are keywords in the HID library.

  MessageShort.addControl("[Channel1]", "!sync_enabled", 2, "B", 0x01);
  MessageShort.addControl("[Channel2]", "!sync_enabled", 5, "B", 0x04);

  MessageShort.addControl("[Channel1]", "keylock", 2, "B", 0x02);
  MessageShort.addControl("[Channel2]", "keylock", 5, "B", 0x08);

  MessageShort.addControl("[Channel1]", "!cue_default", 2, "B", 0x04);
  MessageShort.addControl("[Channel2]", "!cue_default", 5, "B", 0x10);

  MessageShort.addControl("[Channel1]", "!play", 2, "B", 0x08);
  MessageShort.addControl("[Channel2]", "!play", 5, "B", 0x20);

  MessageShort.addControl("[Channel1]", "!hotcue1", 2, "B", 0x10);
  MessageShort.addControl("[Channel1]", "!hotcue2", 2, "B", 0x20);
  MessageShort.addControl("[Channel1]", "!hotcue3", 2, "B", 0x40);
  MessageShort.addControl("[Channel1]", "!hotcue4", 2, "B", 0x80);
  MessageShort.addControl("[Channel1]", "!hotcue5", 3, "B", 0x01);
  MessageShort.addControl("[Channel1]", "!hotcue6", 3, "B", 0x02);
  MessageShort.addControl("[Channel1]", "!hotcue7", 3, "B", 0x04);
  MessageShort.addControl("[Channel1]", "!hotcue8", 3, "B", 0x08);
  MessageShort.addControl("[Channel2]", "!hotcue1", 5, "B", 0x40);
  MessageShort.addControl("[Channel2]", "!hotcue2", 5, "B", 0x80);
  MessageShort.addControl("[Channel2]", "!hotcue3", 6, "B", 0x01);
  MessageShort.addControl("[Channel2]", "!hotcue4", 6, "B", 0x02);
  MessageShort.addControl("[Channel2]", "!hotcue5", 6, "B", 0x04);
  MessageShort.addControl("[Channel2]", "!hotcue6", 6, "B", 0x08);
  MessageShort.addControl("[Channel2]", "!hotcue7", 6, "B", 0x10);
  MessageShort.addControl("[Channel2]", "!hotcue8", 6, "B", 0x20);

  MessageShort.addControl("[Channel1]", "beatloop_activate", 7, "B", 0x04);
  MessageShort.addControl("[Channel2]", "beatloop_activate", 7, "B", 0x20);

  MessageShort.addControl("[Channel1]", "reloop_toggle", 7, "B", 0x02);
  MessageShort.addControl("[Channel2]", "reloop_toggle", 7, "B", 0x10);

  MessageShort.addControl("[Channel1]", "!jog_touch", 8, "B", 0x40);
  MessageShort.addControl("[Channel2]", "!jog_touch", 8, "B", 0x80);

  MessageShort.addControl("[Channel1]", "!jog_wheel", 12, "I");
  MessageShort.addControl("[Channel2]", "!jog_wheel", 16, "I");

  MessageShort.addControl("[Channel1]", "pfl", 4, "B", 0x01);
  MessageShort.addControl("[Channel2]", "pfl", 4, "B", 0x02);

  MessageShort.addControl("[Channel1]", "!load_track", 7, "B", 0x01);
  MessageShort.addControl("[Channel2]", "!load_track", 7, "B", 0x08);
  MessageShort.setCallback("[Channel1]", "!load_track", this.loadTrackHandler);
  MessageShort.setCallback("[Channel2]", "!load_track", this.loadTrackHandler);

  MessageShort.addControl("[Channel1]", "!directorybutton", 1, "B", 0x08);
  MessageShort.addControl("[Channel2]", "!directorybutton", 4, "B", 0x20);

  MessageShort.addControl("[Channel1]", "!grid", 1, "B", 0x10);
  MessageShort.setCallback("[Channel1]", "!grid", this.gridHandler);
  MessageShort.addControl("[Channel2]", "!grid", 4, "B", 0x40);
  MessageShort.setCallback("[Channel2]", "!grid", this.gridHandler);

  if (TraktorS2MK3.TransportButtonMode === "NORMAL") {
    MessageShort.addControl("[Channel1]", "!reverseroll", 1, "B", 0x01);
    MessageShort.setCallback("[Channel1]", "!reverseroll", this.reverseHandler);
    MessageShort.addControl("[Channel2]", "!reverseroll", 4, "B", 0x04);
    MessageShort.setCallback("[Channel2]", "!reverseroll", this.reverseHandler);
    MessageShort.addControl("[Channel1]", "slip_enabled", 1, "B", 0x02);
    MessageShort.addControl("[Channel2]", "slip_enabled", 4, "B", 0x08);
  } else if (TraktorS2MK3.TransportButtonMode === "LOOP") {
    MessageShort.addControl("[Channel1]", "loop_in", 1, "B", 0x01);
    MessageShort.addControl("[Channel2]", "loop_in", 4, "B", 0x04);
    MessageShort.addControl("[Channel1]", "loop_out", 1, "B", 0x02);
    MessageShort.addControl("[Channel2]", "loop_out", 4, "B", 0x08);
  }

  if (TraktorS2MK3.HotcueSamplesButtonMode === "NORMAL") {
    MessageShort.addControl("[Channel1]", "!hotcues1", 1, "B", 0x40);
    MessageShort.addControl("[Channel1]", "!samples2", 1, "B", 0x80);
    MessageShort.addControl("[Channel2]", "!hotcues1", 5, "B", 0x01);
    MessageShort.addControl("[Channel2]", "!samples2", 5, "B", 0x02);
    MessageShort.setCallback("[Channel1]", "!hotcues1", this.hotcuesampleHandler);
    MessageShort.setCallback("[Channel1]", "!samples2", this.hotcuesampleHandler);
    MessageShort.setCallback("[Channel2]", "!hotcues1", this.hotcuesampleHandler);
    MessageShort.setCallback("[Channel2]", "!samples2", this.hotcuesampleHandler);
  } else if (TraktorS2MK3.HotcueSamplesButtonMode === "LOOP") {
    MessageShort.addControl("[Channel1]", "loop_in", 1, "B", 0x40);
    MessageShort.addControl("[Channel1]", "loop_out", 1, "B", 0x80);
    MessageShort.addControl("[Channel2]", "loop_in", 5, "B", 0x01);
    MessageShort.addControl("[Channel2]", "loop_out", 5, "B", 0x02);
  }

  MessageShort.addControl("[Master]", "!FX1", 3, "B", 0x10);
  MessageShort.addControl("[Master]", "!FX2", 3, "B", 0x20);
  MessageShort.addControl("[Master]", "!FX3", 3, "B", 0x40);
  MessageShort.addControl("[Master]", "!FX4", 3, "B", 0x80);
  MessageShort.setCallback("[Master]", "!FX1", this.fxHandler);
  MessageShort.setCallback("[Master]", "!FX2", this.fxHandler);
  MessageShort.setCallback("[Master]", "!FX3", this.fxHandler);
  MessageShort.setCallback("[Master]", "!FX4", this.fxHandler);

  MessageShort.addControl("[Channel1]", "!shift", 1, "B", 0x20);
  MessageShort.addControl("[Channel2]", "!shift", 4, "B", 0x80);
  MessageShort.setCallback("[Channel1]", "!shift", this.shiftHandler);
  MessageShort.setCallback("[Channel2]", "!shift", this.shiftHandler);

  MessageShort.setCallback("[Channel1]", "!cue_default", this.cueHandler);
  MessageShort.setCallback("[Channel2]", "!cue_default", this.cueHandler);
  MessageShort.setCallback("[Channel1]", "!play", this.playHandler);
  MessageShort.setCallback("[Channel2]", "!play", this.playHandler);

  MessageShort.setCallback("[Channel1]", "!hotcue1", this.hotcueHandler);
  MessageShort.setCallback("[Channel1]", "!hotcue2", this.hotcueHandler);
  MessageShort.setCallback("[Channel1]", "!hotcue3", this.hotcueHandler);
  MessageShort.setCallback("[Channel1]", "!hotcue4", this.hotcueHandler);
  MessageShort.setCallback("[Channel1]", "!hotcue5", this.hotcueHandler);
  MessageShort.setCallback("[Channel1]", "!hotcue6", this.hotcueHandler);
  MessageShort.setCallback("[Channel1]", "!hotcue7", this.hotcueHandler);
  MessageShort.setCallback("[Channel1]", "!hotcue8", this.hotcueHandler);

  MessageShort.setCallback("[Channel2]", "!hotcue1", this.hotcueHandler);
  MessageShort.setCallback("[Channel2]", "!hotcue2", this.hotcueHandler);
  MessageShort.setCallback("[Channel2]", "!hotcue3", this.hotcueHandler);
  MessageShort.setCallback("[Channel2]", "!hotcue4", this.hotcueHandler);
  MessageShort.setCallback("[Channel2]", "!hotcue5", this.hotcueHandler);
  MessageShort.setCallback("[Channel2]", "!hotcue6", this.hotcueHandler);
  MessageShort.setCallback("[Channel2]", "!hotcue7", this.hotcueHandler);
  MessageShort.setCallback("[Channel2]", "!hotcue8", this.hotcueHandler);

  MessageShort.setCallback("[Channel1]", "!sync_enabled", this.syncEnabledHandler);
  MessageShort.setCallback("[Channel2]", "!sync_enabled", this.syncEnabledHandler);
  MessageShort.setCallback("[Channel1]", "!loop_activate", this.loopActivateHandler);
  MessageShort.setCallback("[Channel2]", "!loop_activate", this.loopActivateHandler);

  MessageShort.setCallback("[Channel1]", "!jog_touch", this.jogTouchHandler);
  MessageShort.setCallback("[Channel2]", "!jog_touch", this.jogTouchHandler);
  MessageShort.setCallback("[Channel1]", "!jog_wheel", this.jogMoveHandler);
  MessageShort.setCallback("[Channel2]", "!jog_wheel", this.jogMoveHandler);

  MessageShort.addControl("[Master]", "!quantize", 6, "B", 0x40);
  MessageShort.setCallback("[Master]", "!quantize", this.quantizeHandler);

  MessageShort.addControl("[Channel1]", "!loopmove", 9, "B", 0xF0);
  MessageShort.addControl("[Channel2]", "!loopmove", 11, "B", 0x0F);
  MessageShort.setCallback("[Channel1]", "!loopmove", this.callbackLoopMove);
  MessageShort.setCallback("[Channel2]", "!loopmove", this.callbackLoopMove);
  MessageShort.addControl("[Channel1]", "!loopsize", 10, "B", 0x0F);
  MessageShort.addControl("[Channel2]", "!loopsize", 11, "B", 0xF0);
  MessageShort.setCallback("[Channel1]", "!loopsize", this.callbackLoopSize);
  MessageShort.setCallback("[Channel2]", "!loopsize", this.callbackLoopSize);

  MessageShort.setCallback("[Channel1]", "!directorybutton", this.directoryButtonHandler);
  MessageShort.setCallback("[Channel2]", "!directorybutton", this.directoryButtonHandler);

  // TODO: the rest of the "!" controls.
  this.controller.registerInputPacket(MessageShort);

  // Most items in the long message are controls that go from 0-4096.
  // There are also some 4 bit encoders.

  MessageLong.addControl("[Channel1]", "rate", 0x01, "H");
  MessageLong.addControl("[Channel2]", "rate", 0x09, "H");
  engine.softTakeover("[Channel1]", "rate", true);
  engine.softTakeover("[Channel2]", "rate", true);

  MessageLong.addControl("[Channel1]", "volume", 3, "H");

  MessageLong.addControl("[Channel1]", "!super1", 19, "H");
  MessageLong.setCallback("[Channel1]", "!super1", this.super1Handler);

  MessageLong.addControl("[EqualizerRack1_[Channel1]_Effect1]", "parameter3", 13, "H");
  MessageLong.addControl("[EqualizerRack1_[Channel1]_Effect1]", "parameter2", 15, "H");
  MessageLong.addControl("[EqualizerRack1_[Channel1]_Effect1]", "parameter1", 17, "H");
  MessageLong.addControl("[Channel1]", "pregain", 11, "H");

  MessageLong.addControl("[Channel2]", "volume", 7, "H");

  MessageLong.addControl("[Channel2]", "!super1", 37, "H");
  MessageLong.setCallback("[Channel2]", "!super1", this.super1Handler);

  MessageLong.addControl("[EqualizerRack1_[Channel2]_Effect1]", "parameter3", 31, "H");
  MessageLong.addControl("[EqualizerRack1_[Channel2]_Effect1]", "parameter2", 33, "H");
  MessageLong.addControl("[EqualizerRack1_[Channel2]_Effect1]", "parameter1", 35, "H");
  MessageLong.addControl("[Channel2]", "pregain", 29, "H");

  // The physical master button controls the internal sound card volume, so if we hook this
  // up the adjustment is double-applied.
  //MessageLong.addControl("[Master]", "volume", 0x11, "H");

  MessageLong.addControl("[Master]", "crossfader", 5, "H");
  MessageLong.addControl("[Master]", "headMix", 25, "H");
  MessageLong.addControl("[Master]", "headVolume", 27, "H");

  MessageShort.addControl("[Playlist]", "browseleft", 9, "B", 0x0F);
  MessageShort.setCallback("[Playlist]", "browseleft", this.callbackBrowseL);
  MessageShort.addControl("[Playlist]", "browseright", 10, "B", 0xF0);
  MessageShort.setCallback("[Playlist]", "browseright", this.callbackBrowseR);

  this.controller.setScaler("pregain", this.scalerParameter);
  this.controller.setScaler("volume", this.scalerVolume);
  this.controller.setScaler("headMix", this.scalerSlider);
  this.controller.setScaler("headVolume", this.scalerVolume);
  this.controller.setScaler("meta", this.scalerParameter);
  this.controller.setScaler("parameter1", this.scalerParameter);
  this.controller.setScaler("parameter2", this.scalerParameter);
  this.controller.setScaler("parameter3", this.scalerParameter);
  this.controller.setScaler("!super1", this.scalerParameter);
  this.controller.setScaler("crossfader", this.scalerSlider);
  this.controller.setScaler("rate", this.scalerSlider);
  this.controller.setScaler("mix", this.scalerParameter);

  this.controller.registerInputPacket(MessageLong);
}

TraktorS2MK3.registerOutputPackets = function() {
  Output1 = new HIDPacket("output1", [0x80], 38);

  var VuOffsets = {"[Channel1]" : 28,
                   "[Channel2]" : 34};
  for (ch in VuOffsets) {
    for (i = 0; i < 0x05; i++) {
      Output1.addOutput(ch, "!" + "VuMeter" + i, VuOffsets[ch] + i, "B");
      HIDDebug(i);
    }
  }

  Output1.addOutput("[Master]", "!quantize", 60, "B");

  Output1.addOutput("[Channel1]", "!shift", 6, "B");
  Output1.addOutput("[Channel2]", "!shift", 45, "B");

  Output1.addOutput("[Channel1]", "sync_enabled", 9, "B");
  Output1.addOutput("[Channel2]", "sync_enabled", 48, "B");

  Output1.addOutput("[Channel1]", "cue_indicator", 11, "B");
  Output1.addOutput("[Channel2]", "cue_indicator", 50, "B");

  Output1.addOutput("[Channel1]", "play_indicator", 12, "B");
  Output1.addOutput("[Channel2]", "play_indicator", 51, "B");

  Output1.addOutput("[Channel1]", "keylock", 10, "B");
  Output1.addOutput("[Channel2]", "keylock", 49, "B");

  Output1.addOutput("[Channel1]", "hotcue_1_enabled", 13, "B");
  Output1.addOutput("[Channel1]", "hotcue_2_enabled", 14, "B");
  Output1.addOutput("[Channel1]", "hotcue_3_enabled", 15, "B");
  Output1.addOutput("[Channel1]", "hotcue_4_enabled", 16, "B");
  Output1.addOutput("[Channel1]", "hotcue_5_enabled", 17, "B");
  Output1.addOutput("[Channel1]", "hotcue_6_enabled", 18, "B");
  Output1.addOutput("[Channel1]", "hotcue_7_enabled", 19, "B");
  Output1.addOutput("[Channel1]", "hotcue_8_enabled", 20, "B");
  Output1.addOutput("[Channel2]", "hotcue_1_enabled", 52, "B");
  Output1.addOutput("[Channel2]", "hotcue_2_enabled", 53, "B");
  Output1.addOutput("[Channel2]", "hotcue_3_enabled", 54, "B");
  Output1.addOutput("[Channel2]", "hotcue_4_enabled", 55, "B");
  Output1.addOutput("[Channel2]", "hotcue_5_enabled", 56, "B");
  Output1.addOutput("[Channel2]", "hotcue_6_enabled", 57, "B");
  Output1.addOutput("[Channel2]", "hotcue_7_enabled", 58, "B");
  Output1.addOutput("[Channel2]", "hotcue_8_enabled", 59, "B");

  Output1.addOutput("[Channel1]", "directorybutton", 4, "B");
  Output1.addOutput("[Channel2]", "directorybutton", 43, "B");

  Output1.addOutput("[Channel1]", "PeakIndicator", 33, "B");
  Output1.addOutput("[Channel2]", "PeakIndicator", 39, "B");

  Output1.addOutput("[Channel1]", "pfl", 26, "B");
  Output1.addOutput("[Channel2]", "pfl", 27, "B");

  Output1.addOutput("[Channel1]", "!grid", 5, "B");
  Output1.addOutput("[Channel2]", "!grid", 44, "B");

  if (TraktorS2MK3.TransportButtonMode === "NORMAL") {
    Output1.addOutput("[Channel1]", "!reverseroll", 1, "B");
    Output1.addOutput("[Channel2]", "!reverseroll", 40, "B");
    Output1.addOutput("[Channel1]", "slip_enabled", 2, "B");
    Output1.addOutput("[Channel2]", "slip_enabled", 41, "B");
  } else if (TraktorS2MK3.TransportButtonMode === "LOOP") {
    Output1.addOutput("[Channel1]", "loop_in", 1, "B");
    Output1.addOutput("[Channel2]", "loop_in", 40, "B");
    Output1.addOutput("[Channel1]", "loop_out", 2, "B");
    Output1.addOutput("[Channel2]", "loop_out", 41, "B");
  }

  if (TraktorS2MK3.HotcueSamplesButtonMode === "NORMAL") {
    Output1.addOutput("[Channel1]", "!hotcues1", 7, "B");
    Output1.addOutput("[Channel1]", "!samples2", 8, "B");
    Output1.addOutput("[Channel2]", "!hotcues1", 46, "B");
    Output1.addOutput("[Channel2]", "!samples2", 47, "B");
  } else if (TraktorS2MK3.HotcueSamplesButtonMode === "LOOP") {
    Output1.addOutput("[Channel1]", "loop_in", 7, "B");
    Output1.addOutput("[Channel1]", "loop_out", 8, "B");
    Output1.addOutput("[Channel2]", "loop_in", 46, "B");
    Output1.addOutput("[Channel2]", "loop_out", 47, "B");
  }

  Output1.addOutput("[Master]", "FX1", 22, "B");
  Output1.addOutput("[Master]", "FX2", 23, "B");
  Output1.addOutput("[Master]", "FX3", 24, "B");
  Output1.addOutput("[Master]", "FX4", 25, "B");

  this.controller.registerOutputPacket(Output1);

  // Link up control objects to their outputs
  TraktorS2MK3.linkDeckOutputs("sync_enabled", TraktorS2MK3.outputCallback);
  if (PlayCueDark) {
    TraktorS2MK3.linkDeckOutputs("cue_indicator", TraktorS2MK3.outputCallbackDark);
    TraktorS2MK3.linkDeckOutputs("play_indicator", TraktorS2MK3.outputCallbackDark);
  } else {
    TraktorS2MK3.linkDeckOutputs("cue_indicator", TraktorS2MK3.outputCallback);
    TraktorS2MK3.linkDeckOutputs("play_indicator", TraktorS2MK3.outputCallback);
  }

  TraktorS2MK3.linkDeckOutputs("hotcue_1_enabled", TraktorS2MK3.outputCueCallback);
  TraktorS2MK3.linkDeckOutputs("hotcue_2_enabled", TraktorS2MK3.outputCueCallback);
  TraktorS2MK3.linkDeckOutputs("hotcue_3_enabled", TraktorS2MK3.outputCueCallback);
  TraktorS2MK3.linkDeckOutputs("hotcue_4_enabled", TraktorS2MK3.outputCueCallback);
  TraktorS2MK3.linkDeckOutputs("hotcue_5_enabled", TraktorS2MK3.outputCueCallback);
  TraktorS2MK3.linkDeckOutputs("hotcue_6_enabled", TraktorS2MK3.outputCueCallback);
  TraktorS2MK3.linkDeckOutputs("hotcue_7_enabled", TraktorS2MK3.outputCueCallback);
  TraktorS2MK3.linkDeckOutputs("hotcue_8_enabled", TraktorS2MK3.outputCueCallback);

  TraktorS2MK3.linkDeckOutputs("loop_in", TraktorS2MK3.outputCallbackLoop);
  TraktorS2MK3.linkDeckOutputs("loop_out", TraktorS2MK3.outputCallbackLoop);

  TraktorS2MK3.linkDeckOutputs("keylock", TraktorS2MK3.outputCallbackDark);
  TraktorS2MK3.linkDeckOutputs("LoadSelectedTrack", TraktorS2MK3.outputCallback);
  TraktorS2MK3.linkDeckOutputs("slip_enabled", TraktorS2MK3.outputCallback);

  TraktorS2MK3.linkChannelOutput("[Channel1]", "pfl", TraktorS2MK3.outputChannelCallback);
  TraktorS2MK3.linkChannelOutput("[Channel2]", "pfl", TraktorS2MK3.outputChannelCallback);

  TraktorS2MK3.linkChannelOutput("[Channel1]", "track_samples", TraktorS2MK3.outputChannelCallback);
  TraktorS2MK3.linkChannelOutput("[Channel2]", "track_samples", TraktorS2MK3.outputChannelCallback);

  TraktorS2MK3.linkChannelOutput("[Channel1]", "PeakIndicator", TraktorS2MK3.outputChannelCallbackDark);
  TraktorS2MK3.linkChannelOutput("[Channel2]", "PeakIndicator", TraktorS2MK3.outputChannelCallbackDark);

  // VU meters get special attention
  engine.connectControl("[Channel1]", "VuMeter", "TraktorS2MK3.onVuMeterChanged");
  engine.connectControl("[Channel2]", "VuMeter", "TraktorS2MK3.onVuMeterChanged");

  engine.connectControl("[Channel1]", "loop_enabled", "TraktorS2MK3.onLoopEnabledChanged");
  engine.connectControl("[Channel2]", "loop_enabled", "TraktorS2MK3.onLoopEnabledChanged");
}

TraktorS2MK3.linkDeckOutputs = function(key, callback) {
  // Linking outputs is a little tricky because the library doesn't quite do what I want.  But this
  // method works.
  TraktorS2MK3.controller.linkOutput("[Channel1]", key, "[Channel1]", key, callback);
  engine.connectControl("[Channel3]", key, callback);
  TraktorS2MK3.controller.linkOutput("[Channel2]", key, "[Channel2]", key, callback);
  engine.connectControl("[Channel4]", key, callback);
}

TraktorS2MK3.linkChannelOutput = function(group, key, callback) {
  TraktorS2MK3.controller.linkOutput(group, key, group, key, callback);
}

TraktorS2MK3.lightGroup = function(packet, output_group_name, co_group_name) {
  var group_ob = packet.groups[output_group_name];
  for (var field_name in group_ob) {
    field = group_ob[field_name];
    if (field.name[0] === "!") {
      continue;
    }
    if (field.mapped_callback) {
      var value = engine.getValue(co_group_name, field.name);
      field.mapped_callback(value, co_group_name, field.name);
    }
    // No callback, no light!
  }
}

TraktorS2MK3.lightDeck = function(group) {
  // Freeze the lights while we do this update so we don't spam HID.
  this.controller.freeze_lights = true;
  for (var packet_name in this.controller.OutputPackets) {
    packet = this.controller.OutputPackets[packet_name];
    TraktorS2MK3.lightGroup(packet, group, group);

    // turn lights on for specific buttons
    // Shift is a weird key because there's no CO that it is actually associated with.
    TraktorS2MK3.outputCallback(0, group, "!shift");

    // turn grid light on
    TraktorS2MK3.outputCallback(0, group, "!grid");

    if (TraktorS2MK3.TransportButtonMode === "NORMAL") {
      // turn rev light on
      TraktorS2MK3.outputCallback(0, group, "!reverseroll");
    }

  }

  this.controller.freeze_lights = false;
  // And now send them all.
  for (packet_name in this.controller.OutputPackets) {
    var packet_ob = this.controller.OutputPackets[packet_name];
    packet_ob.send();
  }
}

TraktorS2MK3.init = function(id) {
  TraktorS2MK3.registerInputPackets()
  TraktorS2MK3.registerOutputPackets()

  // Initialize master quantize based on the state of Channel1.  It's the best we can do for now
  // until we have controller preferences.
  TraktorS2MK3.master_quantize = engine.getValue("[Channel1]", "quantize");
  engine.setValue("[Channel1]", "quantize", TraktorS2MK3.master_quantize);
  engine.setValue("[Channel2]", "quantize", TraktorS2MK3.master_quantize);
  TraktorS2MK3.controller.setOutput("[Master]", "!quantize", (TraktorS2MK3.master_quantize) ? TraktorS2MK3.controller.LEDColors.high : TraktorS2MK3.controller.LEDColors.low, true);

  // set fx select leds
  TraktorS2MK3.controller.setOutput("[Master]", "FX1", engine.getValue("[EffectRack1_EffectUnit1]", "group_[Channel1]_enable") ? TraktorS2MK3.controller.LEDColors.high : TraktorS2MK3.controller.LEDColors.low, true);
  TraktorS2MK3.controller.setOutput("[Master]", "FX2", engine.getValue("[EffectRack1_EffectUnit2]", "group_[Channel1]_enable") ? TraktorS2MK3.controller.LEDColors.high : TraktorS2MK3.controller.LEDColors.low, true);
  TraktorS2MK3.controller.setOutput("[Master]", "FX3", engine.getValue("[EffectRack1_EffectUnit1]", "group_[Channel2]_enable") ? TraktorS2MK3.controller.LEDColors.high : TraktorS2MK3.controller.LEDColors.low, true);
  TraktorS2MK3.controller.setOutput("[Master]", "FX4", engine.getValue("[EffectRack1_EffectUnit2]", "group_[Channel2]_enable") ? TraktorS2MK3.controller.LEDColors.high : TraktorS2MK3.controller.LEDColors.low, true);

  // set hotcues/samples select leds
  if (TraktorS2MK3.HotcueSamplesButtonMode === "NORMAL") {
    TraktorS2MK3.controller.setOutput("[Channel1]", "!hotcues1", TraktorS2MK3.controller.HotcueSamplesMode["[Channel1]"]===1 ? TraktorS2MK3.controller.LEDColors.high : TraktorS2MK3.controller.LEDColors.low, true);
    TraktorS2MK3.controller.setOutput("[Channel1]", "!samples2", TraktorS2MK3.controller.HotcueSamplesMode["[Channel1]"]===2 ? TraktorS2MK3.controller.LEDColors.high : TraktorS2MK3.controller.LEDColors.low, true);
    TraktorS2MK3.controller.setOutput("[Channel2]", "!hotcues1", TraktorS2MK3.controller.HotcueSamplesMode["[Channel2]"]===1 ? TraktorS2MK3.controller.LEDColors.high : TraktorS2MK3.controller.LEDColors.low, true);
    TraktorS2MK3.controller.setOutput("[Channel2]", "!samples2", TraktorS2MK3.controller.HotcueSamplesMode["[Channel2]"]===2 ? TraktorS2MK3.controller.LEDColors.high : TraktorS2MK3.controller.LEDColors.low, true);
  }

  TraktorS2MK3.outputChannelCallback(engine.getValue("[InternalClock]", "sync_master"), "[InternalClock]", "sync_master");
  TraktorS2MK3.lightDeck("[Preview[Channel1]]");
  TraktorS2MK3.lightDeck("[Channel1]");
  TraktorS2MK3.lightDeck("[Channel2]");

  // TraktorS2MK3.debugLights();

  HIDDebug("TraktorS2MK3: init done");
}

TraktorS2MK3.debugLights = function() {
  HIDDebug("TraktorS2MK3: debugLights");
  // Call this if you want to just send raw packets to the controller (good for figuring out what
  // bytes do what).

  // pad 04 05 06 red 07 pink 08 09 dark red 10 11 dark yellow 12 13 bright yellow 14 15 dark yellow 16 17 yellow 18 light green

  // 00 01  02  03      04        05   06    07      08      09   10      11  12   13   14   15
  // 80 rev flx addfile filelist= grid shift hotcues samples sync keylock cue play pad1 pad2 pad3
  // 16   17   18   19   20   21     22  23  24  25  26   27   28    29    30    31
  // pad4 pad5 pad6 pad7 pad8 sample fx1 fx2 fx3 fx4 cuel cuer voll1 voll2 voll3 voll4
  // 32   33       34    35    36    37    38    39        40  41  42      43        44   45    46       47
  // vol5 vol6clip volr1 volr2 volr3 volr4 volr5 volr6clip rev flx addfile filelist= grid shift hotcues samples
  // 48   49      50  51   52   53   54   55   56   57   58   59   60  61
  // sync keylock cue play pad1 pad2 pad3 pad4 pad5 pad6 pad7 pad8 qnt mic

  //                   00 01 02 03  04 05 06 07  08 09 0A 0B  0C 0D 0E 0F
  var data_strings = ["80 00 00 00  00 00 00 00  00 00 00 00  00 00 00 00  \n" +
                      "00 00 00 00  00 00 00 00  00 00 00 00  00 00 00 00  \n" +
                      "00 00 00 00  00 00 00 00  00 00 00 00  00 00 00 00  \n" +
                      "00 00 00 00  00 00 00 00  00 00 00 00  00 00"];

  var data = [Object()];

  for (i = 0; i < 1; i++) {
    var ok = true;
    var splitted = data_strings[i].split(/\s+/);
    HIDDebug("i" + i + " " + splitted);
    data[i].length = splitted.length;
    for (j = 0; j < splitted.length; j++) {
      var byte_str = splitted[j];
      if (byte_str.length !== 2) {
        ok = false;
        HIDDebug("not two characters?? " + byte_str);
      }
      var b = parseInt(byte_str, 16);
      if (b < 0 || b > 255) {
        ok = false;
        HIDDebug("number out of range: " + byte_str + " " + b);
      }
      data[i][j] = b;
    }
    if (ok) {
      controller.send(data[i], data[i].length, 0);
    }
  }
}

TraktorS2MK3.shutdown = function() {
  var packet_lengths = [62];
  for (i = 0; i < packet_lengths.length; i++) {
    var packet_length = packet_lengths[i];
    var data = Object();
    data.length = packet_length;
    data[0] = 0x80 + i;
    for (j = 1; j < packet_length; j++) {
      data[j] = 0;
    }
    controller.send(data, packet_length, 0);
  }
  HIDDebug("TraktorS2MK3: shutdown done");
}

// Called by Mixxx -- mandatory function to receive anything from HID
TraktorS2MK3.incomingData = function(data, length) {
  // There are no partial packets in S3 so we can handle them right away?
  TraktorS2MK3.controller.parsePacket(data, length);
  return;
}

// The short message handles buttons and jog wheels.
TraktorS2MK3.shortMessageCallback = function(packet, data) {
  for (name in data) {
    field = data[name];
    if (field.name === "!jog_wheel") {
      TraktorS2MK3.controller.processControl(field);
      continue;
    }

    TraktorS2MK3.controller.processButton(field);
  }
}

// There are no buttons handled by the long message, so this is a little simpler.  (Even though
// this is very similar to the other handler, it's easier to keep them separate to know what's
// a control and what's a button.
TraktorS2MK3.longMessageCallback = function(packet, data) {
  for (name in data) {
    field = data[name];
    TraktorS2MK3.controller.processControl(field);
  }
}

TraktorS2MK3.hotcuesampleHandler = function(field) {
  if (field.value === 0) {
    return;
  }
  var group = field.id.split(".")[0];
  var button = field.name.substring(0, field.name.length - 1);
  var buttonNumber = parseInt(field.name[field.name.length - 1]);

  HIDDebug("TraktorS2MK3.hotcuesampleHandler " + field.group + " " + field.name + " " + field.value + " " + field.id);
  HIDDebug("TraktorS2MK3.hotcuesampleHandler " + group + " " + button + " " + buttonNumber);

  // TODO

  // TraktorS2MK3.controller.shift_pressed[group] = field.value;
  // TraktorS2MK3.outputCallback(field.value, field.group, "!shift");
}


TraktorS2MK3.shiftHandler = function(field) {
  var group = field.id.split(".")[0];

  // HIDDebug("TraktorS2MK3.shiftHandler " + field.group + " " + field.value);

  TraktorS2MK3.controller.shift_pressed[group] = field.value;
  TraktorS2MK3.outputCallback(field.value, field.group, "!shift");
}

TraktorS2MK3.reverseHandler = function(field) {
  var group = field.id.split(".")[0];

  // HIDDebug("TraktorS2MK3.reverseHandler " + field.group + " " + field.value);

  TraktorS2MK3.outputCallback(field.value, field.group, "!reverseroll");
  engine.setValue(field.group, "reverseroll", field.value);
}

TraktorS2MK3.gridHandler = function(field) {
  if (field.value === 0) {
    return;
  }

  var group = field.id.split(".")[0];

  // HIDDebug("TraktorS2MK3.gridHandler " + field.group + " " + field.value);

  if (TraktorS2MK3.controller.shift_pressed[group]) {
    // set beatgrid
    engine.setValue(field.group, "beats_translate_curpos", 1);
  } else {
    // do something else
  }

}

TraktorS2MK3.loadTrackHandler = function(field) {
  var splitted = field.id.split(".");
  var group = splitted[0];
  if (TraktorS2MK3.controller.shift_pressed[group]) {
    engine.setValue(field.group, "eject", field.value);
  } else {
    engine.setValue(field.group, "LoadSelectedTrack", field.value);
  }
}

TraktorS2MK3.syncEnabledHandler = function(field) {
  var now = Date.now();

  var splitted = field.id.split(".");
  var group = splitted[0];
  // If shifted, just toggle.
  // TODO(later version): actually make this enable explicit master.
  if (TraktorS2MK3.controller.shift_pressed[group]) {
    if (field.value === 0) {
      return;
    }
    var synced = engine.getValue(field.group, "sync_enabled");
    engine.setValue(field.group, "sync_enabled", !synced);
  } else {
    if (field.value === 1) {
      TraktorS2MK3.controller.sync_enabled_time[field.group] = now;
      engine.setValue(field.group, "sync_enabled", 1);
    } else {
      var cur_enabled = engine.getValue(field.group, "sync_enabled");
      if (!cur_enabled) {
        // If disabled, and switching to disable... stay disabled.
        engine.setValue(field.group, "sync_enabled", 0);
        return;
      }
      // was enabled, and button has been let go.  maybe latch it.
      if (now - TraktorS2MK3.controller.sync_enabled_time[field.group] > 300) {
        engine.setValue(field.group, "sync_enabled", 1);
        return;
      }
      engine.setValue(field.group, "sync_enabled", 0);
    }
  }
}

TraktorS2MK3.loopActivateHandler = function(field) {
  var splitted = field.id.split(".");
  var group = splitted[0];
  if (TraktorS2MK3.controller.shift_pressed[group]) {
    engine.setValue(field.group, "pitch_adjust_set_default", field.value);
  } else {
    engine.setValue(field.group, "reloop_exit", field.value);
  }
}

TraktorS2MK3.cueHandler = function(field) {
  var splitted = field.id.split(".");
  var group = splitted[0];
  if (TraktorS2MK3.controller.shift_pressed[group]) {
    if (field.value === 0) {
      return;
    }
    engine.setValue(field.group, "start_stop", 1);
  } else {
    engine.setValue(field.group, "cue_default", field.value);
  }
}

TraktorS2MK3.playHandler = function(field) {
  if (field.value === 0) {
    return;
  }
  var splitted = field.id.split(".");
  var group = splitted[0];
  if (TraktorS2MK3.controller.shift_pressed[group]) {
    var locked = engine.getValue(field.group, "keylock");
    engine.setValue(field.group, "keylock", !locked);
  } else {
    var playing = engine.getValue(field.group, "play");
    engine.setValue(field.group, "play", !playing);
  }
}

TraktorS2MK3.previewDeckHandler = function(field) {
  if (field.value === 0) {
    return;
  }
  // TODO: figure out a way to know if the browse position has changed.  If not, the preview
  // button should pause / resume. If it has changed, preview button loads new track.
  /*if (engine.getValue("[Preview[Channel1]]", "play")) {
    engine.setValue("[Preview[Channel1]]", "cue_gotoandstop", 1);
    engine.setValue("[Preview[Channel1]]", "cue_gotoandstop", 0);
  } else {*/
  engine.setValue("[Preview[Channel1]]", "LoadSelectedTrackAndPlay", 1);
  engine.setValue("[Preview[Channel1]]", "LoadSelectedTrackAndPlay", 0);
  //}
}

// Jog wheel touch code taken from VCI400.  It should be moved into common-hid-packet-parser.js
TraktorS2MK3.jogTouchHandler = function(field) {
  if (TraktorS2MK3.controller.wheelTouchInertiaTimer[field.group] != 0) {
    // The wheel was touched again, reset the timer.
    engine.stopTimer(TraktorS2MK3.controller.wheelTouchInertiaTimer[field.group]);
    TraktorS2MK3.controller.wheelTouchInertiaTimer[field.group] = 0;
  }
  if (field.value !== 0) {
    var deckNumber = TraktorS2MK3.controller.resolveDeck(group);

    engine.scratchEnable(deckNumber, 1024, 33.3333, 0.125, 0.125/8, true);

  } else {
    // The wheel touch sensor can be overly sensitive, so don't release scratch mode right away.
    // Depending on how fast the platter was moving, lengthen the time we'll wait.
    var scratchRate = Math.abs(engine.getValue(field.group, "scratch2"));
    // Note: inertiaTime multiplier is controller-specific and should be factored out.
    var inertiaTime = Math.pow(1.8, scratchRate) * 2;
    if (inertiaTime < 100) {
      // Just do it now.
      TraktorS2MK3.finishJogTouch(field.group);
    } else {
      TraktorS2MK3.controller.wheelTouchInertiaTimer[field.group] = engine.beginTimer(
          inertiaTime, "TraktorS2MK3.finishJogTouch(\"" + field.group + "\")", true);
    }
  }
}

TraktorS2MK3.finishJogTouch = function(group) {
  TraktorS2MK3.controller.wheelTouchInertiaTimer[group] = 0;
  var deckNumber = TraktorS2MK3.controller.resolveDeck(group);
  var play = engine.getValue(group, "play");
  if (play != 0) {
    // If we are playing, just hand off to the engine.
    engine.scratchDisable(deckNumber, true);
  } else {
    // If things are paused, there will be a non-smooth handoff between scratching and jogging.
    // Instead, keep scratch on until the platter is not moving.
    var scratchRate = Math.abs(engine.getValue(group, "scratch2"));
    if (scratchRate < 0.01) {
      // The platter is basically stopped, now we can disable scratch and hand off to jogging.
      engine.scratchDisable(deckNumber, false);
    } else {
      // Check again soon.
      TraktorS2MK3.controller.wheelTouchInertiaTimer[group] = engine.beginTimer(
              100, "TraktorS2MK3.finishJogTouch(\"" + group + "\")", true);
    }
  }
}

TraktorS2MK3.jogMoveHandler = function(field) {
  // var tickval = field.value & 0xFF;
  // var timeval = field.value >>> 16;

  // HIDDebug("TraktorS2MK3.jogMoveHandler " + " tickval=" + tickval + " timeval=" + timeval);

  var deltas = TraktorS2MK3.wheelDeltas(field.group, field.value);
  var tick_delta = deltas[0];
  var time_delta = deltas[1];

  // increase tick_delta when shift is pressed for faster jogwheel scrub
  if (TraktorS2MK3.controller.shift_pressed[field.group]) {
      tick_delta = tick_delta * 5;
  }

  // HIDDebug("TraktorS2MK3.jogMoveHandler tick_delta=" + tick_delta + " time_delta=" + time_delta);
  // HIDDebug("TraktorS2MK3.jogMoveHandler field.group=" + field.group + " field.value=" + field.value);

  var velocity = TraktorS2MK3.scalerJog(tick_delta, time_delta);

  engine.setValue(field.group, "jog", velocity);
  if (engine.getValue(field.group, "scratch2_enable")) {

    var deckNumber = TraktorS2MK3.controller.resolveDeck(group);
    engine.scratchTick(deckNumber, tick_delta);
  }
};

TraktorS2MK3.wheelDeltas = function(group, value) {
  // When the wheel is touched, four bytes change, but only the first behaves predictably.
  // It looks like the wheel is 640 ticks per revolution.
  var tickval = value & 0xFF;
  var timeval = value >>> 16;
  var prev_tick = 0;
  var prev_time = 0;

  if (group[8] === "1" || group[8] === "3") {
    prev_tick = TraktorS2MK3.controller.last_tick_val[0];
    prev_time = TraktorS2MK3.controller.last_tick_time[0];
    TraktorS2MK3.controller.last_tick_val[0] = tickval;
    TraktorS2MK3.controller.last_tick_time[0] = timeval;
  } else {
    prev_tick = TraktorS2MK3.controller.last_tick_val[1];
    prev_time = TraktorS2MK3.controller.last_tick_time[1];
    TraktorS2MK3.controller.last_tick_val[1] = tickval;
    TraktorS2MK3.controller.last_tick_time[1] = timeval;
  }

  if (prev_time > timeval) {
    // We looped around.  Adjust current time so that subtraction works.
    timeval += 0x10000;
  }
  var time_delta = timeval - prev_time;
  if (time_delta === 0) {
    // Spinning too fast to detect speed!  By not dividing we are guessing it took 1ms.
    time_delta = 1;
  }

  var tick_delta = 0;
  if (prev_tick >= 200 && tickval <= 100) {
    tick_delta = tickval + 256 - prev_tick;
  } else if (prev_tick <= 100 && tickval >= 200) {
    tick_delta = tickval - prev_tick - 256;
  } else {
    tick_delta = tickval - prev_tick;
  }
  // HIDDebug("TraktorS2MK3.wheelDeltas group=" + group + " tickval=" + tickval + " timeval=" + timeval + " prev_tick=" + prev_tick + " prev_time=" + prev_time + " tick_delta=" + tick_delta);
  return [tick_delta, time_delta];
}

TraktorS2MK3.scalerJog = function(tick_delta, time_delta) {
  if (engine.getValue(group, "play")) {
    return (tick_delta / time_delta) / 3;
  } else {
    return (tick_delta / time_delta) * 2.0;
  }
}

TraktorS2MK3.hotcueHandler = function(field) {
  var group = field.id.split(".")[0];
  var buttonNumber = parseInt(field.name[field.name.length - 1]);

  HIDDebug("TraktorS2MK3.hotcueHandler: " + group + "," + buttonNumber);

  if (TraktorS2MK3.controller.shift_pressed[group]) {
    engine.setValue(field.group, "hotcue_" + buttonNumber + "_clear", field.value);
  } else {
    engine.setValue(field.group, "hotcue_" + buttonNumber + "_activate", field.value);
  }
}

// TraktorS2MK3.hotcuemodeHandler = function(field) {
//   var group = field.id.split(".")[0];

//   engine.setValue(field.group, "padmode", 1);

//   HIDDebug("TraktorS2MK3.hotcuemodeHandler: " + group + " " + engine.getValue(field.group, "padmode") );

//   // if (TraktorS2MK3.controller.shift_pressed[group]) {
//   //   engine.setValue(field.group, "hotcue_" + buttonNumber + "_clear", field.value);
//   // } else {
//   //   engine.setValue(field.group, "hotcue_" + buttonNumber + "_activate", field.value);
//   // }
// }

TraktorS2MK3.super1Handler = function(field) {
  var group = field.id.split(".")[0];
  var effectunit;

  // HIDDebug("TraktorS2MK3.super1 " + group + " " + field.value + " " + effectunit);

    // change fx mix when pressing shift+super1
  if (TraktorS2MK3.controller.shift_pressed["[Channel1]"] || TraktorS2MK3.controller.shift_pressed["[Channel2]"]) {

    if (field.group === "[Channel1]") {
      engine.setValue("[EffectRack1_EffectUnit1]", "mix", field.value/4096);
    } else if (field.group === "[Channel2]") {
      engine.setValue("[EffectRack1_EffectUnit2]", "mix", field.value/4096);
    }

  } else {
    engine.setValue("[QuickEffectRack1_" + field.group + "]", "super1", field.value/4096);
  }

  // change normal effect metaknob
  if (engine.getValue("[EffectRack1_EffectUnit1]", "group_" + field.group + "_enable") ) {
    engine.setValue("[EffectRack1_EffectUnit1]", "super1", field.value/4096);
  }
  // change normal effect metaknob
  if (engine.getValue("[EffectRack1_EffectUnit2]", "group_" + field.group + "_enable")) {
    engine.setValue("[EffectRack1_EffectUnit2]", "super1", field.value/4096);
  }


  // if (engine.getValue("[EffectRack1_EffectUnit1]", "group_" + field.group + "_enable") || engine.getValue("[EffectRack1_EffectUnit2]", "group_" + field.group + "_enable")) {
  //   // change normal effect metaknob
  //   engine.setValue(effectunit, "super1", field.value/4096);
  // }

  // engine.setValue("[EffectRack1_EffectUnit1]", "super1", field.value/4096);
  // engine.setValue("[EffectRack1_EffectUnit2]", "super1", field.value/4096);
  // engine.setValue("[EffectRack1_EffectUnit3]", "super1", field.value/4096);
  // engine.setValue("[EffectRack1_EffectUnit4]", "super1", field.value/4096);

}

TraktorS2MK3.fxHandler = function(field) {
  if (field.value === 0) {
    return;
  }

  var group = field.id.split(".")[0];
  var buttonNumber = parseInt(field.name[field.name.length - 1]);

  // HIDDebug("TraktorS2MK3.fxHandler " + group + " " + buttonNumber + " " + field.value);

  if (TraktorS2MK3.controller.shift_pressed["[Channel1]"]) {

    script.toggleControl("[EffectRack1_EffectUnit1_Effect" + buttonNumber + "]", "enabled");

  } else if (TraktorS2MK3.controller.shift_pressed["[Channel2]"]) {

    script.toggleControl("[EffectRack1_EffectUnit2_Effect" + buttonNumber + "]", "enabled");

  } else if (buttonNumber === 1 || buttonNumber === 2) {
    script.toggleControl("[EffectRack1_EffectUnit" + buttonNumber + "]", "group_[Channel1]_enable");

    TraktorS2MK3.controller.setOutput("[Master]", "FX1", engine.getValue("[EffectRack1_EffectUnit1]", "group_[Channel1]_enable") ? TraktorS2MK3.controller.LEDColors.high : TraktorS2MK3.controller.LEDColors.low, true);
    TraktorS2MK3.controller.setOutput("[Master]", "FX2", engine.getValue("[EffectRack1_EffectUnit2]", "group_[Channel1]_enable") ? TraktorS2MK3.controller.LEDColors.high : TraktorS2MK3.controller.LEDColors.low, true);

    if (engine.getValue("[EffectRack1_EffectUnit1]", "group_[Channel1]_enable") || engine.getValue("[EffectRack1_EffectUnit2]", "group_[Channel1]_enable")) {
      // disable effect
      engine.setValue("[QuickEffectRack1_[Channel1]_Effect1]", "enabled", 0);
    }
    else {
      // enable effect
      engine.setValue("[QuickEffectRack1_[Channel1]_Effect1]", "enabled", 1);
    }

  }
  else if (buttonNumber === 3 || buttonNumber === 4) {
    script.toggleControl("[EffectRack1_EffectUnit" + (buttonNumber-2) + "]", "group_[Channel2]_enable");

    TraktorS2MK3.controller.setOutput("[Master]", "FX3", engine.getValue("[EffectRack1_EffectUnit1]", "group_[Channel2]_enable") ? TraktorS2MK3.controller.LEDColors.high : TraktorS2MK3.controller.LEDColors.low, true);
    TraktorS2MK3.controller.setOutput("[Master]", "FX4", engine.getValue("[EffectRack1_EffectUnit2]", "group_[Channel2]_enable") ? TraktorS2MK3.controller.LEDColors.high : TraktorS2MK3.controller.LEDColors.low, true);

    if (engine.getValue("[EffectRack1_EffectUnit1]", "group_[Channel2]_enable") || engine.getValue("[EffectRack1_EffectUnit2]", "group_[Channel2]_enable")) {
      // disable quickeffect
      engine.setValue("[QuickEffectRack1_[Channel2]_Effect1]", "enabled", 0);
    }
    else {
      // enable quickeffect
      engine.setValue("[QuickEffectRack1_[Channel2]_Effect1]", "enabled", 1);
    }

  }

}

TraktorS2MK3.directoryButtonHandler = function(field) {
  HIDDebug("TraktorS2MK3.directoryButtonHandler " + field.value);
  if (field.value === 0) {
    return;
  }
  if (TraktorS2MK3.DirectoryButtonMode === "NORMAL") {
    // HIDDebug("TraktorS2MK3.DirectoryButtonMode === NORMAL");

    if (engine.getValue("[Master]", "maximize_library") === 0) {
      engine.setValue("[Master]", "maximize_library", 1);
      TraktorS2MK3.outputCallback(1, "[Channel1]", "directorybutton");
      TraktorS2MK3.outputCallback(1, "[Channel2]", "directorybutton");
    } else {
      engine.setValue("[Master]", "maximize_library", 0);
      TraktorS2MK3.outputCallback(0, "[Channel1]", "directorybutton");
      TraktorS2MK3.outputCallback(0, "[Channel2]", "directorybutton");
    }

  }

}

TraktorS2MK3.quantizeHandler = function(field) {
  if (field.value === 0) {
    return;
  }
  TraktorS2MK3.master_quantize = !TraktorS2MK3.master_quantize;
  engine.setValue("[Channel1]", "quantize", TraktorS2MK3.master_quantize);
  engine.setValue("[Channel2]", "quantize", TraktorS2MK3.master_quantize);
  TraktorS2MK3.controller.setOutput("[Master]", "!quantize", (TraktorS2MK3.master_quantize) ? TraktorS2MK3.controller.LEDColors.high : TraktorS2MK3.controller.LEDColors.low, true);
}

TraktorS2MK3.callbackLoopMove = function(field) {
  // TODO: common-hid-packet-parser looks like it should do deltas, but I can't get them to work.
  var splitted = field.id.split(".");
  var group = splitted[0]
  prev_loopmove = TraktorS2MK3.controller.prev_loopmove[group];
  TraktorS2MK3.controller.prev_loopmove[group] = field.value;
  var delta = 0;
  if (prev_loopmove === 15 && field.value === 0) {
    delta = 1;
  } else if (prev_loopmove === 0 && field.value === 15) {
    delta = -1;
  } else if (field.value > prev_loopmove) {
    delta = 1;
  } else {
    delta = -1;
  }

  // Shift mode: adjust musical key
  if (TraktorS2MK3.controller.shift_pressed[group]) {
    if (delta == 1) {
      engine.setValue(field.group, "pitch_up_small", 1);
      engine.setValue(field.group, "pitch_up_small", 0);
    } else {
      engine.setValue(field.group, "pitch_down_small", 1);
      engine.setValue(field.group, "pitch_down_small", 0);
    }
  } else {
    if (delta == 1) {
      engine.setValue(field.group, "beatjump_forward", 1);
      engine.setValue(field.group, "beatjump_forward", 0);
    } else {
      engine.setValue(field.group, "beatjump_backward", 1);
      engine.setValue(field.group, "beatjump_backward", 0);
    }
  }
}

TraktorS2MK3.callbackLoopSize = function(field) {
  var splitted = field.id.split(".");
  var group = splitted[0];
  prev_loopsize = TraktorS2MK3.controller.prev_loopsize[group];
  TraktorS2MK3.controller.prev_loopsize[group] = field.value;
  var delta = 0;
  if (prev_loopsize === 15 && field.value === 0) {
    delta = 1;
  } else if (prev_loopsize === 0 && field.value === 15) {
    delta = -1;
  } else if (field.value > prev_loopsize) {
    delta = 1;
  } else if (field.value < prev_loopsize) {
    delta = -1;
  }

  if (TraktorS2MK3.controller.shift_pressed[group]) {
    var playPosition = engine.getValue(field.group, "playposition")
    if (delta == 1) {
      playPosition += 0.0125;
    } else {
      playPosition -= 0.0125;
    }
    engine.setValue(field.group, "playposition", playPosition);
  } else {
    var current_size = engine.getValue(field.group, "beatloop_size")

    if (delta == 1) {
      if(current_size < 64) current_size *= 2;
    } else {
      if(current_size > 0.03125) current_size /= 2;
    }
    engine.setValue(field.group, "beatloop_size", current_size);
    engine.setValue(field.group, "beatjump_size", current_size);
  }
}


TraktorS2MK3.callbackBrowseL = function(field) {
  // TODO: common-hid-packet-parser looks like it should do deltas, but I can't get them to work.
  prev_browse = TraktorS2MK3.controller.prev_browseL;
  TraktorS2MK3.controller.prev_browseL = field.value;

  HIDDebug("TraktorS2MK3.callbackBrowseL " + field.value + " " + prev_browse);

  var delta = 0;
  if (prev_browse === 15 && field.value === 0) {
    delta = 1;
  } else if (prev_browse === 0 && field.value === 15) {
    delta = -1;
  } else if (field.value > prev_browse) {
    delta = 1;
  } else if (field.value < prev_browse){
    delta = -1;
  } else {
    return;
  }
  if (TraktorS2MK3.controller.shift_pressed["[Channel1]"] || TraktorS2MK3.controller.shift_pressed["[Channel2]"]) {
    engine.setValue("[Playlist]", "SelectPlaylist", delta);
  }
  else {
    engine.setValue("[Playlist]", "SelectTrackKnob", delta);
  }
}


TraktorS2MK3.callbackBrowseR = function(field) {
  // TODO: common-hid-packet-parser looks like it should do deltas, but I can't get them to work.
  // field.value = field.value / 16;
  prev_browse = TraktorS2MK3.controller.prev_browseR;
  // values 00-255 step 16
  TraktorS2MK3.controller.prev_browseR = field.value;

  HIDDebug("TraktorS2MK3.callbackBrowseR " + field.value + " " + prev_browse);

  var delta = 0;
  if (prev_browse === 15 && field.value === 0) {
    delta = 1;
  } else if (prev_browse === 0 && field.value === 15) {
    delta = -1;
  } else if (field.value > prev_browse) {
    delta = 1;
  } else if (field.value < prev_browse){
    delta = -1;
  } else {
    return;
  }

  if (TraktorS2MK3.controller.shift_pressed["[Channel1]"] || TraktorS2MK3.controller.shift_pressed["[Channel2]"]) {
    engine.setValue("[Playlist]", "SelectPlaylist", delta);
  }
  else {
    engine.setValue("[Playlist]", "SelectTrackKnob", delta);
  }
}


TraktorS2MK3.scalerParameter = function(group, name, value) {
  return script.absoluteLin(value, 0, 1, 16, 4080);
}
// Tell the HIDController script to use setParameter instead of setValue.
TraktorS2MK3.scalerParameter.useSetParameter = true;

TraktorS2MK3.scalerVolume = function(group, name, value) {
  if (group === "[Master]") {
    return script.absoluteNonLin(value, 0, 1, 4, 16, 4080);
  } else {
    return script.absoluteNonLin(value, 0, 0.25, 1, 16, 4080);
  }
}

TraktorS2MK3.scalerSlider = function(group, name, value) {
  return script.absoluteLin(value, -1, 1, 16, 4080);
}

TraktorS2MK3.outputChannelCallback = function(value,group,key) {
  var led_value = TraktorS2MK3.controller.LEDColors.low;
  if (value) {
    led_value = TraktorS2MK3.controller.LEDColors.high;
  }
  TraktorS2MK3.controller.setOutput(group, key, led_value, !TraktorS2MK3.controller.freeze_lights);
}

TraktorS2MK3.outputChannelCallbackDark = function(value,group,key) {
  var led_value = TraktorS2MK3.controller.LEDColors.off;
  if (value) {
    led_value = TraktorS2MK3.controller.LEDColors.high;
  }
  TraktorS2MK3.controller.setOutput(group, key, led_value, !TraktorS2MK3.controller.freeze_lights);
}

TraktorS2MK3.outputCallback = function(value,group,key) {
  var led_value = TraktorS2MK3.controller.LEDColors.low;
  if (value) {
    led_value = TraktorS2MK3.controller.LEDColors.high;
  }
  TraktorS2MK3.controller.setOutput(group, key, led_value, !TraktorS2MK3.controller.freeze_lights);
}

TraktorS2MK3.outputCallbackLoop = function(value,group,key) {
  var led_value = TraktorS2MK3.controller.LEDColors.low;
  if (engine.getValue(group, "loop_enabled")) {
    led_value = TraktorS2MK3.controller.LEDColors.high;
  }
  TraktorS2MK3.controller.setOutput(group, key, led_value, !TraktorS2MK3.controller.freeze_lights);
}

TraktorS2MK3.outputCallbackDark = function(value,group,key) {
  var led_value = TraktorS2MK3.controller.LEDColors.off;
  if (value) {
    led_value = TraktorS2MK3.controller.LEDColors.high;
  }
  TraktorS2MK3.controller.setOutput(group, key, led_value, !TraktorS2MK3.controller.freeze_lights);
}

TraktorS2MK3.outputCueCallback = function(value, group, key) {

  HIDDebug("TraktorS2MK3.outputCueCallback: " + value + "," + group + "," + key);

  var RGB_value = [TraktorS2MK3.HotCueColor];
  // var RGB_value = [0, 0, 0];
  // Use different colors that match cue colors
  // var num = key.charAt(7);
  if (value === 1) {
  //   if (num == '1') RGB_value = [0x40, 0x40, 0];
  //   else if (num == '2') RGB_value = [0x40, 0, 0x40];
  //   else if (num == '3') RGB_value = [0, 0x20, 0x20];
  //   else if (num == '4') RGB_value = [0, 0x20, 0];
  } else {
    RGB_value = [TraktorS2MK3.controller.LEDColors.off];
  }

  TraktorS2MK3.controller.setOutput(group, key, RGB_value[0], false);
  // TraktorS2MK3.controller.setOutput(group, "!" + key + "_G", RGB_value[1], false);
  // TraktorS2MK3.controller.setOutput(group, "!" + key + "_B", RGB_value[2], !TraktorS2MK3.controller.freeze_lights);
}

TraktorS2MK3.onVuMeterChanged = function(value, group, key) {
  // This handler is called a lot so it should be as fast as possible.

  // VU is drawn on 5 segments, the 6th indicates clip.
  // Figure out number of fully-illuminated segments.
  var scaledValue = value * 5.0;
  var fullIllumCount = Math.floor(scaledValue);

  // Figure out how much the partially-illuminated segment is illuminated.
  var partialIllum = (scaledValue - fullIllumCount) * 0x7F

  for (i = 0; i < 5; i++) {
    var key = "!" + "VuMeter" + i;
    if (i < fullIllumCount) {
      // Don't update lights until they're all done, so the last term is false.
      TraktorS2MK3.controller.setOutput(group, key, 0x7F, false);
    } else if (i == fullIllumCount) {
      TraktorS2MK3.controller.setOutput(group, key, partialIllum, false);
    } else {
      TraktorS2MK3.controller.setOutput(group, key, 0x00, false);
    }
  }
  TraktorS2MK3.controller.OutputPackets["output1"].send();
}

TraktorS2MK3.onLoopEnabledChanged = function(value, group, key) {
  TraktorS2MK3.outputCallbackLoop(value, group, "loop_in");
  TraktorS2MK3.outputCallbackLoop(value, group, "loop_out");
}
