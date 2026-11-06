#!/usr/bin/python3
"""Real filesystem + HTTP + sealed ZIP protocol checks; python3 scripts/deploy/test_deploy.py."""
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import runpy
import shlex
import signal
import subprocess
import sys
import tempfile
import threading
import unittest
import zipfile

SCRIPT = Path(__file__).resolve()
RELEASE = SCRIPT.with_name("zashboard-release.py")
API = runpy.run_path(str(RELEASE))
A, B = "a" * 40, "b" * 40


if len(sys.argv) > 1 and sys.argv[1] == "--client-ssh":
    root, url = sys.argv[2:4]
    args = sys.argv[4:]
    while args and args[0] in ("-o", "-n"):
        args = args[2:] if args[0] == "-o" else args[1:]
    args = args[1:]  # SSH config target
    command = args[0] if len(args) == 1 else shlex.join(args)
    with (Path(root) / "ssh-audit").open("a") as audit:
        audit.write(command + "\n")
    try:
        server = API["Releases"](root, url, "", url + "/head")
        if command == "fetch " + A:
            # The SSH boundary is local in this integration test; the real
            # HTTPS range downloader is exercised separately in test_artifact.py.
            with server.lock():
                server.install_archive(Path(sys.stdin.readline().strip()), A)
        else:
            API["dispatch"](command, server)
    except Exception as error:
        sys.exit(str(error))
    sys.exit(0)


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path == "/head":
            if self.server.head_sha is None:
                self.send_error(503)
                return
            body = json.dumps({"object": {"sha": self.server.head_sha}}).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.server.pause_commit and os.readlink(self.server.root / "current") == "releases/" + self.server.pause_commit:
            self.server.check_started.set()
            self.server.check_continue.wait(10)
        if self.server.fail_commit and os.readlink(self.server.root / "current") == "releases/" + self.server.fail_commit:
            self.send_error(503)
            return
        super().do_GET()


class DeploymentChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "releases").mkdir()
        old = self.root / "releases" / "cb8e896"
        self.fixture(old, "legacy")
        (self.root / "current").symlink_to("releases/cb8e896")
        self.http = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(self.root / "current")))
        self.http.root = self.root
        self.http.fail_commit = None
        self.http.head_sha = A
        self.http.pause_commit = None
        self.http.check_started = threading.Event()
        self.http.check_continue = threading.Event()
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_http)
        self.url = f"http://127.0.0.1:{self.http.server_port}"
        self.server = API["Releases"](self.root, self.url, "", self.url + "/head")
        with self.server.lock():
            pass

    def stop_http(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()

    @staticmethod
    def fixture(path, text):
        path.mkdir(parents=True)
        (path / "assets").mkdir()
        (path / "index.html").write_text('<html><link rel="stylesheet" href="./assets/main.css"><script type="module" src="./assets/main.js"></script></html>')
        (path / "assets/main.js").write_text(text)
        (path / "assets/main.css").write_text("body { color: blue }")
        return path

    def stage(self, sha=A):
        path = self.fixture(self.root / "incoming" / sha, sha)
        API["seal"](path, sha)
        return path

    def activate(self, sha=A):
        with self.server.lock():
            return self.server.activate(sha)

    def test_seal_and_cli_verify(self):
        stage = self.stage()
        result = subprocess.run([sys.executable, str(SCRIPT.with_name("seal.py")), "--verify", str(stage), A], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(API["verify"](stage, A)["commit"], A)
        (stage / "assets/main.js").write_text("tamper")
        with self.assertRaisesRegex(ValueError, "inventory/hash"):
            API["verify"](stage, A)

    def test_extra_and_symlink_and_hardlink_rejected(self):
        stage = self.stage()
        (stage / "extra").write_text("extra")
        with self.assertRaises(ValueError):
            API["verify"](stage, A)
        (stage / "extra").unlink()
        (stage / "extra").symlink_to("/etc/passwd")
        with self.assertRaises(ValueError):
            API["verify"](stage, A)
        with self.assertRaises(ValueError):
            API["seal"](stage, A)
        (stage / "extra").unlink()
        os.link(stage / "assets/main.js", stage / "extra")
        with self.assertRaises(ValueError):
            API["verify"](stage, A)

    def test_manifest_and_entrypoint_validation(self):
        stage = self.stage()
        manifest = json.loads((stage / "release.json").read_text())
        manifest["files"]["../secret"] = "0" * 64
        (stage / "release.json").write_text(json.dumps(manifest))
        with self.assertRaises(ValueError):
            API["verify"](stage, A)
        (stage / "index.html").write_text('<script src="/missing.js"></script>')
        with self.assertRaisesRegex(ValueError, "missing entrypoint"):
            API["seal"](stage, A)
        (stage / "index.html").write_text('<script src="/%2e%2e/secret"></script>')
        with self.assertRaises(ValueError):
            API["seal"](stage, A)

    def test_switch_and_idempotency_and_immutability(self):
        self.stage()
        self.activate()
        self.assertEqual(os.readlink(self.root / "current"), "releases/" + A)
        self.assertEqual(os.readlink(self.root / "previous"), "releases/cb8e896")
        self.assertTrue(self.activate()["unchanged"])
        stage = self.stage()
        (stage / "assets/main.js").write_text("different, sealed but immutable")
        API["seal"](stage, A)
        with self.assertRaisesRegex(ValueError, "immutable"):
            self.activate()
        self.assertEqual((self.root / "releases" / A / "assets/main.js").read_text(), A)

    def test_automatic_rollback_and_retained_release(self):
        self.stage()
        self.activate()
        self.stage(B)
        self.http.head_sha = B
        self.http.fail_commit = B
        with self.assertRaisesRegex(RuntimeError, "rolled back"):
            self.activate(B)
        self.assertEqual(os.readlink(self.root / "current"), "releases/" + A)
        self.assertEqual(os.readlink(self.root / "previous"), "releases/cb8e896")
        self.assertTrue((self.root / "releases" / B).is_dir())
        self.http.fail_commit = None
        self.activate(B)
        self.assertEqual(os.readlink(self.root / "previous"), "releases/" + A)

    def test_legacy_rollback(self):
        self.stage()
        self.http.fail_commit = A
        with self.assertRaisesRegex(RuntimeError, "rolled back"):
            self.activate()
        self.assertEqual(os.readlink(self.root / "current"), "releases/cb8e896")

    def test_disconnect_during_health_check_still_rolls_back(self):
        self.stage()
        self.http.pause_commit = A
        self.http.fail_commit = A
        command = [sys.executable, str(RELEASE), "--root", str(self.root), "--url", self.url, "--resolve", "", "--head-url", self.url + "/head", "activate", A]
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            self.assertTrue(self.http.check_started.wait(5), "activation never reached HTTP health check")
            process.send_signal(signal.SIGHUP)
            process.send_signal(signal.SIGTERM)
            self.http.check_continue.set()
            _, error = process.communicate(timeout=10)
            self.assertEqual(process.returncode, 1, error.decode())
            self.assertIn(b"rolled back", error)
            self.assertEqual(os.readlink(self.root / "current"), "releases/cb8e896")
        finally:
            self.http.check_continue.set()
            if process.poll() is None:
                process.kill()
                process.communicate()

    def test_stale_head_and_unavailable_api_fail_closed(self):
        self.stage()
        for head in (B, None):
            self.http.head_sha = head
            with self.assertRaises((ValueError, subprocess.CalledProcessError)):
                self.activate()
            self.assertEqual(os.readlink(self.root / "current"), "releases/cb8e896")

    def test_stale_and_suspicious_paths(self):
        for value in ("../outside", A + "/../", A.upper(), "0" * 39):
            with self.assertRaises(ValueError):
                self.activate(value)
        with self.assertRaises((ValueError, FileNotFoundError)):
            self.activate()
        (self.root / "incoming" / A).symlink_to(self.root / "releases" / "cb8e896")
        with self.assertRaises(ValueError):
            self.activate()
        (self.root / "current").unlink()
        (self.root / "current").symlink_to("../outside")
        with self.assertRaises(ValueError):
            self.server.status()

    def test_dispatcher_denies_shell_rsync_and_outside_fetch(self):
        for command in ("", "sh", "status; id", "status extra", f"activate {A}; id", f"activate {A} --root /", f"fetch {A}/../", f"fetch {A} --url https://example.com", f"prepare {A}", f"rsync --server -logDtprze.iLsfxCIvu --delete --safe-links . {A}/"):
            with self.subTest(command=command), self.assertRaises(ValueError):
                API["dispatch"](command, self.server)
        self.assertEqual(API["dispatch"]("status", self.server)["current"], "releases/cb8e896")


    def archive(self, source):
        archive = self.root / "artifact.zip"
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as package:
            for path in source.rglob("*"):
                if path.is_file():
                    package.write(path, path.relative_to(source))
        return archive

    def test_real_zip_stage_and_repeat(self):
        source = self.fixture(self.root / "source", A)
        API["seal"](source, A)
        archive = self.archive(source)
        for _ in range(2):
            with self.server.lock():
                self.server.install_archive(archive, A)
            self.assertEqual(API["verify"](self.root / "incoming" / A, A)["commit"], A)
        self.activate()
        self.assertEqual(os.readlink(self.root / "current"), "releases/" + A)

    def test_client_verifies_then_deploys_without_resealing(self):
        source = self.fixture(self.root / "source", A)
        API["seal"](source, A)
        archive = self.archive(source)
        binary = self.root / "bin"
        binary.mkdir()
        ssh = binary / "ssh"
        ssh.write_text("#!/bin/sh\nexec " + shlex.join([sys.executable, str(SCRIPT), "--client-ssh", str(self.root), self.url]) + ' "$@"\n')
        ssh.chmod(0o755)
        env = dict(os.environ, PATH=str(binary) + os.pathsep + os.environ["PATH"])
        command = ["bash", str(SCRIPT.with_name("deploy.sh")), str(source), A, "fixture"]
        result = subprocess.run(command, input=str(archive) + "\n", env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(os.readlink(self.root / "current"), "releases/" + A)
        self.assertEqual((self.root / "ssh-audit").read_text().splitlines(), ["fetch " + A, "activate " + A])
        self.assertIn("Fetching validated artifact for release " + A, result.stdout)
        self.assertIn("Activating and checking release " + A, result.stdout)
        archive.write_bytes(b"corrupt transport archive")
        result = subprocess.run(command, input=str(archive) + "\n", env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / "ssh-audit").read_text().splitlines(), ["fetch " + A, "activate " + A, "fetch " + A])
        self.assertNotIn("Activating and checking", result.stdout)
        before = (source / "release.json").read_bytes()
        audit = (self.root / "ssh-audit").read_text()
        (source / "assets/main.js").write_text("corrupt after CI seal")
        result = subprocess.run(command, input=str(archive) + "\n", env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((source / "release.json").read_bytes(), before)
        self.assertEqual((self.root / "ssh-audit").read_text(), audit)

    def test_cleanup_preserves_current_previous_and_unknown(self):
        self.stage()
        self.activate()
        for number in range(8):
            path = self.root / "releases" / f"{number:040x}"
            path.mkdir()
        unknown = self.root / "releases" / "old-original"
        unknown.mkdir()
        linked = self.root / "releases" / ("f" * 40)
        linked.symlink_to(unknown)
        with self.server.lock():
            self.server.cleanup()
        self.assertTrue((self.root / "releases" / A).is_dir())
        self.assertTrue((self.root / "releases" / "cb8e896").is_dir())
        self.assertTrue(unknown.is_dir())
        self.assertTrue(linked.is_symlink())
        self.assertLessEqual(sum(p.is_dir() and not p.is_symlink() and API["SHA"].fullmatch(p.name) is not None for p in (self.root / "releases").iterdir()), 6)


if __name__ == "__main__":
    # Keep the existing CI entrypoint covering the new transport as well.
    from test_artifact import ArtifactChecks
    unittest.main()
