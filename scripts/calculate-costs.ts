/**
 * Cost Calculation Script
 * Calculates exact costs based on API pricing and usage patterns
 */

interface CostBreakdown {
  component: string;
  costPerUnit: number;
  units: number;
  total: number;
  notes: string;
}

interface MonthlyCost {
  scenario: string;
  queries: number;
  documents: number;
  breakdown: CostBreakdown[];
  total: number;
}

// Pricing (as of 2025)
const PRICING = {
  // Vercel Hobby Plan (Free tier)
  vercel: {
    free: true,
    requests: 0, // Free tier: 100GB bandwidth, unlimited requests
  },
  
  // Upstash Vector (Free tier: 10K requests/month, then $0.10 per 1K requests)
  upstashVector: {
    freeTier: 10000,
    costPer1K: 0.10,
  },
  
  // Upstash Redis (Free tier: 10K commands/day, then $0.20 per 100K commands)
  upstashRedis: {
    freeTierPerDay: 10000,
    costPer100K: 0.20,
  },
  
  // Google Gemini 2.5 Flash
  gemini: {
    inputCostPer1M: 0.10, // $0.10 per 1M input tokens
    outputCostPer1M: 0.40, // $0.40 per 1M output tokens
    avgInputTokens: 2000, // Average tokens per query (system + context + query)
    avgOutputTokens: 500, // Average tokens per response
  },
};

function calculateCosts(queriesPerMonth: number, cacheHitRate: number = 0.45): MonthlyCost {
  const cacheHits = Math.floor(queriesPerMonth * cacheHitRate);
  const cacheMisses = queriesPerMonth - cacheHits;
  
  const breakdown: CostBreakdown[] = [];
  
  // Vercel (Free tier)
  breakdown.push({
    component: "Vercel (Hobby Plan)",
    costPerUnit: 0,
    units: queriesPerMonth,
    total: 0,
    notes: "Free tier: Unlimited requests",
  });
  
  // Upstash Vector
  // Each query = 1 vector search + cache upsert (on miss) = ~1.5 requests per query
  const vectorRequests = Math.floor(queriesPerMonth * 1.5);
  const vectorRequestsOverFree = Math.max(0, vectorRequests - PRICING.upstashVector.freeTier);
  const vectorCost = (vectorRequestsOverFree / 1000) * PRICING.upstashVector.costPer1K;
  
  breakdown.push({
    component: "Upstash Vector",
    costPerUnit: PRICING.upstashVector.costPer1K / 1000,
    units: vectorRequests,
    total: vectorCost,
    notes: `Free tier: ${PRICING.upstashVector.freeTier.toLocaleString()} requests/month`,
  });
  
  // Upstash Redis
  // Each query = 1 get (cache check) + 1 set (on miss) = ~1.5 commands per query
  const redisCommands = Math.floor(queriesPerMonth * 1.5);
  const redisCommandsPerDay = redisCommands / 30;
  const redisCommandsOverFree = Math.max(0, redisCommandsPerDay - PRICING.upstashRedis.freeTierPerDay) * 30;
  const redisCost = (redisCommandsOverFree / 100000) * PRICING.upstashRedis.costPer100K;
  
  breakdown.push({
    component: "Upstash Redis",
    costPerUnit: PRICING.upstashRedis.costPer100K / 100000,
    units: redisCommands,
    total: redisCost,
    notes: `Free tier: ${PRICING.upstashRedis.freeTierPerDay.toLocaleString()} commands/day`,
  });
  
  // Gemini LLM (only for cache misses)
  const totalInputTokens = cacheMisses * PRICING.gemini.avgInputTokens;
  const totalOutputTokens = cacheMisses * PRICING.gemini.avgOutputTokens;
  const inputCost = (totalInputTokens / 1000000) * PRICING.gemini.inputCostPer1M;
  const outputCost = (totalOutputTokens / 1000000) * PRICING.gemini.outputCostPer1M;
  const llmCost = inputCost + outputCost;
  
  breakdown.push({
    component: "Google Gemini 2.5 Flash",
    costPerUnit: (PRICING.gemini.inputCostPer1M + PRICING.gemini.outputCostPer1M) / 2000000,
    units: totalInputTokens + totalOutputTokens,
    total: llmCost,
    notes: `Only charged for cache misses (${cacheMisses} queries)`,
  });
  
  const total = breakdown.reduce((sum, item) => sum + item.total, 0);
  
  return {
    scenario: `${queriesPerMonth.toLocaleString()} queries/month`,
    queries: queriesPerMonth,
    documents: 0, // Documents don't incur ongoing costs
    breakdown,
    total,
  };
}

function calculateCostPerQuery(queriesPerMonth: number, cacheHitRate: number = 0.45): number {
  const costs = calculateCosts(queriesPerMonth, cacheHitRate);
  return costs.total / queriesPerMonth;
}

// Main calculations
console.log("💰 Cost Analysis\n");

const scenarios = [1000, 5000, 10000, 50000, 100000];

scenarios.forEach((queries) => {
  const costs = calculateCosts(queries, 0.45);
  const costPerQuery = calculateCostPerQuery(queries, 0.45);
  
  console.log(`\n${costs.scenario}:`);
  console.log(`  Total: $${costs.total.toFixed(2)}/month`);
  console.log(`  Cost per query: $${costPerQuery.toFixed(4)}`);
  costs.breakdown.forEach((item) => {
    if (item.total > 0) {
      console.log(`  - ${item.component}: $${item.total.toFixed(2)}`);
    }
  });
});

// Export for use in other scripts
export { calculateCosts, calculateCostPerQuery, PRICING };
