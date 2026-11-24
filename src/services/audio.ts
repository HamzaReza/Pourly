/**
 * Sound effects (spec §15) through `expo-audio`. A pool of two preloaded players per effect is
 * created at startup and reused round-robin, so `play` never allocates (it is called during
 * pours). Players are released when the app goes to the background and recreated when it comes
 * back. The audio session mixes with other apps and stays silent in silent/vibrate mode.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { AppState, type NativeEventSubscription } from 'react-native';

import { useSettingsStore } from '@/state/settingsStore';
import { logger } from '@/utils/logger';

export type SoundName = 'select' | 'pour' | 'drop' | 'complete' | 'win' | 'error' | 'tap' | 'coin';

export const SOUND_NAMES: readonly SoundName[] = [
  'select',
  'pour',
  'drop',
  'complete',
  'win',
  'error',
  'tap',
  'coin',
];

/** Players per effect: lets an effect overlap itself once (e.g. two quick taps). */
export const PLAYERS_PER_SOUND = 2;

const SOURCES: Readonly<Record<SoundName, number>> = {
  select: require('../../assets/sounds/select.wav'),
  pour: require('../../assets/sounds/pour.wav'),
  drop: require('../../assets/sounds/drop.wav'),
  complete: require('../../assets/sounds/complete.wav'),
  win: require('../../assets/sounds/win.wav'),
  error: require('../../assets/sounds/error.wav'),
  tap: require('../../assets/sounds/tap.wav'),
  coin: require('../../assets/sounds/coin.wav'),
};

interface Pool {
  readonly players: readonly AudioPlayer[];
  next: number;
}

type Pools = Record<SoundName, Pool>;

let pools: Pools | null = null;
let paused = false;
let pausedPlayers: AudioPlayer[] = [];
let appStateSubscription: NativeEventSubscription | null = null;

const createPool = (name: SoundName): Pool => {
  const players: AudioPlayer[] = [];
  for (let i = 0; i < PLAYERS_PER_SOUND; i += 1) players.push(createAudioPlayer(SOURCES[name]));
  return { players, next: 0 };
};

const load = (): void => {
  if (pools !== null) return;
  try {
    pools = {
      select: createPool('select'),
      pour: createPool('pour'),
      drop: createPool('drop'),
      complete: createPool('complete'),
      win: createPool('win'),
      error: createPool('error'),
      tap: createPool('tap'),
      coin: createPool('coin'),
    };
  } catch (error: unknown) {
    logger.warn('Audio players could not be created', error);
    pools = null;
  }
};

const unload = (): void => {
  const current = pools;
  pools = null;
  pausedPlayers = [];
  if (current === null) return;
  for (const name of SOUND_NAMES) {
    for (const player of current[name].players) {
      try {
        player.remove();
      } catch (error: unknown) {
        logger.warn('Audio player release failed', error);
      }
    }
  }
};

/**
 * Configures the audio session, preloads every effect and follows the app state (release on
 * background, recreate on foreground). Safe to call more than once.
 */
export const initAudio = async (): Promise<void> => {
  if (appStateSubscription !== null) return;
  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') load();
    else if (state === 'background') unload();
  });
  try {
    await setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      allowsRecording: false,
    });
  } catch (error: unknown) {
    logger.warn('Audio mode could not be set', error);
  }
  if (AppState.currentState !== 'background') load();
};

/** Stops following the app state and releases every player. */
export const shutdownAudio = (): void => {
  appStateSubscription?.remove();
  appStateSubscription = null;
  unload();
};

/** Plays an effect from its pool. No-op when sound is off, audio is paused or not loaded. */
export const play = (name: SoundName): void => {
  if (paused || pools === null || !useSettingsStore.getState().sound) return;
  const pool = pools[name];
  const player = pool.players[pool.next];
  pool.next = (pool.next + 1) % pool.players.length;
  if (player === undefined) return;
  try {
    player.seekTo(0).catch(() => undefined);
    player.play();
  } catch (error: unknown) {
    logger.warn(`Sound ${name} failed`, error);
  }
};

/** Pauses every playing effect and mutes `play` until `resumeAll` (used around full-screen ads). */
export const pauseAll = (): void => {
  paused = true;
  if (pools === null) return;
  for (const name of SOUND_NAMES) {
    for (const player of pools[name].players) {
      if (!player.playing) continue;
      player.pause();
      pausedPlayers.push(player);
    }
  }
};

/** Undoes `pauseAll`, resuming the effects it interrupted. */
export const resumeAll = (): void => {
  paused = false;
  const interrupted = pausedPlayers;
  pausedPlayers = [];
  if (pools === null || !useSettingsStore.getState().sound) return;
  for (const player of interrupted) {
    try {
      player.play();
    } catch (error: unknown) {
      logger.warn('Sound resume failed', error);
    }
  }
};
