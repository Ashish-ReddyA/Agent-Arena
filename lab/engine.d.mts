export interface Arena {
  id: string;
  title: string;
  category: string;
  summary: string;
  description: string;
  minAgents: number;
  maxAgents: number;
  accent: string;
  objective: string;
  actions: string[];
}
export interface ExperimentConfig {
  arenaId: string;
  agentCount?: number;
  seed?: string | number;
  objective?: string;
  maxSteps?: number;
  ruleChangeStep?: number | null;
}
export interface MazeArtifact {
  kind: 'maze';
  title: string;
  grid: string[];
  start: [number, number];
  goal: [number, number];
  checkpoint?: [number, number];
}
export interface ExperimentEvent { step: number; agent: string; text: string; kind: string }
export interface ExperimentCheck { name: string; passed: boolean; detail: string }
export interface ExperimentState {
  arenaId: string;
  seed: string | number;
  step: number;
  status: 'running' | 'completed';
  agents: string[];
  objective: string;
  maxSteps: number;
  ruleChangeStep: number | null;
  ruleChanged: boolean;
  events: ExperimentEvent[];
  checks: ExperimentCheck[];
  metrics: Record<string, number>;
  artifact: MazeArtifact | { kind: 'escape' | 'civilization'; title: string; [key: string]: unknown } | null;
  [key: string]: unknown;
}
export const CATALOG: Arena[];
export function createExperiment(config: ExperimentConfig): ExperimentState;
export function observe(state: ExperimentState, slot: string): Record<string, unknown>;
export function applyAction(state: ExperimentState, slot: string, action: unknown): ExperimentState;
export function intervene(state: ExperimentState): ExperimentState;
