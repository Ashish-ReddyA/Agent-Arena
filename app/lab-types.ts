export type Execution = "hosted" | "local";
export type Maze = {kind: "maze"; title: string; grid: string[]; start: [number,number]; goal: [number,number]};
export type LabState = {
  arenaId: string; seed: number; step: number; status: string; agents: string[];
  events: {step: number; agent: string; text: string; kind: string}[];
  checks: {name: string; passed: boolean; detail?: string}[];
  metrics: Record<string,number>; artifact?: Maze | null;
  [key: string]: unknown;
};
export type Run = {
  id: string; execution: Execution; status: string;
  provider?: {id:string;model:string}; engineVersion?:string;
  config: {arenaId: string; agentCount: number; seed: number; objective: string; maxSteps: number; ruleChangeStep: number | null};
  state: LabState; usage: {inputTokens: number; outputTokens: number; calls: number};
  createdAt: string; updatedAt: string; error?: string;
};
