// Safe basic-math evaluator: + − × ÷ with correct precedence (no eval()).
export function evalExpr(raw: string): number | null {
  const expr = raw.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  const tokens = expr.match(/\d*\.?\d+|[+\-*/]/g);
  if (!tokens || tokens.length === 0) return null;
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  try {
    const parseTerm = (): number => {
      let val = parseFloat(next());
      while (peek() === '*' || peek() === '/') {
        const op = next();
        const rhs = parseFloat(next());
        if (isNaN(rhs)) throw new Error('bad');
        val = op === '*' ? val * rhs : val / rhs;
      }
      return val;
    };
    const parseExpr = (): number => {
      let val = parseTerm();
      while (peek() === '+' || peek() === '-') {
        const op = next();
        const rhs = parseTerm();
        val = op === '+' ? val + rhs : val - rhs;
      }
      return val;
    };
    const r = parseExpr();
    if (pos < tokens.length || isNaN(r)) return null;
    return isFinite(r) ? Math.round(r * 100) / 100 : null;
  } catch {
    return null;
  }
}

const OPS = ['+', '−', '×', '÷'];

/** Apply one calculator key to the current expression string. */
export function applyCalcKey(a: string, key: string): string {
  if (key === 'C') return '';
  if (key === '⌫') return a.slice(0, -1);
  if (key === '=') {
    const r = evalExpr(a);
    return r !== null ? String(r) : a;
  }
  if (OPS.includes(key)) {
    if (a === '') return '';
    if (OPS.includes(a.slice(-1))) return a.slice(0, -1) + key;
    return a + key;
  }
  if (key === '.') {
    const lastNum = a.split(/[+\-−×÷]/).pop() ?? '';
    if (lastNum.includes('.')) return a;
    return a + (a === '' || OPS.includes(a.slice(-1)) ? '0.' : '.');
  }
  return a + key;
}
