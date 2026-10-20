---
'livekit-client': patch
---

Every sender of a local track, including the backup codec ones, is now updated in one place. A few cases behave differently as a result:

- `pauseUpstream()` and `resumeUpstream()` on a track without a sender, e.g. while it is republished, are no longer ignored: the state applies to the next sender.
- `setProcessor()` on a paused track, and an audio context change on a paused microphone, no longer start sending the processed track.
- A backup codec sender whose connection is closed is left alone, so `pauseUpstream()` no longer rejects because of it.
- When the primary sender rejects the track passed to `replaceTrack()`, the track is adopted and the previous one is stopped, as the backup codecs already did, instead of the replacement being dropped. The next swap, pause or resume retries the sender.
