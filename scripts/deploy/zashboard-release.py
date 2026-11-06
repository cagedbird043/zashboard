#!/usr/bin/python3 -I
"""Sealed, serialized zashboard releases; installed root-owned in /usr/local/libexec.

Local/CI CLI: seal DIST SHA | verify DIST SHA.
Server CLI (administrative/testing only): [--root DIR] [--url URL]
[--resolve HOST:PORT:IP] [--head-url URL] fetch SHA | activate SHA | status.
The SSH wrapper exposes no configuration arguments. Production configuration is
/etc/zashboard-release.json (root-owned, not group/world writable), with optional
root, url, resolve, head_url keys. Defaults target /srv/zashboard, local HTTPS,
and the public GitHub singbox branch ref (checked fail-closed before switching).
CI sends a short-lived artifact descriptor over SSH stdin, never a GitHub token.
The server downloads one bounded ZIP in eight HTTPS ranges, verifies its digest,
then checks the sealed manifest before staging. No source or build runs here.
"""
import argparse
import contextlib
from concurrent.futures import ThreadPoolExecutor
import fcntl
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlsplit, quote
import uuid
import zipfile

SHA = re.compile(r"[0-9a-f]{40}\Z")
LEGACY = "cb8e896"
CONFIG = Path("/etc/zashboard-release.json")
DEFAULTS = {"root": "/srv/zashboard", "url": "https://board.cagedbird.cn", "resolve": "board.cagedbird.cn:443:127.0.0.1", "head_url": "https://api.github.com/repos/cagedbird043/zashboard/git/ref/heads/singbox"}
MAX_ARCHIVE = 64 * 1024 * 1024
MAX_UNPACKED = 128 * 1024 * 1024
ARTIFACT_HOST = re.compile(r"productionresultssa[0-9]+\.blob\.core\.windows\.net\Z")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha_value(value):
    require(isinstance(value, str) and SHA.fullmatch(value), "expected lowercase 40-character commit SHA")
    return value


def artifact_descriptor(data):
    require(len(data) <= 16384, "artifact descriptor too large")
    value = json.loads(data)
    require(isinstance(value, dict) and set(value) == {"url", "size", "sha256"}, "invalid artifact descriptor")
    require(type(value["size"]) is int and 0 < value["size"] <= MAX_ARCHIVE, "invalid archive size")
    require(isinstance(value["sha256"], str) and re.fullmatch(r"[0-9a-f]{64}", value["sha256"]), "invalid archive digest")
    require(isinstance(value["url"], str) and not any(ord(c) <= 32 or ord(c) == 127 for c in value["url"]), "invalid artifact URL")
    url = urlsplit(value["url"])
    require(url.scheme == "https" and ARTIFACT_HOST.fullmatch(url.netloc) and url.path.startswith("/actions-results/") and url.path.endswith(".zip") and url.query and not url.fragment, "untrusted artifact URL")
    return value


def download_artifact(descriptor, destination):
    # One CI ZIP only. Independent ranges avoid a single lossy Azure-to-China
    # TCP stream determining deployment time; redirects are deliberately refused.
    size = descriptor["size"]
    count = min(8, size)
    with tempfile.TemporaryDirectory(prefix=".ranges-", dir=destination.parent) as temporary:
        root = Path(temporary)

        def chunk(index):
            low, high = size * index // count, size * (index + 1) // count - 1
            body, headers = root / str(index), root / (str(index) + ".headers")
            command = ["/usr/bin/curl", "--fail", "--silent", "--show-error", "--noproxy", "*", "--proto", "=https", "--connect-timeout", "10", "--max-time", "120", "--max-filesize", str(high - low + 1), "--range", f"{low}-{high}", "--dump-header", str(headers), "--output", str(body), "--config", "-"]
            result = subprocess.run(command, input="url = " + json.dumps(descriptor["url"]) + "\n", text=True, capture_output=True)
            require(result.returncode == 0, "artifact range download failed")
            response = headers.read_text(encoding="iso-8859-1").lower().splitlines()
            require(response and re.fullmatch(r"http/\S+ 206(?: .*)?", response[0]), "artifact server must return partial content without redirect")
            ranges = [line.partition(":")[2].strip() for line in response if line.startswith("content-range:")]
            require(ranges == [f"bytes {low}-{high}/{size}"], "artifact Content-Range mismatch")
            require(body.stat().st_size == high - low + 1, "artifact range size mismatch")
            return body

        with ThreadPoolExecutor(max_workers=count) as pool:
            chunks = list(pool.map(chunk, range(count)))
        digest = hashlib.sha256()
        with destination.open("xb") as output:
            for path in chunks:
                with path.open("rb") as source:
                    while data := source.read(65536):
                        output.write(data)
                        digest.update(data)
        require(destination.stat().st_size == size and digest.hexdigest() == descriptor["sha256"], "artifact archive size/hash mismatch")


def safe_name(name):
    require(isinstance(name, str) and name and "\\" not in name and "\x00" not in name, "invalid manifest path")
    path = PurePosixPath(name)
    require(not path.is_absolute() and all(p not in ("", ".", "..") for p in name.split("/")), "unsafe manifest path")
    return name


def directory(path):
    require(path.is_dir() and not path.is_symlink(), f"not a real directory: {path}")
    require(path.absolute() == path.resolve(), f"directory has a symlink ancestor: {path}")
    return path


def inventory(root):
    directory(root)
    files = {}
    for parent, dirs, names in os.walk(root, followlinks=False):
        for name in dirs + names:
            path = Path(parent) / name
            mode = path.lstat().st_mode
            require(stat.S_ISDIR(mode) or stat.S_ISREG(mode), f"non-regular release entry: {path}")
            if stat.S_ISREG(mode):
                require(path.stat().st_nlink == 1, f"hard-linked release entry: {path}")
                relative = safe_name(path.relative_to(root).as_posix())
                if relative != "release.json":
                    files[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    return dict(sorted(files.items()))


class Entrypoints(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("src"):
            self.paths.append(attrs["src"])
        if tag == "link" and "stylesheet" in attrs.get("rel", "").lower().split():
            require(bool(attrs.get("href")), "stylesheet without href")
            self.paths.append(attrs["href"])


def entries(root, files):
    require("index.html" in files, "missing index.html")
    parser = Entrypoints()
    parser.feed((root / "index.html").read_text(encoding="utf-8"))
    result = ["index.html"]
    for value in parser.paths:
        url = urlsplit(value)
        require(not url.scheme and not url.netloc and not url.fragment, "entrypoint must be a local resource")
        name = safe_name(PurePosixPath(unquote(url.path).removeprefix("/")).as_posix())
        require(name in files, f"missing entrypoint: {name}")
        result.append(name)
    require(len(result) > 1, "index.html has no script/css entrypoints")
    return list(dict.fromkeys(result))


def read_json(path):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "duplicate JSON key")
            result[key] = value
        return result
    require(path.is_file() and not path.is_symlink(), f"not a regular JSON file: {path}")
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=pairs)


def seal(root, commit):
    sha_value(commit)
    files = inventory(root)
    entries(root, files)
    manifest = {"commit": commit, "files": files}
    (root / "release.json").write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return verify(root, commit)


def verify(root, commit):
    sha_value(commit)
    files = inventory(root)
    manifest = read_json(root / "release.json")
    require(isinstance(manifest, dict) and set(manifest) == {"commit", "files"}, "invalid manifest schema")
    require(manifest["commit"] == commit, "release commit mismatch")
    require(isinstance(manifest["files"], dict), "invalid manifest files")
    for name, digest in manifest["files"].items():
        safe_name(name)
        require(name != "release.json" and isinstance(digest, str) and re.fullmatch(r"[0-9a-f]{64}", digest), "invalid manifest digest")
    require(files == manifest["files"], "release file inventory/hash mismatch")
    entries(root, files)
    return manifest


class Releases:
    def __init__(self, root, url, resolve="", head_url=DEFAULTS["head_url"]):
        self.root = directory(Path(root).absolute())
        self.url = url.rstrip("/")
        require(urlsplit(self.url).scheme in ("https", "http"), "invalid health URL")
        self.resolve = resolve
        require(urlsplit(head_url).scheme in ("https", "http"), "invalid branch head URL")
        self.head_url = head_url

    @contextlib.contextmanager
    def lock(self):
        fd = os.open(self.root / ".deploy.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            for name in ("incoming", "releases"):
                path = self.root / name
                path.mkdir(exist_ok=True)
                directory(path)
            yield
        finally:
            os.close(fd)

    def pointer(self, name):
        path = self.root / name
        if not path.is_symlink():
            require(not path.exists(), f"{name} is not a symlink")
            return None
        target = os.readlink(path)
        require(re.fullmatch(r"releases/([0-9a-f]{40}|" + LEGACY + r")", target), f"unsafe {name} target")
        directory(self.root / target)
        return target

    def point(self, name, target):
        temp = self.root / ("." + name + "-" + uuid.uuid4().hex)
        try:
            temp.symlink_to(target)
            os.replace(temp, self.root / name)
        finally:
            temp.unlink(missing_ok=True)

    def install_archive(self, archive, commit):
        sha_value(commit)
        with tempfile.TemporaryDirectory(prefix=".extract-", dir=self.root / "incoming") as temporary:
            unpacked = Path(temporary) / "release"
            unpacked.mkdir()
            with zipfile.ZipFile(archive) as package:
                items = package.infolist()
                require(0 < len(items) <= 10000 and sum(item.file_size for item in items) <= MAX_UNPACKED, "artifact unpacked size/count exceeded")
                names = set()
                for item in items:
                    name = safe_name(item.filename.rstrip("/") if item.is_dir() else item.filename)
                    require(name not in names, "duplicate ZIP path")
                    names.add(name)
                    mode = stat.S_IFMT(item.external_attr >> 16)
                    require(mode in (0, stat.S_IFDIR if item.is_dir() else stat.S_IFREG) and not item.flag_bits & 1, "non-regular/encrypted ZIP entry")
                    path = unpacked / name
                    if item.is_dir():
                        path.mkdir(parents=True, exist_ok=True)
                    else:
                        path.parent.mkdir(parents=True, exist_ok=True)
                        with package.open(item) as source, path.open("xb") as output:
                            shutil.copyfileobj(source, output, 65536)
            verify(unpacked, commit)
            stage = self.root / "incoming" / commit
            if stage.exists() or stage.is_symlink():
                directory(stage)
                inventory(stage)
                shutil.rmtree(stage)
            unpacked.rename(stage)
        return {"staged": commit}

    def fetch_artifact(self, commit, descriptor):
        with tempfile.TemporaryDirectory(prefix=".artifact-", dir=self.root / "incoming") as temporary:
            archive = Path(temporary) / "artifact.zip"
            download_artifact(descriptor, archive)
            return self.install_archive(archive, commit)

    def snapshot(self, target):
        root = self.root / target
        name = Path(target).name
        if name != LEGACY:
            return verify(root, name)
        files = inventory(root)
        entries(root, files)
        return {"commit": LEGACY, "files": files}

    def fetch(self, name):
        args = ["/usr/bin/curl", "--fail", "--silent", "--show-error", "--noproxy", "*", "--connect-timeout", "5", "--max-time", "20"]
        if self.resolve:
            args += ["--resolve", self.resolve]
        args += ["--header", "Cache-Control: no-cache", self.url + "/" + quote(name, safe="/") + "?deploy-check=" + uuid.uuid4().hex]
        return subprocess.run(args, check=True, stdout=subprocess.PIPE).stdout

    def check_head(self, commit):
        result = subprocess.run(["/usr/bin/curl", "--fail", "--silent", "--show-error", "--noproxy", "*", "--connect-timeout", "5", "--max-time", "20", "--header", "Accept: application/vnd.github+json", "--header", "Cache-Control: no-cache", "--user-agent", "zashboard-release", self.head_url], check=True, stdout=subprocess.PIPE)
        head = json.loads(result.stdout)
        require(isinstance(head, dict) and isinstance(head.get("object"), dict) and head["object"].get("sha") == commit, "stale deployment: commit is not the singbox branch head")

    def healthy(self, target, manifest):
        root = self.root / target
        if manifest["commit"] != LEGACY:
            require(self.fetch("release.json") == (root / "release.json").read_bytes(), "served release metadata mismatch")
        for name in entries(root, manifest["files"]):
            require(hashlib.sha256(self.fetch(name)).hexdigest() == manifest["files"][name], f"served resource mismatch: {name}")

    def activate(self, commit):
        sha_value(commit)
        stage = self.root / "incoming" / commit
        release = self.root / "releases" / commit
        current = self.pointer("current")
        self.pointer("previous")
        old = self.snapshot(current) if current else None
        if release.exists() or release.is_symlink():
            manifest = verify(release, commit)
            if stage.exists() or stage.is_symlink():
                require(verify(stage, commit) == manifest, "immutable release differs from staging")
        else:
            manifest = verify(stage, commit)
            stage.rename(release)
        self.check_head(commit)
        target = "releases/" + commit
        if current == target:
            self.healthy(target, manifest)
            return {"current": target, "unchanged": True}
        self.point("current", target)
        try:
            self.healthy(target, manifest)
        except Exception as error:
            if current:
                self.point("current", current)
                try:
                    self.healthy(current, old)
                except Exception as rollback_error:
                    raise RuntimeError(f"activation failed: {error}; restored link but rollback health failed: {rollback_error}") from error
            else:
                (self.root / "current").unlink()
            raise RuntimeError(f"activation failed and rolled back: {error}") from error
        if current:
            self.point("previous", current)
        self.cleanup()
        return {"current": target, "previous": current}

    def cleanup(self):
        protected = {self.pointer("current"), self.pointer("previous")}
        releases = self.root / "releases"
        candidates = [p for p in releases.iterdir() if SHA.fullmatch(p.name) and p.is_dir() and not p.is_symlink()]
        candidates.sort(key=lambda p: p.stat().st_mtime_ns, reverse=True)
        for path in candidates[5:]:
            if "releases/" + path.name not in protected:
                directory(path)
                shutil.rmtree(path)

    def status(self):
        return {"current": self.pointer("current"), "previous": self.pointer("previous")}


def production():
    config = dict(DEFAULTS)
    if CONFIG.exists() or CONFIG.is_symlink():
        mode = CONFIG.lstat()
        require(stat.S_ISREG(mode.st_mode) and mode.st_uid == 0 and not mode.st_mode & 0o022, "unsafe server configuration permissions")
        value = read_json(CONFIG)
        require(isinstance(value, dict) and set(value) <= set(DEFAULTS), "unknown server configuration key")
        require(all(isinstance(v, str) for v in value.values()), "invalid server configuration value")
        config.update(value)
    return Releases(**config)


def ignore_disconnect():
    # Once activation starts, cancellation of the SSH transport cannot strand a
    # new current without its health check / rollback. All network checks time out.
    for sig in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, signal.SIG_IGN)


def dispatch(command, server=None):
    server = server or production()
    if command == "status":
        with server.lock():
            return server.status()
    match = re.fullmatch(r"(fetch|activate) ([0-9a-f]{40})", command)
    require(match is not None, "SSH command denied")
    descriptor = artifact_descriptor(sys.stdin.buffer.read(16385)) if match[1] == "fetch" else None
    ignore_disconnect()
    with server.lock():
        if descriptor is not None:
            return server.fetch_artifact(match[2], descriptor)
        return server.activate(match[2])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default=DEFAULTS["root"])
    parser.add_argument("--url", default=DEFAULTS["url"])
    parser.add_argument("--resolve", default=DEFAULTS["resolve"])
    parser.add_argument("command", choices=("seal", "verify", "fetch", "activate", "status"))
    parser.add_argument("--head-url", default=DEFAULTS["head_url"])
    parser.add_argument("args", nargs="*")
    args = parser.parse_args()
    if args.command in ("seal", "verify"):
        require(len(args.args) == 2, "expected DIST SHA")
        result = globals()[args.command](Path(args.args[0]).absolute(), args.args[1])
    else:
        require(len(args.args) == (0 if args.command == "status" else 1), "invalid argument count")
        ignore_disconnect()
        server = Releases(args.root, args.url, args.resolve, args.head_url)
        with server.lock():
            result = server.fetch_artifact(args.args[0], artifact_descriptor(sys.stdin.buffer.read(16385))) if args.command == "fetch" else getattr(server, args.command)(*args.args)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError, zipfile.BadZipFile) as error:
        sys.exit(str(error))
