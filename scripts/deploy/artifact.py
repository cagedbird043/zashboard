#!/usr/bin/env python3
"""Emit a short-lived descriptor for the exact all-fonts artifact to SSH stdin."""
import json
import os
from pathlib import Path
import runpy
import sys
import urllib.error
import urllib.request

API = "https://api.github.com/repos/cagedbird043/zashboard"
release = runpy.run_path(str(Path(__file__).with_name("zashboard-release.py")))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_):
        return None


def descriptor(run_id, commit):
    release["sha_value"](commit)
    release["require"](run_id.isdecimal(), "invalid artifact run ID")
    headers = {"Authorization": "Bearer " + os.environ["GH_TOKEN"], "Accept": "application/vnd.github+json", "User-Agent": "zashboard-deploy"}
    request = urllib.request.Request(f"{API}/actions/runs/{run_id}/artifacts?name=zashboard-all&per_page=100", headers=headers)
    with urllib.request.urlopen(request, timeout=20) as response:
        artifacts = json.load(response)["artifacts"]
    artifacts = [item for item in artifacts if item["name"] == "zashboard-all" and not item["expired"]]
    release["require"](len(artifacts) == 1, "expected one unexpired all-fonts artifact")
    artifact = artifacts[0]
    release["require"](artifact["workflow_run"]["head_sha"] == commit and str(artifact["workflow_run"]["id"]) == run_id, "artifact run/commit mismatch")
    digest = artifact["digest"]
    release["require"](isinstance(digest, str) and digest.startswith("sha256:"), "missing artifact SHA256")
    request = urllib.request.Request(f"{API}/actions/artifacts/{artifact['id']}/zip", headers=headers)
    try:
        urllib.request.build_opener(NoRedirect).open(request, timeout=20)
    except urllib.error.HTTPError as error:
        release["require"](error.code == 302, "artifact download did not redirect")
        value = {"url": error.headers["Location"], "size": artifact["size_in_bytes"], "sha256": digest.removeprefix("sha256:")}
        return release["artifact_descriptor"](json.dumps(value))
    raise ValueError("artifact download did not redirect")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("usage: artifact.py RUN_ID COMMIT")
        print(json.dumps(descriptor(*sys.argv[1:])))
    except Exception:
        # HTTP errors may contain signed URLs. Neither URLs nor tokens belong in CI logs.
        sys.exit("Could not resolve the validated artifact descriptor")
