"""Lightweight, readable logging for the app's own ``silly.*`` loggers.

Kept separate from uvicorn's handlers (propagate=False) so our logs have a clean,
consistent format and don't double-print.
"""

from __future__ import annotations

import logging
import sys

_ROOT = "silly"


def setup_logging(level: str = "INFO") -> None:
    logger = logging.getLogger(_ROOT)
    logger.setLevel(level.upper())
    logger.propagate = False
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)-7s %(name)s | %(message)s", "%H:%M:%S")
        )
        logger.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"{_ROOT}.{name}")
