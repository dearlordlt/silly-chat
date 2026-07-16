/**
 * Safe math-expression evaluator for sim blocks — the TS mirror of
 * backend/app/schema/simexpr.py (same grammar, operators, functions,
 * constants; keep the two in sync). No eval(): expressions parse into a
 * tiny AST compiled to a closure. Domain errors yield NaN — the chart
 * renders a gap, never crashes.
 */

export class ExprError extends Error {}

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 }

const FUNCTIONS: Record<string, { arity: number; fn: (...a: number[]) => number }> = {
  sin: { arity: 1, fn: Math.sin },
  cos: { arity: 1, fn: Math.cos },
  tan: { arity: 1, fn: Math.tan },
  asin: { arity: 1, fn: Math.asin },
  acos: { arity: 1, fn: Math.acos },
  atan: { arity: 1, fn: Math.atan },
  atan2: { arity: 2, fn: Math.atan2 },
  sqrt: { arity: 1, fn: Math.sqrt },
  cbrt: { arity: 1, fn: Math.cbrt },
  abs: { arity: 1, fn: Math.abs },
  exp: { arity: 1, fn: Math.exp },
  ln: { arity: 1, fn: Math.log },
  log: { arity: 1, fn: Math.log },
  log10: { arity: 1, fn: Math.log10 },
  log2: { arity: 1, fn: Math.log2 },
  pow: { arity: 2, fn: Math.pow },
  min: { arity: 2, fn: Math.min },
  max: { arity: 2, fn: Math.max },
  floor: { arity: 1, fn: Math.floor },
  ceil: { arity: 1, fn: Math.ceil },
  round: { arity: 1, fn: Math.round },
  sign: { arity: 1, fn: Math.sign },
  rad: { arity: 1, fn: (v) => (v * Math.PI) / 180 },
  deg: { arity: 1, fn: (v) => (v * 180) / Math.PI },
}

type Token = { kind: 'num' | 'ident' | 'op'; text: string }

const TOKEN_RE = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|(\*\*|[-+*/%^(),]))/y

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let pos = 0
  while (pos < src.length) {
    TOKEN_RE.lastIndex = pos
    const m = TOKEN_RE.exec(src)
    if (!m || TOKEN_RE.lastIndex === pos) {
      const rest = src.slice(pos).trimStart()
      if (!rest) break
      throw new ExprError(`unexpected character '${rest[0]}'`)
    }
    pos = TOKEN_RE.lastIndex
    if (m[1] !== undefined) tokens.push({ kind: 'num', text: m[1] })
    else if (m[2] !== undefined) tokens.push({ kind: 'ident', text: m[2] })
    else if (m[3] !== undefined) tokens.push({ kind: 'op', text: m[3] === '**' ? '^' : m[3] })
  }
  return tokens
}

type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'neg'; e: Node }
  | { t: 'bin'; op: string; l: Node; r: Node }
  | { t: 'call'; name: string; args: Node[] }

class Parser {
  i = 0
  private tokens: Token[]
  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  peek(): Token | undefined {
    return this.tokens[this.i]
  }
  take(): Token {
    const tok = this.tokens[this.i++]
    if (!tok) throw new ExprError('expression ends unexpectedly')
    return tok
  }
  expectOp(op: string) {
    const tok = this.peek()
    if (!tok || tok.kind !== 'op' || tok.text !== op) throw new ExprError(`expected '${op}'`)
    this.i++
  }
  isOp(op: string): boolean {
    const tok = this.peek()
    return !!tok && tok.kind === 'op' && tok.text === op
  }

  expr(): Node {
    let node = this.term()
    for (let tok = this.peek(); tok && tok.kind === 'op' && (tok.text === '+' || tok.text === '-'); tok = this.peek()) {
      this.i++
      node = { t: 'bin', op: tok.text, l: node, r: this.term() }
    }
    return node
  }
  term(): Node {
    let node = this.unary()
    for (let tok = this.peek(); tok && tok.kind === 'op' && '*/%'.includes(tok.text); tok = this.peek()) {
      this.i++
      node = { t: 'bin', op: tok.text, l: node, r: this.unary() }
    }
    return node
  }
  unary(): Node {
    const tok = this.peek()
    if (tok && tok.kind === 'op' && (tok.text === '-' || tok.text === '+')) {
      this.i++
      const inner = this.unary()
      return tok.text === '+' ? inner : { t: 'neg', e: inner }
    }
    return this.power()
  }
  power(): Node {
    const node = this.atom()
    if (this.isOp('^')) {
      this.i++
      return { t: 'bin', op: '^', l: node, r: this.unary() }
    }
    return node
  }
  atom(): Node {
    const tok = this.take()
    if (tok.kind === 'num') return { t: 'num', v: parseFloat(tok.text) }
    if (tok.kind === 'ident') {
      if (this.isOp('(')) {
        this.i++
        const spec = FUNCTIONS[tok.text]
        if (!spec) throw new ExprError(`unknown function '${tok.text}'`)
        const args = [this.expr()]
        while (this.isOp(',')) {
          this.i++
          args.push(this.expr())
        }
        this.expectOp(')')
        if (args.length !== spec.arity) throw new ExprError(`${tok.text}() takes ${spec.arity} argument(s)`)
        return { t: 'call', name: tok.text, args }
      }
      return { t: 'var', name: tok.text }
    }
    if (tok.text === '(') {
      const node = this.expr()
      this.expectOp(')')
      return node
    }
    throw new ExprError(`unexpected '${tok.text}'`)
  }
}

function evalNode(node: Node, env: Record<string, number>): number {
  switch (node.t) {
    case 'num':
      return node.v
    case 'var':
      return node.name in env ? env[node.name] : CONSTANTS[node.name] ?? NaN
    case 'neg':
      return -evalNode(node.e, env)
    case 'call':
      return FUNCTIONS[node.name].fn(...node.args.map((a) => evalNode(a, env)))
    case 'bin': {
      const l = evalNode(node.l, env)
      const r = evalNode(node.r, env)
      switch (node.op) {
        case '+':
          return l + r
        case '-':
          return l - r
        case '*':
          return l * r
        case '/':
          return r === 0 ? NaN : l / r
        case '%':
          return r === 0 ? NaN : l % r
        default:
          return Math.pow(l, r)
      }
    }
  }
}

export type CompiledExpr = (env: Record<string, number>) => number

/** Parse an expression; throws ExprError on bad syntax. */
export function compileExpr(src: string): CompiledExpr {
  const tokens = tokenize(src)
  if (tokens.length === 0) throw new ExprError('empty expression')
  const parser = new Parser(tokens)
  const ast = parser.expr()
  if (parser.peek()) throw new ExprError(`unexpected '${parser.peek()!.text}' after expression`)
  return (env) => evalNode(ast, env)
}

/** Like compileExpr but never throws — a bad expression evaluates to NaN. */
export function compileExprSafe(src: string): CompiledExpr {
  try {
    return compileExpr(src)
  } catch {
    return () => NaN
  }
}
