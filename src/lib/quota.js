const quotas = {}; // simplistic in-memory quotas: { key: { count, resetAt } }

function checkQuota(key, max=3){
  const now = Date.now();
  if(!quotas[key] || quotas[key].resetAt < now){
    quotas[key] = { count: 0, resetAt: now + 24*3600*1000 };
  }
  if(quotas[key].count >= max) return false;
  quotas[key].count += 1;
  return true;
}

module.exports = { checkQuota };
