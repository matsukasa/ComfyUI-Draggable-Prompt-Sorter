import { app } from "../../scripts/app.js";

const EXTENSION_NAME = "draggablePromptSorter.draggablePromptSorter";
const NODE_NAME = "DraggablePromptSorter";
const STATE_VERSION = 2;
const BUTTON_VIEWPORT_HEIGHT = 160;
const UPDATE_ROW_HEIGHT = 22;
const UPDATE_LEFT_INSET = 76;
const WIDGETS_START_Y = 1;
const SINGLE_CLICK_DELAY_MS = 450;

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

function reorder(entries, fromIndex, targetIndex, position = "before") {
  if (fromIndex === targetIndex || fromIndex < 0 || targetIndex < 0) return entries;
  const next = entries.map((entry) => ({ ...entry }));
  const [moved] = next.splice(fromIndex, 1);
  let insertionIndex = targetIndex + (position === "after" ? 1 : 0);
  if (fromIndex < insertionIndex) insertionIndex -= 1;
  next.splice(insertionIndex, 0, moved);
  return next;
}

function getRequiredNodeHeight(node, width = node.size?.[0]) {
  const widget = node.promptButtonsWidget;
  const widgetSize = widget?.computeSize?.(width);
  if (!Array.isArray(widgetSize)) return null;
  const widgetY = Number.isFinite(widget.y) ? widget.y : WIDGETS_START_Y;
  return Math.ceil(widgetY + widgetSize[1] + 4);
}

function fitNodeToContent(node) {
  const fit = () => {
    const requiredHeight = getRequiredNodeHeight(node);
    if (!requiredHeight || !Array.isArray(node.size)) return;
    if (node.size[1] !== requiredHeight) node.setSize([node.size[0], requiredHeight]);
    node.setDirtyCanvas(true, true);
  };

  node.setDirtyCanvas(true, true);
  requestAnimationFrame(fit);
  window.setTimeout(fit, 0);
  window.setTimeout(fit, 100);
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

function createButtonElement(entry, index, onMove, onToggle, onEdit, clearDropState) {
  const button = document.createElement("button");
  let suppressClickUntil = 0;
  let clickTimer = null;

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
    clearTimeout(clickTimer);
    clickTimer = window.setTimeout(() => onToggle(index), SINGLE_CLICK_DELAY_MS);
  });

  button.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearTimeout(clickTimer);
    onEdit(index, button);
  });

  button.addEventListener("dragstart", (event) => {
    clearTimeout(clickTimer);
    suppressClickUntil = performance.now() + 500;
    event.stopPropagation();
    button.style.cursor = "grabbing";
    applyButtonStyle(button, entry, "dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  });

  button.addEventListener("dragend", (event) => {
    event.stopPropagation();
    clearDropState();
    button.style.cursor = "grab";
    applyButtonStyle(button, entry);
    suppressClickUntil = performance.now() + 250;
  });

  button.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    clearDropState();
    const bounds = button.getBoundingClientRect();
    const position = event.clientX >= bounds.left + bounds.width / 2 ? "after" : "before";
    button.dataset.dropPosition = position;
    button.style.boxShadow = position === "after" ? "4px 0 0 #b9dcff" : "-4px 0 0 #b9dcff";
    applyButtonStyle(button, entry, "target");
  });

  button.addEventListener("dragleave", (event) => {
    event.stopPropagation();
    if (!button.contains(event.relatedTarget)) clearDropState();
  });

  button.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const fromIndex = Number(event.dataTransfer.getData("text/plain"));
    const position = button.dataset.dropPosition === "after" ? "after" : "before";
    clearDropState();
    onMove(fromIndex, index, position);
  });

  return button;
}

function createDomControlsWidget(node) {
  const controlsHeight = UPDATE_ROW_HEIGHT + BUTTON_VIEWPORT_HEIGHT;
  const controls = document.createElement("div");
  const updateRow = document.createElement("div");
  const updateButton = document.createElement("button");
  const container = document.createElement("div");
  Object.assign(controls.style, {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "0",
    height: `${controlsHeight}px`,
    overflow: "hidden",
    width: "100%",
  });

  Object.assign(updateRow.style, {
    boxSizing: "border-box",
    flex: `0 0 ${UPDATE_ROW_HEIGHT}px`,
    height: `${UPDATE_ROW_HEIGHT}px`,
    padding: `0 8px 0 ${UPDATE_LEFT_INSET}px`,
    pointerEvents: "none",
    width: "100%",
  });

  updateButton.type = "button";
  updateButton.textContent = "Update";
  Object.assign(updateButton.style, {
    appearance: "none",
    background: "#355f82",
    border: "1px solid #547fa3",
    borderRadius: "4px",
    boxSizing: "border-box",
    color: "#ffffff",
    cursor: "pointer",
    font: "12px Arial, sans-serif",
    height: `${UPDATE_ROW_HEIGHT}px`,
    padding: "0 8px",
    pointerEvents: "auto",
    width: "100%",
  });

  for (const eventName of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
    updateButton.addEventListener(eventName, (event) => event.stopPropagation());
  }
  updateButton.addEventListener("pointerdown", () => {
    updateButton.style.background = "#284b68";
  });
  updateButton.addEventListener("pointerup", () => {
    updateButton.style.background = "#355f82";
  });
  updateButton.addEventListener("pointercancel", () => {
    updateButton.style.background = "#355f82";
  });
  updateButton.addEventListener("mouseleave", () => {
    updateButton.style.background = "#355f82";
  });
  updateButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    queueThisNode(node);
  });

  updateRow.appendChild(updateButton);
  Object.assign(container.style, {
    alignContent: "flex-start",
    boxSizing: "border-box",
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    height: `${BUTTON_VIEWPORT_HEIGHT}px`,
    overflowX: "hidden",
    overflowY: "auto",
    padding: "0 8px 8px",
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
      const clearDropState = () => {
        for (const item of container.children) {
          delete item.dataset.dropPosition;
          item.style.boxShadow = "none";
          const itemIndex = Number(item.dataset.index);
          if (this.entries[itemIndex]) applyButtonStyle(item, this.entries[itemIndex]);
        }
      };
      for (const [index, entry] of this.entries.entries()) {
        container.appendChild(
          createButtonElement(
            entry,
            index,
            (fromIndex, targetIndex, position) => {
              this.entries = reorder(this.entries, fromIndex, targetIndex, position);
              writeState(node, this.entries);
              preserveNodeSize(node, () => this.render());
            },
            (toggleIndex) => {
              this.entries = this.entries.map((item, itemIndex) =>
                itemIndex === toggleIndex ? { ...item, enabled: !item.enabled } : item
              );
              writeState(node, this.entries);
              preserveNodeSize(node, () => this.render());
            },
            (editIndex, button) => {
              const editor = document.createElement("input");
              const originalText = this.entries[editIndex]?.text ?? "";
              let finished = false;
              editor.type = "text";
              editor.value = originalText;
              editor.setAttribute("aria-label", "Edit tag");
              Object.assign(editor.style, {
                background: "#171717",
                border: "2px solid #9ac7ff",
                borderRadius: "4px",
                boxSizing: "border-box",
                color: "#ffffff",
                font: "12px Arial, sans-serif",
                minHeight: "28px",
                minWidth: "120px",
                padding: "4px 8px",
              });
              const finish = (save) => {
                if (finished) return;
                finished = true;
                const nextText = editor.value.trim();
                if (save && nextText && nextText !== originalText) {
                  this.entries = this.entries.map((item, itemIndex) =>
                    itemIndex === editIndex ? { ...item, text: nextText } : item
                  );
                  writeState(node, this.entries);
                }
                preserveNodeSize(node, () => this.render());
              };
              for (const eventName of ["pointerdown", "mousedown", "click", "dblclick"]) {
                editor.addEventListener(eventName, (event) => event.stopPropagation());
              }
              editor.addEventListener("keydown", (event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  finish(true);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  finish(false);
                }
              });
              editor.addEventListener("blur", () => finish(true));
              button.replaceWith(editor);
              editor.focus();
              editor.select();
            },
            clearDropState
          )
        );
      }
      node.setDirtyCanvas(true, true);
    },
  };

  controls.append(updateRow, container);
  const widget = node.addDOMWidget("prompt_buttons", "div", controls, {
    getValue: () => api.entries,
    getMaxHeight: () => controlsHeight,
    getMinHeight: () => controlsHeight,
    setValue: (value) => api.setEntries(value, false),
  });

  widget.serialize = false;
  widget.computeLayoutSize = () => ({
    minHeight: controlsHeight,
    maxHeight: controlsHeight,
    minWidth: 0,
  });
  widget.computeSize = (width) => [width, controlsHeight + 12];
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
  let y = 0;

  ctx.font = "12px Arial";
  for (const [index, entry] of entries.entries()) {
    const lines = wrapCanvasText(ctx, entry.text, textWidth);
    const height = Math.max(28, lines.length * 16 + 10);
    layout.push({ index, x: left, y, w: buttonWidth, h: height, lines });
    y += height + gap;
  }

  return { buttons: layout, contentHeight: Math.max(0, y - gap + 4) };
}

function createCanvasControlsWidget(node) {
  const widget = {
    name: "prompt_buttons",
    type: "custom",
    entries: [],
    y: 0,
    lastLayout: [],
    contentHeight: 0,
    scrollOffset: 0,
    dragIndex: null,
    dropTarget: null,
    didDrag: false,
    updatePressed: false,
    updateBounds: null,
    clickTimer: null,
    lastClickAt: 0,
    lastClickIndex: null,

    computeSize(width) {
      return [width, UPDATE_ROW_HEIGHT + BUTTON_VIEWPORT_HEIGHT + 12];
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

      const updateX = Math.min(UPDATE_LEFT_INSET, Math.max(52, width - 48));
      const updateWidth = Math.max(36, width - updateX - 8);
      this.updateBounds = { x: updateX, y, w: updateWidth, h: UPDATE_ROW_HEIGHT };

      ctx.save();
      ctx.fillStyle = this.updatePressed ? "#284b68" : "#355f82";
      ctx.strokeStyle = this.updatePressed ? "#78a4c8" : "#547fa3";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(updateX, y, updateWidth, UPDATE_ROW_HEIGHT, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Update", updateX + updateWidth / 2, y + UPDATE_ROW_HEIGHT / 2);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y + UPDATE_ROW_HEIGHT, width, BUTTON_VIEWPORT_HEIGHT);
      ctx.clip();
      ctx.translate(0, y + UPDATE_ROW_HEIGHT - this.scrollOffset);

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

      if (this.dropTarget) {
        const target = buttons.find((rect) => rect.index === this.dropTarget.index);
        if (target) {
          const indicatorX = this.dropTarget.position === "after" ? target.x + target.w + 2 : target.x - 2;
          ctx.strokeStyle = "#b9dcff";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(indicatorX, target.y + 2);
          ctx.lineTo(indicatorX, target.y + target.h - 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    },

    mouse(event, pos) {
      const updateHit =
        this.updateBounds &&
        pos[0] >= this.updateBounds.x &&
        pos[0] <= this.updateBounds.x + this.updateBounds.w &&
        pos[1] >= this.updateBounds.y &&
        pos[1] <= this.updateBounds.y + this.updateBounds.h;

      if ((event.type === "pointerdown" || event.type === "mousedown") && updateHit) {
        this.updatePressed = true;
        node.setDirtyCanvas(true, true);
        return true;
      }

      if (
        this.updatePressed &&
        (event.type === "pointerup" ||
          event.type === "mouseup" ||
          event.type === "pointercancel" ||
          event.type === "mouseleave")
      ) {
        const shouldUpdate =
          updateHit && event.type !== "pointercancel" && event.type !== "mouseleave";
        this.updatePressed = false;
        node.setDirtyCanvas(true, true);
        if (shouldUpdate) queueThisNode(node);
        return true;
      }

      if (event.type === "wheel") {
        this.scrollOffset = Math.max(0, Math.min(this.maxScroll(), this.scrollOffset + event.deltaY));
        node.setDirtyCanvas(true, true);
        return true;
      }

      const contentY = pos[1] - this.y - UPDATE_ROW_HEIGHT + this.scrollOffset;
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
        if (this.dragIndex !== null) {
          this.didDrag = this.didDrag || Boolean(hit && hit.index !== this.dragIndex);
          this.dropTarget = hit && hit.index !== this.dragIndex
            ? { index: hit.index, position: pos[0] >= hit.x + hit.w / 2 ? "after" : "before" }
            : null;
        }
        node.setDirtyCanvas(true, true);
        return this.dragIndex !== null || Boolean(hit);
      }

      if (event.type === "pointerup" || event.type === "mouseup" || event.type === "pointercancel") {
        if (event.type !== "pointercancel" && this.dragIndex !== null && this.dropTarget) {
          this.entries = reorder(this.entries, this.dragIndex, this.dropTarget.index, this.dropTarget.position);
          writeState(node, this.entries);
        } else if (!this.didDrag && this.dragIndex !== null && hit?.index === this.dragIndex) {
          const clickedIndex = this.dragIndex;
          const now = performance.now();
          const isDoubleClick =
            this.lastClickIndex === clickedIndex && now - this.lastClickAt <= SINGLE_CLICK_DELAY_MS;
          clearTimeout(this.clickTimer);
          if (isDoubleClick) {
            const nextText = window.prompt("Edit tag", this.entries[clickedIndex].text)?.trim();
            if (nextText && nextText !== this.entries[clickedIndex].text) {
              this.entries[clickedIndex] = { ...this.entries[clickedIndex], text: nextText };
              writeState(node, this.entries);
            }
            this.lastClickAt = 0;
            this.lastClickIndex = null;
          } else {
            this.lastClickAt = now;
            this.lastClickIndex = clickedIndex;
            this.clickTimer = window.setTimeout(() => {
              this.entries[clickedIndex] = {
                ...this.entries[clickedIndex],
                enabled: !this.entries[clickedIndex].enabled,
              };
              writeState(node, this.entries);
              node.setDirtyCanvas(true, true);
              this.lastClickAt = 0;
              this.lastClickIndex = null;
            }, SINGLE_CLICK_DELAY_MS);
          }
        }
        this.dragIndex = null;
        this.dropTarget = null;
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

function createControlsWidget(node) {
  if (typeof node.addDOMWidget === "function") return createDomControlsWidget(node);
  return createCanvasControlsWidget(node);
}

function moveVisibleWidgetFirst(node, promptWidget) {
  const remainingWidgets = node.widgets.filter((widget) => widget !== promptWidget);
  node.widgets = [promptWidget, ...remainingWidgets];
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

      this.widgets_start_y = WIDGETS_START_Y;
      this.promptButtonsWidget = createControlsWidget(this);
      moveVisibleWidgetFirst(this, this.promptButtonsWidget);

      const textWidget = getWidget(this, "text");
      if (textWidget?.value) this.promptButtonsWidget.setSourceItems(splitPromptText(textWidget.value));
      fitNodeToContent(this);
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      onConfigure?.apply(this, arguments);
      this.widgets_start_y = WIDGETS_START_Y;
      const state = readState(this);
      if (state?.entries && this.promptButtonsWidget) {
        this.promptButtonsWidget.setEntries(state.entries, false);
      }
      fitNodeToContent(this);
    };

    const onAdded = nodeType.prototype.onAdded;
    nodeType.prototype.onAdded = function () {
      onAdded?.apply(this, arguments);
      fitNodeToContent(this);
    };

    const onResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      onResize?.apply(this, arguments);
      const requiredHeight = getRequiredNodeHeight(this, size?.[0]);
      if (!requiredHeight || !Array.isArray(size)) return;
      size[1] = requiredHeight;
      if (Array.isArray(this.size)) this.size[1] = requiredHeight;
      this.setDirtyCanvas(true, true);
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
