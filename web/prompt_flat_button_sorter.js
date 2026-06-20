import { app } from "../../scripts/app.js";

const EXTENSION_NAME = "draggablePromptSorter.draggablePromptSorter";
const NODE_NAME = "DraggablePromptSorter";

function splitPromptText(text) {
  return String(text ?? "")
    .split(",")
    .map((line) => line.trim())
    .filter(Boolean);
}

function getWidget(node, name) {
  return node.widgets?.find((widget) => widget.name === name);
}

function hideWidget(widget) {
  if (!widget) return;
  widget.type = "hidden";
  widget.computeSize = () => [0, -4];
}

function sameMultiset(a, b) {
  if (a.length !== b.length) return false;
  const counts = new Map();
  for (const item of a) counts.set(item, (counts.get(item) ?? 0) + 1);
  for (const item of b) {
    const next = (counts.get(item) ?? 0) - 1;
    if (next < 0) return false;
    if (next === 0) counts.delete(item);
    else counts.set(item, next);
  }
  return counts.size === 0;
}

function readState(node) {
  const widget = getWidget(node, "order_state");
  if (!widget?.value) return null;

  try {
    return JSON.parse(widget.value);
  } catch {
    return null;
  }
}

function writeState(node, items) {
  const widget = getWidget(node, "order_state");
  if (!widget) return;

  widget.value = JSON.stringify({ items });
  node.setDirtyCanvas(true, true);
}

function reorder(items, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

async function queueThisNode(node) {
  try {
    if (typeof app.queuePrompt !== "function") {
      throw new Error("app.queuePrompt is not available in this ComfyUI frontend.");
    }
    await app.queuePrompt(-1, 1, [String(node.id)]);
  } catch (error) {
    console.error("Draggable Prompt Sorter: failed to update buttons", error);
    alert(`Draggable Prompt Sorter: failed to update buttons.\n${error?.message ?? error}`);
  }
}

function stopCanvasEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

function createButtonElement(label, index, onMove) {
  const button = document.createElement("button");
  button.type = "button";
  button.draggable = true;
  button.textContent = label;
  button.dataset.index = String(index);
  button.title = label;

  Object.assign(button.style, {
    appearance: "none",
    border: "1px solid #555",
    borderRadius: "4px",
    background: "#303030",
    color: "#f1f1f1",
    cursor: "grab",
    font: "12px Arial, sans-serif",
    lineHeight: "18px",
    maxWidth: "100%",
    minHeight: "26px",
    overflow: "hidden",
    padding: "4px 9px",
    textOverflow: "ellipsis",
    userSelect: "none",
    whiteSpace: "nowrap",
  });

  button.addEventListener("pointerdown", (event) => event.stopPropagation());
  button.addEventListener("mousedown", (event) => event.stopPropagation());
  button.addEventListener("click", (event) => event.stopPropagation());

  button.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    button.style.cursor = "grabbing";
    button.style.background = "#2f7dd3";
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  });

  button.addEventListener("dragend", (event) => {
    event.stopPropagation();
    button.style.cursor = "grab";
    button.style.background = "#303030";
  });

  button.addEventListener("dragover", (event) => {
    stopCanvasEvent(event);
    event.dataTransfer.dropEffect = "move";
    button.style.background = "#3f3f3f";
  });

  button.addEventListener("dragleave", (event) => {
    event.stopPropagation();
    button.style.background = "#303030";
  });

  button.addEventListener("drop", (event) => {
    stopCanvasEvent(event);
    button.style.background = "#303030";
    const fromIndex = Number(event.dataTransfer.getData("text/plain"));
    onMove(fromIndex, index);
  });

  return button;
}

function createDomButtonsWidget(node) {
  const container = document.createElement("div");
  Object.assign(container.style, {
    boxSizing: "border-box",
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    minHeight: "34px",
    padding: "4px 8px 8px",
    width: "100%",
  });

  for (const eventName of ["pointerdown", "mousedown", "click", "dragover", "drop"]) {
    container.addEventListener(eventName, (event) => event.stopPropagation());
  }

  const api = {
    value: [],

    setItems(items) {
      const current = Array.isArray(this.value) ? this.value : [];
      this.value = sameMultiset(current, items) ? current : [...items];
      writeState(node, this.value);
      this.render();
    },

    render() {
      container.replaceChildren();
      for (const [index, label] of this.value.entries()) {
        container.appendChild(
          createButtonElement(label, index, (fromIndex, toIndex) => {
            this.value = reorder(this.value, fromIndex, toIndex);
            writeState(node, this.value);
            this.render();
          })
        );
      }
      node.setDirtyCanvas(true, true);
    },
  };

  const widget = node.addDOMWidget("prompt_buttons", "div", container, {
    getValue: () => api.value,
    setValue: (value) => {
      api.setItems(Array.isArray(value) ? value : []);
    },
  });

  widget.serialize = false;
  widget.computeSize = (width) => {
    container.style.width = `${Math.max(120, width - 16)}px`;
    const rows = Math.max(1, Math.ceil(api.value.length / 3));
    const measuredHeight = container.offsetHeight || rows * 34 + 12;
    return [width, Math.max(42, measuredHeight + 8)];
  };

  widget.setItems = api.setItems.bind(api);
  widget.render = api.render.bind(api);
  return widget;
}

function layoutButtons(ctx, items, width) {
  const gap = 6;
  const xPad = 9;
  const buttonHeight = 26;
  const left = 8;
  const maxRight = Math.max(120, width - 8);
  const rows = [];
  let x = left;
  let y = 4;

  ctx.font = "12px Arial";

  for (let index = 0; index < items.length; index++) {
    const label = items[index];
    const textWidth = Math.min(ctx.measureText(label).width, Math.max(80, width - 40));
    const buttonWidth = Math.max(52, Math.ceil(textWidth + xPad * 2));

    if (x + buttonWidth > maxRight && x > left) {
      x = left;
      y += buttonHeight + gap;
    }

    rows.push({ index, x, y, w: Math.min(buttonWidth, maxRight - left), h: buttonHeight });
    x += buttonWidth + gap;
  }

  return {
    buttons: rows,
    height: items.length ? y + buttonHeight + 8 : 38,
  };
}

function createCanvasButtonsWidget(node) {
  const widget = {
    name: "prompt_buttons",
    type: "custom",
    value: [],
    y: 0,
    lastLayout: [],
    dragIndex: null,
    hoverIndex: null,

    computeSize(width) {
      return [width, Math.max(42, this.layoutHeight ?? 42)];
    },

    setItems(items) {
      const current = Array.isArray(this.value) ? this.value : [];
      this.value = sameMultiset(current, items) ? current : [...items];
      writeState(node, this.value);
      node.setDirtyCanvas(true, true);
    },

    draw(ctx, _node, width, y) {
      const items = Array.isArray(this.value) ? this.value : [];
      this.y = y;
      ctx.save();
      ctx.translate(0, y);

      const { buttons, height } = layoutButtons(ctx, items, width);
      this.lastLayout = buttons;
      this.layoutHeight = height;

      for (const rect of buttons) {
        const label = items[rect.index];
        const isDragging = this.dragIndex === rect.index;
        const isHover = this.hoverIndex === rect.index;

        ctx.fillStyle = isDragging ? "#2f7dd3" : isHover ? "#3f3f3f" : "#303030";
        ctx.strokeStyle = isDragging ? "#78b6ff" : "#555";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#f1f1f1";
        ctx.font = "12px Arial";
        ctx.textBaseline = "middle";
        const maxTextWidth = rect.w - 18;
        let displayLabel = label;
        while (ctx.measureText(displayLabel).width > maxTextWidth && displayLabel.length > 4) {
          displayLabel = `${displayLabel.slice(0, -3)}...`;
        }
        ctx.fillText(displayLabel, rect.x + 9, rect.y + rect.h / 2);
      }

      ctx.restore();
    },

    mouse(event, pos) {
      const localY = pos[1] - this.y;
      const hit = this.lastLayout.find(
        (rect) =>
          pos[0] >= rect.x &&
          pos[0] <= rect.x + rect.w &&
          localY >= rect.y &&
          localY <= rect.y + rect.h
      );

      if ((event.type === "pointerdown" || event.type === "mousedown") && hit) {
        this.dragIndex = hit.index;
        this.hoverIndex = hit.index;
        return true;
      }

      if (event.type === "pointermove" || event.type === "mousemove") {
        this.hoverIndex = hit?.index ?? null;
        if (this.dragIndex !== null && hit && hit.index !== this.dragIndex) {
          this.value = reorder(this.value, this.dragIndex, hit.index);
          this.dragIndex = hit.index;
          writeState(node, this.value);
        }
        node.setDirtyCanvas(true, true);
        return this.dragIndex !== null || Boolean(hit);
      }

      if (
        event.type === "pointerup" ||
        event.type === "mouseup" ||
        event.type === "pointercancel"
      ) {
        this.dragIndex = null;
        this.hoverIndex = null;
        node.setDirtyCanvas(true, true);
        return true;
      }

      return Boolean(hit);
    },
  };

  node.addCustomWidget(widget);
  return widget;
}

function createPromptButtonsWidget(node) {
  if (typeof node.addDOMWidget === "function") {
    return createDomButtonsWidget(node);
  }
  return createCanvasButtonsWidget(node);
}

app.registerExtension({
  name: EXTENSION_NAME,

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);

      hideWidget(getWidget(this, "text"));
      hideWidget(getWidget(this, "order_state"));

      this.addWidget("button", "Update Buttons", "", () => queueThisNode(this));
      this.promptButtonsWidget = createPromptButtonsWidget(this);

      const textWidget = getWidget(this, "text");
      if (textWidget?.value) {
        this.promptButtonsWidget.setItems(splitPromptText(textWidget.value));
      }
    };

    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      onExecuted?.apply(this, arguments);

      const payload = Array.isArray(message?.prompt_flat_button_sorter)
        ? message.prompt_flat_button_sorter[0]
        : message?.prompt_flat_button_sorter;

      if (!payload?.items || !this.promptButtonsWidget) return;

      const state = readState(this);
      const ordered = Array.isArray(payload.ordered) ? payload.ordered : payload.items;
      const nextItems =
        state?.items && sameMultiset(state.items, payload.items) ? state.items : ordered;

      this.promptButtonsWidget.setItems(nextItems);
    };
  },
});
