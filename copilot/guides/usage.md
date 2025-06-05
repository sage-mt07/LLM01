# Copilot 使用ガイド：フェーズごとの提示タイミングと指示テンプレート

このガイドは、Copilotに対してどの instructions.md ファイルをいつ提示すべきかを示します。

---

## ✅ 共通ルール（常時有効）

- rules/three-laws.md をすべてのフェーズで最上位ルールとして適用。
- Copilot Chat では冒頭に「三原則に従って」と宣言する。

---

## 🟨 フェーズごとの提示タイミングとプロンプト例

### ▶ 要件定義フェーズ開始時

```
今は要件定義フェーズです。
- フェーズ: phases/requirements.md
- 進行ルール: rules/progressive.md
- 三原則: rules/three-laws.md

コードは出さずに、FIT&GAPやQA整理の支援をお願いします。
```

---

### ▶ 設計フェーズ開始時

```
今は設計フェーズです。
- フェーズ: phases/design.md
- 成果物ルール: rules/design-output.md
- 進行ルール: rules/progressive.md
- 三原則: rules/three-laws.md

コードは出さず、責務分割やインターフェース設計のみを行ってください。
```

---

### ▶ 実装フェーズ開始時

```
現在は実装フェーズです。
- フェーズ: phases/implementation.md
- 成果物ルール: rules/implementation-output.md
- 三原則: rules/three-laws.md

設計に基づき、メンテナンス性を重視してコードを生成してください。
```

---

### ▶ テストフェーズ開始時

```
テストフェーズに入りました。
- フェーズ: phases/test.md
- 三原則: rules/three-laws.md

xUnit形式のテストコード出力や、負荷テストスクリプトのテンプレート支援のみを行ってください。
```

---

## 🔁 フェーズ終了時の対応

- 「今は何も指示していないフェーズです」と明示して、Copilotの補完を止める。
