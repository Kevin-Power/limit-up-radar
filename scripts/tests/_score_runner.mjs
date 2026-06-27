// Helper: invoke scoreStock with a JSON input from argv[2], print result JSON.
// Usage: node scripts/tests/_score_runner.mjs '<json>'
import { scoreStock } from "../../src/lib/scoring.ts";

const input = JSON.parse(process.argv[2]);
input.trendingGroups = new Set(input.trendingGroups || []);
input.group = input.group || { name: "_test", color: "", stocks: [] };
const out = scoreStock(input);
process.stdout.write(JSON.stringify(out));
