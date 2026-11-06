/**
 * Owner: Person B.
 *
 * Python script that runs INSIDE the sandbox container. It reads a JSON job
 * from stdin, optionally runs a compile step once, then runs the student's
 * program once per input with a per-input time limit, and prints one JSON
 * object with the raw results. If the compile step fails, no input runs.
 *
 * Expected outputs are never sent into the container: comparison happens in
 * the API, so a program that tampers with this harness can't learn or fake
 * hidden test answers.
 */
export const HARNESS_SOURCE = String.raw`
import json, os, signal, subprocess, sys, time

job = json.load(sys.stdin)
cmd = job["cmd"]
limit_s = job["timeLimitMs"] / 1000.0
cap = job["outputCapBytes"]
env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/tmp", "LANG": "C.UTF-8"}

def read_capped(path):
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        data = f.read(cap)
    return data.decode("utf-8", "replace"), size >= cap

def run_compile(step):
    with open("/tmp/.cout", "wb") as fout:
        start = time.monotonic()
        try:
            p = subprocess.Popen(step["cmd"], stdin=subprocess.DEVNULL, stdout=fout, stderr=subprocess.STDOUT,
                                 cwd="/tmp", env=env, start_new_session=True)
        except Exception as e:
            return {"spawnError": str(e)}
        timed_out = False
        try:
            code = p.wait(timeout=step["timeLimitMs"] / 1000.0)
        except subprocess.TimeoutExpired:
            timed_out = True
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            code = p.wait()
        elapsed_ms = int((time.monotonic() - start) * 1000)
    out, _ = read_capped("/tmp/.cout")
    return {"ok": code == 0 and not timed_out, "exitCode": code, "timedOut": timed_out,
            "timeMs": elapsed_ms, "output": out}

def cgroup_counter(name, key):
    try:
        with open("/sys/fs/cgroup/" + name) as f:
            for line in f:
                k, v = line.split()
                if k == key:
                    return int(v)
    except Exception:
        return None

def usage():
    # Container-wide counters for the run log and suspicious-code flags (cgroup v2; missing elsewhere).
    u = {"pidsLimitHits": cgroup_counter("pids.events", "max"), "oomKills": cgroup_counter("memory.events", "oom_kill")}
    try:
        with open("/sys/fs/cgroup/memory.peak") as f:
            u["memoryPeakBytes"] = int(f.read())
    except Exception:
        pass
    return {k: v for k, v in u.items() if v is not None}

compiled = run_compile(job["compile"]) if job.get("compile") else None
if compiled is not None and not compiled.get("ok"):
    sys.stdout.write(json.dumps({"compile": compiled, "results": [], "usage": usage()}))
    sys.stdout.flush()
    sys.exit(0)

results = []
for i, text in enumerate(job["inputs"]):
    with open("/tmp/.in", "wb") as f:
        f.write(text.encode("utf-8"))
    with open("/tmp/.in", "rb") as fin, open("/tmp/.out", "wb") as fout, open("/tmp/.err", "wb") as ferr:
        start = time.monotonic()
        timed_out = False
        try:
            p = subprocess.Popen(cmd, stdin=fin, stdout=fout, stderr=ferr, cwd="/tmp", env=env,
                                 start_new_session=True)
        except Exception as e:
            results.append({"spawnError": str(e)})
            continue
        try:
            code = p.wait(timeout=limit_s)
        except subprocess.TimeoutExpired:
            timed_out = True
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            code = p.wait()
        elapsed_ms = int((time.monotonic() - start) * 1000)
    out, out_over = read_capped("/tmp/.out")
    err, err_over = read_capped("/tmp/.err")
    results.append({"exitCode": code, "timedOut": timed_out, "timeMs": elapsed_ms,
                    "stdout": out, "stderr": err, "outputExceeded": out_over or err_over})

sys.stdout.write(json.dumps({"compile": compiled, "results": results, "usage": usage()}))
sys.stdout.flush()
`;
