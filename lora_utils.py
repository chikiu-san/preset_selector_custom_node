import os

import folder_paths
import comfy.sd
import comfy.utils

_lora_cache = {}


def resolve_lora_path(lora_name):
    if not lora_name:
        return None
    lora_name = lora_name.strip()
    if not lora_name or lora_name == "None":
        return None

    if os.path.isabs(lora_name) and os.path.exists(lora_name):
        return lora_name

    direct_path = folder_paths.get_full_path("loras", lora_name)
    if direct_path is not None:
        return direct_path

    target_base = os.path.basename(lora_name)
    for available in folder_paths.get_filename_list("loras"):
        if os.path.basename(available) == target_base:
            path = folder_paths.get_full_path("loras", available)
            if path is not None:
                return path

    raise ValueError(
        f"LoRA not found: '{lora_name}'. Use the exact filename from your loras folder."
    )


def load_lora_file(lora_name):
    path = resolve_lora_path(lora_name)
    if path is None:
        return None
    if path in _lora_cache:
        return _lora_cache[path]
    lora = comfy.utils.load_torch_file(path, safe_load=True)
    _lora_cache[path] = lora
    return lora


def apply_single_lora(model, clip, lora_name, strength):
    name = "" if lora_name is None else str(lora_name).strip()
    if name in ("", "None") or abs(float(strength)) < 1e-12:
        return model
    lora_data = load_lora_file(name)
    model_lora, _clip_unused = comfy.sd.load_lora_for_models(model, clip, lora_data, float(strength), 0.0)
    return model_lora


def encode_text(clip, text):
    text = "" if text is None else str(text)
    tokens = clip.tokenize(text)
    cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
    return [[cond, {"pooled_output": pooled}]]
