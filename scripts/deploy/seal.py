#!/usr/bin/python3 -I
"""CI: seal.py DIST SHA; pre-upload verification: seal.py --verify DIST SHA."""
import argparse
from pathlib import Path
import runpy
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="check the existing manifest without rewriting it")
    parser.add_argument("dist", type=Path)
    parser.add_argument("sha")
    args = parser.parse_args()
    release = runpy.run_path(str(Path(__file__).with_name("zashboard-release.py")))
    release["verify" if args.verify else "seal"](args.dist.absolute(), args.sha)
    print(("Verified " if args.verify else "Sealed ") + args.sha)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        sys.exit(str(error))
