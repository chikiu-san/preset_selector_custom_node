from .preset_selector import (
    NODE_CLASS_MAPPINGS as _selector_class,
    NODE_DISPLAY_NAME_MAPPINGS as _selector_display,
)
from .preset_library import (
    NODE_CLASS_MAPPINGS as _library_class,
    NODE_DISPLAY_NAME_MAPPINGS as _library_display,
)

WEB_DIRECTORY = "./web"

NODE_CLASS_MAPPINGS = {**_selector_class, **_library_class}
NODE_DISPLAY_NAME_MAPPINGS = {**_selector_display, **_library_display}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
