import type { Pool } from "pg";
import { evaluateDomains } from "./pipeline.js";
import {
  insertEvaluationJob,
  getEvaluationJob as getEvaluationJobRow,
  updateEvaluationJob,
  type EvaluationJobRow,
} from "../db/queries.js";

export const MAX_EVALUATE_DOMAINS = 20;

/** Creates a pending job row and kicks off processing in the background; returns immediately with the job id. */
export async function createEvaluationJob(pool: Pool, domains: string[]): Promise<EvaluationJobRow> {
  const job = await insertEvaluationJob(pool, domains);
  void runJob(pool, job.id, domains);
  return job;
}

async function runJob(pool: Pool, id: string, domains: string[]): Promise<void> {
  await updateEvaluationJob(pool, id, { status: "running" });
  try {
    const results = await evaluateDomains(pool, domains);
    await updateEvaluationJob(pool, id, { status: "done", results });
  } catch (err) {
    await updateEvaluationJob(pool, id, {
      status: "error",
      error: err instanceof Error ? err.message : "job_failed",
    });
  }
}

export async function getEvaluationJob(pool: Pool, id: string): Promise<EvaluationJobRow | null> {
  return getEvaluationJobRow(pool, id);
}
