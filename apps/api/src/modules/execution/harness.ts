/**
 * Owner: Person B.
 *
 * Python script that runs INSIDE the sandbox container. It reads a JSON job
 * from stdin, runs the student's program once per input with a per-input
 * time limit, and prints one JSON object with the raw results.
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

sys.stdout.write(json.dumps({"results": results}))
sys.stdout.flush()
`;
