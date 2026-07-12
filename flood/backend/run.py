"""Run FloodGuardian backend.

Usage:
  python run.py                 # dev mode with reload
  python run.py --prod          # production mode (more workers)
"""
import sys
import uvicorn
from app.core.config import settings


def main():
    prod = "--prod" in sys.argv
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=not prod,
        workers=1,  # use 1 for in-memory graph; scale horizontally with Redis later
        log_level="info",
        access_log=not prod,
    )


if __name__ == "__main__":
    main()
