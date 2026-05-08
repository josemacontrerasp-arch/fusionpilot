"""Serve the FusionPilot frontend on http://localhost:8000/web/.

Runs Python's stdlib http.server with a sensible default port. The frontend
needs HTTP (not file://) because it loads ES modules and JSON trajectories
via fetch(), both of which are blocked under file:// in modern browsers.

Usage:
    python scripts/serve.py
    python scripts/serve.py --port 8888
"""

from __future__ import annotations

import argparse
import http.server
import socketserver
import webbrowser
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-open", action="store_true", help="Do not auto-open the browser.")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    handler = http.server.SimpleHTTPRequestHandler

    class Handler(handler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(repo_root), **kw)

    with socketserver.TCPServer(("", args.port), Handler) as httpd:
        url = f"http://localhost:{args.port}/web/"
        print(f"FusionPilot demo serving at {url}")
        print(f"  repo root: {repo_root}")
        print("  Ctrl+C to stop.")
        if not args.no_open:
            try:
                webbrowser.open(url)
            except Exception:
                pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped.")


if __name__ == "__main__":
    main()
