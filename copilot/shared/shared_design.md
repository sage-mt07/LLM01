## 🏗 shared_design.md（設計フェーズ）

### レイヤ構成原則
- API / Application / Domain / Infrastructure の4層を基本とする

### 責務分割パターン
- CQRSパターンを推奨
- Domain層にビジネスロジックを集約

### 外部連携方式の選定基準
- RESTを原則とし、双方向通信はSignalRなどで補完
