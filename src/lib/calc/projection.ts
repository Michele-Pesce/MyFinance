// PAC projection: constant-return hypothesis, no taxes, fees or inflation. Never advice.

export interface ProjectionPoint {
  year: number;
  contributed: number; // starting capital + all monthly contributions
  value: number;
}

/**
 * i = (1+r)^(1/12) - 1
 * FV(t) = P(1+i)^(12t) + A((1+i)^(12t) - 1)/i      (i = 0 handled apart)
 */
export function projectPac(startValue: number, monthly: number, annualRate: number, years: number): ProjectionPoint[] {
  const i = Math.pow(1 + annualRate, 1 / 12) - 1;
  const out: ProjectionPoint[] = [];
  for (let t = 0; t <= years; t++) {
    const m = 12 * t;
    const growth = Math.pow(1 + i, m);
    out.push({
      year: t,
      contributed: startValue + monthly * m,
      value: i === 0 ? startValue + monthly * m : startValue * growth + monthly * ((growth - 1) / i),
    });
  }
  return out;
}
