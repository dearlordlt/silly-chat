# Design tokens — measured from the design doc (v2)

Values extracted from `silly-chat-design.html` via computed styles (Frigg · light and
Bifröst · dark frames). These are the formulas `frontend/src/lib/theme.ts` implements;
component metrics guide the per-screen restyle.

## Theme builder formulas

`pH` = primary hue, `nH` = neutral hue, `pC` = primary chroma, seeds for mixed themes.

### Light
| token | value |
|---|---|
| background | `oklch(0.985 0.004 nH)` |
| foreground | `oklch(0.25 0.03 nH)` |
| card | `oklch(1 0 0)` (pure white) |
| muted | `oklch(0.955 0.008 nH)` |
| muted-foreground | `oklch(0.52 0.025 nH)` |
| primary | `oklch(0.51 pC+0.06 pH)` (deeper + more vivid than pre-design values) |
| primary-foreground | `oklch(0.99 0.004 pH)` |
| accent | `oklch(0.945 0.032 pH)` |
| border / input | `oklch(0.912 0.012 nH)` |
| sidebar | `oklch(0.973 0.007 nH)` |
| destructive | `oklch(0.55 0.19 25)` · success `oklch(0.58 0.14 150)` |

### Dark (seed bgL≈0.17, bgC≈0.018; Bifröst 0.165/0.025)
| token | value |
|---|---|
| background | `oklch(bgL bgC nH)` |
| foreground | `oklch(0.93 0.014 nH)` |
| card | `oklch(bgL+0.048 bgC+0.005 nH)` |
| muted | `oklch(bgL+0.095 bgC+0.007 nH)` |
| muted-foreground | `oklch(0.71 0.03 nH)` |
| primary | `oklch(0.74 pC pH)` |
| primary-foreground | `oklch(0.21 0.07 pH)` (dark text on bright primary) |
| accent | `oklch(0.31 0.06 pH)` |
| border | `oklch(bgL+0.15 bgC+0.01 nH)` · input slightly lighter |
| sidebar | `oklch(bgL+0.025 bgC+0.003 nH)` |
| destructive | `oklch(0.66 0.17 22)` · success `oklch(0.75 0.14 155)` |

Bifröst is re-seeded to the doc: `dark(350, 340, 0.17, { bgL: 0.165, bgC: 0.025 })`.

## Radius scale
`--radius: 0.75rem` (12px). Cards/panels = lg (12), composer + user bubble = xl (16),
sidebar rows / small chips = sm (8), pills = full.

## Component metrics (from the doc)
| component | metrics |
|---|---|
| user bubble | primary bg, radius 16/16/6 (tight BR), padding 12×16, fs 14.5px, max-w 520px |
| block cards (agent panel, chart, table, code) | card bg, 1px border, radius 12 |
| chart card | padding 16×18, 13px/600 title |
| composer | radius 16, max-w 720, padding ~14–16, shadow `0 6px 24px oklch(primary/0.07)` |
| sidebar row | radius 8, padding 8, active bg = accent |
| table | header cells 12.5px/700 on muted, body cells 13.5px, padding 11×14 |
| mode pills | 12.5px/600, radius full, padding 6×12, inactive = 1px border + muted-fg |
| agent rows | 12.5px, muted-fg labels |
| sources items | 12px muted-fg |
| code filename chip | mono 12.5px on muted, radius sm |
| page headers ("Settings") | 13px/600 |
