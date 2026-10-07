import { RuleBasedEducationalRiskModel, SYMPTOM_CATALOGUE, symptomDefinition } from "./ruleBasedModel";
import type { RiskAssessmentInput, RiskAssessmentModel } from "./model";

/**
 * Model registry.
 *
 * A validated machine-learning model (for example a scikit-learn or ONNX model served
 * behind an inference endpoint) can be added here without changing a single caller:
 *
 * ```ts
 * registerRiskModel(new OnnxRiskModel("/models/bcrat-v3.onnx"));
 * setActiveRiskModel("onnx-bcrat", "3.1.0");
 * ```
 *
 * Every model must implement the same `RiskAssessmentModel` interface, and every result
 * it returns must carry the platform's medical-safety disclaimers.
 */
const registry = new Map<string, RiskAssessmentModel>();

const ruleBased = new RuleBasedEducationalRiskModel();
registry.set(ruleBased.id, ruleBased);

let activeModelId = ruleBased.id;

export function registerRiskModel(model: RiskAssessmentModel): void {
  registry.set(model.id, model);
}

export function setActiveRiskModel(id: string): RiskAssessmentModel {
  const model = registry.get(id);
  if (!model) {
    throw new Error(`Unknown risk assessment model: ${id}`);
  }
  activeModelId = id;
  return model;
}

export function getActiveRiskModel(): RiskAssessmentModel {
  const model = registry.get(activeModelId);
  if (!model) throw new Error(`Active risk model "${activeModelId}" is not registered`);
  return model;
}

export function listRiskModels(): { id: string; version: string; label: string; description: string; active: boolean }[] {
  return [...registry.values()].map((m) => ({
    id: m.id,
    version: m.version,
    label: m.label,
    description: m.description,
    active: m.id === activeModelId,
  }));
}

export { RuleBasedEducationalRiskModel, SYMPTOM_CATALOGUE, symptomDefinition };
export type { RiskAssessmentInput, RiskAssessmentModel };
export * from "./model";
export * from "./types";
