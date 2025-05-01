/**
 * Metrics tracking utilities for monitoring and performance measurement
 */

import { logger } from "./logger.js";

// Simple in-memory storage for metrics
// In a production system, you might use a proper metrics system like Prometheus
const metrics: Record<string, MetricValue> = {};

// Types for different metric values
type CounterMetric = { type: "counter"; value: number };
type GaugeMetric = { type: "gauge"; value: number };
type HistogramMetric = { 
  type: "histogram"; 
  count: number; 
  sum: number; 
  min: number; 
  max: number; 
  buckets: Record<string, number> 
};

type MetricValue = CounterMetric | GaugeMetric | HistogramMetric;

// Common labels for metrics
export interface MetricLabels {
  operation?: string;
  model?: string;
  status?: "success" | "failure";
  errorType?: string;
}

/**
 * Increments a counter metric
 * @param name Metric name
 * @param increment Amount to increment by (default: 1)
 * @param labels Optional labels to attach to the metric
 */
export function incrementCounter(name: string, increment = 1, labels?: MetricLabels): void {
  const metricName = getMetricNameWithLabels(name, labels);
  if (!metrics[metricName]) {
    metrics[metricName] = { type: "counter", value: 0 };
  }
  
  if (metrics[metricName].type === "counter") {
    metrics[metricName].value += increment;
  } else {
    logger.warn(`Metric ${metricName} is not a counter`);
  }
}

/**
 * Sets a gauge metric
 * @param name Metric name
 * @param value Value to set
 * @param labels Optional labels to attach to the metric
 */
export function setGauge(name: string, value: number, labels?: MetricLabels): void {
  const metricName = getMetricNameWithLabels(name, labels);
  metrics[metricName] = { type: "gauge", value };
}

/**
 * Records a value in a histogram metric
 * @param name Metric name
 * @param value Value to record
 * @param bucketBoundaries Boundaries for histogram buckets
 * @param labels Optional labels to attach to the metric
 */
export function recordHistogram(
  name: string, 
  value: number, 
  bucketBoundaries: number[] = [10, 50, 100, 500, 1000, 5000], 
  labels?: MetricLabels
): void {
  const metricName = getMetricNameWithLabels(name, labels);
  
  // Initialize histogram if it doesn't exist
  if (!metrics[metricName] || metrics[metricName].type !== "histogram") {
    const buckets: Record<string, number> = {};
    bucketBoundaries.forEach(bound => {
      buckets[`le_${bound}`] = 0;
    });
    buckets[`le_inf`] = 0;
    
    metrics[metricName] = {
      type: "histogram",
      count: 0,
      sum: 0,
      min: Infinity,
      max: -Infinity,
      buckets
    };
  }
  
  const histogram = metrics[metricName] as HistogramMetric;
  
  // Update histogram values
  histogram.count += 1;
  histogram.sum += value;
  histogram.min = Math.min(histogram.min, value);
  histogram.max = Math.max(histogram.max, value);
  
  // Update buckets
  let bucketUpdated = false;
  for (const bound of bucketBoundaries) {
    if (value <= bound) {
      histogram.buckets[`le_${bound}`]++;
      bucketUpdated = true;
      break;
    }
  }
  
  // If value is larger than all bucket boundaries, update the infinity bucket
  if (!bucketUpdated) {
    histogram.buckets[`le_inf`]++;
  }
}

/**
 * Gets the current value of a metric
 * @param name Metric name
 * @param labels Optional labels to attach to the metric
 * @returns The metric value or undefined if not found
 */
export function getMetric(name: string, labels?: MetricLabels): MetricValue | undefined {
  const metricName = getMetricNameWithLabels(name, labels);
  return metrics[metricName];
}

/**
 * Gets all metrics
 * @returns All current metrics
 */
export function getAllMetrics(): Record<string, MetricValue> {
  return { ...metrics };
}

/**
 * Resets a specific metric
 * @param name Metric name
 * @param labels Optional labels to attach to the metric
 */
export function resetMetric(name: string, labels?: MetricLabels): void {
  const metricName = getMetricNameWithLabels(name, labels);
  delete metrics[metricName];
}

/**
 * Resets all metrics
 */
export function resetAllMetrics(): void {
  Object.keys(metrics).forEach(key => {
    delete metrics[key];
  });
}

/**
 * Utility to time an operation and record it in a histogram
 * @param name Metric name
 * @param fn Function to time
 * @param labels Optional labels to attach to the metric
 * @returns The result of the function
 */
export async function timeOperation<T>(
  name: string, 
  fn: () => Promise<T>, 
  labels?: MetricLabels
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    recordHistogram(name, duration, undefined, { ...labels, status: "success" });
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    recordHistogram(name, duration, undefined, { 
      ...labels, 
      status: "failure", 
      errorType: error instanceof Error ? error.constructor.name : "unknown" 
    });
    throw error;
  }
}

// Helper to create metric names with labels
function getMetricNameWithLabels(name: string, labels?: MetricLabels): string {
  if (!labels) return name;
  
  const labelString = Object.entries(labels)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
  
  return labelString ? `${name}{${labelString}}` : name;
}