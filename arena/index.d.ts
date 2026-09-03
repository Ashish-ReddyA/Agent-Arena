// Type declarations for the plain-data arena registry, so the TypeScript
// dashboard gets full typing from the .mjs modules it shares with the bridge.

export interface ArenaTask {
  id: string;
  title: string;
}

export interface AgentRange {
  min: number;
  max: number;
  default: number;
}

export interface ArenaMechanics {
  scored?: boolean;
  fs?: boolean;
  sharedPool?: boolean;
  scarcity?: boolean;
  institutions?: boolean;
  goalCheck?: boolean;
  openEnded?: boolean;
  solo?: boolean;
  market?: boolean;
  needs?: boolean;
}

export interface ArenaDefinition {
  id: string;
  number: string;
  name: string;
  tagline: string;
  researchQuestion: string;
  framing: string;
  objective: string;
  instructions: string;
  metric: string;
  agentRange: AgentRange;
  mechanics: ArenaMechanics;
  places: string[] | null;
  home: (string | null)[] | null;
  tasks: ArenaTask[];
  relationship: string;
  scoring: { criterion: "influence" | "points" | null };
  simulation: { beats: Record<string, string[]> };
  presentation: { accent: string; blurb: string };
}

export interface AgentSlot {
  id: string;
  label: string;
  index: number;
  home: string | null;
}

export const MECHANIC_FLAGS: string[];
export const ARENAS: readonly ArenaDefinition[];
export const ARENA_IDS: readonly string[];
export function getArena(id: string): ArenaDefinition | null;

export function validateArena(arena: unknown, seenIds?: Set<string>): string[];
export function validateArenas(arenas?: readonly ArenaDefinition[]): string[];
export function assertValidArenas(arenas?: readonly ArenaDefinition[]): readonly ArenaDefinition[];

export function clampCount(arena: ArenaDefinition, count: number): number;
export function countAllowed(arena: ArenaDefinition, count: number): boolean;
export function agentSlots(arena: ArenaDefinition, count: number): AgentSlot[];
export function otherSlots(slots: AgentSlot[], id: string): string[];

export const useFilesystem: (arena: ArenaDefinition | null | undefined) => boolean;
export const isScored: (arena: ArenaDefinition | null | undefined) => boolean;
export const hasSharedPool: (arena: ArenaDefinition | null | undefined) => boolean;
export const hasScarcity: (arena: ArenaDefinition | null | undefined) => boolean;
export const usesInstitutions: (arena: ArenaDefinition | null | undefined) => boolean;
export const hasGoalCheck: (arena: ArenaDefinition | null | undefined) => boolean;
export const isOpenEnded: (arena: ArenaDefinition | null | undefined) => boolean;
export const isSolo: (arena: ArenaDefinition | null | undefined) => boolean;
export const hasMarket: (arena: ArenaDefinition | null | undefined) => boolean;
export const hasNeeds: (arena: ArenaDefinition | null | undefined) => boolean;
export const usesTasks: (arena: ArenaDefinition | null | undefined) => boolean;
