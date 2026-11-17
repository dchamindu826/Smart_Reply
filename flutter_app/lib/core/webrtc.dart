import 'dart:async';

import 'package:flutter_webrtc/flutter_webrtc.dart';

/// The phone is the audio peer of a WhatsApp call (Stage A). Meta wants every ICE candidate
/// inside the SDP (no trickle), so each local description waits for gathering to finish.
class CallPeer {
  CallPeer._(this.pc, this.local, this._iceDone);

  final RTCPeerConnection pc;
  final MediaStream local;
  final Completer<void> _iceDone;

  static Future<CallPeer> _create() async {
    final pc = await createPeerConnection({
      'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'}
      ],
      'sdpSemantics': 'unified-plan',
    });
    // Listen before setLocalDescription so a fast "complete" is not missed.
    final iceDone = Completer<void>();
    pc.onIceGatheringState = (state) {
      if (state == RTCIceGatheringState.RTCIceGatheringStateComplete && !iceDone.isCompleted) iceDone.complete();
    };
    final MediaStream local;
    try {
      local = await navigator.mediaDevices.getUserMedia({'audio': true, 'video': false});
    } catch (_) {
      await pc.close();
      rethrow;
    }
    for (final t in local.getAudioTracks()) {
      await pc.addTrack(t, local);
    }
    return CallPeer._(pc, local, iceDone);
  }

  Future<void> _waitForIce() async {
    if (pc.iceGatheringState == RTCIceGatheringState.RTCIceGatheringStateComplete) return;
    await _iceDone.future.timeout(const Duration(seconds: 4), onTimeout: () {});
  }

  Future<String> _localSdp() async => (await pc.getLocalDescription())?.sdp ?? '';

  /// Incoming call: answer Meta's offer.
  static Future<(CallPeer, String)> answer(String sdpOffer) async {
    final peer = await _create();
    try {
      await peer.pc.setRemoteDescription(RTCSessionDescription(sdpOffer, 'offer'));
      final answer = await peer.pc.createAnswer({'offerToReceiveAudio': true});
      await peer.pc.setLocalDescription(answer);
      await peer._waitForIce();
      return (peer, await peer._localSdp());
    } catch (e) {
      await peer.close();
      rethrow;
    }
  }

  /// Outgoing call: make an offer. Call [applyAnswer] when Meta's answer arrives.
  static Future<(CallPeer, String)> offer() async {
    final peer = await _create();
    try {
      final offer = await peer.pc.createOffer({'offerToReceiveAudio': true});
      await peer.pc.setLocalDescription(offer);
      await peer._waitForIce();
      return (peer, await peer._localSdp());
    } catch (e) {
      await peer.close();
      rethrow;
    }
  }

  Future<void> applyAnswer(String sdpAnswer) => pc.setRemoteDescription(RTCSessionDescription(sdpAnswer, 'answer'));

  void setMuted(bool muted) {
    for (final t in local.getAudioTracks()) {
      t.enabled = !muted;
    }
  }

  Future<void> setSpeaker(bool on) => Helper.setSpeakerphoneOn(on);

  Future<void> close() async {
    for (final t in local.getTracks()) {
      await t.stop();
    }
    await local.dispose();
    await pc.close();
  }
}
