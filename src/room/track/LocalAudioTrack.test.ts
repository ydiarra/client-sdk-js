import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mutex } from '@livekit/mutex';
import LocalAudioTrack from './LocalAudioTrack';
import type { Track } from './Track';
import type { AudioProcessorOptions, TrackProcessor } from './processor/types';

// what the sender carries after each operation on the track, whichever code path applies it
describe('LocalAudioTrack sender contents', () => {
  // happy-dom's user agent reads as an old Safari, which refuses pauseUpstream
  beforeEach(() => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeMediaStreamTrack(id: string) {
    const track = {
      id,
      kind: 'audio',
      enabled: true,
      muted: false,
      readyState: 'live',
      clone: () => makeMediaStreamTrack(`${id}-clone`),
      stop: () => {
        track.readyState = 'ended';
      },
      getConstraints: () => ({}),
      getSettings: () => ({}),
      applyConstraints: async () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    return track as unknown as MediaStreamTrack;
  }

  function makeTrackSender() {
    const sender = {
      track: null as MediaStreamTrack | null,
      replaceTrack: vi.fn(async (track: MediaStreamTrack | null) => {
        sender.track = track;
      }),
    };
    return sender;
  }

  function makeProcessor() {
    const processor = {
      name: 'noise-filter',
      processedTrack: undefined as MediaStreamTrack | undefined,
      init: async () => {
        processor.processedTrack = makeMediaStreamTrack('processed');
      },
      restart: async () => {
        processor.processedTrack = makeMediaStreamTrack('processed');
      },
      destroy: async () => {},
    };
    return processor as unknown as TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> & {
      processedTrack: MediaStreamTrack;
    };
  }

  async function publish(source: MediaStreamTrack) {
    const track = new LocalAudioTrack(source, undefined, true, {} as AudioContext);
    // the constructor sets the track up under this lock, wait for it like a real publish would
    const { trackChangeLock } = track as unknown as { trackChangeLock: Mutex };
    (await trackChangeLock.lock())();
    const sender = makeTrackSender();
    track.sender = sender as unknown as RTCRtpSender;
    await sender.replaceTrack(track.mediaStreamTrack);
    return { track, sender };
  }

  it('takes the track off the sender while paused, and puts it back on resume', async () => {
    const microphone = makeMediaStreamTrack('microphone');
    const { track, sender } = await publish(microphone);

    await track.pauseUpstream();
    expect(sender.track).toBeNull();

    await track.resumeUpstream();
    expect(sender.track).toBe(microphone);
  });

  it('sends the processed track once a processor is set, and the microphone once it is stopped', async () => {
    const microphone = makeMediaStreamTrack('microphone');
    const { track, sender } = await publish(microphone);
    const processor = makeProcessor();

    await track.setProcessor(processor);
    expect(sender.track).toBe(processor.processedTrack);

    await track.stopProcessor();
    expect(sender.track).toBe(microphone);
  });

  it('sends the rebuilt processed track when the audio context changes', async () => {
    const { track, sender } = await publish(makeMediaStreamTrack('microphone'));
    const processor = makeProcessor();
    await track.setProcessor(processor);
    const first = processor.processedTrack;

    await track.setAudioContext({} as AudioContext);

    expect(processor.processedTrack).not.toBe(first);
    expect(sender.track).toBe(processor.processedTrack);
  });

  it('keeps a paused track off the sender when a processor is set', async () => {
    const { track, sender } = await publish(makeMediaStreamTrack('microphone'));
    await track.pauseUpstream();

    await track.setProcessor(makeProcessor());

    expect(sender.track).toBeNull();
  });

  it('keeps a paused track off the sender when the audio context changes', async () => {
    const { track, sender } = await publish(makeMediaStreamTrack('microphone'));
    await track.setProcessor(makeProcessor());
    await track.pauseUpstream();

    await track.setAudioContext({} as AudioContext);

    expect(sender.track).toBeNull();
  });
});
