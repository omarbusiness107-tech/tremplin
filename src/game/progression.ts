import { FERVOUR } from "./playerStats";

const SAVE_KEY = "penitence.save.v1";
const SAVE_VERSION = 1;

export interface GuiltMark {
  room: string;
  x: number;
  y: number;
  /** Tears held at the moment of death, recoverable by reaching the mark. */
  tears: number;
}

export interface SaveData {
  version: number;
  checkpoint: { room: string; altar: number };
  abilities: { doubleJump: boolean; sealBreaker: boolean };
  maxHealth: number;
  maxFlasks: number;
  tears: number;
  collected: string[];
  guilt: GuiltMark | null;
  bossDefeated: boolean;
  visited: string[];
  deaths: number;
}

/** Fraction of the fervour pool still usable while guilt is unclaimed. */
export const GUILT_FERVOUR_PENALTY = 0.55;

function freshSave(): SaveData {
  return {
    version: SAVE_VERSION,
    checkpoint: { room: "cell", altar: 0 },
    abilities: { doubleJump: false, sealBreaker: false },
    maxHealth: 6,
    maxFlasks: 3,
    tears: 0,
    collected: [],
    guilt: null,
    bossDefeated: false,
    visited: [],
    deaths: 0,
  };
}

/**
 * Persistent run state: what you own, where you last prayed, and the guilt
 * you left behind. Saving is best-effort -- a blocked localStorage must never
 * break the game.
 */
export class Progression {
  data: SaveData = freshSave();

  private collectedSet = new Set<string>();
  private visitedSet = new Set<string>();

  load(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as SaveData;
      if (parsed?.version !== SAVE_VERSION) return false;
      this.data = { ...freshSave(), ...parsed };
      this.syncSets();
      return true;
    } catch {
      return false;
    }
  }

  save(): void {
    try {
      this.data.collected = [...this.collectedSet];
      this.data.visited = [...this.visitedSet];
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // Private browsing or a full quota; the run simply is not persisted.
    }
  }

  reset(): void {
    this.data = freshSave();
    this.syncSets();
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // ignore
    }
  }

  private syncSets(): void {
    this.collectedSet = new Set(this.data.collected ?? []);
    this.visitedSet = new Set(this.data.visited ?? []);
  }

  hasCollected(id: string): boolean {
    return this.collectedSet.has(id);
  }

  markCollected(id: string): void {
    this.collectedSet.add(id);
  }

  visit(roomId: string): void {
    this.visitedSet.add(roomId);
  }

  hasVisited(roomId: string): boolean {
    return this.visitedSet.has(roomId);
  }

  get visitedRooms(): ReadonlySet<string> {
    return this.visitedSet;
  }

  setCheckpoint(room: string, altar: number): void {
    this.data.checkpoint = { room, altar };
  }

  /** Drop everything at the place of death. */
  recordDeath(room: string, x: number, y: number, tears: number): void {
    this.data.deaths++;
    this.data.guilt = { room, x, y, tears };
    this.data.tears = 0;
  }

  /** Reclaim the mark: tears return and the fervour pool is whole again. */
  clearGuilt(): number {
    const recovered = this.data.guilt?.tears ?? 0;
    this.data.guilt = null;
    this.data.tears += recovered;
    return recovered;
  }

  get guilt(): GuiltMark | null {
    return this.data.guilt;
  }

  get fervourCap(): number {
    return this.data.guilt ? Math.round(FERVOUR.max * GUILT_FERVOUR_PENALTY) : FERVOUR.max;
  }
}
