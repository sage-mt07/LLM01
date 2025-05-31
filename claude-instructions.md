# Windows 11日本語環境用PowerShell対応プロンプト

## 基本指示
Windows 11日本語環境でPowerShellスクリプトを生成する際は、以下の要件を必ず満たしてください：

### 1. 文字エンコーディング対応
- PowerShellスクリプトは必ずUTF-8（BOM付き）で保存
- 日本語文字列を含む場合は、以下の設定を冒頭に追加：
```powershell
# 文字エンコーディング設定
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null
```

### 2. 実行ポリシー対応
- スクリプト冒頭に実行ポリシーの一時変更を含める：
```powershell
# 実行ポリシーの一時変更
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force
```

### 3. パス処理の注意点
- 日本語を含むパスは必ず二重引用符で囲む
- 相対パスより絶対パスを優先
- パス区切りは`\`ではなく`/`または`[System.IO.Path]::DirectorySeparatorChar`を使用

### 4. エラーハンドリング
- 各コマンドの後に適切なエラーチェックを追加：
```powershell
if ($LASTEXITCODE -ne 0) {
    Write-Host "エラーが発生しました: $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}
```

### 5. 日本語環境特有の問題回避
- `Get-ChildItem`の代わりに`Get-ChildItem -LiteralPath`を使用
- 日本語ファイル名を扱う場合は`-Encoding UTF8`オプションを明示
- 出力結果に日本語が含まれる場合は`Out-String -Encoding UTF8`を使用

### 6. VS Code統合時の注意
- ターミナルでの実行時は、VS Codeのターミナルエンコーディング設定も確認
- `settings.json`に以下を追加することを推奨：
```json
{
    "terminal.integrated.defaultProfile.windows": "PowerShell",
    "terminal.integrated.profiles.windows": {
        "PowerShell": {
            "source": "PowerShell",
            "args": ["-ExecutionPolicy", "Bypass", "-NoLogo"]
        }
    }
}
```

### 7. 実行例テンプレート
```powershell
# Windows 11日本語環境対応PowerShellスクリプト
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

try {
    # メイン処理をここに記述
    Write-Host "処理を開始します..." -Encoding UTF8
    
    # 処理内容
    
    Write-Host "処理が完了しました。" -ForegroundColor Green
} catch {
    Write-Host "エラーが発生しました: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
```

## 追加指示
- PowerShellコマンドレットの日本語ヘルプが利用可能な場合は、それを参照
- Windows Terminalを使用している場合は、プロファイル設定でエンコーディングをUTF-8に設定
- 可能な限り、PowerShell Core（PowerShell 7+）の使用を推奨

この指示に従ってPowerShellスクリプトを生成し、Windows 11日本語環境での実行エラーを最小限に抑えてください。
