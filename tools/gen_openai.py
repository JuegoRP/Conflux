#!/usr/bin/env python3
"""
Přímý OpenAI generátor pro hromadný běh (bez n8n — žádný admin-queue/GDrive spam).
Čte prompts JSON (z generate.py), volá gpt-image-1, ukládá:
  - raw PNG do <out>/_raw/<ID>.png
  - finální JPG (q85) na cílovou cestu z manifestu (item['file'])
Paralelně (thread pool). Přeskakuje hotové (pokud není --force). Loguje do tools/gen_log.jsonl.

Použití:
  OPENAI_API_KEY=sk-... python3 tools/gen_openai.py tools/synth.json --workers 5
  ... --force            přegenerovat i existující
  ... --root .           kořen projektu (kam patří assets/)
"""
import json, os, sys, time, base64, argparse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

API = "https://api.openai.com/v1/images/generations"

def call_openai(prompt, size, quality, key, timeout=180):
    body = json.dumps({"model": "gpt-image-1", "prompt": prompt,
                       "size": size, "quality": quality, "n": 1}).encode()
    req = urllib.request.Request(API, data=body, method="POST", headers={
        "Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.loads(r.read().decode())
    return base64.b64decode(d["data"][0]["b64_json"])

def to_jpg(png_bytes, dest, quality=85):
    from PIL import Image
    import io
    im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    im.save(dest, "JPEG", quality=quality)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prompts")
    ap.add_argument("--root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument("--workers", type=int, default=5)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--retries", type=int, default=2)
    a = ap.parse_args()

    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        sys.exit("CHYBA: nastav OPENAI_API_KEY")

    items = json.load(open(a.prompts))
    raw_dir = os.path.join(a.root, "assets/images/cards/_raw")
    os.makedirs(raw_dir, exist_ok=True)
    log = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "gen_log.jsonl"), "a")

    todo = []
    for it in items:
        dest = os.path.join(a.root, it["file"])
        if os.path.exists(dest) and not a.force:
            continue
        todo.append(it)
    print(f"Ke generování: {len(todo)}/{len(items)} (workers={a.workers})")

    def work(it):
        dest = os.path.join(a.root, it["file"])
        raw = os.path.join(raw_dir, f'{str(it["id"]).zfill(3)}.png')
        last = None
        for attempt in range(a.retries + 1):
            try:
                t0 = time.time()
                png = call_openai(it["prompt"], it["size"], it["quality"], key)
                open(raw, "wb").write(png)
                to_jpg(png, dest)
                return (it["id"], "OK", round(time.time()-t0, 1), None)
            except Exception as e:
                last = str(e)[:160]
                time.sleep(3 * (attempt + 1))
        return (it["id"], "FAIL", 0, last)

    ok = fail = 0
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = {ex.submit(work, it): it for it in todo}
        for fu in as_completed(futs):
            cid, status, secs, err = fu.result()
            if status == "OK": ok += 1
            else: fail += 1
            log.write(json.dumps({"id": cid, "status": status, "secs": secs, "err": err, "ts": time.time()})+"\n"); log.flush()
            print(f'  #{cid:>4} {status} {secs:>5}s {"" if not err else err}  [{ok} ok / {fail} fail]')
    print(f"\nHotovo: {ok} OK, {fail} FAIL")

if __name__ == "__main__":
    main()
