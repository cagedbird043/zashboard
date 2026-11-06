#!/usr/bin/env python3
"""Artifact descriptor, real HTTPS ranges, and hostile ZIP regression checks."""
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import ssl
import stat
import subprocess
import threading
import unittest
import warnings
import zipfile

import test_deploy as protocol

API = protocol.API
A = protocol.A


class Ranges(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        data = self.server.payload
        low, high = map(int, re.fullmatch(r"bytes=(\d+)-(\d+)", self.headers["Range"]).groups())
        self.server.requests.append((low, high))
        mode = self.server.mode
        if mode == "redirect":
            self.send_response(302)
            self.send_header("Location", "http://127.0.0.1/private")
            self.end_headers()
            return
        self.send_response(200 if mode == "whole" else 206)
        self.send_header("Content-Range", f"bytes {low}-{high}/{len(data) + (mode == 'range')}")
        body = data[low:high + 1]
        if mode == "short":
            body = body[:-1]
        if mode == "hash" and body:
            body = bytes([body[0] ^ 1]) + body[1:]
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class ArtifactChecks(unittest.TestCase):
    def setUp(self):
        self.case = protocol.DeploymentChecks()
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.root, self.server = self.case.root, self.case.server

    def descriptor(self):
        return {"url": "https://productionresultssa7.blob.core.windows.net/actions-results/test/artifacts/test.zip?sig=short-lived", "size": 100, "sha256": "0" * 64}

    def test_descriptor_restricts_url_and_archive_metadata(self):
        value = self.descriptor()
        self.assertEqual(API["artifact_descriptor"](json.dumps(value)), value)
        urls = ["http://productionresultssa7.blob.core.windows.net/actions-results/test.zip?sig=x", "https://evil.blob.core.windows.net/actions-results/test.zip?sig=x", "https://productionresultssa7.blob.core.windows.net.evil.test/actions-results/test.zip?sig=x", "https://user@productionresultssa7.blob.core.windows.net/actions-results/test.zip?sig=x", "https://productionresultssa7.blob.core.windows.net:443/actions-results/test.zip?sig=x", value["url"] + "#fragment", value["url"] + "\n", value["url"].replace("/actions-results/", "/other/")]
        for url in urls:
            with self.subTest(url=url), self.assertRaises(ValueError):
                API["artifact_descriptor"](json.dumps(dict(value, url=url)))
        for key, bad in (("size", 0), ("size", True), ("size", API["MAX_ARCHIVE"] + 1), ("sha256", "x" * 64), ("url", 1)):
            with self.subTest(key=key, value=bad), self.assertRaises(ValueError):
                API["artifact_descriptor"](json.dumps(dict(value, **{key: bad})))
        with self.assertRaises(ValueError):
            API["artifact_descriptor"](" " * 16385)
        with self.assertRaises(ValueError):
            API["artifact_descriptor"](json.dumps(dict(value, token="never accepted")))

    def test_real_https_ranges_and_transport_failures(self):
        key, cert = self.root / "key.pem", self.root / "cert.pem"
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(key), "-out", str(cert), "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-days", "1"], check=True, capture_output=True)
        http = ThreadingHTTPServer(("127.0.0.1", 0), Ranges)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert, key)
        http.socket = context.wrap_socket(http.socket, server_side=True)
        http.payload = os.urandom(32771)
        http.requests = []
        http.mode = "ok"
        worker = threading.Thread(target=http.serve_forever, daemon=True)
        worker.start()
        before = os.environ.get("CURL_CA_BUNDLE")
        os.environ["CURL_CA_BUNDLE"] = str(cert)
        try:
            # URL policy is tested separately; exercise the actual curl/TLS and
            # range assembly against an isolated, certificate-verified fixture.
            descriptor = {"url": f"https://127.0.0.1:{http.server_port}/artifact", "size": len(http.payload), "sha256": hashlib.sha256(http.payload).hexdigest()}
            output = self.root / "download.zip"
            API["download_artifact"](descriptor, output)
            self.assertEqual(output.read_bytes(), http.payload)
            self.assertEqual(len(http.requests), 8)
            ordered = sorted(http.requests)
            self.assertEqual(ordered[0][0], 0)
            self.assertEqual(ordered[-1][1], len(http.payload) - 1)
            self.assertTrue(all(a[1] + 1 == b[0] for a, b in zip(ordered, ordered[1:])))
            for mode in ("redirect", "whole", "range", "short", "hash"):
                output.unlink(missing_ok=True)
                http.mode = mode
                with self.subTest(mode=mode), self.assertRaises(ValueError):
                    API["download_artifact"](descriptor, output)
                self.assertEqual(list(self.root.glob(".ranges-*")), [])
        finally:
            if before is None:
                os.environ.pop("CURL_CA_BUNDLE", None)
            else:
                os.environ["CURL_CA_BUNDLE"] = before
            http.shutdown()
            http.server_close()
            worker.join()

    def test_zip_rejects_escape_symlink_duplicates_and_tampering(self):
        source = self.case.fixture(self.root / "source", A)
        API["seal"](source, A)
        archive = self.case.archive(source)
        for name in ("../outside", "/absolute", "assets/../outside", "assets\\outside"):
            self.case.archive(source)
            with zipfile.ZipFile(archive, "a") as package:
                package.writestr(name, "bad")
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.server.install_archive(archive, A)
        self.case.archive(source)
        with zipfile.ZipFile(archive, "a") as package:
            link = zipfile.ZipInfo("link")
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            package.writestr(link, "/etc/passwd")
        with self.assertRaises(ValueError):
            self.server.install_archive(archive, A)
        self.case.archive(source)
        with zipfile.ZipFile(archive, "a") as package:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                package.writestr("index.html", "duplicate")
        with self.assertRaises(ValueError):
            self.server.install_archive(archive, A)
        (source / "assets/main.js").write_text("tampered after seal")
        self.case.archive(source)
        with self.assertRaisesRegex(ValueError, "inventory/hash"):
            self.server.install_archive(archive, A)
        self.assertFalse((self.root / "incoming" / A).exists())
        self.assertEqual(os.readlink(self.root / "current"), "releases/cb8e896")
        self.assertEqual(list((self.root / "incoming").glob(".extract-*")), [])

    def test_zip_rejects_oversized_expansion_and_unsafe_stage(self):
        archive = self.root / "large.zip"
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as package:
            with package.open("bomb", "w") as output:
                for _ in range(129):
                    output.write(b"0" * 1024 * 1024)
        with self.assertRaisesRegex(ValueError, "size/count"):
            self.server.install_archive(archive, A)
        source = self.case.fixture(self.root / "source", A)
        API["seal"](source, A)
        archive = self.case.archive(source)
        (self.root / "incoming" / A).symlink_to(self.root / "releases/cb8e896")
        with self.assertRaises(ValueError):
            self.server.install_archive(archive, A)
        self.assertEqual(os.readlink(self.root / "current"), "releases/cb8e896")


if __name__ == "__main__":
    unittest.main()
