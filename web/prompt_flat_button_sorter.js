import { app } from "../../scripts/app.js";

const EXTENSION_NAME = "draggablePromptSorter.draggablePromptSorter";
const NODE_NAME = "DraggablePromptSorter";
const STATE_VERSION = 2;
const BUTTON_VIEWPORT_HEIGHT = 160;
const UPDATE_ROW_HEIGHT = 28;
const UPDATE_LEFT_INSET = 76;

function splitPromptText(text) {
  return String(text ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function makeEntries(items) {
  return items
    .map((text) => ({ text: String(text).trim(), enabled: true }))
    .filter((item) => item.text);
}

function normalizeEntries(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (item && typeof item === "object") {
        return {
          text: String(item.text ?? "").trim(),
          enabled: item.enabled !== false,
        };
      }
      return { text: String(item ?? "").trim(), enabled: true };
    })
    .filter((item) => item.text);
}

function getWidget(node, name) {
  return node.widgets?.find((widget) => widget.name === name);
}

function hideWidget(widget) {
  if (!widget) return;
  widget.type = "converted-widget";
  widget.computeSize = () => [0, -4];
  widget.draw = () => {};
  widget.hidden = true;
  widget.visible = false;
  widget.serialize = true;
  widget.serializeValue = async () => widget.value;
  widget.options = { ...widget.options, hidden: true, serialize: true };

  for (const element of [widget.element, widget.inputEl, widget.el]) {
    if (!element) continue;
    if (element.style) {
      Object.assign(element.style, {
        border: "0",
        display: "none",
        height: "0",
        margin: "0",
        maxHeight: "0",
        minHeight: "0",
        overflow: "hidden",
        padding: "0",
        pointerEvents: "none",
        visibility: "hidden",
        width: "0",
      });
    }
    element.remove?.();
  }
}

function sameTextMultiset(entries, texts) {
  if (entries.length !== texts.length) return false;
  const counts = new Map();
  for (const entry of entries) counts.set(entry.text, (counts.get(entry.text) ?? 0) + 1);
  for (const text of texts) {
    const next = (counts.get(text) ?? 0) - 1;
    if (next < 0) return false;
    if (next === 0) counts.delete(text);
    else counts.set(text, next);
  }
  return counts.size === 0;
}

function readState(node) {
  const widget = getWidget(node, "order_state");
  if (!widget?.value) return null;

  try {
    const state = JSON.parse(widget.value);
    const entries = normalizeEntries(state.items);
    return entries.length ? { version: state.version ?? 1, entries } : null;
  } catch {
    return null;
  }
}

function writeState(node, entries) {
  const widget = getWidget(node, "order_state");
  if (!widget) return;

  widget.value = JSON.stringify({
    version: STATE_VERSION,
    items: entries.map((entry) => ({ text: entry.text, enabled: entry.enabled })),
  });
  node.graph?.change?.();
  node.graph?.setDirtyCanvas(true, true);
  node.setDirtyCanvas(true, true);
}

function reorder(entries, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return entries;
  const next = entries.map((entry) => ({ ...entry }));
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function preserveNodeSize(node, callback) {
  const size = Array.isArray(node.size) ? [...node.size] : null;
  callback();
  if (!size) return;

  requestAnimationFrame(() => {
    if (node.size?.[0] !== size[0] || node.size?.[1] !== size[1]) {
      node.setSize(size);
    }
    node.setDirtyCanvas(true, true);
  });
}

function getCurrentUiEntries(node) {
  return normalizeEntries(node.promptButtonsWidget?.getEntries?.() ?? []);
}

function syncCurrentUiState(node) {
  const entries = getCurrentUiEntries(node);
  if (entries.length) writeState(node, entries);
  return entries;
}

async function queueThisNode(node) {
  try {
    if (typeof app.queuePrompt !== "function") {
      throw new Error("app.queuePrompt is not available in this ComfyUI frontend.");
    }
    syncCurrentUiState(node);
    await app.queuePrompt(-1, 1, [String(node.id)]);
  } catch (error) {
    console.error("Draggable Prompt Sorter: failed to update buttons", error);
    alert(`Draggable Prompt Sorter: failed to update buttons.\n${error?.message ?? error}`);
  }
}

function applyButtonStyle(button, entry, dragState = "idle") {
  const enabledBackground = dragState === "dragging" ? "#1f6fbd" : "#2f7dd3";
  const disabledBackground = dragState === "dragging" ? "#3a3a3a" : "#242424";
  button.style.background = entry.enabled ? enabledBackground : disabledBackground;
  button.style.borderColor = dragState === "target" ? "#9ac7ff" : entry.enabled ? "#78b6ff" : "#555";
  button.style.color = entry.enabled ? "#fff" : "#aaa";
  button.style.opacity = entry.enabled ? "1" : "0.55";
  button.style.textDecoration = entry.enabled ? "none" : "line-through";
}

function createButtonElement(entry, index, onMove, onToggle) {
  const button = document.createElement("button");
  let suppressClickUntil = 0;

  button.type = "button";
  button.draggable = true;
  button.textContent = entry.text;
  button.dataset.index = String(index);
  button.title = entry.text;
  button.setAttribute("aria-pressed", String(entry.enabled));

  Object.assign(button.style, {
    appearance: "none",
    border: "1px solid",
    borderRadius: "4px",
    boxSizing: "border-box",
    cursor: "grab",
    display: "inline-flex",
    font: "12px Arial, sans-serif",
    justifyContent: "center",
    lineHeight: "18px",
    maxWidth: "100%",
    minHeight: "28px",
    overflowWrap: "anywhere",
    padding: "4px 9px",
    textAlign: "left",
    userSelect: "none",
    whiteSpace: "normal",
    wordBreak: "break-word",
  });
  applyButtonStyle(button, entry);

  for (const eventName of ["pointerdown", "mousedown"]) {
    button.addEventListener(eventName, (event) => event.stopPropagation());
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (performance.now() < suppressClickUntil) return;
    onToggle(index);
  });

  button.addEventListener("dragstart", (event) => {
    suppressClickUntil = performance.now() + 500;
    event.stopPropagation();
    button.style.cursor = "grabbing";
    applyButtonStyle(button, entry, "dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  });

  button.addEventListener("dragend", (event) => {
    event.stopPropagation();
    button.style.cursor = "grab";
    applyButtonStyle(button, entry);
    suppressClickUntil = performance.now() + 250;
  });

  button.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    applyButtonStyle(button, entry, "target");
  });

  button.addEventListener("dragleave", (event) => {
    event.stopPropagation();
    applyButtonStyle(button, entry);
  });

  button.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    applyButtonStyle(button, entry);
    const fromIndex = Number(event.dataTransfer.getData("text/plain"));
    onMove(fromIndex, index);
  });

  return button;
}

function createDomButtonsWidget(node) {
  const container = document.createElement("div");
  Object.assign(container.style, {
    alignContent: "flex-start",
    boxSizing: "border-box",
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    height: `${BUTTON_VIEWPORT_HEIGHT}px`,
    overflowX: "hidden",
    overflowY: "auto",
    padding: "4px 8px 8px",
    width: "100%",
  });

  for (const eventName of ["pointerdown", "mousedown", "click", "dragover", "drop"]) {
    container.addEventListener(eventName, (event) => event.stopPropagation());
  }

  const api = {
    entries: [],

    getEntries() {
      return this.entries.map((entry) => ({ ...entry }));
    },

    setEntries(entries, save = true) {
      this.entries = normalizeEntries(entries);
      if (save) writeState(node, this.entries);
      preserveNodeSize(node, () => this.render());
    },

    setSourceItems(items) {
      const state = readState(node);
      const entries = state && sameTextMultiset(state.entries, items) ? state.entries : makeEntries(items);
      this.setEntries(entries);
    },

    render() {
      container.replaceChildren();
      for (const [index, entry] of this.entries.entries()) {
        container.appendChild(
          createButtonElement(
            entry,
            index,
            (fromIndex, toIndex) => {
              this.entries = reorder(this.entries, fromIndex, toIndex);
              writeState(node, this.entries);
              preserveNodeSize(node, () => this.render());
            },
            (toggleIndex) => {
              this.entries = this.entries.map((item, itemIndex) =>
                itemIndex === toggleIndex ? { ...item, enabled: !item.enabled } : item
              );
              writeState(node, this.entries);
              preserveNodeSize(node, () => this.render());
            }
          )
        );
      }
      node.setDirtyCanvas(true, true);
    },
  };

  const widget = node.addDOMWidget("prompt_buttons", "div", container, {
    getValue: () => api.entries,
    setValue: (value) => api.setEntries(value, false),
  });

  widget.serialize = false;
  widget.computeSize = (width) => [width, BUTTON_VIEWPORT_HEIGHT + 12];
  widget.getEntries = api.getEntries.bind(api);
  widget.setEntries = api.setEntries.bind(api);
  widget.setSourceItems = api.setSourceItems.bind(api);
  widget.render = api.render.bind(api);
  return widget;
}

function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  let line = "";

  for (const character of text) {
    const candidate = line + character;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = character;
    } else {
      line = candidate;
    }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

function layoutCanvasButtons(ctx, entries, width) {
  const gap = 6;
  const left = 8;
  const buttonWidth = Math.max(80, width - 16);
  const textWidth = Math.max(48, buttonWidth - 18);
  const layout = [];
  let y = 4;

  ctx.font = "12px Arial";
  for (const [index, entry] of entries.entries()) {
    const lines = wrapCanvasText(ctx, entry.text, textWidth);
    const height = Math.max(28, lines.length * 16 + 10);
    layout.push({ index, x: left, y, w: buttonWidth, h: height, lines });
    y += height + gap;
  }

  return { buttons: layout, contentHeight: Math.max(0, y - gap + 4) };
}

function createCanvasButtonsWidget(node) {
  const widget = {
    name: "prompt_buttons",
    type: "custom",
    entries: [],
    y: 0,
    lastLayout: [],
    contentHeight: 0,
    scrollOffset: 0,
    dragIndex: null,
    didDrag: false,

    computeSize(width) {
      return [width, BUTTON_VIEWPORT_HEIGHT + 12];
    },

    getEntries() {
      return this.entries.map((entry) => ({ ...entry }));
    },

    setEntries(entries, save = true) {
      this.entries = normalizeEntries(entries);
      if (save) writeState(node, this.entries);
      this.scrollOffset = Math.min(this.scrollOffset, this.maxScroll());
      node.setDirtyCanvas(true, true);
    },

    setSourceItems(items) {
      const state = readState(node);
      const entries = state && sameTextMultiset(state.entries, items) ? state.entries : makeEntries(items);
      this.setEntries(entries);
    },

    maxScroll() {
      return Math.max(0, this.contentHeight - BUTTON_VIEWPORT_HEIGHT);
    },

    draw(ctx, _node, width, y) {
      this.y = y;
      const { buttons, contentHeight } = layoutCanvasButtons(ctx, this.entries, width);
      this.lastLayout = buttons;
      this.contentHeight = contentHeight;
      this.scrollOffset = Math.min(this.scrollOffset, this.maxScroll());

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, width, BUTTON_VIEWPORT_HEIGHT);
      ctx.clip();
      ctx.translate(0, y - this.scrollOffset);

      for (const rect of buttons) {
        const entry = this.entries[rect.index];
        const isDragging = this.dragIndex === rect.index;
        ctx.fillStyle = entry.enabled ? (isDragging ? "#1f6fbd" : "#2f7dd3") : "#242424";
        ctx.strokeStyle = entry.enabled ? "#78b6ff" : "#555";
        ctx.globalAlpha = entry.enabled ? 1 : 0.55;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = entry.enabled ? "#fff" : "#aaa";
        ctx.font = "12px Arial";
        ctx.textBaseline = "top";
        rect.lines.forEach((line, lineIndex) => {
          ctx.fillText(line, rect.x + 9, rect.y + 5 + lineIndex * 16);
        });
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },

    mouse(event, pos) {
      if (event.type === "wheel") {
        this.scrollOffset = Math.max(0, Math.min(this.maxScroll(), this.scrollOffset + event.deltaY));
        node.setDirtyCanvas(true, true);
        return true;
      }

      const contentY = pos[1] - this.y + this.scrollOffset;
      const hit = this.lastLayout.find(
        (rect) =>
          pos[0] >= rect.x &&
          pos[0] <= rect.x + rect.w &&
          contentY >= rect.y &&
          contentY <= rect.y + rect.h
      );

      if ((event.type === "pointerdown" || event.type === "mousedown") && hit) {
        this.dragIndex = hit.index;
        this.didDrag = false;
        return true;
      }

      if (event.type === "pointermove" || event.type === "mousemove") {
        if (this.dragIndex !== null && hit && hit.index !== this.dragIndex) {
          this.entries = reorder(this.entries, this.dragIndex, hit.index);
          this.dragIndex = hit.index;
          this.didDrag = true;
          writeState(node, this.entries);
        }
        node.setDirtyCanvas(true, true);
        return this.dragIndex !== null || Boolean(hit);
      }

      if (event.type === "pointerup" || event.type === "mouseup" || event.type === "pointercancel") {
        if (!this.didDrag && this.dragIndex !== null && hit?.index === this.dragIndex) {
          this.entries[this.dragIndex] = {
            ...this.entries[this.dragIndex],
            enabled: !this.entries[this.dragIndex].enabled,
          };
          writeState(node, this.entries);
        }
        this.dragIndex = null;
        this.didDrag = false;
        node.setDirtyCanvas(true, true);
        return true;
      }

      return Boolean(hit);
    },
  };

  node.addCustomWidget(widget);
  return widget;
}

function createCanvasUpdateWidget(node) {
  const widget = {
    name: "update",
    type: "custom",
    y: 0,
    pressed: false,
    bounds: null,
    serialize: false,

    computeSize(width) {
      return [width, UPDATE_ROW_HEIGHT];
    },

    draw(ctx, _node, width, y) {
      this.y = y;
      const x = Math.min(UPDATE_LEFT_INSET, Math.max(52, width - 48));
      const buttonWidth = Math.max(36, width - x - 8);
      const buttonHeight = 22;
      const buttonY = y + 2;
      this.bounds = { x, y: buttonY, w: buttonWidth, h: buttonHeight };

      ctx.save();
      ctx.fillStyle = this.pressed ? "#284b68" : "#355f82";
      ctx.strokeStyle = this.pressed ? "#78a4c8" : "#547fa3";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, buttonY, buttonWidth, buttonHeight, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Update", x + buttonWidth / 2, buttonY + buttonHeight / 2);
      ctx.restore();
    },

    mouse(event, pos) {
      if (!this.bounds) return false;
      const hit =
        pos[0] >= this.bounds.x &&
        pos[0] <= this.bounds.x + this.bounds.w &&
        pos[1] >= this.bounds.y &&
        pos[1] <= this.bounds.y + this.bounds.h;

      if ((event.type === "pointerdown" || event.type === "mousedown") && hit) {
        this.pressed = true;
        node.setDirtyCanvas(true, true);
        return true;
      }

      if (event.type === "pointerup" || event.type === "mouseup") {
        const shouldUpdate = this.pressed && hit;
        this.pressed = false;
        node.setDirtyCanvas(true, true);
        if (shouldUpdate) queueThisNode(node);
        return shouldUpdate;
      }

      if (event.type === "pointercancel" || event.type === "mouseleave") {
        this.pressed = false;
        node.setDirtyCanvas(true, true);
        return true;
      }

      return hit;
    },
  };

  node.addCustomWidget(widget);
  return widget;
}

function createDomUpdateWidget(node) {
  const row = document.createElement("div");
  const button = document.createElement("button");

  Object.assign(row.style, {
    boxSizing: "border-box",
    height: `${UPDATE_ROW_HEIGHT}px`,
    padding: `2px 8px 4px ${UPDATE_LEFT_INSET}px`,
    pointerEvents: "none",
    width: "100%",
  });

  button.type = "button";
  button.textContent = "Update";
  Object.assign(button.style, {
    appearance: "none",
    background: "#355f82",
    border: "1px solid #547fa3",
    borderRadius: "4px",
    boxSizing: "border-box",
    color: "#ffffff",
    cursor: "pointer",
    font: "12px Arial, sans-serif",
    height: "22px",
    padding: "0 8px",
    pointerEvents: "auto",
    width: "100%",
  });

  for (const eventName of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
    button.addEventListener(eventName, (event) => event.stopPropagation());
  }
  button.addEventListener("pointerdown", () => {
    button.style.background = "#284b68";
  });
  button.addEventListener("pointerup", () => {
    button.style.background = "#355f82";
  });
  button.addEventListener("pointercancel", () => {
    button.style.background = "#355f82";
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = "#355f82";
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    queueThisNode(node);
  });

  row.appendChild(button);
  const widget = node.addDOMWidget("update", "div", row, {
    getValue: () => undefined,
    hideOnZoom: false,
  });
  widget.serialize = false;
  widget.computeSize = (width) => {
    row.style.width = `${width}px`;
    return [width, UPDATE_ROW_HEIGHT];
  };
  return widget;
}

function createUpdateWidget(node) {
  if (typeof node.addDOMWidget === "function") return createDomUpdateWidget(node);
  return createCanvasUpdateWidget(node);
}

function createPromptButtonsWidget(node) {
  if (typeof node.addDOMWidget === "function") return createDomButtonsWidget(node);
  return createCanvasButtonsWidget(node);
}

function moveVisibleWidgetsFirst(node, updateWidget, promptWidget) {
  const remainingWidgets = node.widgets.filter(
    (widget) => widget !== updateWidget && widget !== promptWidget
  );
  node.widgets = [updateWidget, promptWidget, ...remainingWidgets];
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

      this.widgets_start_y = 0;
      const updateWidget = createUpdateWidget(this);
      this.promptButtonsWidget = createPromptButtonsWidget(this);
      moveVisibleWidgetsFirst(this, updateWidget, this.promptButtonsWidget);

      const textWidget = getWidget(this, "text");
      if (textWidget?.value) this.promptButtonsWidget.setSourceItems(splitPromptText(textWidget.value));
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      onConfigure?.apply(this, arguments);
      const state = readState(this);
      if (state?.entries && this.promptButtonsWidget) {
        this.promptButtonsWidget.setEntries(state.entries, false);
      }
    };

    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      onExecuted?.apply(this, arguments);

      const payload = Array.isArray(message?.prompt_flat_button_sorter)
        ? message.prompt_flat_button_sorter[0]
        : message?.prompt_flat_button_sorter;

      if (!payload || !this.promptButtonsWidget) return;
      const incomingEntries = normalizeEntries(payload.entries ?? makeEntries(payload.items ?? []));
      const incomingTexts = incomingEntries.map((entry) => entry.text);
      const currentUiEntries = getCurrentUiEntries(this);
      const savedEntries = readState(this)?.entries ?? [];
      const preferredEntries = currentUiEntries.length ? currentUiEntries : savedEntries;

      if (preferredEntries.length && sameTextMultiset(preferredEntries, incomingTexts)) {
        this.promptButtonsWidget.setEntries(preferredEntries, false);
        return;
      }

      this.promptButtonsWidget.setEntries(incomingEntries);
    };
  },
});
