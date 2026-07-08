import folder_paths

try:
    from . import lora_utils
except ImportError:  # allow standalone import for tests
    import lora_utils


class PresetLibrarySelector:
    """
    Pick a (high_lora, low_lora) pair; the matching prompt/strengths are
    auto-loaded into the widgets by the frontend extension (web/preset_library.js)
    from a persistent per-user library. Execution uses the *current* widget
    values — the library is never read here ("what you see is what runs").
    """

    CATEGORY = "presets"
    RETURN_TYPES = ("MODEL", "MODEL", "CONDITIONING", "CONDITIONING", "STRING")
    RETURN_NAMES = ("high_model", "low_model", "positive", "negative", "selected_label")
    FUNCTION = "select_preset"

    @classmethod
    def INPUT_TYPES(cls):
        lora_options = ["None"] + folder_paths.get_filename_list("loras")
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "high_lora": (lora_options,),
                "high_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05}),
                "low_lora": (lora_options,),
                "low_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05}),
                "label": ("STRING", {"default": "", "multiline": False}),
                "positive": ("STRING", {"default": "", "multiline": True, "dynamicPrompts": False}),
                "negative": ("STRING", {"default": "", "multiline": True, "dynamicPrompts": False}),
            }
        }

    def select_preset(self, model, clip, high_lora, high_strength,
                      low_lora, low_strength, label, positive, negative):
        high_model = lora_utils.apply_single_lora(model, clip, high_lora, high_strength)
        low_model = lora_utils.apply_single_lora(model, clip, low_lora, low_strength)
        positive_cond = lora_utils.encode_text(clip, positive)
        negative_cond = lora_utils.encode_text(clip, negative)
        return (high_model, low_model, positive_cond, negative_cond, str(label))


NODE_CLASS_MAPPINGS = {
    "PresetLibrarySelector": PresetLibrarySelector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PresetLibrarySelector": "Preset Library Selector",
}
