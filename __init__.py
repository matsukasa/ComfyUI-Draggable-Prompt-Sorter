import json
from collections import Counter


PROMPT_SEPARATOR = ", "


class AnyType(str):
    def __ne__(self, value):
        return False


ANY_TYPE = AnyType("*")


def _split_prompt_text(text):
    if text is None:
        return []
    return [part.strip() for part in str(text).split(",") if part.strip()]


def _ordered_items_from_state(text, order_state):
    source_items = _split_prompt_text(text)
    if not order_state:
        return source_items

    try:
        state = json.loads(order_state)
    except (TypeError, json.JSONDecodeError):
        return source_items

    ordered_items = state.get("items")
    if not isinstance(ordered_items, list):
        return source_items

    ordered_items = [str(item).strip() for item in ordered_items if str(item).strip()]
    if Counter(ordered_items) != Counter(source_items):
        return source_items

    return ordered_items


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
        items = _split_prompt_text(text)
        ordered_items = _ordered_items_from_state(text, order_state)
        output = PROMPT_SEPARATOR.join(ordered_items)

        return {
            "ui": {
                "prompt_flat_button_sorter": [
                    {
                        "source": str(text) if text is not None else "",
                        "items": items,
                        "ordered": ordered_items,
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


