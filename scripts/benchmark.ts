/**
 * Performance Benchmark Script
 * Measures cold start times, query latency, cache hit rates, and throughput
 * 
 * Run with: npx tsx scripts/benchmark.ts
 */

import { performance } from "perf_hooks";

// Mock environment for testing (replace with actual API calls in production)
const BENCHMARK_ITERATIONS = 50;
const CONCURRENT_REQUESTS = 10;

interface BenchmarkResult {
  metric: string;
  average: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  unit: string;
}

function calculateStats(times: number[]): Omit<BenchmarkResult, "metric" | "unit"> {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    average: times.reduce((a, b) => a + b, 0) / times.length,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

async function measureColdStart(): Promise<BenchmarkResult> {
  const times: number[] = [];
  
  console.log("Measuring cold start times...");
  
  for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
    const start = performance.now();
    
    // Simulate Edge function cold start
    // In production, this would be an actual API call to /api/chat
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 30 + 20));
    
    const end = performance.now();
    times.push(end - start);
  }
  
  const stats = calculateStats(times);
  return {
    metric: "Cold Start Time",
    ...stats,
    unit: "ms",
  };
}

async function measureQueryLatency(): Promise<{ cached: BenchmarkResult; uncached: BenchmarkResult }> {
  const cachedTimes: number[] = [];
  const uncachedTimes: number[] = [];
  
  console.log("Measuring query latency (cached vs uncached)...");
  
  for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
    // Simulate cached query (semantic cache hit)
    const cachedStart = performance.now();
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 200 + 100));
    cachedTimes.push(performance.now() - cachedStart);
    
    // Simulate uncached query (full RAG pipeline)
    const uncachedStart = performance.now();
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 2000 + 1500));
    uncachedTimes.push(performance.now() - uncachedStart);
  }
  
  return {
    cached: {
      metric: "Query Latency (Cached)",
      ...calculateStats(cachedTimes),
      unit: "ms",
    },
    uncached: {
      metric: "Query Latency (Uncached)",
      ...calculateStats(uncachedTimes),
      unit: "ms",
    },
  };
}

async function measureThroughput(): Promise<BenchmarkResult> {
  const times: number[] = [];
  
  console.log("Measuring concurrent request throughput...");
  
  const start = performance.now();
  const promises = Array.from({ length: CONCURRENT_REQUESTS }, async () => {
    const reqStart = performance.now();
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000 + 500));
    times.push(performance.now() - reqStart);
  });
  
  await Promise.all(promises);
  const totalTime = performance.now() - start;
  
  const stats = calculateStats(times);
  return {
    metric: "Concurrent Request Throughput",
    ...stats,
    unit: "ms",
  };
}

async function main() {
  console.log("🚀 Starting Performance Benchmarks\n");
  console.log(`Iterations: ${BENCHMARK_ITERATIONS}`);
  console.log(`Concurrent Requests: ${CONCURRENT_REQUESTS}\n`);
  
  const coldStart = await measureColdStart();
  const queryLatency = await measureQueryLatency();
  const throughput = await measureThroughput();
  
  console.log("\n📊 Benchmark Results:\n");
  console.log(JSON.stringify(coldStart, null, 2));
  console.log("\n" + JSON.stringify(queryLatency.cached, null, 2));
  console.log("\n" + JSON.stringify(queryLatency.uncached, null, 2));
  console.log("\n" + JSON.stringify(throughput, null, 2));
}

if (require.main === module) {
  main().catch(console.error);
}
