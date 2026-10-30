import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "package_source.py"


class SourcePackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "case-training-demo"
        self.root.mkdir()
        self.safe = {
            "README.md": "Portable demo",
            ".gitignore": ".env\n*.csv\n",
            ".openai/hosting.json": '{"project_id":"demo","static":{"directory":"dist"}}',
            "dist/index.html": '<script src="app.js"></script>',
            "dist/app.js": "window.example = true;",
            "dist/styles.css": "body { color: navy; }",
            "dist/assets/materials/example.jpg": "expected teaching image",
            "docs/demo-design.md": "Design notes",
            "scripts/helper.py": "print('example')",
            "tests/core.test.cjs": "// test",
        }
        self.private = {
            ".git/config": "private repository configuration",
            "original-materials/original.jpg": "unapproved raw data",
            "原始资料/学生信息.txt": "private original data",
            "scores.csv": "student,result",
            "dist/results.csv": "student,result",
            "docs/runtime.log": "private runtime data",
            "docs/.env": "PRIVATE_CONFIGURATION",
            "scripts/.env.local": "PRIVATE_CONFIGURATION",
            "scripts/credentials.py": "PRIVATE_CONFIGURATION",
            "docs/client-secret.txt": "PRIVATE_CONFIGURATION",
            "dist/node_modules/package/index.js": "dependency cache",
            "scripts/__pycache__/helper.pyc": "cache",
            "dist/downloads/source-01.part": "old package data",
            "dist/downloads/manifest.json": "{}",
            "unapproved.txt": "private unrelated file",
        }
        for name, content in {**self.safe, **self.private}.items():
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")

    def build(self, chunk_size=512):
        self.assertTrue(SCRIPT.exists(), "source packaging script must be implemented")
        spec = importlib.util.spec_from_file_location("package_source", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertTrue(callable(getattr(module, "build_package", None)))
        return module.build_package(self.root, chunk_size=chunk_size)

    def test_allowlist_excludes_credentials_raw_data_runtime_files_and_self(self):
        manifest = self.build()
        archive = self.root.parent / manifest["filename"]
        with zipfile.ZipFile(archive) as package:
            names = set(package.namelist())
            expected = {"case-training-demo/" + name for name in self.safe}
            expected.add("case-training-demo/开始使用.txt")
            self.assertEqual(names, expected)
            self.assertIsNone(package.testzip())
            self.assertTrue(all(info.compress_type == zipfile.ZIP_DEFLATED for info in package.infolist()))
            self.assertEqual(manifest["fileCount"], len(expected))
            instructions = package.read("case-training-demo/开始使用.txt").decode("utf-8-sig")
            self.assertIn("dist/index.html", instructions)
            self.assertIn("进度", instructions)
            self.assertIn("不随", instructions)

    def test_parts_reassemble_exact_archive_with_per_part_and_full_checksums(self):
        manifest = self.build(chunk_size=113)
        expected_bytes = (self.root.parent / manifest["filename"]).read_bytes()
        self.assertGreater(len(manifest["parts"]), 1)
        chunks = []
        for index, part in enumerate(manifest["parts"], 1):
            self.assertEqual(part["url"], f"downloads/source-{index:02d}.part")
            content = (self.root / "dist" / part["url"]).read_bytes()
            self.assertGreater(len(content), 0)
            self.assertLessEqual(len(content), 113)
            self.assertEqual(part["size"], len(content))
            self.assertEqual(part["sha256"], hashlib.sha256(content).hexdigest())
            chunks.append(content)
        self.assertEqual(b"".join(chunks), expected_bytes)
        self.assertEqual(manifest["size"], len(expected_bytes))
        self.assertEqual(manifest["sha256"], hashlib.sha256(expected_bytes).hexdigest())
        self.assertEqual(manifest["version"], "2026-10-30")
        self.assertEqual(json.loads((self.root / "dist/downloads/manifest.json").read_text(encoding="utf-8")), manifest)

    def test_repeated_build_never_packages_previously_generated_parts(self):
        self.build(chunk_size=113)
        manifest = self.build(chunk_size=256)
        with zipfile.ZipFile(self.root.parent / manifest["filename"]) as package:
            self.assertFalse(any("/downloads/" in name for name in package.namelist()))
            self.assertEqual(len(package.namelist()), len(self.safe) + 1)

    def test_rejects_oversize_or_invalid_chunk_limits(self):
        self.assertTrue(SCRIPT.exists(), "source packaging script must be implemented")
        spec = importlib.util.spec_from_file_location("package_source", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for size in [0, -1, 16 * 1024 * 1024 + 1]:
            with self.assertRaises(ValueError):
                module.build_package(self.root, chunk_size=size)


if __name__ == "__main__":
    unittest.main()
