"""Build the portable teaching-demo source ZIP and browser download chunks.

Run: python scripts/package_source.py [project_root]
Only reviewed source locations and file types are eligible for packaging.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile


VERSION = "2026-10-30"
FILENAME = "case-training-demo-source.zip"
ARCHIVE_ROOT = "case-training-demo"
MAX_PART_SIZE = 16 * 1024 * 1024
ROOT_FILES = {"README.md", ".gitignore"}
ALLOWED_TYPES = {
    "dist": {".html", ".css", ".js", ".json", ".jpg", ".jpeg", ".png", ".svg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".otf"},
    "docs": {".md", ".txt"},
    "scripts": {".py", ".js", ".cjs", ".mjs", ".ps1", ".sh", ".bat"},
    "tests": {".py", ".js", ".cjs", ".mjs"},
}
BLOCKED_COMPONENTS = {".git", "node_modules", "__pycache__", ".pytest_cache", ".venv", "venv", "tmp", "temp", "logs"}
BLOCKED_SUFFIXES = {".csv", ".tsv", ".log", ".pem", ".key", ".pfx", ".p12", ".sqlite", ".db", ".pyc", ".zip", ".part"}
INSTRUCTIONS = """公安机关刑事案卷整理立卷训练 Demo — 源码使用说明

1. 在其他电脑完整解压本ZIP，保留全部文件夹结构。
2. 双击 case-training-demo/dist/index.html，用现代浏览器打开即可离线体验。
   若已进入 case-training-demo 文件夹，直接打开 dist/index.html。
3. HTML、CSS、JavaScript及其他源码均可使用文本编辑器继续修改。
4. 当前电脑浏览器中的训练进度、学员信息和成绩不随源码包迁移。
   成绩CSV可在原电脑的应用页面另行导出；目前没有训练存档导入功能。
5. 直接打开文件时，浏览器可能限制本地自动保存。可选：安装Python后，
   在 case-training-demo 文件夹打开终端，运行：
       python -m http.server 8000 --directory dist
   然后访问 http://localhost:8000/ 。停止时在终端按 Ctrl+C。

本包包含教学模拟材料和标准答案。仅用于已授权的教学演示与开发。
"""


def _eligible(relative):
    parts = relative.parts
    lowered = [part.casefold() for part in parts]
    if any(part in BLOCKED_COMPONENTS for part in lowered):
        return False
    if any(".env" in part or "credential" in part or "secret" in part or "password" in part for part in lowered):
        return False
    if relative.suffix.casefold() in BLOCKED_SUFFIXES:
        return False
    if len(parts) == 1:
        return parts[0] in ROOT_FILES
    if relative.as_posix() == ".openai/hosting.json":
        return True
    if parts[0] not in ALLOWED_TYPES:
        return False
    if parts[0] == "dist" and parts[1].casefold() == "downloads":
        return False
    return relative.suffix.casefold() in ALLOWED_TYPES[parts[0]]


def _source_files(root):
    # Never traverse unrelated root folders or links to data outside this project.
    candidates = [root / name for name in ROOT_FILES]
    candidates.append(root / ".openai" / "hosting.json")
    for directory in ALLOWED_TYPES:
        base = root / directory
        if base.is_dir() and not base.is_symlink():
            candidates.extend(base.rglob("*"))
    sources = []
    for candidate in candidates:
        relative = candidate.relative_to(root)
        if not candidate.is_file() or not _eligible(relative):
            continue
        if candidate.is_symlink() or any(parent.is_symlink() for parent in candidate.parents if parent != root):
            continue
        try:
            candidate.resolve().relative_to(root)
        except ValueError:
            continue
        if relative.as_posix() == ".openai/hosting.json":
            settings = json.loads(candidate.read_text(encoding="utf-8-sig"))
            static = settings.get("static", {})
            if (not isinstance(settings, dict) or set(settings) - {"project_id", "static"}
                    or not isinstance(static, dict) or set(static) - {"directory"}):
                raise ValueError("hosting.json has unreviewed fields; refusing to package it")
        sources.append((relative, candidate))
    return sorted(sources, key=lambda entry: entry[0].as_posix())


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_package(root, manifest):
    """Check every ZIP CRC, entry count and reconstructed-download checksum."""
    root = Path(root).resolve()
    archive = root.parent / FILENAME
    with zipfile.ZipFile(archive) as package:
        corrupt = package.testzip()
        if corrupt is not None:
            raise ValueError("ZIP integrity check failed")
        if len(package.infolist()) != manifest["fileCount"]:
            raise ValueError("ZIP file count differs from manifest")
        if any(not item.filename.startswith(ARCHIVE_ROOT + "/") for item in package.infolist()):
            raise ValueError("Unexpected archive root")
    digest = hashlib.sha256()
    total = 0
    for part in manifest["parts"]:
        if not re.fullmatch(r"downloads/source-\d{2,}\.part", part["url"]):
            raise ValueError("Unexpected download part path")
        path = root / "dist" / part["url"]
        content = path.read_bytes()
        if not 0 < len(content) <= MAX_PART_SIZE or len(content) != part["size"]:
            raise ValueError("Download part size differs from manifest")
        if hashlib.sha256(content).hexdigest() != part["sha256"]:
            raise ValueError("Download part checksum differs from manifest")
        digest.update(content)
        total += len(content)
    if total != manifest["size"] or archive.stat().st_size != total:
        raise ValueError("Archive size differs from reconstructed download")
    if digest.hexdigest() != manifest["sha256"] or sha256_file(archive) != manifest["sha256"]:
        raise ValueError("Archive checksum differs from reconstructed download")


def build_package(project_root, chunk_size=MAX_PART_SIZE):
    root = Path(project_root).resolve()
    if not isinstance(chunk_size, int) or not 0 < chunk_size <= MAX_PART_SIZE:
        raise ValueError("chunk_size must be between 1 and 16 MiB")
    if not (root / "dist" / "index.html").is_file():
        raise ValueError("project_root must contain dist/index.html")
    sources = _source_files(root)
    archive = root.parent / FILENAME
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as package:
        for relative, path in sources:
            package.write(path, ARCHIVE_ROOT + "/" + relative.as_posix())
        package.writestr(ARCHIVE_ROOT + "/开始使用.txt", "\ufeff" + INSTRUCTIONS)
    downloads = root / "dist" / "downloads"
    downloads.mkdir(parents=True, exist_ok=True)
    manifest = {
        "version": VERSION,
        "filename": FILENAME,
        "size": archive.stat().st_size,
        "sha256": sha256_file(archive),
        "fileCount": len(sources) + 1,
        "parts": [],
    }
    # Only the explicitly generated target list is written. No recursive deletion.
    with archive.open("rb") as source:
        index = 1
        while True:
            content = source.read(chunk_size)
            if not content:
                break
            filename = f"source-{index:02d}.part"
            (downloads / filename).write_bytes(content)
            manifest["parts"].append({
                "url": "downloads/" + filename,
                "size": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            })
            index += 1
    verify_package(root, manifest)
    (downloads / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_root", nargs="?", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    manifest = build_package(args.project_root)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
