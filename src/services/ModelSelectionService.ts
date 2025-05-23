import {
  ModelConfiguration,
  ModelSelectionCriteria,
  ModelCapabilities,
  ModelScore,
  ModelSelectionHistory,
  ModelPerformanceMetrics,
} from "../types/index.js";
import { logger } from "../utils/logger.js";

export class ModelSelectionService {
  private modelCache: Map<string, ModelCapabilities>;
  private performanceMetrics: Map<string, ModelPerformanceMetrics>;
  private selectionHistory: ModelSelectionHistory[];
  private readonly maxHistorySize = 500;

  constructor(private config: ModelConfiguration) {
    this.modelCache = new Map();
    this.performanceMetrics = new Map();
    this.selectionHistory = [];
    this.initializeModelCache();
  }

  private initializeModelCache(): void {
    Object.entries(this.config.capabilities).forEach(
      ([model, capabilities]) => {
        this.modelCache.set(model, capabilities);
      }
    );
  }

  async selectOptimalModel(criteria: ModelSelectionCriteria): Promise<string> {
    const startTime = Date.now();
    try {
      const candidateModels = this.getCandidateModels(criteria);
      if (candidateModels.length === 0) {
        logger.warn(
          "[ModelSelectionService] No candidate models found for criteria",
          { criteria }
        );
        return criteria.fallbackModel || this.config.default;
      }

      const selectedModel = this.selectBestModel(candidateModels, criteria);

      const selectionTime = Date.now() - startTime;
      this.recordSelection(
        criteria,
        selectedModel,
        candidateModels,
        selectionTime
      );

      logger.debug("[ModelSelectionService] Model selected", {
        selectedModel,
        criteria,
      });

      return selectedModel;
    } catch (error) {
      logger.error("[ModelSelectionService] Model selection failed", {
        error,
        criteria,
      });
      return criteria.fallbackModel || this.config.default;
    }
  }

  private getCandidateModels(criteria: ModelSelectionCriteria): string[] {
    let baseModels: string[];

    switch (criteria.taskType) {
      case "text-generation":
        baseModels = this.config.textGeneration;
        break;
      case "image-generation":
        baseModels = this.config.imageGeneration;
        break;
      case "video-generation":
        baseModels = this.config.videoGeneration;
        break;
      case "code-review":
        baseModels = this.config.codeReview;
        break;
      case "reasoning":
        baseModels = this.config.complexReasoning;
        break;
      case "multimodal":
        baseModels = this.config.textGeneration.filter((model) => {
          const caps = this.modelCache.get(model);
          return (
            caps && (caps.imageInput || caps.videoInput || caps.audioInput)
          );
        });
        break;
      default:
        baseModels = this.config.textGeneration;
    }

    // Filter out models that don't have capabilities defined
    baseModels = baseModels.filter((model) => this.modelCache.has(model));

    if (criteria.requiredCapabilities) {
      return baseModels.filter((model) => {
        const capabilities = this.modelCache.get(model);
        if (!capabilities) return false;

        return criteria.requiredCapabilities!.every((capability) => {
          const value = capabilities[capability];
          if (typeof value === "boolean") return value;
          if (typeof value === "string") return value !== "none";
          return Boolean(value);
        });
      });
    }

    return baseModels;
  }

  private selectBestModel(
    models: string[],
    criteria: ModelSelectionCriteria
  ): string {
    if (models.length === 0) {
      return criteria.fallbackModel || this.config.default;
    }

    // Score-based selection that considers performance metrics
    const scoredModels = models.map((model) => ({
      model,
      score: this.calculateModelScore(model, criteria),
    }));

    scoredModels.sort((a, b) => b.score - a.score);
    return scoredModels[0].model;
  }

  private sortModelsByPreference(
    models: string[],
    criteria: ModelSelectionCriteria
  ): string[] {
    const preferCost =
      criteria.preferCost || this.config.routing.preferCostEffective;
    const preferSpeed = criteria.preferSpeed || this.config.routing.preferSpeed;
    const preferQuality =
      criteria.preferQuality || this.config.routing.preferQuality;

    return models.sort((a, b) => {
      const capsA = this.modelCache.get(a)!;
      const capsB = this.modelCache.get(b)!;

      // Primary sorting: cost preference
      if (preferCost) {
        const costComparison = this.compareCost(capsA.costTier, capsB.costTier);
        if (costComparison !== 0) return costComparison;
      }

      // Secondary sorting: speed preference
      if (preferSpeed) {
        const speedComparison = this.compareSpeed(
          capsA.speedTier,
          capsB.speedTier
        );
        if (speedComparison !== 0) return speedComparison;
      }

      // Tertiary sorting: quality preference (default)
      if (preferQuality) {
        const qualityComparison = this.compareQuality(capsA, capsB);
        if (qualityComparison !== 0) return qualityComparison;
      }

      return 0; // Equal preference
    });
  }

  private compareCost(costA: string, costB: string): number {
    const costOrder = { low: 0, medium: 1, high: 2 };
    const orderA = costOrder[costA as keyof typeof costOrder] ?? 1;
    const orderB = costOrder[costB as keyof typeof costOrder] ?? 1;
    return orderA - orderB; // Lower cost wins
  }

  private compareSpeed(speedA: string, speedB: string): number {
    const speedOrder = { fast: 0, medium: 1, slow: 2 };
    const orderA = speedOrder[speedA as keyof typeof speedOrder] ?? 1;
    const orderB = speedOrder[speedB as keyof typeof speedOrder] ?? 1;
    return orderA - orderB; // Faster wins
  }

  private compareQuality(
    capsA: ModelCapabilities,
    capsB: ModelCapabilities
  ): number {
    const reasoningOrder = { none: 0, basic: 1, good: 2, excellent: 3 };
    const codeOrder = { none: 0, basic: 1, good: 2, excellent: 3 };

    const reasoningA =
      reasoningOrder[capsA.complexReasoning as keyof typeof reasoningOrder] ??
      0;
    const reasoningB =
      reasoningOrder[capsB.complexReasoning as keyof typeof reasoningOrder] ??
      0;

    if (reasoningA !== reasoningB) {
      return reasoningB - reasoningA; // Higher reasoning wins
    }

    const codeA = codeOrder[capsA.codeExecution as keyof typeof codeOrder] ?? 0;
    const codeB = codeOrder[capsB.codeExecution as keyof typeof codeOrder] ?? 0;

    if (codeA !== codeB) {
      return codeB - codeA; // Higher code execution wins
    }

    // Additional quality factors
    if (capsA.contextWindow !== capsB.contextWindow) {
      return capsB.contextWindow - capsA.contextWindow; // Larger context wins
    }

    return 0;
  }

  getModelCapabilities(modelName: string): ModelCapabilities | undefined {
    return this.modelCache.get(modelName);
  }

  isModelAvailable(modelName: string): boolean {
    return this.modelCache.has(modelName);
  }

  getAvailableModels(): string[] {
    return Array.from(this.modelCache.keys());
  }

  validateModelForTask(
    modelName: string,
    taskType: ModelSelectionCriteria["taskType"]
  ): boolean {
    const capabilities = this.modelCache.get(modelName);
    if (!capabilities) return false;

    switch (taskType) {
      case "text-generation":
        return capabilities.textGeneration;
      case "image-generation":
        return capabilities.imageGeneration;
      case "video-generation":
        return capabilities.videoGeneration;
      case "code-review":
        return capabilities.codeExecution !== "none";
      case "reasoning":
        return capabilities.complexReasoning !== "none";
      case "multimodal":
        return (
          capabilities.imageInput ||
          capabilities.videoInput ||
          capabilities.audioInput
        );
      default:
        return capabilities.textGeneration;
    }
  }

  updateConfiguration(newConfig: ModelConfiguration): void {
    this.config = newConfig;
    this.modelCache.clear();
    this.initializeModelCache();
    logger.info("[ModelSelectionService] Configuration updated");
  }

  updatePerformanceMetrics(
    modelName: string,
    latency: number,
    success: boolean
  ): void {
    const existing = this.performanceMetrics.get(modelName) || {
      totalCalls: 0,
      avgLatency: 0,
      successRate: 0,
      lastUpdated: new Date(),
    };

    const newTotalCalls = existing.totalCalls + 1;
    const newAvgLatency =
      (existing.avgLatency * existing.totalCalls + latency) / newTotalCalls;
    const successCount =
      existing.successRate * existing.totalCalls + (success ? 1 : 0);
    const newSuccessRate = successCount / newTotalCalls;

    this.performanceMetrics.set(modelName, {
      totalCalls: newTotalCalls,
      avgLatency: newAvgLatency,
      successRate: newSuccessRate,
      lastUpdated: new Date(),
    });
  }

  getPerformanceMetrics(): Map<string, ModelPerformanceMetrics> {
    return new Map(this.performanceMetrics);
  }

  getSelectionHistory(limit?: number): ModelSelectionHistory[] {
    const history = [...this.selectionHistory];
    return limit ? history.slice(-limit) : history;
  }

  private recordSelection(
    criteria: ModelSelectionCriteria,
    selectedModel: string,
    candidateModels: string[],
    selectionTime: number
  ): void {
    const scores: ModelScore[] = candidateModels.map((model) => ({
      model,
      score: this.calculateModelScore(model, criteria),
      capabilities: this.modelCache.get(model)!,
    }));

    const record: ModelSelectionHistory = {
      timestamp: new Date(),
      criteria,
      selectedModel,
      candidateModels,
      scores,
      selectionTime,
    };

    this.selectionHistory.push(record);

    if (this.selectionHistory.length > this.maxHistorySize) {
      this.selectionHistory.shift();
    }
  }

  private calculateModelScore(
    model: string,
    criteria: ModelSelectionCriteria
  ): number {
    const capabilities = this.modelCache.get(model);
    if (!capabilities) return 0;

    let score = 0;

    // Base score from routing preferences
    if (criteria.preferCost) {
      const costScore =
        capabilities.costTier === "low"
          ? 3
          : capabilities.costTier === "medium"
            ? 2
            : 1;
      score += costScore * 0.4;
    }

    if (criteria.preferSpeed) {
      const speedScore =
        capabilities.speedTier === "fast"
          ? 3
          : capabilities.speedTier === "medium"
            ? 2
            : 1;
      score += speedScore * 0.4;
    }

    if (criteria.preferQuality) {
      const reasoningScore =
        capabilities.complexReasoning === "excellent"
          ? 3
          : capabilities.complexReasoning === "good"
            ? 2
            : 1;
      score += reasoningScore * 0.4;
    }

    // URL context scoring - prefer models with larger context windows for URL-heavy requests
    if (criteria.urlCount && criteria.urlCount > 0) {
      // Bonus for models with large context windows when processing URLs
      if (capabilities.contextWindow >= 1000000) {
        score += Math.min(criteria.urlCount / 5, 2.0); // Up to 2 points for many URLs
      } else if (capabilities.contextWindow >= 500000) {
        score += Math.min(criteria.urlCount / 10, 1.0); // Up to 1 point for medium context
      }

      // Bonus for estimated content size handling
      if (criteria.estimatedUrlContentSize && criteria.estimatedUrlContentSize > 0) {
        const sizeInTokens = criteria.estimatedUrlContentSize / 4; // Rough estimate: 4 chars per token
        const contextUtilization = sizeInTokens / capabilities.contextWindow;
        
        // Prefer models that won't be overwhelmed by the content size
        if (contextUtilization < 0.3) {
          score += 1.5; // Comfortable fit
        } else if (contextUtilization < 0.6) {
          score += 0.5; // Acceptable fit
        } else if (contextUtilization > 0.8) {
          score -= 2.0; // Penalize models that might struggle
        }
      }

      // Slight bonus for models that support URL context natively (Gemini 2.5 models)
      if (model.includes('gemini-2.5')) {
        score += 0.5;
      }
    }

    // Performance metrics influence (heavily weighted)
    const metrics = this.performanceMetrics.get(model);
    if (metrics && metrics.totalCalls >= 5) {
      // Strong preference for models with good performance history
      score += metrics.successRate * 2.0;
      // Prefer lower latency (significant impact)
      const latencyScore = Math.max(0, 1 - metrics.avgLatency / 2000);
      score += latencyScore * 1.5;
    }

    return score;
  }
}
