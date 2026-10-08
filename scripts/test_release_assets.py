import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("assets", Path(__file__).with_name("stage-release-assets.py"))
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)


class ReleaseAssetsTest(unittest.TestCase):
    def test_grace_begins_when_current_asset_is_retired(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            old, first, second, fresh = [root / name for name in ("old", "first", "second", "fresh")]
            (old / "web/assets").mkdir(parents=True)
            fresh.mkdir()
            (old / "web/assets/old.js").write_text("old")
            (fresh / "new.js").write_text("new")
            self.assertEqual(assets.stage(old, first, fresh, now=100), (1, 1))
            # A later deploy keeps the last current bundle even if it is old;
            # only already-retired bundles age out of the new release.
            newer = root / "newer"
            newer.mkdir()
            (newer / "latest.js").write_text("latest")
            self.assertEqual(assets.stage(first, second, newer, now=101 + assets.GRACE_SECONDS), (1, 1))
            self.assertTrue((second / "web/assets/new.js").exists())
            self.assertFalse((second / "web/assets/old.js").exists())
            self.assertTrue((old / "web/assets/old.js").exists())
            self.assertTrue((first / "web/assets/old.js").exists())
            with self.assertRaises(ValueError):
                assets.stage(first, second, newer)

    def test_invalid_manifest_cannot_copy_external_paths(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            old, fresh = root / "old", root / "fresh"
            (old / "web/assets").mkdir(parents=True)
            fresh.mkdir()
            (old / assets.MANIFEST).write_text(json.dumps({"current": ["../../secret"], "retired": {}}))
            with self.assertRaises(ValueError):
                assets.stage(old, root / "new", fresh)


if __name__ == "__main__":
    unittest.main()
