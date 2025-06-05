## 🧑‍💻 shared_coding.md（実装フェーズ）

### 命名規則
- DTO: [Name]Dto
- Entity: [Name]Entity
- Controller: [Name]Controller

### 例外の扱い
- 業務例外（ユーザー向け）とシステム例外を分離
- try-catch-finallyを原則とし、finallyでログを出力

### ログ方針
- Serilogを使用
- 情報レベル: Information / Warning / Error
