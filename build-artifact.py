"""Builds the claude.ai artifact page from the planner.

The artifact publisher wraps the page in its own <html>/<head>/<body>
skeleton, so this strips those wrappers and writes the page body
(title, style, markup, script) to the path given as the first argument.

    python build-artifact.py path/to/artifact.html
"""
import io, re, sys

src = io.open("Weekly Kratom Planner.html", encoding="utf-8").read()
out = src
for pat in [r"<!DOCTYPE html>\s*", r"<html[^>]*>\s*", r"<head>\s*", r'<meta[^>]*>\s*',
            r"</head>\s*", r"<body>\s*", r"</body>\s*", r"</html>\s*"]:
    out = re.sub(pat, "", out, count=0 if "meta" in pat else 1, flags=re.I)
dest = sys.argv[1] if len(sys.argv) > 1 else "artifact.html"
io.open(dest, "w", encoding="utf-8").write(out)
print("wrote", dest, len(out), "bytes")
