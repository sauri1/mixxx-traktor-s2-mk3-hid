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
// * Remix slots
// * Effect lights

// ==== Friendly User Configuration ====
// The Cue button, when Shift is also held, can have two possible functions:
// 1. "REWIND": seeks to the very start of the track.
// 2. "REVERSEROLL": performs a temporary reverse or "censor" effect, where the track
//    is momentarily played in reverse until the button is released.
ShiftCueButtonAction = "REWIND";
// Play and cue buttons darken out completely instead of staying dim
PlayCueDark = false;


TraktorS2MK3 = new function() {
  this.controller = new HIDController();
  // TODO: Decide if these should be part of this.controller instead.
  this.partial_packet = Object();
  this.divisor_map = Object();
  this.ShiftCueButtonAction = ShiftCueButtonAction;

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
  this.controller.prev_browse = 0;
  this.controller.prev_loopmove = {"[Channel1]" : 0,
                                   "[Channel2]" : 0};
  this.controller.prev_loopsize = {"[Channel1]" : 0,
                                   "[Channel2]" : 0};
  this.controller.shift_pressed = {"[Channel1]" : false,
                                   "[Channel2]" : false};
  this.controller.wheelTouchInertiaTimer = {"[Channel1]" : 0,
                                            "[Channel2]" : 0,
                                            "[Channel3]" : 0,
                                            "[Channel4]" : 0};

  // TODO: convert to Object()s for easier logic.
  this.controller.last_tick_val = [0, 0];
  this.controller.last_tick_time = [0.0, 0.0];
  this.controller.sync_enabled_time = Object();

  // scratch overrides
  // TODO: these can probably be removed, or should be used in my custom scratch code.
  this.controller.scratchintervalsPerRev = 1024;
  this.controller.scratchRPM = 33+1/3;
  this.controller.scratchAlpha = 1.0 / 8;
  this.controller.scratchBeta = this.controller.scratchAlpha / 8;
  this.controller.scratchRampOnEnable = true;
  this.controller.scratchRampOnDisable = true;
}

TraktorS2MK3.registerInputPackets = function() {
  // selfnote: remember to change packet length
  MessageShort = new HIDPacket("shortmessage", [0x01], 20, this.shortMessageCallback);
  MessageLong = new HIDPacket("longmessage", [0x02], 51, this.longMessageCallback);

  // Values in the short message are all buttons, except the jog wheels.
  // An exclamation point indicates a specially-handled function.  Everything else is a standard
  // Mixxx control object name.
  // "[Channel1]" and "[Channel2]" refer to the left deck or right deck, and may be Channel1 or 3 depending
  // on the deck switch state.  These are keywords in the HID library.

  MessageShort.addControl("[Channel1]", "!shift", 0x0B, "B", 0x08);
  MessageShort.addControl("[Channel1]", "!sync_enabled", 0x0B, "B", 0x04);
  MessageShort.addControl("[Channel1]", "!cue_default", 0x02, "B", 0x04);
  MessageShort.addControl("[Channel1]", "!play", 0x02, "B", 0x08);
  MessageShort.addControl("[Channel1]", "!hotcue1", 0x0B, "B", 0x80);
  MessageShort.addControl("[Channel1]", "!hotcue2", 0x0B, "B", 0x40);
  MessageShort.addControl("[Channel1]", "!hotcue3", 0x0B, "B", 0x20);
  MessageShort.addControl("[Channel1]", "!hotcue4", 0x0B, "B", 0x10);
  MessageShort.addControl("[Channel1]", "loop_out", 0x0C, "B", 0x80);
  MessageShort.addControl("[Channel1]", "loop_in", 0x0C, "B", 0x40);
  //MessageShort.addControl("[Channel1]", "slip_enabled", 0x0E, "B", 0x02);
  //MessageShort.addControl("[Channel1]", "!reset", 0x0E, "B", 0x01);
  MessageShort.addControl("[Channel1]", "beatloop_activate", 0x0F, "B", 0x02);
  MessageShort.addControl("[Channel1]", "!loop_activate", 0x0F, "B", 0x01);
  MessageShort.addControl("[Channel1]", "!jog_touch", 0x0A, "B", 0x01);
  MessageShort.addControl("[Channel1]", "!jog_wheel", 0x01, "I");
  MessageShort.addControl("[Channel1]", "!load_track", 0x0C, "B", 0x08);
  //MessageShort.addControl("[Channel1]", "!FX1", 0x0E, "B", 0x10);
  //MessageShort.addControl("[Channel1]", "!FX2", 0x0E, "B", 0x80);
  //MessageShort.addControl("[Channel1]", "!FX3", 0x0E, "B", 0x40);
  //MessageShort.addControl("[Channel1]", "!FX4", 0x0E, "B", 0x20);
  //MessageShort.addControl("[EffectRack1_EffectUnit1]", "next_chain", 0x0E, "B", 0x10);
  MessageShort.addControl("[EffectRack1_EffectUnit1_Effect1]", "enabled", 0x0E, "B", 0x80);
  MessageShort.addControl("[EffectRack1_EffectUnit1_Effect2]", "enabled", 0x0E, "B", 0x40);
  MessageShort.addControl("[EffectRack1_EffectUnit1_Effect3]", "enabled", 0x0E, "B", 0x20);
  MessageShort.setCallback("[EffectRack1_EffectUnit1_Effect1]", "enabled", this.effectEnabledHandler);
  MessageShort.setCallback("[EffectRack1_EffectUnit1_Effect2]", "enabled", this.effectEnabledHandler);
  MessageShort.setCallback("[EffectRack1_EffectUnit1_Effect3]", "enabled", this.effectEnabledHandler);

  // MessageShort.addControl("[Channel2]", "!shift", 0x09, "B", 0x08);
  // MessageShort.addControl("[Channel2]", "!sync_enabled", 0x09, "B", 0x04);
  // MessageShort.addControl("[Channel2]", "!cue_default", 0x09, "B", 0x02);
  // MessageShort.addControl("[Channel2]", "!play", 0x05, "B", 0x32);
  // MessageShort.addControl("[Channel2]", "!hotcue1", 0x09, "B", 0x80);
  // MessageShort.addControl("[Channel2]", "!hotcue2", 0x09, "B", 0x40);
  // MessageShort.addControl("[Channel2]", "!hotcue3", 0x09, "B", 0x20);
  // MessageShort.addControl("[Channel2]", "!hotcue4", 0x09, "B", 0x10);
  // MessageShort.addControl("[Channel2]", "loop_out", 0x0A, "B", 0x80);
  // MessageShort.addControl("[Channel2]", "loop_in", 0x0A, "B", 0x40);
  // //MessageShort.addControl("[Channel2]", "slip_enabled", 0x0B, "B", 0x02);
  // //MessageShort.addControl("[Channel2]", "!reset", 0x0B, "B", 0x01);
  // MessageShort.addControl("[Channel2]", "beatloop_activate", 0x0F, "B", 0x10);
  // MessageShort.addControl("[Channel2]", "!loop_activate", 0x0F, "B", 0x08);
  // MessageShort.addControl("[Channel2]", "!jog_touch", 0x0A, "B", 0x02);
  // MessageShort.addControl("[Channel2]", "!jog_wheel", 0x05, "I");
  // MessageShort.addControl("[Channel2]", "!load_track", 0x0C, "B", 0x04);
  // //MessageShort.addControl("[Channel2]", "!FX1", 0x0D, "B", 0x04);
  // //MessageShort.addControl("[Channel2]", "!FX2", 0x0D, "B", 0x20);
  // //MessageShort.addControl("[Channel2]", "!FX3", 0x0D, "B", 0x10);
  // //MessageShort.addControl("[Channel2]", "!FX4", 0x0D, "B", 0x08);
  // MessageShort.addControl("[EffectRack1_EffectUnit2_Effect1]", "enabled", 0xD, "B", 0x20);
  // MessageShort.addControl("[EffectRack1_EffectUnit2_Effect2]", "enabled", 0xD, "B", 0x10);
  // MessageShort.addControl("[EffectRack1_EffectUnit2_Effect3]", "enabled", 0xD, "B", 0x08);
  // MessageShort.setCallback("[EffectRack1_EffectUnit2_Effect1]", "enabled", this.effectEnabledHandler);
  // MessageShort.setCallback("[EffectRack1_EffectUnit2_Effect2]", "enabled", this.effectEnabledHandler);
  // MessageShort.setCallback("[EffectRack1_EffectUnit2_Effect3]", "enabled", this.effectEnabledHandler);
  // //MessageShort.addControl("[EffectRack1_EffectUnit2]", "next_chain", 0xD, "B", 0x04);

  MessageShort.addControl("[Channel1]", "pfl", 0x0C, "B", 0x10);
  MessageShort.addControl("[EffectRack1_EffectUnit1]","group_[Channel1]_enable", 0x0E, "B", 0x08);
  MessageShort.addControl("[EffectRack1_EffectUnit2]","group_[Channel1]_enable", 0x0E, "B", 0x04);
  MessageShort.addControl("[Channel1]", "pregain_set_default", 0x0D, "B", 0x40);

  MessageShort.addControl("[Channel2]", "pfl", 0x0A, "B", 0x10);
  MessageShort.addControl("[EffectRack1_EffectUnit1]","group_[Channel2]_enable", 0x0E, "B", 0x02);
  MessageShort.addControl("[EffectRack1_EffectUnit2]","group_[Channel2]_enable", 0x0E, "B", 0x01);
  MessageShort.addControl("[Channel2]", "pregain_set_default", 0x0D, "B", 0x80);

  MessageShort.addControl("[Playlist]", "LoadSelectedIntoFirstStopped", 0x13, "B", 0x04);
  MessageShort.addControl("[Preview[Channel1]]", "!previewdeck", 0x0F, "B", 0x01);

  MessageShort.addControl("[Master]", "!quantize", 0x0A, "B", 0x08);

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
  MessageShort.setCallback("[Channel2]", "!hotcue1", this.hotcueHandler);
  MessageShort.setCallback("[Channel2]", "!hotcue2", this.hotcueHandler);
  MessageShort.setCallback("[Channel2]", "!hotcue3", this.hotcueHandler);
  MessageShort.setCallback("[Channel2]", "!hotcue4", this.hotcueHandler);
  MessageShort.setCallback("[Channel1]", "!load_track", this.loadTrackHandler);
  MessageShort.setCallback("[Channel2]", "!load_track", this.loadTrackHandler);
  MessageShort.setCallback("[Channel1]", "!sync_enabled", this.syncEnabledHandler);
  MessageShort.setCallback("[Channel2]", "!sync_enabled", this.syncEnabledHandler);
  MessageShort.setCallback("[Channel1]", "!loop_activate", this.loopActivateHandler);
  MessageShort.setCallback("[Channel2]", "!loop_activate", this.loopActivateHandler);
  MessageShort.setCallback("[Channel1]", "!jog_touch", this.jogTouchHandler);
  MessageShort.setCallback("[Channel2]", "!jog_touch", this.jogTouchHandler);
  MessageShort.setCallback("[Channel1]", "!jog_wheel", this.jogMoveHandler);
  MessageShort.setCallback("[Channel2]", "!jog_wheel", this.jogMoveHandler);
  MessageShort.setCallback("[Preview[Channel1]]", "!previewdeck", this.previewDeckHandler);
  MessageShort.setCallback("[Master]", "!quantize", this.quantizeHandler);
  // TODO: the rest of the "!" controls.
  this.controller.registerInputPacket(MessageShort);

  // Most items in the long message are controls that go from 0-4096.
  // There are also some 4 bit encoders.
  MessageLong.addControl("[Channel1]", "rate", 0x07, "H");
  MessageLong.addControl("[Channel2]", "rate", 0x09, "H");
  engine.softTakeover("[Channel1]", "rate", true);
  engine.softTakeover("[Channel2]", "rate", true);
  MessageLong.addControl("[Channel1]", "!loopmove", 0x01, "B", 0x0F, undefined, true);
  MessageLong.addControl("[Channel2]", "!loopmove", 0x02, "B", 0xF0, undefined, true);
  MessageLong.setCallback("[Channel1]", "!loopmove", this.callbackLoopMove);
  MessageLong.setCallback("[Channel2]", "!loopmove", this.callbackLoopMove);
  MessageLong.addControl("[Channel1]", "!loopsize", 0x01, "B", 0xF0, undefined, true);
  MessageLong.addControl("[Channel2]", "!loopsize", 0x03, "B", 0x0F, undefined, true);
  MessageLong.setCallback("[Channel1]", "!loopsize", this.callbackLoopSize);
  MessageLong.setCallback("[Channel2]", "!loopsize", this.callbackLoopSize);

  MessageLong.addControl("[EffectRack1_EffectUnit1]", "mix", 0x17, "H");
  MessageLong.addControl("[EffectRack1_EffectUnit1_Effect1]", "meta", 0x19, "H");
  MessageLong.addControl("[EffectRack1_EffectUnit1_Effect2]", "meta", 0x1B, "H");
  MessageLong.addControl("[EffectRack1_EffectUnit1_Effect3]", "meta", 0x1D, "H");

  MessageLong.addControl("[EffectRack1_EffectUnit2]", "mix", 0x1F, "H");
  MessageLong.addControl("[EffectRack1_EffectUnit2_Effect1]", "meta", 0x21, "H");
  MessageLong.addControl("[EffectRack1_EffectUnit2_Effect2]", "meta", 0x23, "H");
  MessageLong.addControl("[EffectRack1_EffectUnit2_Effect3]", "meta", 0x25, "H");

  MessageLong.addControl("[Channel1]", "volume", 0x13, "H");
  //MessageLong.addControl("[QuickEffectRack1_[Channel1]]", "super1", 0x1D, "H");
  MessageLong.addControl("[EqualizerRack1_[Channel1]_Effect1]", "parameter3", 0x27, "H");
  MessageLong.addControl("[EqualizerRack1_[Channel1]_Effect1]", "parameter2", 0x29, "H");
  MessageLong.addControl("[EqualizerRack1_[Channel1]_Effect1]", "parameter1", 0x2B, "H");
  MessageLong.addControl("[Channel1]", "pregain", 0x03, "B", 0xF0, undefined, true);
  MessageLong.setCallback("[Channel1]", "pregain", this.callbackPregain);

  MessageLong.addControl("[Channel2]", "volume", 0x15, "H");
  //MessageLong.addControl("[QuickEffectRack1_[Channel2]]", "super1", 0x25, "H");
  MessageLong.addControl("[EqualizerRack1_[Channel2]_Effect1]", "parameter3", 0x2D, "H");
  MessageLong.addControl("[EqualizerRack1_[Channel2]_Effect1]", "parameter2", 0x2F, "H");
  MessageLong.addControl("[EqualizerRack1_[Channel2]_Effect1]", "parameter1", 0x31, "H");
  MessageLong.addControl("[Channel2]", "pregain", 0x04, "B", 0x0F, undefined, true);
  MessageLong.setCallback("[Channel2]", "pregain", this.callbackPregain);

  // The physical master button controls the internal sound card volume, so if we hook this
  // up the adjustment is double-applied.
  //MessageLong.addControl("[Master]", "volume", 0x11, "H");
  MessageLong.addControl("[Master]", "crossfader", 0x05, "H");
  MessageLong.addControl("[Master]", "headMix", 0x0B, "H");
  MessageLong.addControl("[Playlist]", "!browse", 0x02, "B", 0x0F, undefined, true);
  MessageLong.setCallback("[Playlist]", "!browse", this.callbackBrowse);

  this.controller.setScaler("volume", this.scalerVolume);
  this.controller.setScaler("headMix", this.scalerSlider);
  this.controller.setScaler("meta", this.scalerParameter);
  this.controller.setScaler("parameter1", this.scalerParameter);
  this.controller.setScaler("parameter2", this.scalerParameter);
  this.controller.setScaler("parameter3", this.scalerParameter);
  this.controller.setScaler("super1", this.scalerParameter);
  this.controller.setScaler("crossfader", this.scalerSlider);
  this.controller.setScaler("rate", this.scalerSlider);
  this.controller.setScaler("mix", this.scalerParameter);
  this.controller.registerInputPacket(MessageLong);
}

TraktorS2MK3.registerOutputPackets = function() {
  Output1 = new HIDPacket("output1", [0x80], 38);
  Output2 = new HIDPacket("output2", [0x81], 33);

  var VuOffsets = {"[Channel1]" : 28,
                   "[Channel2]" : 34};
  for (ch in VuOffsets) {
    for (i = 0; i < 0x05; i++) {
      Output1.addOutput(ch, "!" + "VuMeter" + i, VuOffsets[ch] + i, "B");
      HIDDebug(i);
    }
  }


  Output1.addOutput("[Channel1]", "PeakIndicator", 33, "B");
  Output1.addOutput("[Channel2]", "PeakIndicator", 39, "B");

  // Output1.addOutput("[Channel1]", "loop_in", 0x21, "B");
  // Output1.addOutput("[Channel1]", "loop_out", 0x22, "B");
  // Output2.addOutput("[Channel2]", "loop_in", 0x23, "B");
  // Output2.addOutput("[Channel2]", "loop_out", 0x24, "B");

  // Output1.addOutput("[Channel1]", "pfl", 0x1B, "B");
  // Output1.addOutput("[Master]", "!usblight", 0x1D, "B");
  // Output1.addOutput("[Channel2]", "pfl", 0x1F, "B");

  // Output1.addOutput("[EffectRack1_EffectUnit1]", "group_[Channel1]_enable", 0x0F, "B");
  // Output1.addOutput("[EffectRack1_EffectUnit2]", "group_[Channel1]_enable", 0x10, "B");
  // Output1.addOutput("[EffectRack1_EffectUnit1]", "group_[Channel2]_enable", 0x11, "B");
  // Output1.addOutput("[EffectRack1_EffectUnit2]", "group_[Channel2]_enable", 0x12, "B");

  // //
  // //Output1.addOutput("[Master]", "!quantize", 0x31, "B");
  // //Output1.addOutput("[InternalClock]", "sync_master", 0x30, "B");

  Output1.addOutput("[Channel1]", "cue_indicator", 0x0B, "B");
  Output1.addOutput("[Channel1]", "play_indicator", 0x0C, "B");

  this.controller.registerOutputPacket(Output1);

  // Output2.addOutput("[Channel1]", "!shift", 0x19, "B");
  // Output2.addOutput("[Channel1]", "sync_enabled", 0x1A, "B");
  // Output2.addOutput("[Channel1]", "cue_indicator", 0x1B, "B");
  // Output2.addOutput("[Channel1]", "play_indicator", 0x0C, "B");
  // Output2.addOutput("[Channel1]", "hotcue_1_enabled", 0x01, "B");
  // Output2.addOutput("[Channel1]", "!hotcue_1_enabled_G", 0x02, "B");
  // Output2.addOutput("[Channel1]", "!hotcue_1_enabled_B", 0x03, "B");
  // Output2.addOutput("[Channel1]", "hotcue_2_enabled", 0x04, "B");
  // Output2.addOutput("[Channel1]", "!hotcue_2_enabled_G", 0x05, "B");
  // Output2.addOutput("[Channel1]", "!hotcue_2_enabled_B", 0x06, "B");
  // Output2.addOutput("[Channel1]", "hotcue_3_enabled", 0x07, "B");
  // Output2.addOutput("[Channel1]", "!hotcue_3_enabled_G", 0x08, "B");
  // Output2.addOutput("[Channel1]", "!hotcue_3_enabled_B", 0x09, "B");
  // Output2.addOutput("[Channel1]", "hotcue_4_enabled", 0x0A, "B");
  // Output2.addOutput("[Channel1]", "!hotcue_4_enabled_G", 0x0B, "B");
  // Output2.addOutput("[Channel1]", "!hotcue_4_enabled_B", 0x0C, "B");

  // //Output2.addOutput("[Channel1]", "loop_out", 0x2A, "B");
  // //Output2.addOutput("[Channel1]", "keylock", 0x2F, "B");
  // //Output2.addOutput("[Channel1]", "slip_enabled", 0x39, "B");

  // Output2.addOutput("[Channel2]", "!shift", 0x1D, "B");
  // Output2.addOutput("[Channel2]", "sync_enabled", 0x1E, "B");
  // Output2.addOutput("[Channel2]", "cue_indicator", 0x1F, "B");
  // Output2.addOutput("[Channel2]", "play_indicator", 0x20, "B");
  // Output2.addOutput("[Channel2]", "hotcue_1_enabled", 0x0D, "B");
  // Output2.addOutput("[Channel2]", "!hotcue_1_enabled_G", 0x0E, "B");
  // Output2.addOutput("[Channel2]", "!hotcue_1_enabled_B", 0x0F, "B");
  // Output2.addOutput("[Channel2]", "hotcue_2_enabled", 0x10, "B");
  // Output2.addOutput("[Channel2]", "!hotcue_2_enabled_G", 0x11, "B");
  // Output2.addOutput("[Channel2]", "!hotcue_2_enabled_B", 0x12, "B");
  // Output2.addOutput("[Channel2]", "hotcue_3_enabled", 0x13, "B");
  // Output2.addOutput("[Channel2]", "!hotcue_3_enabled_G", 0x14, "B");
  // Output2.addOutput("[Channel2]", "!hotcue_3_enabled_B", 0x15, "B");
  // Output2.addOutput("[Channel2]", "hotcue_4_enabled", 0x16, "B");
  // Output2.addOutput("[Channel2]", "!hotcue_4_enabled_G", 0x17, "B");
  // Output2.addOutput("[Channel2]", "!hotcue_4_enabled_B", 0x18, "B");
  // //Output2.addOutput("[Channel2]", "keylock", 0x35, "B");
  // //Output2.addOutput("[Channel2]", "slip_enabled", 0x3B, "B");


  // /*Output2.addOutput("[Channel1]", "!deck_A", 0x2E, "B");
  // Output2.addOutput("[Channel2]", "!deck_B", 0x34, "B");

  // Output2.addOutput("[Preview[Channel1]]", "play_indicator", 0x3D, "B");

  // }*/

  this.controller.registerOutputPacket(Output2);

  // Link up control objects to their outputs
  TraktorS2MK3.linkDeckOutputs("sync_enabled", TraktorS2MK3.outputCallback);
  if(PlayCueDark) {
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
  TraktorS2MK3.linkChannelOutput("[Master]", "PeakIndicatorL", TraktorS2MK3.outputChannelCallbackDark);
  TraktorS2MK3.linkChannelOutput("[Master]", "PeakIndicatorR", TraktorS2MK3.outputChannelCallbackDark);
  TraktorS2MK3.linkChannelOutput("[EffectRack1_EffectUnit1]", "group_[Channel1]_enable", TraktorS2MK3.outputChannelCallback);
  TraktorS2MK3.linkChannelOutput("[EffectRack1_EffectUnit2]", "group_[Channel1]_enable", TraktorS2MK3.outputChannelCallback);
  TraktorS2MK3.linkChannelOutput("[EffectRack1_EffectUnit1]", "group_[Channel2]_enable", TraktorS2MK3.outputChannelCallback);
  TraktorS2MK3.linkChannelOutput("[EffectRack1_EffectUnit2]", "group_[Channel2]_enable", TraktorS2MK3.outputChannelCallback);
  TraktorS2MK3.linkChannelOutput("[EffectRack1_EffectUnit1_Effect1]", "enabled", TraktorS2MK3.outputChannelCallback);

  TraktorS2MK3.linkChannelOutput("[EffectRack1_EffectUnit1]", "next_chain", TraktorS2MK3.outputChannelCallback);
  TraktorS2MK3.linkChannelOutput("[EffectRack1_EffectUnit2]", "next_chain", TraktorS2MK3.outputChannelCallback);
  TraktorS2MK3.linkChannelOutput("[Preview[Channel1]]", "play_indicator", TraktorS2MK3.outputChannelCallback);
  TraktorS2MK3.linkChannelOutput("[InternalClock]", "sync_master", TraktorS2MK3.outputChannelCallback);

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
    // Shift is a weird key because there's no CO that it is actually associated with.
    TraktorS2MK3.outputCallback(0, group, "!shift");
  }

  this.controller.freeze_lights = false;
  // And now send them all.
  for (packet_name in this.controller.OutputPackets) {
    var packet_ob = this.controller.OutputPackets[packet_name];
    packet_ob.send();
  }
}

TraktorS2MK3.pointlessLightShow = function() {
  var packets = [Object(), Object()];

  packets[0].length = 38;
  packets[1].length = 33;
  //packets[2].length = 61;

  // Fade up all lights evenly from 0 to 0x7F
  for (k = 0; k < 0x7F; k+=0x05) {
    for (var i = 0; i < packets.length; i++) {
      // Packet header
      packets[i][0] = 0x80 + i;
      for (j = 1; j < packets[i].length; j++) {
        packets[i][j] = k;
      }
    }
    controller.send(packets[0], packets[0].length, 0);
    controller.send(packets[1], packets[1].length, 0);
    // "sleep"
    var then = Date.now();
    while (true) {
      var now = Date.now();
      if (now - then > 25) {
        break;
      }
    }
  }
}

TraktorS2MK3.init = function(id) {
  //TraktorS2MK3.pointlessLightShow()
  TraktorS2MK3.registerInputPackets()
  TraktorS2MK3.registerOutputPackets()

  // Initialize master quantize based on the state of Channel1.  It's the best we can do for now
  // until we have controller preferences.
  TraktorS2MK3.master_quantize = engine.getValue("[Channel1]", "quantize");
  engine.setValue("[Channel1]", "quantize", TraktorS2MK3.master_quantize);
  engine.setValue("[Channel2]", "quantize", TraktorS2MK3.master_quantize);
  TraktorS2MK3.controller.setOutput("[Master]", "!quantize", 0x7F * TraktorS2MK3.master_quantize, true);

  TraktorS2MK3.controller.setOutput("[Master]", "!usblight", 0x7F, true);
  TraktorS2MK3.outputChannelCallback(engine.getValue("[InternalClock]", "sync_master"), "[InternalClock]", "sync_master");
  TraktorS2MK3.lightDeck("[Preview[Channel1]]");
  TraktorS2MK3.lightDeck("[Channel1]");
  TraktorS2MK3.lightDeck("[Channel2]");

  TraktorS2MK3.debugLights();

  HIDDebug("TraktorS2MK3: done init");
}

TraktorS2MK3.debugLights = function() {
  // Call this if you want to just send raw packets to the controller (good for figuring out what
  // bytes do what).
  //var data_strings = ["80 00 00 00 00 00 00 00 0A 00 00 00 00 00 00 00 0A 00 00 00 00 00 00 00 0A 00 00 00 00 00 00 00 0A 0A 0A 0A 0A 0A 0A 0A 0A 00 7F 00 00 00 00 0A 0A 0A 0A 0A 0A",
  //                    "81 0B 03 00 0B 03 00 0B 03 00 0B 03 00 0B 03 00 0B 03 00 0B 03 00 0B 03 00 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 7F 0A 0A 0A 0A 0A 7F 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A",
  //                    "82 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 0A 00 00 7F 7F 7F 7F 7F 7F 00 00 7F 7F 7F 7F 7F 00 00 00 7F 7F 7F 7F 7F 7F 00 00 7F 7F 7F 7F 7F 00 00 00"];
  //                   00 01 02 03  04 05 06 07  08 09 0A 0B  0C 0D 0E 0F
  // var data_strings = ["80 00 00 00  00 00 00 00  0A 00 00 00  00 00 00 00  \n" +
  //                     "0A 00 00 00  00 00 00 00  0A 00 00 00  00 00 00 00  \n" +
  //                     "0A 0A 0A 0A  0A 0A 0A 0A  0A 00 7F 00  00 00 00 0A  \n" +
  //                     "0A 0A 0A 0A  0A",
  //                     "81 00 00 7F  7F 03 7F 0B  03 7F 0B 03  7F 0B 03 7F  \n" +
  //                     "0B 03 7F 0B  03 00 7f 03  7F 0A 0A 0A  00 7f 0A 0A  \n" +
  //                     "00 7f 0A 0A  0A 0A 0A 0A  7F 0A 0a 0A  0a 0a 7f 0a  \n" +
  //                     "0a 0a 0a 0a  7F 0A 0A 0A  0a 0a 0a 0a  0a 0a 0a",
  //                     "82 0a 0A 0A  0a 0a 0a 0A  0A 0A 0A 0A  0a 0a 0A 0A  \n" +
  //                     "0a 0a 0a 0a  0a 0a 0a 0a  0A 0A 0a 0a  00 00 00 00  \n" +
  //                     "7f 00 00 7f  00 7F 7F 7F  7F 7F 7f 7f  00 7F 7F 7F  \n" +
  //                     "7F 7F 7F 00  00 7F 7F 7F  7F 7F 00 7f  00"];

  // pad 04 05 06 red 07 pink 08 09 dark red 10 11 dark yellow 12 13 bright yellow 14 15 dark yellow

  // 80 rev flx addfile filelist= grid     shift hotcues samples sync keylock      cue play pad1 pad2 pad3
  // pad4 pad5 pad6 pad7 pad8 sample       fx1 fx2 fx3 fx4 cuel      cuer voll1 voll2 voll3 voll4
  // vol5 vol6clip volr1 volr2 volr3 volr4       volr5 volr6clip rev flx addfile filelist= grid shift hotcuest samples
  //                   00 01 02 03  04 05 06 07  08 09 0A 0B  0C 0D 0E 0F
  var data_strings = ["80 00 00 00  00 00 00 00  00 00 00 00  00 00 00 00  \n" +
                      "00 00 00 00  00 00 00 00  00 00 00 00  00 00 00 00  \n" +
                      "00 00 00 00  00 00 00 00  00 00 00 00  0a 0a 0a 0a  \n" +
                      "00 00 00 00  00",
                      "81 00 00 7F  7F 03 7F 0B  03 7F 0B 03  7F 0B 03 7F  \n" +
                      "0B 03 7F 0B  03 00 7f 03  7F 0A 0A 0A  00 7f 0A 0A  \n" +
                      "00 7f 0A 0A  0A 0A 0A 0A  7F 0A 0a 0A  0a 0a 7f 0a  \n" +
                      "0a 0a 0a 0a  7F 0A 0A 0A  0a 0a 0a 0a  0a 0a 0a",
                      "82 0a 0A 0A  0a 0a 0a 0A  0A 0A 0A 0A  0a 0a 0A 0A  \n" +
                      "0a 0a 0a 0a  0a 0a 0a 0a  0A 0A 0a 0a  00 00 00 00  \n" +
                      "7f 00 00 7f  00 7F 7F 7F  7F 7F 7f 7f  00 7F 7F 7F  \n" +
                      "7F 7F 7F 00  00 7F 7F 7F  7F 7F 00 7f  00"];

  var data = [Object(), Object(), Object()];

  HIDDebug("TraktorS2MK3: debugLights");

  for (i = 0; i < 3; i++) {
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
  // var packet_lengths = [53, 63, 61];
  // for (i = 0; i < packet_lengths.length; i++) {
  //   var packet_length = packet_lengths[i];
  //   var data = Object();
  //   data.length = packet_length;
  //   data[0] = 0x80 + i;
  //   for (j = 1; j < packet_length; j++) {
  //     data[j] = 0;
  //   }
  //   // Keep USB light on though.
  //   if (i === 0) {
  //     data[0x2A] = 0x7F;
  //   }
  //   controller.send(data, packet_length, 0);
  // }
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

TraktorS2MK3.shiftHandler = function(field) {
  var group = field.id.split(".")[0];
  TraktorS2MK3.controller.shift_pressed[group] = field.value;
  TraktorS2MK3.outputCallback(field.value, field.group, "!shift");
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

TraktorS2MK3.effectEnabledHandler = function(field) {
  var splitted = field.id.split(".");
  var group = splitted[0];
  if (field.value) {
      script.toggleControl(group, 'enabled');
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
    if (TraktorS2MK3.ShiftCueButtonAction == "REWIND") {
      if (field.value === 0) {
        return;
      }
      engine.setValue(field.group, "start_stop", 1);
    } else if (TraktorS2MK3.ShiftCueButtonAction == "REVERSEROLL") {
      engine.setValue(field.group, "reverseroll", field.value);
    } else {
      print ("Traktor S4 WARNING: Invalid ShiftCueButtonAction picked.  Must be either REWIND " +
           "or REVERSEROLL");
    }
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
  // No vinyl button (yet)
  /*if (this.vinylActive) {
    // Vinyl button still being pressed, don't disable scratch mode yet.
    this.wheelTouchInertiaTimer[group] = engine.beginTimer(
        100, "VestaxVCI400.Decks." + this.deckIdentifier + ".finishJogTouch()", true);
    return;
  }*/
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
  var deltas = TraktorS2MK3.wheelDeltas(field.group, field.value);
  var tick_delta = deltas[0];
  var time_delta = deltas[1];

  var velocity = TraktorS2MK3.scalerJog(tick_delta, time_delta);
  engine.setValue(field.group, "jog", velocity);
  if (engine.getValue(field.group, "scratch2_enable")) {
    var deckNumber = TraktorS2MK3.controller.resolveDeck(group);
    engine.scratchTick(deckNumber, tick_delta);
  }
};

TraktorS2MK3.wheelDeltas = function(group, value) {
  // When the wheel is touched, four bytes change, but only the first behaves predictably.
  // It looks like the wheel is 1024 ticks per revolution.
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
  //HIDDebug(group + " " + tickval + " " + prev_tick + " " + tick_delta);
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
  if (TraktorS2MK3.controller.shift_pressed[group]) {
    engine.setValue(field.group, "hotcue_" + buttonNumber + "_clear", field.value);
  } else {
    engine.setValue(field.group, "hotcue_" + buttonNumber + "_activate", field.value);
  }
}

TraktorS2MK3.quantizeHandler = function(field) {
  if (field.value === 0) {
    return;
  }
  TraktorS2MK3.master_quantize = !TraktorS2MK3.master_quantize;
  engine.setValue("[Channel1]", "quantize", TraktorS2MK3.master_quantize);
  engine.setValue("[Channel2]", "quantize", TraktorS2MK3.master_quantize);
  TraktorS2MK3.controller.setOutput("[Master]", "!quantize", 0x7F * TraktorS2MK3.master_quantize, true);
}

TraktorS2MK3.callbackPregain = function(field) {
  // TODO: common-hid-packet-parser looks like it should do deltas, but I can't get them to work.
  prev_pregain = TraktorS2MK3.controller.prev_pregain[field.group];
  TraktorS2MK3.controller.prev_pregain[field.group] = field.value;
  var delta = 0;
  if (prev_pregain === 15 && field.value === 0) {
    delta = 0.05;
  } else if (prev_pregain === 0 && field.value === 15) {
    delta = -0.05;
  } else if (field.value > prev_pregain) {
    delta = 0.05;
  } else {
    delta = -0.05;
  }

  var cur_pregain = engine.getValue(group, "pregain");
  engine.setValue(group, "pregain", cur_pregain + delta);
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
  var group = splitted[0]
  prev_loopsize = TraktorS2MK3.controller.prev_loopsize[group];
  TraktorS2MK3.controller.prev_loopsize[group] = field.value;
  var delta = 0;
  if (prev_loopsize === 15 && field.value === 0) {
    delta = 1;
  } else if (prev_loopsize === 0 && field.value === 15) {
    delta = -1;
  } else if (field.value > prev_loopsize) {
    delta = 1;
  } else {
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

TraktorS2MK3.callbackBrowse = function(field) {
  // TODO: common-hid-packet-parser looks like it should do deltas, but I can't get them to work.
  prev_browse = TraktorS2MK3.controller.prev_browse;
  TraktorS2MK3.controller.prev_browse = field.value;
  var delta = 0;
  if (prev_browse === 15 && field.value === 0) {
    delta = 1;
  } else if (prev_browse === 0 && field.value === 15) {
    delta = -1;
  } else if (field.value > prev_browse) {
    delta = 1;
  } else {
    delta = -1;
  }

  engine.setValue("[Playlist]", "SelectTrackKnob", delta);
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
  var led_value = 0x05;
  if (value) {
    led_value = 0x7F;
  }
  TraktorS2MK3.controller.setOutput(group, key, led_value, !TraktorS2MK3.controller.freeze_lights);
}

TraktorS2MK3.outputChannelCallbackDark = function(value,group,key) {
  var led_value = 0x00;
  if (value) {
    led_value = 0x7F;
  }
  TraktorS2MK3.controller.setOutput(group, key, led_value, !TraktorS2MK3.controller.freeze_lights);
}

TraktorS2MK3.outputCallback = function(value,group,key) {
  var led_value = 0x09;
  if (value) {
    led_value = 0x7F;
  }
  TraktorS2MK3.controller.setOutput(group, key, led_value, !TraktorS2MK3.controller.freeze_lights);
}

TraktorS2MK3.outputCallbackLoop = function(value,group,key) {
  var led_value = 0x09;
  if (engine.getValue(group, "loop_enabled")) {
    led_value = 0x7F;
  }
  TraktorS2MK3.controller.setOutput(group, key, led_value, !TraktorS2MK3.controller.freeze_lights);
}

TraktorS2MK3.outputCallbackDark = function(value,group,key) {
  var led_value = 0x00;
  if (value) {
    led_value = 0x7F;
  }
  TraktorS2MK3.controller.setOutput(group, key, led_value, !TraktorS2MK3.controller.freeze_lights);
}

TraktorS2MK3.outputCueCallback = function(value, group, key) {
  var RGB_value = [0, 0, 0];
  // Use different colors that match cue colors
  var num = key.charAt(7);
  if (value === 1) {
    if (num == '1') RGB_value = [0x40, 0x40, 0];
    else if (num == '2') RGB_value = [0x40, 0, 0x40];
    else if (num == '3') RGB_value = [0, 0x20, 0x20];
    else if (num == '4') RGB_value = [0, 0x20, 0];
  } else {
    RGB_value = [0, 0, 0];
  }

  TraktorS2MK3.controller.setOutput(group, key, RGB_value[0], false);
  TraktorS2MK3.controller.setOutput(group, "!" + key + "_G", RGB_value[1], false);
  TraktorS2MK3.controller.setOutput(group, "!" + key + "_B", RGB_value[2], !TraktorS2MK3.controller.freeze_lights);
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
