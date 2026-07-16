"""Safe math-expression parser for sim blocks.

The model writes each sim series as a plain math expression over ``x`` and the
declared variables ("P*(1+r/100)^x"). This module parses that string into a
tiny AST — no eval(), no attribute access, a fixed whitelist of functions — so
a broken or malicious expression can never reach the frontend, and validation
errors read well enough to steer the model's retry.

The frontend mirrors this exact grammar in ``lib/expr.ts``; keep the two in
sync (operators, function names, arities, constants).
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable
from typing import Any

__all__ = ["ExprError", "Expr", "parse_expr", "FUNCTIONS", "CONSTANTS"]


class ExprError(ValueError):
    """Raised when an expression fails to parse or references unknowns."""


CONSTANTS: dict[str, float] = {"pi": math.pi, "e": math.e, "tau": math.tau}


def _safe(fn: Callable[..., float]) -> Callable[..., float]:
    def wrapped(*args: float) -> float:
        try:
            return float(fn(*args))
        except (ValueError, OverflowError, ZeroDivisionError):
            return math.nan

    return wrapped


def _sign(v: float) -> float:
    return float((v > 0) - (v < 0))


# name -> (arity, impl). Domain errors become NaN (a gap in the curve), never a crash.
FUNCTIONS: dict[str, tuple[int, Callable[..., float]]] = {
    "sin": (1, _safe(math.sin)),
    "cos": (1, _safe(math.cos)),
    "tan": (1, _safe(math.tan)),
    "asin": (1, _safe(math.asin)),
    "acos": (1, _safe(math.acos)),
    "atan": (1, _safe(math.atan)),
    "atan2": (2, _safe(math.atan2)),
    "sqrt": (1, _safe(math.sqrt)),
    "cbrt": (1, _safe(lambda v: math.copysign(abs(v) ** (1 / 3), v))),
    "abs": (1, _safe(abs)),
    "exp": (1, _safe(math.exp)),
    "ln": (1, _safe(math.log)),
    "log": (1, _safe(math.log)),  # alias for ln
    "log10": (1, _safe(math.log10)),
    "log2": (1, _safe(math.log2)),
    "pow": (2, _safe(math.pow)),
    "min": (2, _safe(min)),
    "max": (2, _safe(max)),
    "floor": (1, _safe(math.floor)),
    "ceil": (1, _safe(math.ceil)),
    "round": (1, _safe(round)),
    "sign": (1, _safe(_sign)),
    "rad": (1, _safe(math.radians)),
    "deg": (1, _safe(math.degrees)),
}

_TOKEN = re.compile(
    r"\s*(?:"
    r"(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)"  # number
    r"|([A-Za-z_][A-Za-z_0-9]*)"  # identifier
    r"|(\*\*|[-+*/%^(),])"  # operator / punctuation
    r")"
)

# AST: ("num", v) | ("var", name) | ("neg", node) | ("bin", op, l, r) | ("call", name, [args])
_Node = tuple[Any, ...]


def _tokenize(src: str) -> list[tuple[str, str]]:
    tokens: list[tuple[str, str]] = []
    pos = 0
    while pos < len(src):
        m = _TOKEN.match(src, pos)
        if not m or m.end() == pos:
            rest = src[pos:].lstrip()
            if not rest:
                break
            raise ExprError(f"unexpected character {rest[0]!r} in expression")
        pos = m.end()
        num, ident, op = m.groups()
        if num is not None:
            tokens.append(("num", num))
        elif ident is not None:
            tokens.append(("ident", ident))
        elif op is not None:
            tokens.append(("op", "^" if op == "**" else op))
    return tokens


class _Parser:
    def __init__(self, tokens: list[tuple[str, str]]):
        self.tokens = tokens
        self.i = 0

    def peek(self) -> tuple[str, str] | None:
        return self.tokens[self.i] if self.i < len(self.tokens) else None

    def take(self) -> tuple[str, str]:
        tok = self.peek()
        if tok is None:
            raise ExprError("expression ends unexpectedly")
        self.i += 1
        return tok

    def expect(self, op: str) -> None:
        tok = self.peek()
        if tok is None or tok != ("op", op):
            raise ExprError(f"expected {op!r} in expression")
        self.i += 1

    # expr := term (('+'|'-') term)*
    def expr(self) -> _Node:
        node = self.term()
        while (tok := self.peek()) and tok[0] == "op" and tok[1] in "+-":
            self.i += 1
            node = ("bin", tok[1], node, self.term())
        return node

    # term := unary (('*'|'/'|'%') unary)*
    def term(self) -> _Node:
        node = self.unary()
        while (tok := self.peek()) and tok[0] == "op" and tok[1] in "*/%":
            self.i += 1
            node = ("bin", tok[1], node, self.unary())
        return node

    # unary := '-' unary | '+' unary | power
    def unary(self) -> _Node:
        tok = self.peek()
        if tok and tok[0] == "op" and tok[1] in "+-":
            self.i += 1
            inner = self.unary()
            return inner if tok[1] == "+" else ("neg", inner)
        return self.power()

    # power := atom ('^' unary)?   — right-associative, exponent may be signed
    def power(self) -> _Node:
        node = self.atom()
        tok = self.peek()
        if tok == ("op", "^"):
            self.i += 1
            node = ("bin", "^", node, self.unary())
        return node

    def atom(self) -> _Node:
        kind, text = self.take()
        if kind == "num":
            return ("num", float(text))
        if kind == "ident":
            if self.peek() == ("op", "("):
                self.i += 1
                if text not in FUNCTIONS:
                    raise ExprError(f"unknown function {text!r}")
                arity = FUNCTIONS[text][0]
                args = [self.expr()]
                while self.peek() == ("op", ","):
                    self.i += 1
                    args.append(self.expr())
                self.expect(")")
                if len(args) != arity:
                    raise ExprError(f"{text}() takes {arity} argument(s), got {len(args)}")
                return ("call", text, args)
            return ("var", text)
        if (kind, text) == ("op", "("):
            node = self.expr()
            self.expect(")")
            return node
        raise ExprError(f"unexpected {text!r} in expression")


def _identifiers(node: _Node, out: set[str]) -> None:
    tag = node[0]
    if tag == "var":
        out.add(node[1])
    elif tag == "neg":
        _identifiers(node[1], out)
    elif tag == "bin":
        _identifiers(node[2], out)
        _identifiers(node[3], out)
    elif tag == "call":
        for arg in node[2]:
            _identifiers(arg, out)


def _eval(node: _Node, env: dict[str, float]) -> float:
    tag = node[0]
    if tag == "num":
        return node[1]
    if tag == "var":
        name = node[1]
        if name in env:
            return env[name]
        return CONSTANTS[name]
    if tag == "neg":
        return -_eval(node[1], env)
    if tag == "call":
        return FUNCTIONS[node[1]][1](*(_eval(a, env) for a in node[2]))
    op, left, right = node[1], _eval(node[2], env), _eval(node[3], env)
    try:
        if op == "+":
            return left + right
        if op == "-":
            return left - right
        if op == "*":
            return left * right
        if op == "/":
            return left / right if right != 0 else math.nan
        if op == "%":
            return math.fmod(left, right) if right != 0 else math.nan
        return math.pow(left, right)
    except (ValueError, OverflowError):
        return math.nan


class Expr:
    """A parsed, evaluatable expression."""

    def __init__(self, src: str):
        tokens = _tokenize(src)
        if not tokens:
            raise ExprError("empty expression")
        parser = _Parser(tokens)
        self.ast = parser.expr()
        if parser.peek() is not None:
            raise ExprError(f"unexpected {parser.peek()[1]!r} after expression")
        names: set[str] = set()
        _identifiers(self.ast, names)
        self.identifiers = names - set(CONSTANTS)

    def eval(self, env: dict[str, float]) -> float:
        return _eval(self.ast, env)


def parse_expr(src: str) -> Expr:
    return Expr(src)
