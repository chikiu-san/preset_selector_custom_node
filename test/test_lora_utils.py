import unittest
from unittest import mock

from comfy_stubs import install_stubs

install_stubs()
import lora_utils  # noqa: E402


class ResolveLoraPath(unittest.TestCase):
    def test_none_and_empty_return_none(self):
        self.assertIsNone(lora_utils.resolve_lora_path("None"))
        self.assertIsNone(lora_utils.resolve_lora_path(""))
        self.assertIsNone(lora_utils.resolve_lora_path(None))

    def test_direct_full_path(self):
        with mock.patch.object(
            lora_utils.folder_paths, "get_full_path", return_value="/loras/a.safetensors"
        ) as m:
            self.assertEqual(lora_utils.resolve_lora_path("a.safetensors"), "/loras/a.safetensors")
            m.assert_called_once_with("loras", "a.safetensors")

    def test_missing_raises_valueerror(self):
        with mock.patch.object(lora_utils.folder_paths, "get_full_path", return_value=None), \
             mock.patch.object(lora_utils.folder_paths, "get_filename_list", return_value=[]):
            with self.assertRaises(ValueError):
                lora_utils.resolve_lora_path("ghost.safetensors")


class ApplySingleLora(unittest.TestCase):
    def test_none_name_is_passthrough(self):
        model = object()
        with mock.patch.object(lora_utils.comfy.sd, "load_lora_for_models") as m:
            out = lora_utils.apply_single_lora(model, object(), "None", 1.0)
        self.assertIs(out, model)
        m.assert_not_called()

    def test_zero_strength_is_passthrough(self):
        model = object()
        with mock.patch.object(lora_utils.comfy.sd, "load_lora_for_models") as m:
            out = lora_utils.apply_single_lora(model, object(), "real.safetensors", 0.0)
        self.assertIs(out, model)
        m.assert_not_called()

    def test_applies_lora_and_returns_model(self):
        model, clip, applied = object(), object(), object()
        with mock.patch.object(lora_utils.folder_paths, "get_full_path", return_value="/loras/r.safetensors"), \
             mock.patch.object(lora_utils.comfy.sd, "load_lora_for_models", return_value=(applied, clip)) as m:
            out = lora_utils.apply_single_lora(model, clip, "r.safetensors", 0.8)
        self.assertIs(out, applied)
        self.assertEqual(m.call_args.args[3], 0.8)


class EncodeText(unittest.TestCase):
    def test_returns_conditioning_shape(self):
        clip = mock.Mock()
        clip.tokenize.return_value = "TOK"
        clip.encode_from_tokens.return_value = ("COND", "POOL")
        out = lora_utils.encode_text(clip, "hello")
        self.assertEqual(out, [["COND", {"pooled_output": "POOL"}]])
        clip.tokenize.assert_called_once_with("hello")


if __name__ == "__main__":
    unittest.main()
