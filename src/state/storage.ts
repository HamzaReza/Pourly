import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/** Shared JSON storage for every persisted Zustand store. */
export const createPersistStorage = <S>() => createJSONStorage<S>(() => AsyncStorage);
