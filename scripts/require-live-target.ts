const target = process.env.APPROVED_LIVE_TARGET;
if (!target) {
  console.error("BLOCKED: APPROVED_LIVE_TARGET is required for live tests.");
  process.exit(2);
}
console.error(`BLOCKED: live test implementation for approved target ${target} is not yet available (P0.3).`);
process.exit(2);
