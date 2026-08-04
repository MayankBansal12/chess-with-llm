import { useCallback, useState } from "react";

export type SoundCue =
  | "bishop"
  | "capture"
  | "check"
  | "gameOver"
  | "gameStart"
  | "king"
  | "knight"
  | "move"
  | "premove"
  | "queen"
  | "rook";

interface Tone {
  delay?: number;
  duration: number;
  endFrequency?: number;
  frequency: number;
  type: OscillatorType;
  volume: number;
}

const SOUND_PREFERENCE_KEY = "chess-with-llm:sound-muted";
const AUDIO_CLOSE_DELAY_MS = 650;

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

const playTone = (
  audioContext: AudioContext,
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
  gain.gain.exponentialRampToValueAtTime(tone.volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(end);
};

const playWoodImpact = (
  audioContext: AudioContext,
  start: number,
  frequency: number,
  volume: number
): void => {
  const duration = 0.065;
  const frameCount = Math.floor(audioContext.sampleRate * duration);
  const buffer = audioContext.createBuffer(
    1,
    frameCount,
    audioContext.sampleRate
  );
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    const progress = index / frameCount;
    channel[index] = (Math.random() * 2 - 1) * (1 - progress) ** 3;
  }

  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(frequency, start);
  filter.Q.setValueAtTime(0.8, start);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  source.start(start);
};

const playMoveSound = (audioContext: AudioContext, now: number): void => {
  playWoodImpact(audioContext, now, 980, 0.24);
  playTone(audioContext, now, {
    duration: 0.055,
    endFrequency: 105,
    frequency: 145,
    type: "sine",
    volume: 0.09,
  });
};

const playCaptureSound = (audioContext: AudioContext, now: number): void => {
  playWoodImpact(audioContext, now, 820, 0.3);
  playWoodImpact(audioContext, now + 0.052, 520, 0.34);
  playTone(audioContext, now + 0.045, {
    duration: 0.08,
    endFrequency: 92,
    frequency: 138,
    type: "sine",
    volume: 0.11,
  });
};

const playStartSound = (audioContext: AudioContext, now: number): void => {
  const notes = [392, 493.88, 587.33];
  for (const [index, frequency] of notes.entries()) {
    playTone(audioContext, now, {
      delay: index * 0.075,
      duration: 0.16,
      frequency,
      type: "sine",
      volume: 0.085,
    });
  }
};

const getTone = (cue: SoundCue): Tone => {
  if (cue === "gameOver") {
    return {
      duration: 0.22,
      endFrequency: 196,
      frequency: 294,
      type: "sine",
      volume: 0.09,
    };
  }
  if (cue === "check") {
    return { duration: 0.14, frequency: 622, type: "sine", volume: 0.09 };
  }
  if (cue === "knight") {
    return {
      duration: 0.09,
      endFrequency: 370,
      frequency: 294,
      type: "triangle",
      volume: 0.08,
    };
  }
  if (cue === "bishop") {
    return {
      duration: 0.11,
      endFrequency: 440,
      frequency: 370,
      type: "sine",
      volume: 0.075,
    };
  }
  if (cue === "queen") {
    return { duration: 0.13, frequency: 494, type: "sine", volume: 0.08 };
  }
  if (cue === "king") {
    return { duration: 0.12, frequency: 196, type: "triangle", volume: 0.1 };
  }
  if (cue === "rook") {
    return { duration: 0.085, frequency: 220, type: "square", volume: 0.045 };
  }
  return { duration: 0.06, frequency: 520, type: "sine", volume: 0.055 };
};

export const playGameSound = (cue: SoundCue): void => {
  if (typeof window === "undefined" || getStoredMutedPreference()) {
    return;
  }
  try {
    const audioContext = new window.AudioContext();
    const now = audioContext.currentTime;
    if (cue === "gameStart") {
      playStartSound(audioContext, now);
    } else if (cue === "capture") {
      playCaptureSound(audioContext, now);
    } else if (cue === "move") {
      playMoveSound(audioContext, now);
    } else if (
      cue === "bishop" ||
      cue === "king" ||
      cue === "knight" ||
      cue === "queen" ||
      cue === "rook"
    ) {
      playMoveSound(audioContext, now);
      playTone(audioContext, now + 0.025, getTone(cue));
    } else {
      playTone(audioContext, now, getTone(cue));
    }
    window.setTimeout(() => {
      audioContext.close().catch(() => undefined);
    }, AUDIO_CLOSE_DELAY_MS);
  } catch {
    // Audio is optional and can be blocked by browser autoplay policies.
  }
};

export const useGameSounds = () => {
  const [isMuted, setIsMuted] = useState(getStoredMutedPreference);

  const play = useCallback((cue: SoundCue): void => {
    playGameSound(cue);
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
