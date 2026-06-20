import json
from collections import Counter


PROMPT_SEPARATOR = ", "
STATE_VERSION = 2


class AnyType(str):
    def __ne__(self, value):
        return False


ANY_TYPE = AnyType("*")


def _split_prompt_text(text):
    if text is None:
        return []
    return [part.strip() for part in str(text).split(",") if part.strip()]


def _default_entries(text):
    return [{"text": item, "enabled": True} for item in _split_prompt_text(text)]


def _entries_from_state(text, order_state):
    source_items = _split_prompt_text(text)
    if not order_state:
        return _default_entries(text)

    try:
        state = json.loads(order_state)
    except (TypeError, json.JSONDecodeError):
        return _default_entries(text)

    state_items = state.get("items")
    if not isinstance(state_items, list):
        return _default_entries(text)

    entries = []
    for item in state_items:
        if isinstance(item, dict):
            item_text = str(item.get("text", "")).strip()
            enabled = bool(item.get("enabled", True))
        else:
            # Migrate the original string-only state as enabled entries.
            item_text = str(item).strip()
            enabled = True

        if item_text:
            entries.append({"text": item_text, "enabled": enabled})

    if Counter(entry["text"] for entry in entries) != Counter(source_items):
        return _default_entries(text)

    return entries


class DraggablePromptSorter:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": (ANY_TYPE, {"forceInput": True}),
                "order_state": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                    },
                ),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    OUTPUT_NODE = True
    FUNCTION = "sort_prompt"
    CATEGORY = "prompt"

    def sort_prompt(self, text, order_state=""):
        entries = _entries_from_state(text, order_state)
        output = PROMPT_SEPARATOR.join(
            entry["text"] for entry in entries if entry["enabled"]
        )

        return {
            "ui": {
                "prompt_flat_button_sorter": [
                    {
                        "version": STATE_VERSION,
                        "items": [entry["text"] for entry in entries],
                        "entries": entries,
                    }
                ]
            },
            "result": (output,),
        }


NODE_CLASS_MAPPINGS = {
    "DraggablePromptSorter": DraggablePromptSorter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DraggablePromptSorter": "Draggable Prompt Sorter",
}

WEB_DIRECTORY = "./web"
