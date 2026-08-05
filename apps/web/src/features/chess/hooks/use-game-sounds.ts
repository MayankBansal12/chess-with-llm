import { useCallback, useState } from "react";

export type SoundCue =
  | "bishop"
  | "capture"
  | "check"
  | "draw"
  | "gameStart"
  | "king"
  | "knight"
  | "loss"
  | "move"
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
const MASTER_VOLUME = 1.8;
let audioEngine: AudioEngine | null = null;

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

const playWoodImpact = (
  audioContext: AudioContext,
  output: AudioNode,
  start: number,
  frequency: number,
  volume: number,
  duration = 0.085
): void => {
  const frameCount = Math.floor(audioContext.sampleRate * duration);
  const buffer = audioContext.createBuffer(
    1,
    frameCount,
    audioContext.sampleRate
  );
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    const progress = index / frameCount;
    channel[index] = (Math.random() * 2 - 1) * (1 - progress) ** 4;
  }

  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(frequency, start);
  filter.frequency.exponentialRampToValueAtTime(
    frequency * 0.58,
    start + duration
  );
  filter.Q.setValueAtTime(1.1, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  source.start(start);
};

const playMoveSound = (
  audioContext: AudioContext,
  output: AudioNode,
  now: number,
  side: MoveSoundSide
): void => {
  const isPlayerMove = side === "player";
  playWoodImpact(
    audioContext,
    output,
    now,
    isPlayerMove ? 1500 : 850,
    isPlayerMove ? 0.68 : 0.76,
    isPlayerMove ? 0.08 : 0.1
  );
  playTone(audioContext, output, now, {
    duration: isPlayerMove ? 0.08 : 0.105,
    endFrequency: isPlayerMove ? 110 : 70,
    frequency: isPlayerMove ? 220 : 145,
    type: "sine",
    volume: isPlayerMove ? 0.25 : 0.3,
  });
};

const playCaptureSound = (
  audioContext: AudioContext,
  output: AudioNode,
  now: number,
  side: MoveSoundSide
): void => {
  const isPlayerMove = side === "player";
  playWoodImpact(
    audioContext,
    output,
    now,
    isPlayerMove ? 1700 : 1100,
    0.6,
    0.075
  );
  playWoodImpact(
    audioContext,
    output,
    now + 0.055,
    isPlayerMove ? 1050 : 620,
    0.8,
    0.11
  );
  playTone(audioContext, output, now + 0.05, {
    duration: 0.11,
    endFrequency: isPlayerMove ? 95 : 64,
    frequency: isPlayerMove ? 190 : 125,
    type: "sine",
    volume: 0.3,
  });
};

const playStartSound = (
  audioContext: AudioContext,
  output: AudioNode,
  now: number
): void => {
  const notes = [392, 493.88, 587.33];
  for (const [index, frequency] of notes.entries()) {
    playTone(audioContext, output, now, {
      delay: index * 0.075,
      duration: 0.16,
      frequency,
      type: "sine",
      volume: 0.13,
    });
  }
};

const getResultFrequencies = (cue: "draw" | "loss" | "win"): number[] => {
  if (cue === "win") {
    return [392, 523.25, 659.25];
  }
  if (cue === "loss") {
    return [392, 311.13, 233.08];
  }
  return [349.23, 392, 349.23];
};

const playResultSound = (
  audioContext: AudioContext,
  output: AudioNode,
  now: number,
  cue: "draw" | "loss" | "win"
): void => {
  const frequencies = getResultFrequencies(cue);
  for (const [index, frequency] of frequencies.entries()) {
    playTone(audioContext, output, now, {
      delay: index * 0.13,
      duration: 0.3,
      frequency,
      type: cue === "loss" ? "triangle" : "sine",
      volume: 0.24,
    });
  }
};

const getTone = (cue: SoundCue): Tone => {
  if (cue === "check") {
    return { duration: 0.15, frequency: 740, type: "triangle", volume: 0.2 };
  }
  if (cue === "knight") {
    return {
      duration: 0.09,
      endFrequency: 370,
      frequency: 294,
      type: "triangle",
      volume: 0.1,
    };
  }
  if (cue === "bishop") {
    return {
      duration: 0.11,
      endFrequency: 440,
      frequency: 370,
      type: "sine",
      volume: 0.09,
    };
  }
  if (cue === "queen") {
    return { duration: 0.13, frequency: 494, type: "sine", volume: 0.1 };
  }
  if (cue === "king") {
    return { duration: 0.12, frequency: 196, type: "triangle", volume: 0.12 };
  }
  if (cue === "rook") {
    return { duration: 0.085, frequency: 220, type: "square", volume: 0.055 };
  }
  return { duration: 0.07, frequency: 520, type: "sine", volume: 0.1 };
};

const startGameSound = async (
  cue: SoundCue,
  side: MoveSoundSide
): Promise<void> => {
  const { context, output } = getAudioEngine();
  if (context.state === "suspended") {
    await context.resume();
  }
  const now = context.currentTime + 0.005;
  if (cue === "gameStart") {
    playStartSound(context, output, now);
  } else if (cue === "draw" || cue === "loss" || cue === "win") {
    playResultSound(context, output, now, cue);
  } else if (cue === "capture") {
    playCaptureSound(context, output, now, side);
  } else if (cue === "move") {
    playMoveSound(context, output, now, side);
  } else if (cue === "check") {
    playMoveSound(context, output, now, side);
    playTone(context, output, now + 0.045, getTone(cue));
  } else if (
    cue === "bishop" ||
    cue === "king" ||
    cue === "knight" ||
    cue === "queen" ||
    cue === "rook"
  ) {
    playMoveSound(context, output, now, side);
    playTone(context, output, now + 0.025, getTone(cue));
  } else {
    playTone(context, output, now, getTone(cue));
  }
};

export const playGameSound = (
  cue: SoundCue,
  side: MoveSoundSide = "player"
): void => {
  if (typeof window === "undefined" || getStoredMutedPreference()) {
    return;
  }
  try {
    startGameSound(cue, side).catch(() => undefined);
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
