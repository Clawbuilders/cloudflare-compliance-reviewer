import { aiGovernance } from "./ai-governance";
import { casl } from "./casl";
import { changeControl } from "./change-control";
import { licensing } from "./licensing";
import { privacy } from "./privacy";
import { sensitiveData } from "./sensitive-data";
import type { Specialist } from "./types";

/** Ids match the triage questions in clef.ts. */
export const SPECIALISTS: Specialist[] = [privacy, licensing, casl, aiGovernance, sensitiveData, changeControl];

export const getSpecialist = (id: string): Specialist | undefined => SPECIALISTS.find((s) => s.id === id);
export { runSpecialist } from "./run";
export type { Specialist, SpecialistContext } from "./types";
