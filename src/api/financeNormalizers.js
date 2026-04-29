function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveReportSource(raw) {
  return raw?.summary || raw?.totals || raw?.data?.summary || raw?.data?.totals || raw?.data || raw || {};
}

export function normalizeTotals(report) {
  const source = resolveReportSource(report);
  const legacyNet = toNumber(source?.bonusPenaltyTotal, 0);
  const hasBonus = source?.bonusTotal !== undefined && source?.bonusTotal !== null;
  const hasPenalty = source?.penaltyTotal !== undefined && source?.penaltyTotal !== null;

  const bonusTotal = hasBonus
    ? Math.max(0, toNumber(source?.bonusTotal, 0))
    : (!hasPenalty && legacyNet > 0 ? legacyNet : 0);
  const penaltyTotal = hasPenalty
    ? Math.max(0, toNumber(source?.penaltyTotal, 0))
    : (!hasBonus && legacyNet < 0 ? Math.abs(legacyNet) : 0);
  const bonusPenaltyTotal = source?.bonusPenaltyTotal !== undefined && source?.bonusPenaltyTotal !== null
    ? toNumber(source?.bonusPenaltyTotal, 0)
    : (bonusTotal - penaltyTotal);

  return {
    bonusTotal,
    penaltyTotal,
    bonusPenaltyTotal
  };
}

export function normalizeBonusPenalty(item) {
  const source = item || {};
  const rawType = String(source?.type || '').trim().toLowerCase();
  const signedAmount = toNumber(source?.amount, 0);
  const type = rawType === 'bonus' || rawType === 'penalty'
    ? rawType
    : (signedAmount < 0 ? 'penalty' : 'bonus');
  const absoluteAmount = source?.absoluteAmount !== undefined && source?.absoluteAmount !== null
    ? Math.abs(toNumber(source?.absoluteAmount, 0))
    : Math.abs(signedAmount);
  const normalizedSignedAmount = type === 'penalty' ? -absoluteAmount : absoluteAmount;

  return {
    ...source,
    type,
    absoluteAmount,
    amount: signedAmount === 0 && absoluteAmount > 0 ? normalizedSignedAmount : signedAmount
  };
}

export function normalizeBonusPenaltyList(items) {
  return (Array.isArray(items) ? items : []).map((item) => normalizeBonusPenalty(item));
}

