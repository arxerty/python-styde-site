"""Выполняет одну проверку в изолированном процессе (вызывается из verify_content.py).

stdin: JSON {"runner": путь к runner.py, "kind": "test"|"run", "payload": {...}, "assets_dir": путь|null, "assets": [...]}
stdout: JSON-результат runner.handle()
"""
import importlib.util
import json
import os
import shutil
import sys
import tempfile


def main() -> None:
    # -I игнорирует PYTHONIOENCODING, поэтому кодировку задаём явно (иначе на Windows cp1251)
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    job = json.loads(sys.stdin.read())
    spec = importlib.util.spec_from_file_location("runner", job["runner"])
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    workdir = tempfile.mkdtemp(prefix="verify-")
    try:
        for asset in job.get("assets") or []:
            source = os.path.join(job["assets_dir"], asset)
            target = os.path.join(workdir, asset)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            shutil.copyfile(source, target)
        os.chdir(workdir)
        os.environ["MPLBACKEND"] = "agg"
        result = runner.handle(job["kind"], json.dumps(job["payload"]))
        sys.__stdout__.write(result)
    finally:
        os.chdir(os.path.dirname(workdir))
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    main()
