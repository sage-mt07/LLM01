# 依存関係: [モジュール名]

## 外部ライブラリ
| ライブラリ         | バージョン  | 用途                          |
|------------------|------------|-----------------------------|
| Newtonsoft.Json  | 13.0.1     | JSONシリアライズ              |
| CsvHelper        | 27.1.1     | CSV入出力                    |

## 内部依存モジュール
| モジュール         | 用途                      |
|------------------|-------------------------|
| CoreLib          | ドメインモデル・バリデーション |

## バージョンポリシー（自モジュール）
- 自モジュールは外部ライブラリ更新によりPatchを上げる
- 内部モジュール変更により仕様変更があった場合はMinor以上を上げる

---

## 🔗 関連リンク

- 設計仕様書（Azure DevOps Wiki）  
  👉 https://dev.azure.com/myorg/project/_wiki/wikis/myproject/123

- 単体テスト例（GitHub）  
  👉 https://github.com/myorg/myrepo/blob/main/tests/OrderModuleTests.cs

- バージョン戦略ルール  
  👉 ./version-policy.md

- CoreLib 依存構造  
  👉 ../CoreLib/dependencies.md

- 開発運用ガイドライン  
  👉 ../docs/development-guidelines.md

_Last reviewed: 2025-06-09_
