"""Isolated policy deployment checks; never reads or modifies a real Nginx service."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("policy", Path(__file__).with_name("enable-geolocation.py"))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class GeolocationDeploymentTests(unittest.TestCase):
    def test_selects_only_the_active_site_and_rejects_ambiguity(self):
        dump = f"# configuration file /etc/nginx/nginx.conf:\nhttp {{}}\n# configuration file /etc/nginx/sites-enabled/gyansetu:\nserver_name thegyansetu.in www.thegyansetu.in;\n{policy.OLD}\n"
        self.assertEqual(policy.site_config(dump).name, "gyansetu")
        with self.assertRaises(RuntimeError):
            policy.site_config(dump + f"# configuration file /etc/nginx/other:\nserver_name thegyansetu.in;\n{policy.OLD}\n")
        with self.assertRaises(RuntimeError):
            policy.site_config(dump.replace("www.thegyansetu.in", "unrelated.example"))

    def test_preserves_other_settings_and_keeps_a_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "site.conf"
            original = f"# Previous example: {policy.OLD}\nssl_protocols TLSv1.2 TLSv1.3;\n    {policy.OLD}\nproxy_pass http://127.0.0.1:8080;\n".encode()
            target.write_bytes(original)
            with patch.object(policy, "command") as run:
                policy.apply_policy(target, root / "backups")
                self.assertEqual([call.args for call in run.call_args_list], [("nginx", "-t"), ("systemctl", "reload", "nginx")])
            self.assertEqual(target.read_bytes(), original.replace(f"    {policy.OLD}".encode(), f"    {policy.NEW}".encode()))
            self.assertEqual(next((root / "backups").iterdir()).read_bytes(), original)

    def test_failed_reload_restores_the_original_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "site.conf"
            target.write_text(policy.OLD)
            with patch.object(policy, "command", side_effect=[None, subprocess.CalledProcessError(1, "reload"), None, None]):
                with self.assertRaisesRegex(RuntimeError, "previous config restored"):
                    policy.apply_policy(target, root / "backups")
            self.assertEqual(target.read_text(), policy.OLD)

    def test_unknown_policy_is_not_overwritten_and_correct_policy_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "site.conf"
            target.write_text('add_header Permissions-Policy "camera=(self)" always;')
            with patch.object(policy, "command") as run:
                with self.assertRaises(RuntimeError):
                    policy.apply_policy(target, root / "backups")
                run.assert_not_called()
                target.write_text(policy.NEW)
                policy.apply_policy(target, root / "backups")
                self.assertEqual(target.read_text(), policy.NEW)
                self.assertFalse((root / "backups").exists())


if __name__ == "__main__":
    unittest.main()
