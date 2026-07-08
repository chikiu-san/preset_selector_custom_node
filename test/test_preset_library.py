import unittest
from unittest import mock

from comfy_stubs import install_stubs

install_stubs()
import preset_library  # noqa: E402


class PresetLibrarySelectorNode(unittest.TestCase):
    def test_input_types_expose_expected_widgets(self):
        req = preset_library.PresetLibrarySelector.INPUT_TYPES()["required"]
        for key in ["model", "clip", "high_lora", "high_strength",
                    "low_lora", "low_strength", "label", "positive", "negative"]:
            self.assertIn(key, req)

    def test_lora_dropdown_starts_with_none(self):
        req = preset_library.PresetLibrarySelector.INPUT_TYPES()["required"]
        self.assertEqual(req["high_lora"][0][0], "None")
        self.assertEqual(req["low_lora"][0][0], "None")

    def test_return_names(self):
        self.assertEqual(
            preset_library.PresetLibrarySelector.RETURN_NAMES,
            ("high_model", "low_model", "positive", "negative", "selected_label"),
        )

    def test_select_preset_passthrough_and_label_echo(self):
        node = preset_library.PresetLibrarySelector()
        model = object()
        clip = mock.Mock()
        clip.tokenize.return_value = "T"
        clip.encode_from_tokens.return_value = ("C", "P")
        out = node.select_preset(model, clip, "None", 1.0, "None", 1.0, "MyLabel", "pos", "neg")
        high_model, low_model, positive, negative, label = out
        self.assertIs(high_model, model)
        self.assertIs(low_model, model)
        self.assertEqual(positive, [["C", {"pooled_output": "P"}]])
        self.assertEqual(negative, [["C", {"pooled_output": "P"}]])
        self.assertEqual(label, "MyLabel")


class Registration(unittest.TestCase):
    def test_mappings_present(self):
        self.assertIn("PresetLibrarySelector", preset_library.NODE_CLASS_MAPPINGS)
        self.assertEqual(
            preset_library.NODE_DISPLAY_NAME_MAPPINGS["PresetLibrarySelector"],
            "Preset Library Selector",
        )


if __name__ == "__main__":
    unittest.main()
