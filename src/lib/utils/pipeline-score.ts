export interface PipelineScoreInput {
  total: number;
  submitted: number;
  validated: number;
  digitized: number;
  indexed: number;
  archived: number;
}

const PIPELINE_STEP_COUNT = 5;

export function computePipelineScore(input: PipelineScoreInput): number {
  if (input.total <= 0) return 0;

  const completedMilestones = [
    input.submitted,
    input.validated,
    input.digitized,
    input.indexed,
    input.archived,
  ].reduce((sum, value) => sum + Math.min(input.total, Math.max(0, value)), 0);

  return Math.round((completedMilestones / (input.total * PIPELINE_STEP_COUNT)) * 100);
}

export function computeQualityScore(total: number, dossiersAtRisk: number): number {
  if (total <= 0) return 0;
  const boundedRisk = Math.min(total, Math.max(0, dossiersAtRisk));
  return Math.round(((total - boundedRisk) / total) * 100);
}
