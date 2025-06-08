instructions.md（自分用）

目的

Claude などの AI に渡す作業指示書を作成する際に、GPT や Copilot とのやりとりをログとして残し、履歴追跡・再評価・再現を可能にする。

運用フロー（手順）

以下の2ファイルを VS Code で開いた状態で作業を開始する：

logs/gpt_instruction_log.md

claude_tasks/タスク名.md

Copilot や GPT（コメント補完含む）へのプロンプトと、その補完結果を gpt_instruction_log.md に記録する。

形式自由（Markdownベースで時刻や意図を明記）

Claude 指示書に反映した部分は明確にマークする

Claude 指示書を claude_tasks/ に作成・保存する。

Copilotの補完ログから抜粋するか、加工して成形

作業単位で git commit を行う。

両方のファイルを同時にコミット

commit メッセージ例： feat: create instruction for fetch_async

必要に応じて Claude へ指示書を投入し、出力結果をレビュー・適用する。
