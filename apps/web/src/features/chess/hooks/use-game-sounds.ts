import { useCallback, useState } from "react";

export type SoundCue =
  | "bishop"
  | "capture"
  | "check"
  | "draw"
  | "gameStart"
  | "keyPress"
  | "king"
  | "knight"
  | "loss"
  | "move"
  | "modelSelect"
  | "premove"
  | "queen"
  | "rook"
  | "win";

export type MoveSoundSide = "opponent" | "player";

interface Tone {
  delay?: number;
  duration: number;
  endFrequency?: number;
  frequency: number;
  type: OscillatorType;
  volume: number;
}

interface AudioEngine {
  context: AudioContext;
  output: GainNode;
}

const SOUND_PREFERENCE_KEY = "chess-with-llm:sound-muted";
const MASTER_VOLUME = 0.75;
const SOUND_FILES: Partial<Record<SoundCue, string>> = {
  capture: "/sounds/capture.mp3",
  draw: "/sounds/draw-sound.mp3",
  gameStart: "/sounds/game-start.mp3",
  keyPress: "/sounds/switch.mp3",
  loss: "/sounds/defeat-sound.mp3",
  modelSelect: "/sounds/mouse-click.mp3",
  move: "/sounds/chess-move.mp3",
  premove: "/sounds/mouse-click.mp3",
  win: "/sounds/win-sound.mp3",
};
let audioEngine: AudioEngine | null = null;
const soundBufferPromises = new Map<string, Promise<AudioBuffer>>();

const getStoredMutedPreference = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(SOUND_PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
};

const storeMutedPreference = (isMuted: boolean): void => {
  try {
    window.localStorage.setItem(SOUND_PREFERENCE_KEY, String(isMuted));
  } catch {
    // Sound preferences remain available for this session when storage is blocked.
  }
};

const getAudioEngine = (): AudioEngine => {
  if (audioEngine && audioEngine.context.state !== "closed") {
    return audioEngine;
  }
  const context = new window.AudioContext();
  const masterGain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  masterGain.gain.value = MASTER_VOLUME;
  compressor.threshold.value = -10;
  compressor.knee.value = 12;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.18;
  masterGain.connect(compressor);
  compressor.connect(context.destination);
  audioEngine = { context, output: masterGain };
  return audioEngine;
};

const getSoundBuffer = (
  audioContext: AudioContext,
  cue: SoundCue
): Promise<AudioBuffer> => {
  const source = SOUND_FILES[cue] ?? SOUND_FILES.move;
  if (!source) {
    throw new Error(`No sound file configured for ${cue}`);
  }
  const existingBuffer = soundBufferPromises.get(source);
  if (existingBuffer) {
    return existingBuffer;
  }
  const bufferPromise = fetch(source)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load sound: ${source}`);
      }
      return response.arrayBuffer();
    })
    .then((data) => audioContext.decodeAudioData(data))
    .catch((error: unknown) => {
      soundBufferPromises.delete(source);
      throw error;
    });
  soundBufferPromises.set(source, bufferPromise);
  return bufferPromise;
};

const playBuffer = (
  audioContext: AudioContext,
  output: AudioNode,
  buffer: AudioBuffer,
  volume = 0.8,
  offset = 0,
  duration?: number
): void => {
  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  source.buffer = buffer;
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(output);
  source.start(audioContext.currentTime + 0.005, offset, duration);
};

const playTone = (
  audioContext: AudioContext,
  output: AudioNode,
  startTime: number,
  tone: Tone
): void => {
  const start = startTime + (tone.delay ?? 0);
  const end = start + tone.duration;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.setValueAtTime(tone.frequency, start);
  if (tone.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end);
  }
  oscillator.type = tone.type;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(tone.volume, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(start);
  oscillator.stop(end);
};

const getTone = (cue: SoundCue): Tone => {
  if (cue === "check") {
    return { duration: 0.15, frequency: 740, type: "triangle", volume: 0.2 };
  }
  return { duration: 0.07, frequency: 520, type: "sine", volume: 0.1 };
};

const startGameSound = async (cue: SoundCue): Promise<void> => {
  const { context, output } = getAudioEngine();
  if (context.state === "suspended") {
    await context.resume();
  }
  const buffer = await getSoundBuffer(context, cue);
  if (cue === "keyPress") {
    playBuffer(context, output, buffer, 0.8, 0.83, 0.35);
  } else {
    playBuffer(context, output, buffer);
  }
  if (cue === "check") {
    const now = context.currentTime + 0.005;
    playTone(context, output, now + 0.045, getTone(cue));
  }
};

export const preloadGameSound = (cue: SoundCue): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const { context } = getAudioEngine();
    getSoundBuffer(context, cue).catch(() => undefined);
  } catch {
    // Audio is optional and can be blocked by browser policies.
  }
};

export const playGameSound = (
  cue: SoundCue,
  _side: MoveSoundSide = "player"
): void => {
  if (typeof window === "undefined" || getStoredMutedPreference()) {
    return;
  }
  try {
    startGameSound(cue).catch(() => undefined);
  } catch {
    // Audio is optional and can be blocked by browser autoplay policies.
  }
};

export const useGameSounds = () => {
  const [isMuted, setIsMuted] = useState(getStoredMutedPreference);

  const play = useCallback((cue: SoundCue, side?: MoveSoundSide): void => {
    playGameSound(cue, side);
  }, []);

  const toggleMuted = useCallback((): void => {
    setIsMuted((currentMuted) => {
      const nextMuted = !currentMuted;
      storeMutedPreference(nextMuted);
      return nextMuted;
    });
  }, []);

  return { isMuted, play, toggleMuted };
};
