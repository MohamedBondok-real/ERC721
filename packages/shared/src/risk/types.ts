import type { AssessmentUrgency, RiskLevel } from "../types";

export interface RiskFactor {
  id: string;
  label: string;
  category: string;
  points: number;
  weight: number;
  severity: "informational" | "notable" | "significant";
  explanation: string;
}

export interface RiskAssessmentResult {
  /** Which model produced this result — always surfaced in the UI and audit trail. */
  modelName: string;
  modelId: string;
  modelVersion: string;
  level: RiskLevel;
  score: number;
  maxScore: number;
  normalizedScore: number;
  urgency: AssessmentUrgency;
  factors: RiskFactor[];
  guidance: string[];
  redFlags: string[];
  disclaimers: string[];
  evaluatedAt: string;
}
