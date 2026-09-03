// Mechanic helpers: read the explicit per-arena feature flags. Absent === false.
const flag = (arena, name) => Boolean(arena?.mechanics?.[name]);

export const useFilesystem = (arena) => flag(arena, "fs");
export const isScored = (arena) => flag(arena, "scored");
export const hasSharedPool = (arena) => flag(arena, "sharedPool");
export const hasScarcity = (arena) => flag(arena, "scarcity");
export const usesInstitutions = (arena) => flag(arena, "institutions");
export const hasGoalCheck = (arena) => flag(arena, "goalCheck");
export const isOpenEnded = (arena) => flag(arena, "openEnded");
export const isSolo = (arena) => flag(arena, "solo");
export const hasMarket = (arena) => flag(arena, "market");
export const hasNeeds = (arena) => flag(arena, "needs");

// Does this arena present evidence tasks on the dashboard board?
export const usesTasks = (arena) => Array.isArray(arena?.tasks) && arena.tasks.length > 0;
