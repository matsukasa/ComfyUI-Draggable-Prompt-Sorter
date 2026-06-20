# ComfyUI Draggable Prompt Sorter

## 日本語

ComfyUI用のカスタムノードです。前段ノードからカンマ区切りの文字列を受け取り、各要素をドラッグ可能なボタンとして表示します。ボタンはクリックでオン・オフでき、オンの項目だけを現在の順番で次のノードへ渡します。

### インストール

ComfyUIの `custom_nodes` ディレクトリでcloneします。

```powershell
cd ComfyUI\custom_nodes
git clone https://github.com/matsukasa/ComfyUI-Draggable-Prompt-Sorter.git
```

clone後にComfyUIを再起動し、ブラウザを再読み込みしてください。

配置例:

```text
ComfyUI/
  custom_nodes/
    ComfyUI-Draggable-Prompt-Sorter/
      __init__.py
      web/
        prompt_flat_button_sorter.js
```

### Gitで更新

```powershell
cd ComfyUI\custom_nodes\ComfyUI-Draggable-Prompt-Sorter
git pull --ff-only
```

更新後はComfyUIを再起動し、ブラウザをハードリロードしてください。

### 使い方

1. `prompt` カテゴリから `Draggable Prompt Sorter` を追加します。
2. 前段ノードのカンマ区切りテキスト出力を `text` に接続します。`STRING` / `TEXT` 系の出力に対応しています。
3. ノード内の `Update Buttons` を押すと、ワークフロー全体ではなく、このノードまでを実行して前段テキストを取得します。
4. カンマごとの要素が1つずつボタンとして表示されます。
5. ボタンをドラッグ&ドロップして順番を入れ替えます。
6. ボタンをクリックしてオン・オフを切り替えます。オフの項目は出力から除外されます。
7. 次のノードへ渡すときは通常どおりQueue / Runしてください。

入力例:

```text
masterpiece, best quality, 1girl, blue eyes
```

`best quality` をオフにして並べ替えた場合の出力例:

```text
blue eyes, masterpiece, 1girl
```

### 表示と状態

- ボタンのテキストは省略されません。長いテキストはボタン内で折り返して全文表示します。
- 入力項目が増減してもノードサイズは自動変更されません。ボタン領域を縦スクロールして確認できます。
- ユーザーが手動で変更したノードサイズは、ボタン更新後も維持されます。
- 順序とオン・オフ状態はワークフローに保存されます。
- 入力内容が変わった場合、同じ項目が完全に揃っているときだけ保存済み状態を再利用します。それ以外は入力順・全オンで初期化します。
- 同じテキストが複数ある場合も、それぞれ別のボタンとして操作できます。

---

## English

A custom node for ComfyUI. It receives a comma-separated string from an upstream node and displays each item as a draggable button. Buttons can be toggled on or off, and only enabled items are passed to the next node in the current order.

### Installation

Clone the repository inside ComfyUI's `custom_nodes` directory.

```powershell
cd ComfyUI\custom_nodes
git clone https://github.com/matsukasa/ComfyUI-Draggable-Prompt-Sorter.git
```

Restart ComfyUI and reload the browser after cloning.

Example layout:

```text
ComfyUI/
  custom_nodes/
    ComfyUI-Draggable-Prompt-Sorter/
      __init__.py
      web/
        prompt_flat_button_sorter.js
```

### Update with Git

```powershell
cd ComfyUI\custom_nodes\ComfyUI-Draggable-Prompt-Sorter
git pull --ff-only
```

Restart ComfyUI and hard-refresh the browser after updating.

### Usage

1. Add `Draggable Prompt Sorter` from the `prompt` category.
2. Connect an upstream comma-separated text output to `text`. `STRING` / `TEXT`-style outputs are supported.
3. Press `Update Buttons` to execute only up to this node and fetch the upstream text without running the whole workflow.
4. Each comma-separated item appears as one button.
5. Drag and drop buttons to reorder them.
6. Click a button to toggle it. Disabled items are omitted from the output.
7. Queue/run normally when you want to pass the result to the next node.

Input example:

```text
masterpiece, best quality, 1girl, blue eyes
```

Example output after disabling `best quality` and reordering:

```text
blue eyes, masterpiece, 1girl
```

### Display and State

- Button text is never truncated. Long text wraps inside the button and remains fully visible.
- The node does not resize when items change. Use the button area's vertical scrollbar when needed.
- User-resized node dimensions are preserved when buttons update.
- Button order and enabled state are saved in the workflow.
- Saved state is reused only when the incoming text contains exactly the same items. Otherwise, items reset to input order and enabled.
- Duplicate text items remain separate buttons and can be controlled independently.
