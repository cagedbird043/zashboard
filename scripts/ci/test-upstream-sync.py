#!/usr/bin/env python3
"""Exercise upstream preparation against real local repositories, without network access."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("upstream-sync.py").resolve()
METADATA = "scripts/ci/upstream-base.json"


class UpstreamSyncTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="test-upstream-sync-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.upstream = self.root / "upstream"
        self.origin = self.root / "origin.git"
        self.repo = self.root / "fork"
        self.git(self.root, "init", "--bare", str(self.origin))
        self.git(self.root, "init", "-b", "main", str(self.upstream))
        self.configure(self.upstream)
        self.commit(self.upstream, "app.txt", "original\n", "upstream baseline")
        self.base = self.git(self.upstream, "rev-parse", "HEAD")
        self.git(self.upstream, "tag", "v3.30.0")
        self.git(self.root, "clone", str(self.upstream), str(self.repo))
        self.configure(self.repo)
        self.git(self.repo, "checkout", "-b", "singbox")
        self.git(self.repo, "remote", "set-url", "origin", str(self.origin))
        self.commit(self.repo, "fork.txt", "fork patch\n", "保留面板补丁")
        self.commit(self.repo, METADATA,
                    json.dumps({"tag": "v3.30.0", "commit": self.base}) + "\n", "记录初始上游基线")
        self.git(self.repo, "push", "origin", "singbox")
        self.old_sha = self.git(self.repo, "rev-parse", "HEAD")
        self.result = self.root / "result.json"

    def git(self, repo, *args, check=True):
        environment = os.environ.copy()
        environment.update({"HUSKY": "0", "GIT_CONFIG_NOSYSTEM": "1"})
        result = subprocess.run(
            ["git", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", *args],
            cwd=repo, env=environment, text=True, capture_output=True,
        )
        if check and result.returncode:
            self.fail(f"git {args} failed: {result.stderr}")
        return result.stdout.strip()

    def configure(self, repo):
        self.git(repo, "config", "user.name", "Fixture")
        self.git(repo, "config", "user.email", "fixture@example.invalid")

    def commit(self, repo, filename, contents, subject):
        path = repo / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents, encoding="utf-8")
        self.git(repo, "add", "--", filename)
        self.git(repo, "commit", "-m", subject)
        return self.git(repo, "rev-parse", "HEAD")

    def release(self, tag="v3.31.0", filename="upstream.txt", contents="new upstream\n", annotated=False):
        sha = self.commit(self.upstream, filename, contents, f"release {tag}")
        self.git(self.upstream, "tag", *( ["-a", "-m", tag] if annotated else []), tag)
        return sha

    def run_sync(self, succeeds=True, *extra):
        self.result.unlink(missing_ok=True)
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--upstream-url", str(self.upstream),
             "--output", str(self.result), *extra],
            cwd=self.repo, text=True, capture_output=True,
        )
        if succeeds:
            self.assertEqual(result.returncode, 0, result.stderr)
            data = json.loads(self.result.read_text())
            self.assertEqual(json.loads(result.stdout), data)
            return data
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertFalse(self.result.exists())
        return result.stderr

    def assert_source_unchanged(self, expected=None):
        expected = expected or self.old_sha
        self.assertEqual(self.git(self.repo, "rev-parse", "singbox"), expected)
        self.assertEqual(self.git(self.origin, "rev-parse", "singbox"), expected)
        self.assertEqual(self.git(self.repo, "symbolic-ref", "HEAD"), "refs/heads/singbox")
        self.assertEqual(self.git(self.repo, "status", "--porcelain"), "")
        self.assertEqual(self.git(self.repo, "for-each-ref", "--format=%(refname)", "refs/cagedbird-sync"), "")
        self.assertEqual(len(self.git(self.repo, "worktree", "list", "--porcelain").split("worktree ")) - 1, 1)

    def test_no_update_keeps_branches(self):
        before = self.git(self.repo, "for-each-ref", "--format=%(refname):%(objectname)", "refs/heads")
        self.assertEqual(self.run_sync(), {"changed": False, "current_tag": "v3.30.0", "old_sha": self.old_sha})
        self.assertEqual(self.git(self.repo, "for-each-ref", "--format=%(refname):%(objectname)", "refs/heads"), before)
        self.assert_source_unchanged()

    def test_new_tag_keeps_patch_and_creates_metadata_commit(self):
        upstream_sha = self.release()
        data = self.run_sync()
        self.assertTrue(data["changed"])
        self.assertEqual(data["old_sha"], self.old_sha)
        self.assertEqual(data["old_base"], {"tag": "v3.30.0", "commit": self.base})
        self.assertEqual(data["new_base"], {"tag": "v3.31.0", "commit": upstream_sha})
        self.assertEqual(data["new_tag"], "v3.31.0")
        self.assertEqual(data["candidate_branch"], "cagedbird/candidate-upstream-v3.31.0")
        candidate = data["candidate_sha"]
        self.assertEqual(self.git(self.repo, "rev-parse", data["candidate_branch"]), candidate)
        self.assertEqual(self.git(self.repo, "show", f"{candidate}:fork.txt"), "fork patch")
        self.assertEqual(self.git(self.repo, "show", f"{candidate}:upstream.txt"), "new upstream")
        self.assertEqual(json.loads(self.git(self.repo, "show", f"{candidate}:{METADATA}")), data["new_base"])
        self.assertEqual(self.git(self.repo, "log", "-1", "--format=%s", candidate), "更新上游基线至 v3.31.0")
        self.assertEqual(self.git(self.repo, "diff-tree", "--no-commit-id", "--name-only", "-r", candidate), METADATA)
        self.assert_source_unchanged()

    def test_two_consecutive_rebases_preserve_mixed_metadata_commit(self):
        # The initial automation rollout will add code and metadata in one commit.
        self.git(self.repo, "reset", "--soft", "HEAD~1")
        (self.repo / "automation.txt").write_text("real code in mixed metadata commit\n")
        self.git(self.repo, "add", "automation.txt")
        self.git(self.repo, "commit", "-m", "新增自动化及初始基线")
        self.git(self.repo, "push", "--force", "origin", "singbox")
        self.release()
        first = self.run_sync()
        # Simulate the parent's promotion only after CI. The tool itself never pushes.
        self.git(self.repo, "reset", "--hard", first["candidate_sha"])
        self.git(self.repo, "push", f"--force-with-lease=singbox:{first['old_sha']}", "origin", "singbox")
        promoted = first["candidate_sha"]
        latest = self.release("v3.32.0", "second.txt", "second release\n")
        second = self.run_sync()
        self.assertEqual(second["old_sha"], promoted)
        self.assertEqual(second["new_base"], {"tag": "v3.32.0", "commit": latest})
        for filename, contents in (("fork.txt", "fork patch"), ("automation.txt", "real code in mixed metadata commit"),
                                   ("upstream.txt", "new upstream"), ("second.txt", "second release")):
            self.assertEqual(self.git(self.repo, "show", f"{second['candidate_sha']}:{filename}"), contents)
        self.assertEqual(json.loads(self.git(self.repo, "show", f"{second['candidate_sha']}:{METADATA}")), second["new_base"])
        self.assertEqual(self.git(self.repo, "log", "--format=%s", f"{latest}..{second['candidate_sha']}").splitlines(),
                         ["更新上游基线至 v3.32.0", "新增自动化及初始基线", "保留面板补丁"])
        self.assert_source_unchanged(promoted)

    def test_conflict_aborts_without_changing_source(self):
        self.commit(self.repo, "app.txt", "fork change\n", "修改同一行")
        self.git(self.repo, "push", "origin", "singbox")
        self.old_sha = self.git(self.repo, "rev-parse", "HEAD")
        self.release(filename="app.txt", contents="upstream change\n")
        self.assertIn("rebase failed", self.run_sync(False))
        self.assert_source_unchanged()
        self.assertEqual(self.git(self.repo, "branch", "--list", "cagedbird/candidate-*"), "")

    def test_moved_baseline_rejected_even_without_newer_release(self):
        self.commit(self.upstream, "app.txt", "moved\n", "move base")
        self.git(self.upstream, "tag", "--force", "v3.30.0")
        self.assertIn("baseline tag was moved", self.run_sync(False))
        self.assert_source_unchanged()

    def test_prereleases_ignored_and_annotated_tag_peeled(self):
        stable = self.release("v3.31.0", annotated=True)
        self.release("v9.0.0-alpha.1", "preview.txt")
        self.git(self.upstream, "tag", "v99.0.0-rc.1")
        self.git(self.upstream, "tag", "v03.99.0")
        data = self.run_sync()
        self.assertEqual(data["new_tag"], "v3.31.0")
        self.assertEqual(data["new_base"]["commit"], stable)
        self.assert_source_unchanged()

    def test_semver_not_lexical_order(self):
        self.release("v3.9.0")
        newest = self.release("v3.100.0", "newest.txt")
        data = self.run_sync()
        self.assertEqual(data["new_tag"], "v3.100.0")
        self.assertEqual(data["new_base"]["commit"], newest)

    def test_non_descendant_release_rejected(self):
        self.git(self.upstream, "checkout", "--orphan", "unrelated")
        self.git(self.upstream, "rm", "--cached", "-r", ".")
        self.release("v4.0.0")
        self.assertIn("not a descendant", self.run_sync(False))
        self.assert_source_unchanged()

    def test_merge_patch_stack_rejected(self):
        self.git(self.repo, "checkout", "-b", "side")
        self.commit(self.repo, "side.txt", "side\n", "side patch")
        self.git(self.repo, "checkout", "singbox")
        self.commit(self.repo, "main.txt", "main\n", "main patch")
        self.git(self.repo, "merge", "--no-ff", "side", "-m", "merge")
        self.git(self.repo, "push", "origin", "singbox")
        self.old_sha = self.git(self.repo, "rev-parse", "HEAD")
        self.release()
        self.assertIn("Non-linear patch stack", self.run_sync(False))
        self.assert_source_unchanged()

    def test_unknown_drift_rejected(self):
        self.release()
        self.git(self.repo, "fetch", str(self.upstream), "main")
        self.git(self.repo, "rebase", "FETCH_HEAD")
        self.git(self.repo, "push", "--force", "origin", "singbox")
        self.old_sha = self.git(self.repo, "rev-parse", "HEAD")
        self.assertIn("Unknown drift", self.run_sync(False))
        self.assert_source_unchanged()

    def test_source_is_fetched_not_local_checkout(self):
        local_sha = self.commit(self.repo, "unpublished.txt", "local only\n", "local unpushed patch")
        self.release()
        data = self.run_sync()
        self.assertEqual(data["old_sha"], self.old_sha)
        self.assertEqual(self.git(self.repo, "rev-parse", "singbox"), local_sha)
        self.assertEqual(self.git(self.repo, "show", f"{data['candidate_sha']}:unpublished.txt", check=False), "")

    def test_source_ref_and_run_id_overrides(self):
        self.git(self.repo, "push", "origin", "singbox:fixture-source")
        self.release()
        data = self.run_sync(True, "--source-ref", "refs/heads/fixture-source", "--run-id", "123-2")
        self.assertEqual(data["candidate_branch"], "cagedbird/candidate-upstream-v3.31.0-123-2")
        self.assert_source_unchanged()

    def test_candidate_branch_not_overwritten(self):
        self.release()
        self.git(self.repo, "branch", "cagedbird/candidate-upstream-v3.31.0")
        self.assertIn("Candidate branch already exists", self.run_sync(False))
        self.assertEqual(self.git(self.repo, "rev-parse", "cagedbird/candidate-upstream-v3.31.0"), self.old_sha)
        self.assert_source_unchanged()

    def test_already_upstream_and_empty_code_commits_are_not_dropped(self):
        self.git(self.repo, "commit", "--allow-empty", "-m", "保留空补丁提交")
        self.git(self.repo, "push", "origin", "singbox")
        self.old_sha = self.git(self.repo, "rev-parse", "HEAD")
        self.commit(self.upstream, "fork.txt", "fork patch\n", "upstream incorporated patch")
        newest = self.release()
        data = self.run_sync()
        subjects = self.git(self.repo, "log", "--format=%s", f"{newest}..{data['candidate_sha']}").splitlines()
        self.assertIn("保留面板补丁", subjects)
        self.assertIn("保留空补丁提交", subjects)
        self.assert_source_unchanged()

    def test_missing_baseline_tag_rejected(self):
        self.git(self.upstream, "tag", "-d", "v3.30.0")
        self.assertIn("baseline tag is missing", self.run_sync(False))
        self.assert_source_unchanged()

    def test_invalid_metadata_rejected_without_an_update(self):
        self.commit(self.repo, METADATA, json.dumps({"tag": "v3.30.0", "commit": self.base, "extra": True}),
                    "unknown baseline format")
        self.git(self.repo, "push", "origin", "singbox")
        self.old_sha = self.git(self.repo, "rev-parse", "HEAD")
        self.assertIn("Baseline must contain exactly", self.run_sync(False))
        self.assert_source_unchanged()

    def test_hooks_disabled(self):
        marker = self.root / "hook-ran"
        hooks = self.root / "hooks"
        hooks.mkdir()
        for name in ("pre-rebase", "pre-commit", "post-checkout"):
            hook = hooks / name
            hook.write_text(f"#!/bin/sh\ntouch '{marker}'\nexit 1\n")
            hook.chmod(0o755)
        self.git(self.repo, "config", "core.hooksPath", str(hooks))
        self.release()
        self.run_sync()
        self.assertFalse(marker.exists())
        self.assert_source_unchanged()


if __name__ == "__main__":
    unittest.main(verbosity=2)
