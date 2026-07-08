import folder_paths

try:
    from . import lora_utils
except ImportError:  # allow standalone import for tests
    import lora_utils


class PresetSelector10:
    """
    Select 1 preset out of 10 and apply:
    - one HIGH LoRA to a copy of the base model
    - one LOW LoRA to a copy of the base model
    - positive / negative prompt encoding using the provided CLIP

    Notes:
    - preset_index is wrapped with modulo 10, so 10 -> 0, 11 -> 1, etc.
    - The HIGH / LOW LoRA slots are dropdowns populated from your ComfyUI loras folder.
      Pick "None" to skip the LoRA for that slot.
    """

    CATEGORY = "presets"
    RETURN_TYPES = ("MODEL", "MODEL", "CONDITIONING", "CONDITIONING", "INT", "STRING")
    RETURN_NAMES = ("high_model", "low_model", "positive", "negative", "selected_index", "selected_name")
    FUNCTION = "select_preset"

    @classmethod
    def INPUT_TYPES(cls):
        # Dropdown choices populated from the ComfyUI loras folder (e.g. MimicPC's
        # models/loras). "None" is prepended so a slot can be left empty.
        lora_options = ["None"] + folder_paths.get_filename_list("loras")

        required = {
            "model": ("MODEL",),
            "clip": ("CLIP",),
            # control_after_generate adds the fixed/increment/decrement/randomize
            # dropdown so preset_index can auto-advance each queue run.
            "preset_index": ("INT", {"default": 0, "min": 0, "max": 999999, "step": 1, "control_after_generate": True}),
        }

        for i in range(10):
            required[f"preset_{i}_name"] = (
                "STRING",
                {"default": f"Preset {i}", "multiline": False},
            )
            required[f"preset_{i}_high_lora"] = (lora_options,)
            required[f"preset_{i}_high_strength"] = (
                "FLOAT",
                {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05},
            )
            required[f"preset_{i}_low_lora"] = (lora_options,)
            required[f"preset_{i}_low_strength"] = (
                "FLOAT",
                {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05},
            )
            required[f"preset_{i}_positive"] = (
                "STRING",
                {"default": "", "multiline": True, "dynamicPrompts": False},
            )
            required[f"preset_{i}_negative"] = (
                "STRING",
                {"default": "", "multiline": True, "dynamicPrompts": False},
            )

        return {"required": required, "optional": {"model_low": ("MODEL",)}}

    def select_preset(self, model, clip, preset_index, model_low=None, **kwargs):
        idx = int(preset_index) % 10

        name = kwargs.get(f"preset_{idx}_name", f"Preset {idx}")
        high_lora = kwargs.get(f"preset_{idx}_high_lora", "None")
        high_strength = kwargs.get(f"preset_{idx}_high_strength", 1.0)
        low_lora = kwargs.get(f"preset_{idx}_low_lora", "None")
        low_strength = kwargs.get(f"preset_{idx}_low_strength", 1.0)
        positive = kwargs.get(f"preset_{idx}_positive", "")
        negative = kwargs.get(f"preset_{idx}_negative", "")

        high_model = lora_utils.apply_single_lora(model, clip, high_lora, high_strength)
        low_base = model if model_low is None else model_low
        low_model = lora_utils.apply_single_lora(low_base, clip, low_lora, low_strength)
        positive_cond = lora_utils.encode_text(clip, positive)
        negative_cond = lora_utils.encode_text(clip, negative)

        return (high_model, low_model, positive_cond, negative_cond, idx, str(name))


class Modulo10:
    """
    Small helper node. Useful if you want to feed a continuously incrementing INT
    into the preset selector while keeping the effective preset range at 0..9.
    """

    CATEGORY = "presets"
    RETURN_TYPES = ("INT", "STRING")
    RETURN_NAMES = ("preset_index", "preset_label")
    FUNCTION = "wrap"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "index": ("INT", {"default": 0, "min": 0, "max": 999999, "step": 1, "control_after_generate": True}),
            }
        }

    def wrap(self, index):
        idx = int(index) % 10
        return (idx, f"Preset {idx}")


# Note: the mapping keys are the internal node IDs referenced by saved workflows.
# They were renamed from the old "Igoon*" IDs, so workflows saved with the previous
# version will show these nodes as missing and need to be re-added.
NODE_CLASS_MAPPINGS = {
    "PresetSelector10": PresetSelector10,
    "Modulo10": Modulo10,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PresetSelector10": "Preset Selector 10",
    "Modulo10": "Modulo 10",
}
