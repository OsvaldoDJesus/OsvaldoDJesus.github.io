const KEY = 'lumen.profile.v1';
export const PROFILE_KEY = KEY;
const integer = (n, max) => Number.isSafeInteger(n) && n >= 0 ? Math.min(n, max) : 0;
const RUN_ID = /^[A-Za-z0-9-]{1,64}$/;
const runId = value => typeof value === 'string' && RUN_ID.test(value) ? value : null;
// `lastRunId`: la última expedición liquidada, para que un punto de control que sobreviva no se cobre dos veces.
export function normalizeProfile(raw) {
  if (!raw || raw.version !== 1) return {version:1, seeds:0, power:0, best:0, victories:0, lastRunId:null};
  return {version:1, seeds:integer(raw.seeds,99999), power:integer(raw.power,5), best:integer(raw.best,12), victories:integer(raw.victories,99999), lastRunId:runId(raw.lastRunId)};
}
export function loadProfile(storage) {
  try { return normalizeProfile(JSON.parse(storage.getItem(KEY))); } catch { return normalizeProfile(null); }
}
export function saveProfile(storage, profile) {
  try { storage.setItem(KEY, JSON.stringify(normalizeProfile(profile))); return true; } catch { return false; }
}
export function powerCost(profile) { return 8 + profile.power * 6; }
export function buyPower(profile) {
  const cost = powerCost(profile);
  if (profile.power >= 5 || profile.seeds < cost) return false;
  profile.seeds -= cost; profile.power++; return true;
}
export function settle(profile, run) {
  if (!['won','lost','retired'].includes(run.phase) || run.settled) return 0;
  run.settled = true;
  if (run.runId && run.runId === profile.lastRunId) return 0;
  profile.lastRunId = run.runId ?? profile.lastRunId ?? null;
  const reward = run.completed * 2 + (run.phase === 'won' ? 8 : 0);
  profile.seeds = Math.min(99999, profile.seeds + reward);
  profile.best = Math.max(profile.best, run.completed);
  if (run.phase === 'won') profile.victories = Math.min(99999, profile.victories+1);
  return reward;
}
