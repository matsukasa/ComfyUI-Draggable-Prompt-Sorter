# ComfyUI Draggable Prompt Sorter

## 日本語

ComfyUI 用のカスタムノードです。
他のノードからカンマ区切りの文字列を受け取り、元のテキスト本文は表示せず、カンマごとの各要素を 1 つずつフラットなドラッグ可能ボタンとして表示します。ボタンを並べ替えると、その順番でカンマ区切りのプロンプト文字列を再構成して次のノードへ渡します。

### インストール

このフォルダを `ComfyUI/custom_nodes/` の下に配置してから、ComfyUI を再起動してください。

配置例:

```text
ComfyUI/
  custom_nodes/
    ComfyUI-Draggable-Prompt-Sorter/
      __init__.py
      web/
        prompt_flat_button_sorter.js
```

### 使い方

1. `prompt` カテゴリから `Draggable Prompt Sorter` を追加します。
2. 前段ノードのカンマ区切りテキスト出力を `text` に接続します。`STRING` / `TEXT` 系の出力を受け取れるようにしています。
3. 入力例: `masterpiece, best quality, 1girl, blue eyes`
4. ノード内の `Update Buttons` を押します。ワークフロー全体ではなく、このノードまでを実行して前段テキストを取得します。
5. カンマごとの要素が、それぞれ 1 つのボタンとして表示されます。
6. 表示されたフラットボタンをドラッグ&ドロップして順番を入れ替えます。
7. 次のノードへ渡すときは通常どおり Queue / Run してください。並べ替え後のカンマ区切り文字列が出力されます。

出力例: `blue eyes, masterpiece, best quality, 1girl`

### 注意点

- カンマごとに分割し、前後の空白は自動で取り除きます。
- 元のテキスト本文はノード上に表示しません。表示されるのは各要素のボタンだけです。
- 接続された前段ノードの値を表示するには、`Update Buttons` を押してこのノードまでを一度実行してください。
- 入力テキストの内容が変わった場合、保存済みのボタン順序は、同じプロンプト要素が完全に揃っている場合だけ再利用されます。

---

## English

A custom node for ComfyUI.
It receives a comma-separated string from another node, hides the original text body, displays each comma-separated item as one flat draggable button, and outputs a comma-separated prompt string reordered by the current button order.

### Installation

Place this folder under `ComfyUI/custom_nodes/`, then restart ComfyUI.

Example:

```text
ComfyUI/
  custom_nodes/
    ComfyUI-Draggable-Prompt-Sorter/
      __init__.py
      web/
        prompt_flat_button_sorter.js
```

### Usage

1. Add `Draggable Prompt Sorter` from the `prompt` category.
2. Connect the upstream comma-separated text output to `text`. The input is compatible with `STRING` / `TEXT`-style outputs.
3. Input example: `masterpiece, best quality, 1girl, blue eyes`
4. Press `Update Buttons` inside the node. This executes only up to this node and fetches the upstream text without running the whole workflow.
5. Each comma-separated item appears as one button.
6. Drag and drop the flat buttons to reorder them.
7. Queue/run normally when you want to pass the reordered comma-separated string to the next node.

Output example: `blue eyes, masterpiece, best quality, 1girl`

### Notes

- The input is split by commas, and surrounding whitespace is trimmed automatically.
- The original text body is not displayed on the node. Only item buttons are shown.
- To display values from connected upstream nodes, press `Update Buttons` to execute up to this node once.
- If the incoming text changes, the saved button order is reused only when it still contains exactly the same prompt fragments.
