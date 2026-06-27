export type Rng = () => number;

export type RngStreamName = "gameplay" | "presentation";

export const hashSeed = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const createSeededRng = (seed: string, streamName: RngStreamName): Rng => {
  let state = hashSeed(`${streamName}\u0000${seed}`) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const randomRange = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

export const randomInt = (rng: Rng, min: number, max: number) =>
  Math.floor(randomRange(rng, min, max + 1));

export const pick = <T,>(rng: Rng, values: readonly T[]): T =>
  values[randomInt(rng, 0, values.length - 1)];

let fallbackSeedCounter = 0;

export const createEphemeralSeed = (...context: Array<string | number | undefined>) => {
  const values = new Uint32Array(4);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    return `ephemeral-${[...values].map((value) => value.toString(16).padStart(8, "0")).join("")}`;
  }

  fallbackSeedCounter += 1;
  const fallback = `${Date.now()}|${fallbackSeedCounter}|${context.map((value) => value ?? "").join("|")}`;
  return `ephemeral-fallback-${hashSeed(fallback).toString(16).padStart(8, "0")}`;
};
