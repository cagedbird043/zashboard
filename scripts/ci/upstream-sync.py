#!/usr/bin/env python3
"""Prepare, but never push, a linear fork rebased onto the newest official tag."""

import argparse
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile
import uuid


UPSTREAM = "https://github.com/Zephyruso/zashboard.git"
METADATA = "scripts/ci/upstream-base.json"
TAG = re.compile(r"v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z")
SHA = re.compile(r"[0-9a-f]{40}\Z")


class SyncError(Exception):
    pass


def git(repo, *args, env=None, check=True):
    environment = os.environ.copy()
    environment.update({
        "HUSKY": "0",
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_COMMITTER_NAME": "github-actions[bot]",
        "GIT_COMMITTER_EMAIL": "41898282+github-actions[bot]@users.noreply.github.com",
    })
    if env:
        environment.update(env)
    result = subprocess.run(
        ["git", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
         "-c", "rebase.updateRefs=false", "-c", "rebase.autoStash=false", *args],
        cwd=repo, env=environment, text=True, capture_output=True,
    )
    if check and result.returncode:
        raise SyncError(f"git {args[0]} failed:\n{result.stderr.strip()}")
    return result


def text(repo, *args):
    return git(repo, *args).stdout.strip()


def version(tag):
    match = TAG.fullmatch(tag)
    if not match:
        raise SyncError(f"Not an official stable version: {tag}")
    return tuple(map(int, match.groups()))


def baseline(repo, source):
    try:
        data = json.loads(text(repo, "show", f"{source}:{METADATA}"))
    except (ValueError, TypeError) as error:
        raise SyncError("Invalid upstream baseline metadata") from error
    if (not isinstance(data, dict) or set(data) != {"tag", "commit"}
            or not isinstance(data["tag"], str)
            or not isinstance(data["commit"], str)
            or not SHA.fullmatch(data["commit"])):
        raise SyncError("Baseline must contain exactly tag and full commit SHA")
    version(data["tag"])
    return data


def ancestor(repo, older, newer):
    result = git(repo, "merge-base", "--is-ancestor", older, newer, check=False)
    if result.returncode not in (0, 1):
        raise SyncError(result.stderr.strip())
    return result.returncode == 0


def prepare(repo, upstream_url, source_ref, run_id):
    # Private refs prevent both fetches from modifying a user's branch or tags.
    namespace = f"refs/cagedbird-sync/{uuid.uuid4().hex}"
    source = f"{namespace}/source"
    worktree = None
    with tempfile.TemporaryDirectory(prefix="zashboard-upstream-") as temporary:
        try:
            git(repo, "check-ref-format", source_ref)
            git(repo, "fetch", "--no-tags", "--no-write-fetch-head", "origin",
                f"+{source_ref}:{source}")
            old_sha = text(repo, "rev-parse", f"{source}^{{commit}}")
            old_base = baseline(repo, old_sha)
            if not ancestor(repo, old_base["commit"], old_sha):
                raise SyncError("Unknown drift: source does not descend from recorded baseline")
            if text(repo, "rev-list", "--merges", f"{old_base['commit']}..{old_sha}"):
                raise SyncError("Non-linear patch stack: merge commits are not supported")

            advertised = {}
            for line in text(repo, "ls-remote", "--tags", "--refs", upstream_url).splitlines():
                oid, ref = line.split("\t", 1)
                tag = ref.removeprefix("refs/tags/")
                if TAG.fullmatch(tag):
                    advertised[tag] = oid
            if old_base["tag"] not in advertised:
                raise SyncError("Recorded baseline tag is missing upstream")
            newest = max(advertised, key=version)
            resolved = {}
            for index, tag in enumerate(dict.fromkeys((old_base["tag"], newest))):
                ref = f"{namespace}/tag-{index}"
                git(repo, "fetch", "--no-tags", "--no-write-fetch-head", upstream_url,
                    f"+refs/tags/{tag}:{ref}")
                # Detect a race between discovery and fetch, including annotated tag moves.
                if text(repo, "rev-parse", ref) != advertised[tag]:
                    raise SyncError(f"Upstream tag changed while fetching: {tag}")
                resolved[tag] = text(repo, "rev-parse", f"{ref}^{{commit}}")
            if resolved[old_base["tag"]] != old_base["commit"]:
                raise SyncError("Recorded baseline tag was moved upstream")
            if version(newest) <= version(old_base["tag"]):
                return {"changed": False, "current_tag": old_base["tag"], "old_sha": old_sha}
            new_base = {"tag": newest, "commit": resolved[newest]}
            if not ancestor(repo, old_base["commit"], new_base["commit"]):
                raise SyncError("Newest official tag is not a descendant of the baseline")
            if text(repo, "merge-base", old_sha, new_base["commit"]) != old_base["commit"]:
                raise SyncError("Unknown drift: source already contains upstream history beyond baseline")

            branch = f"cagedbird/candidate-upstream-{newest}"
            if run_id:
                if not re.fullmatch(r"[A-Za-z0-9_-]+", run_id):
                    raise SyncError("run-id must contain only letters, digits, underscores or hyphens")
                branch += f"-{run_id}"
            git(repo, "check-ref-format", f"refs/heads/{branch}")
            if git(repo, "show-ref", "--verify", "--quiet", f"refs/heads/{branch}", check=False).returncode == 0:
                raise SyncError(f"Candidate branch already exists: {branch}; use a unique --run-id")

            # Only metadata-only commits are dropped. Every code/mixed commit is replayed
            # normally: a conflict is fatal, never resolved with blanket ours/theirs.
            metadata_only = []
            for commit in text(repo, "rev-list", "--reverse", f"{old_base['commit']}..{old_sha}").splitlines():
                paths = text(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", commit).splitlines()
                if paths == [METADATA]:
                    metadata_only.append(commit)
            editor = Path(temporary) / "sequence-editor.py"
            editor.write_text(
                "import json, pathlib, sys\n"
                f"drop = set(json.loads({json.dumps(json.dumps(metadata_only))}))\n"
                "todo = pathlib.Path(sys.argv[1])\n"
                "lines = todo.read_text().splitlines(keepends=True)\n"
                "for i, line in enumerate(lines):\n"
                "    fields = line.split()\n"
                "    if len(fields) >= 2 and fields[0] == 'pick' and fields[1] in drop:\n"
                "        lines[i] = line.replace('pick ', 'drop ', 1)\n"
                "todo.write_text(''.join(lines))\n",
                encoding="utf-8",
            )
            worktree = str(Path(temporary) / "candidate")
            git(repo, "worktree", "add", "--detach", worktree, old_sha)
            result = git(worktree, "-c", "core.abbrev=40", "rebase", "--interactive",
                         "--no-autosquash", "--reapply-cherry-picks", "--keep-empty", "--empty=keep",
                         "--onto", new_base["commit"], old_base["commit"],
                         env={"GIT_SEQUENCE_EDITOR": shlex.join([sys.executable, str(editor)])}, check=False)
            if result.returncode:
                git(worktree, "rebase", "--abort", check=False)
                raise SyncError(f"Upstream rebase failed; source branch is unchanged:\n{result.stderr.strip()}")
            metadata_path = Path(worktree) / METADATA
            metadata_path.parent.mkdir(parents=True, exist_ok=True)
            metadata_path.write_text(json.dumps(new_base, indent=2) + "\n", encoding="utf-8")
            git(worktree, "add", "--", METADATA)
            git(worktree, "-c", "user.name=github-actions[bot]", "-c",
                "user.email=41898282+github-actions[bot]@users.noreply.github.com", "commit",
                "-m", f"更新上游基线至 {newest}")
            candidate_sha = text(worktree, "rev-parse", "HEAD")
            # Atomic create: do not overwrite any candidate a concurrent prepare created.
            git(repo, "update-ref", f"refs/heads/{branch}", candidate_sha, "0" * 40)
            return {"changed": True, "old_sha": old_sha, "old_base": old_base,
                    "new_base": new_base, "new_tag": newest,
                    "candidate_sha": candidate_sha, "candidate_branch": branch}
        finally:
            if worktree:
                git(repo, "worktree", "remove", "--force", worktree, check=False)
            for ref in text(repo, "for-each-ref", "--format=%(refname)", namespace).splitlines():
                git(repo, "update-ref", "-d", ref)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path, help="Prepare result JSON file")
    parser.add_argument("--upstream-url", default=UPSTREAM, help="Trusted upstream URL (local fixtures only override it)")
    parser.add_argument("--source-ref", default="refs/heads/singbox", help="Trusted origin source ref")
    parser.add_argument("--run-id", help="Unique suffix for the candidate branch")
    args = parser.parse_args()
    try:
        repo = text(Path.cwd(), "rev-parse", "--show-toplevel")
        result = prepare(repo, args.upstream_url, args.source_ref, args.run_id)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        # Replace atomically so consumers never read a truncated successful result.
        with tempfile.NamedTemporaryFile(mode="w", dir=args.output.parent, delete=False, encoding="utf-8") as output:
            json.dump(result, output, indent=2)
            output.write("\n")
        os.replace(output.name, args.output)
        print(json.dumps(result))
    except (SyncError, OSError) as error:
        print(f"upstream-sync: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
