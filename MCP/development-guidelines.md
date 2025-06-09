# 開発運用ガイドライン

## MCP + AI運用構成（概要）
- MCPが各モジュールの依存構造と指示テンプレートを保持。
- Copilot Chat / GPT / Claude で共通指示を使用。
- `dependencies.md` を中継ハブとして、AIに情報供給。

## PR時のAI指示テンプレ
このプロジェクトには `dependencies.md` が存在します。
このファイルを参照して依存関係とバージョン戦略を確認したうえで、PullRequestの影響評価と分類を行ってください。
