#!/usr/bin/env python3
"""Exercise real API replicas and the checked-in Traefik pool in isolation.

Requires Go, PostgreSQL binaries, redis-server/redis-cli, and Traefik on PATH.
Never reads .env or contacts an existing database. Logs remain under tmp/.
"""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main():
    for tool in ("go", "initdb", "postgres", "createdb", "pg_isready", "redis-server", "redis-cli", "traefik"):
        if not shutil.which(tool):
            raise RuntimeError(f"Missing executable: {tool}")
    (ROOT / "tmp").mkdir(exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="load-balancing-", dir=ROOT / "tmp"))
    print(f"Test logs: {work}", flush=True)
    processes, logs = {}, []
    # Use only OS essentials, excluding application credentials from the caller.
    env = {k: os.environ[k] for k in ("PATH", "HOME", "TMPDIR", "SYSTEMROOT") if k in os.environ}
    env["LC_ALL"] = "C"
    ports = []
    while len(ports) < 9:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
            if port not in ports:
                ports.append(port)
    pg, redis, api, replica, worker, gateway, api_metrics, replica_metrics, worker_metrics = ports

    def run(*args, extra=None):
        return subprocess.run(args, cwd=ROOT / "backend", env=env | (extra or {}),
                              check=True, capture_output=True, text=True).stdout.strip()

    def start(name, *args, extra=None):
        log = (work / f"{name}.log").open("a")
        logs.append(log)
        processes[name] = subprocess.Popen(args, cwd=ROOT / "backend", env=env | (extra or {}),
                                           stdout=log, stderr=subprocess.STDOUT)

    def stop(name):
        process = processes.pop(name, None)
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

    def wait_for(check, description):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            try:
                if check():
                    return
            except (OSError, subprocess.CalledProcessError):
                pass
            time.sleep(0.2)
        raise AssertionError(f"Timed out: {description}; inspect {work}")

    def request(port, path="/ready", data=None, headers=None):
        body = json.dumps(data).encode() if data is not None else None
        req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=body,
                                     headers={"Content-Type": "application/json"} | (headers or {}))
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status, response.read(), response.headers
        except urllib.error.HTTPError as error:
            return error.code, error.read(), error.headers

    def traffic(count=20, headers=None):
        path = "/api/v1/me/" if headers else "/api/v1/stats"
        for _ in range(count):
            status, body, _ = request(gateway, path, headers=headers)
            assert status == 200, (status, body)

    def backends_since(offset):
        rows = (work / "gateway.log").read_text()[offset:].splitlines()
        return {row["ServiceURL"] for line in rows if line.startswith("{")
                for row in [json.loads(line)] if row.get("RequestPath", "").startswith("/api/v1/")
                and row.get("ServiceURL")}

    try:
        run("initdb", "-D", str(work / "pg"), "-U", "unity", "-A", "trust", "--no-locale", "-E", "UTF8")
        start("postgres", "postgres", "-D", str(work / "pg"), "-h", "127.0.0.1", "-p", str(pg), "-k", str(work))
        start("redis", "redis-server", "--bind", "127.0.0.1", "--port", str(redis), "--save", "", "--appendonly", "no")
        wait_for(lambda: run("pg_isready", "-h", "127.0.0.1", "-p", str(pg), "-U", "unity"), "PostgreSQL")
        wait_for(lambda: run("redis-cli", "-p", str(redis), "ping") == "PONG", "Redis")
        run("createdb", "-h", "127.0.0.1", "-p", str(pg), "-U", "unity", "unity_lb_test")
        app_env = {
            "APP_ENV": "development", "DATABASE_URL": f"postgres://unity@127.0.0.1:{pg}/unity_lb_test?sslmode=disable",
            "DATABASE_MAX_CONN": "4", "REDIS_ADDR": f"127.0.0.1:{redis}", "JWT_SECRET": "isolated-load-balancing-test-secret",
            "BCRYPT_COST": "4", "PAYMENT_PROVIDER": "mock", "UPLOAD_DIR": str(work / "uploads"),
        }
        print("Building API and applying test migrations...", flush=True)
        run("go", "build", "-o", str(work / "server"), "./cmd/server")
        run("go", "run", "./cmd/migrate", "up", extra=app_env)
        run("go", "test", "-tags=integration", "./internal/registrations", "-run", "^TestLockReleasePreservesNewOwner$", "-count=1",
            extra=app_env | {"REDIS_TEST_ADDR": f"127.0.0.1:{redis}"})
        for name, port, metrics_port in (("api", api, api_metrics), ("replica", replica, replica_metrics)):
            start(name, str(work / "server"), extra=app_env | {
                "PORT": str(port), "METRICS_PORT": str(metrics_port), "PROCESS_ROLE": "api"})
            wait_for(lambda p=port: request(p)[0] == 200, name)
        assert run("redis-cli", "-p", str(redis), "exists", "notifications:worker:heartbeat") == "0", "API started background jobs"
        start("worker", str(work / "server"), extra=app_env | {
            "PORT": str(worker), "METRICS_PORT": str(worker_metrics), "PROCESS_ROLE": "worker"})
        wait_for(lambda: request(worker)[0] == 200, "worker")
        wait_for(lambda: run("redis-cli", "-p", str(redis), "exists", "notifications:worker:heartbeat") == "1", "worker heartbeat")
        assert request(worker, "/api/v1/stats")[0] == 404
        config = (ROOT / "deploy/traefik/api.yml").read_text()
        config = config.replace("http://api:8080", f"http://127.0.0.1:{api}")
        config = config.replace("http://api-replica:8080", f"http://127.0.0.1:{replica}")
        (work / "api.yml").write_text(config)
        start("gateway", "traefik", f"--entrypoints.api.address=127.0.0.1:{gateway}",
              f"--providers.file.filename={work / 'api.yml'}", "--accesslog=true", "--accesslog.format=json", "--log.format=json")
        wait_for(lambda: request(gateway)[0] == 200, "gateway")
        traffic()
        expected = {f"http://127.0.0.1:{api}", f"http://127.0.0.1:{replica}"}
        wait_for(lambda: backends_since(0) == expected, "traffic reaching both replicas")
        print("PASS: traffic reaches both API instances; only the worker runs background jobs", flush=True)

        status, body, headers = request(gateway, "/api/v1/auth/register", {
            "email": "lb-test@example.com", "password": "test-password-123", "full_name": "Load Balancing Test"})
        assert status == 201, (status, body)
        token = json.loads(body)["data"]["access_token"]
        traffic(headers={"Authorization": f"Bearer {token}"})
        # Refresh a session issued via the gateway on each instance in sequence.
        cookie = headers["Set-Cookie"].split(";", 1)[0]
        for port in (api, replica):
            status, body, headers = request(port, "/api/v1/auth/refresh", {}, {"Cookie": cookie})
            assert status == 200, (status, body)
            cookie = headers["Set-Cookie"].split(";", 1)[0]
        print("PASS: authentication and refresh sessions work across instances", flush=True)

        stop("api")
        # Health checks run every five seconds; transient in-flight failures are allowed.
        time.sleep(8)
        offset = len((work / "gateway.log").read_text())
        traffic()
        wait_for(lambda: backends_since(offset) == {f"http://127.0.0.1:{replica}"}, "failover")
        print("PASS: requests continue through the surviving instance", flush=True)
        start("api", str(work / "server"), extra=app_env | {
            "PORT": str(api), "METRICS_PORT": str(api_metrics), "PROCESS_ROLE": "api"})
        wait_for(lambda: request(api)[0] == 200, "restarted API")
        time.sleep(8)
        offset = len((work / "gateway.log").read_text())
        traffic()
        wait_for(lambda: backends_since(offset) == expected, "recovered instance rejoining")
        print("PASS: the recovered instance rejoins the pool", flush=True)

        # In particular, exercise the scheduler's real SQL on startup and polling.
        for name in ("api", "replica", "worker"):
            for line in (work / f"{name}.log").read_text().splitlines():
                if line.startswith("{"):
                    row = json.loads(line)
                    assert row.get("level") != "ERROR", (name, row)

        stop("redis")
        # Use a normal DB-backed route: a 503 from /ready itself could be a
        # forwarded probe response before the gateway has removed the backend.
        wait_for(lambda: request(gateway, "/api/v1/stats")[0] == 503, "unready backends removed")
        assert request(api, "/health")[0] == 200
        assert request(replica, "/health")[0] == 200
        print("PASS: dependency failure removes live-but-unready instances (HTTP 503)", flush=True)
    finally:
        for name in reversed(list(processes)):
            stop(name)
        for log in logs:
            log.close()


if __name__ == "__main__":
    main()
