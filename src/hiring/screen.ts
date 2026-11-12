/**
 * Resume screener: asks a Workers AI model to score each application against the job description, then shortlists or
 * rejects the applicant automatically.
 */
export interface Env {
  AI: Ai;
}

export interface Applicant {
  id: string;
  email: string;
  resume: string;
}

/** Applicants scoring below this are rejected without anyone looking at them. */
const REJECT_BELOW = 0.6;

export async function screenApplicant(env: Env, applicant: Applicant, jobDescription: string) {
  const out = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    prompt: `Rate how well this resume fits the job from 0 to 1. Reply with the number only.\nJob: ${jobDescription}\nResume: ${applicant.resume}`,
  });
  const score = Number((out as { response?: string }).response ?? 0);

  if (score < REJECT_BELOW) {
    await rejectApplicant(applicant.id, "Thank you for applying. We will not be moving forward.");
    return { status: "rejected", score };
  }
  return { status: "shortlisted", score };
}

async function rejectApplicant(id: string, message: string): Promise<void> {
  console.log(`rejected ${id}: ${message}`);
}
