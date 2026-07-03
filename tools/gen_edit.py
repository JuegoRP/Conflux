#!/usr/bin/env python3
"""
Restyle portrétů/pozadí přes OpenAI images/edits — původní soubor jako REFERENCE
(zachová identitu místa/postavy = předloha). Čte jobs JSON: [{src,dest,prompt,size}].
Ukládá: .jpg dest → jpg q88, .png dest → png. Done-log = tools/edit_done.txt (resume).
Použití: OPENAI_API_KEY=... python3 tools/gen_edit.py tools/edit_jobs.json --workers 3
"""
import json, os, sys, time, base64, argparse, subprocess, io
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DONE = os.path.join(HERE, "edit_done.txt")

def call_edit(src, prompt, size, key, timeout=200):
    # curl multipart (ověřená cesta pro images/edits)
    cmd = ["curl","-s","--max-time",str(timeout),"https://api.openai.com/v1/images/edits",
           "-H",f"Authorization: Bearer {key}",
           "-F","model=gpt-image-1","-F",f"size={size}","-F","quality=medium",
           "-F",f"image[]=@{src}","-F",f"prompt={prompt}"]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout+20).stdout
    d = json.loads(out)
    if "error" in d: raise RuntimeError(d["error"].get("code") or d["error"].get("message","err"))
    return base64.b64decode(d["data"][0]["b64_json"])

def save(png, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if dest.lower().endswith(".jpg") or dest.lower().endswith(".jpeg"):
        from PIL import Image
        Image.open(io.BytesIO(png)).convert("RGB").save(dest, "JPEG", quality=88)
    else:
        open(dest, "wb").write(png)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jobs"); ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--force", action="store_true"); ap.add_argument("--retries", type=int, default=2)
    a = ap.parse_args()
    key = os.environ.get("OPENAI_API_KEY") or sys.exit("chybí OPENAI_API_KEY")
    done = set(open(DONE).read().split()) if os.path.exists(DONE) and not a.force else set()
    jobs = [j for j in json.load(open(a.jobs)) if j["dest"] not in done]
    print(f"K restylu: {len(jobs)} (workers={a.workers})", flush=True)
    dlog = open(DONE, "a")

    def work(j):
        src = os.path.join(ROOT, j["src"]); dest = os.path.join(ROOT, j["dest"])
        for att in range(a.retries+1):
            try:
                t=time.time(); png=call_edit(src, j["prompt"], j["size"], key)
                save(png, dest); return (j["dest"],"OK",round(time.time()-t))
            except Exception as e:
                last=str(e)[:80]; time.sleep(4*(att+1))
        return (j["dest"],"FAIL:"+last,0)

    ok=fail=0
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        for fu in as_completed([ex.submit(work,j) for j in jobs]):
            dest,st,secs=fu.result()
            if st=="OK": ok+=1; dlog.write(dest+"\n"); dlog.flush()
            else: fail+=1
            print(f'  {os.path.basename(dest):28} {st} {secs}s [{ok}ok/{fail}fail]', flush=True)
    print(f"\nHotovo: {ok} OK, {fail} FAIL", flush=True)

if __name__=="__main__": main()
