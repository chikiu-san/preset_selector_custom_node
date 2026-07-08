"""Install stub `folder_paths` / `comfy.*` modules so the node code imports
without a running ComfyUI, and put the repo root on sys.path for direct imports."""
import os
import sys
import types

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def install_stubs():
    if REPO_ROOT not in sys.path:
        sys.path.insert(0, REPO_ROOT)

    if "folder_paths" not in sys.modules:
        fp = types.ModuleType("folder_paths")
        fp.get_filename_list = lambda folder: []
        fp.get_full_path = lambda folder, name: None
        fp.get_user_directory = lambda: "/tmp"
        sys.modules["folder_paths"] = fp

    comfy = sys.modules.get("comfy") or types.ModuleType("comfy")
    sys.modules["comfy"] = comfy
    if "comfy.sd" not in sys.modules:
        sd = types.ModuleType("comfy.sd")
        sd.load_lora_for_models = lambda model, clip, lora, s1, s2: (model, clip)
        sys.modules["comfy.sd"] = sd
    if "comfy.utils" not in sys.modules:
        cu = types.ModuleType("comfy.utils")
        cu.load_torch_file = lambda path, safe_load=True: {"_stub_lora": path}
        sys.modules["comfy.utils"] = cu
    # Submodules were pre-inserted into sys.modules, so `import comfy.sd` will
    # NOT set these attributes on the parent. Set them explicitly so both
    # lora_utils' runtime access (comfy.sd.load_lora_for_models) and the tests'
    # patch.object(lora_utils.comfy.sd, ...) resolve.
    comfy.sd = sys.modules["comfy.sd"]
    comfy.utils = sys.modules["comfy.utils"]

    return sys.modules["folder_paths"], sys.modules["comfy.sd"], sys.modules["comfy.utils"]
