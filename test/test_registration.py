import importlib
import os
import sys
import unittest

from comfy_stubs import install_stubs

install_stubs()


class Registration(unittest.TestCase):
    def test_package_registers_exactly_the_two_nodes(self):
        repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        parent = os.path.dirname(repo)
        if parent not in sys.path:
            sys.path.insert(0, parent)
        pkg = importlib.import_module(os.path.basename(repo))
        self.assertEqual(set(pkg.NODE_CLASS_MAPPINGS), {"PresetSelector10", "Modulo10"})
        self.assertEqual(pkg.WEB_DIRECTORY, "./web")


if __name__ == "__main__":
    unittest.main()
