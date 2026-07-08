import unittest
from unittest import mock

from comfy_stubs import install_stubs

install_stubs()
import preset_selector  # noqa: E402


class PresetSelector10Refactor(unittest.TestCase):
    def test_input_types_still_expose_preset_slots(self):
        req = preset_selector.PresetSelector10.INPUT_TYPES()["required"]
        self.assertIn("preset_0_high_lora", req)
        self.assertIn("preset_9_negative", req)

    def test_select_preset_none_loras_passthrough(self):
        node = preset_selector.PresetSelector10()
        model = object()
        clip = mock.Mock()
        clip.tokenize.return_value = "T"
        clip.encode_from_tokens.return_value = ("C", "P")
        out = node.select_preset(
            model, clip, 0,
            preset_0_name="Zero",
            preset_0_high_lora="None", preset_0_high_strength=1.0,
            preset_0_low_lora="None", preset_0_low_strength=1.0,
            preset_0_positive="p", preset_0_negative="n",
        )
        self.assertIs(out[0], model)
        self.assertIs(out[1], model)
        self.assertEqual(out[2], [["C", {"pooled_output": "P"}]])
        self.assertEqual(out[4], 0)
        self.assertEqual(out[5], "Zero")

    def test_input_types_expose_optional_model_low(self):
        it = preset_selector.PresetSelector10.INPUT_TYPES()
        self.assertIn("model_low", it.get("optional", {}))
        self.assertEqual(it["optional"]["model_low"], ("MODEL",))

    def _run(self, node, model, clip, **extra):
        return node.select_preset(
            model, clip, 0,
            preset_0_name="Zero",
            preset_0_high_lora="None", preset_0_high_strength=1.0,
            preset_0_low_lora="None", preset_0_low_strength=1.0,
            preset_0_positive="p", preset_0_negative="n",
            **extra,
        )

    def test_low_model_routes_to_model_low_when_connected(self):
        node = preset_selector.PresetSelector10()
        model, model_low = object(), object()
        clip = mock.Mock()
        clip.tokenize.return_value = "T"
        clip.encode_from_tokens.return_value = ("C", "P")
        out = self._run(node, model, clip, model_low=model_low)
        self.assertIs(out[0], model)       # high_model uses `model`
        self.assertIs(out[1], model_low)   # low_model uses `model_low` (low_lora None -> passthrough)

    def test_low_model_falls_back_to_model_when_model_low_absent(self):
        node = preset_selector.PresetSelector10()
        model = object()
        clip = mock.Mock()
        clip.tokenize.return_value = "T"
        clip.encode_from_tokens.return_value = ("C", "P")
        out = self._run(node, model, clip)
        self.assertIs(out[0], model)
        self.assertIs(out[1], model)       # low_model falls back to `model`


if __name__ == "__main__":
    unittest.main()
