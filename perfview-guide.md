# PerfView 概要と使い方ガイド

この文書では、Windows Server 2022上で動作する.NET 8アプリケーションのパフォーマンス分析にPerfViewを使用する方法を解説します。対象は、SQLServerへのアクセス、ネットワーク通信、ローカルファイルへのログ出力を行うオンプレミスのカスタムアプリケーションを前提としています。

## 目次

1. [PerfViewとは](#1-perfviewとは)
2. [セットアップ方法](#2-セットアップ方法)
3. [基本的な使い方](#3-基本的な使い方)
4. [主要なトレース収集シナリオ](#4-主要なトレース収集シナリオ)
5. [トレース分析テクニック](#5-トレース分析テクニック)
6. [スレッド枯渇の検出と分析](#6-スレッド枯渇の検出と分析)
7. [SQLServer連携の分析](#7-sqlserver連携の分析)
8. [I/Oパフォーマンスの分析](#8-ioパフォーマンスの分析)
9. [よくある問題と解決策](#9-よくある問題と解決策)
10. [コマンドラインリファレンス](#10-コマンドラインリファレンス)

## 1. PerfViewとは

PerfViewはMicrosoftが開発した高度なパフォーマンス分析ツールで、特に.NETアプリケーションのプロファイリングに特化しています。Windows Event Tracing (ETW)システムを活用して、CPUの使用状況、メモリ割り当て、ガベージコレクション、スレッド動作など、様々なパフォーマンス指標を収集・分析できます。

### 主な特徴

- 低オーバーヘッドでの詳細なパフォーマンスデータ収集
- .NET Core/.NET 8アプリケーションの完全サポート
- Windows Server 2022との互換性
- スレッドプールの挙動や枯渇状態の分析機能
- CPU使用率とホットパスの特定
- メモリリークや過剰なGC活動の検出
- I/O操作のボトルネック分析

## 2. セットアップ方法

### インストール

1. [GitHub PerfView リポジトリ](https://github.com/microsoft/perfview/releases)から最新版をダウンロード
2. ダウンロードしたZIPファイルを展開
3. セキュリティ警告が表示される場合は「詳細情報」→「実行」をクリック

### 初期設定

1. 初回起動時に「シンボルサーバーサポートを有効にしますか？」という質問が表示されたら「はい」を選択
2. カスタムシンボルパスの設定:
   - メニューから「Collect」→「Set Symbol Path」を選択
   - 以下のようにパスを設定:
   ```
   SRV*C:\SymbolCache*https://msdl.microsoft.com/download/symbols;C:\Path\To\Your\CustomSymbols
   ```

### PDBファイルの準備

カスタムアプリケーションの正確なスタックトレース表示には、対応するPDBファイルが必要です:

1. アプリケーションのビルド時にPDBファイルを生成（Visual Studioのデバッグビルドで自動生成）
2. PDBファイルをアプリケーション実行ファイルと同じディレクトリ、または上記で設定したシンボルパスに配置
3. PDBファイルはアプリケーションのビルドと完全に一致する必要があることに注意

## 3. 基本的な使い方

### トレースの収集

1. PerfViewを管理者権限で起動
2. 「Collect」メニューから「Collect」を選択、または以下のコマンドラインを使用:

```
PerfView collect -CircularMB 1024 -ThreadTime -MaxCollectSec 120 MyTrace.etl
```

### GUIでのトレース収集オプション設定

1. 「Additional Providers」: 「.NETCore」を選択
2. 「Advanced Options」タブ:
   - 「Merge」にチェック
   - 「Thread Time」にチェック
   - 「CLR」セクションで「GC」と「JIT」にチェック
3. 「Start Collection」をクリック
4. パフォーマンス問題を再現する操作を実行
5. 「Stop Collection」をクリック

### トレースの分析

1. 生成された.etlファイルをダブルクリックで開く
2. 左側のナビゲーションパネルで分析したいビューを選択:
   - 「CPU Stacks」: CPU使用率の高いメソッドを特定
   - 「GC Stacks」: ガベージコレクションの原因特定
   - 「Thread Time」: スレッドの挙動とブロッキングの解析
   - 「Events」: 低レベルのETWイベントの分析

## 4. 主要なトレース収集シナリオ

### 全般的なパフォーマンス分析

```
PerfView collect -CircularMB 1024 -ThreadTime -ClrEvents:Default -Merge:true MyTrace.etl
```

### CPU使用率の高いケース

```
PerfView collect -CircularMB 1024 -ThreadTime -MaxCollectSec 60 -Merge:true CPUTrace.etl
```

### メモリリークの調査

```
PerfView collect -CircularMB 2048 -GCOnly -GCCollectOnly -DumpHeap -Merge:true MemoryTrace.etl
```

### SQLServerアクセスのボトルネック特定

```
PerfView collect -CircularMB 1024 -ThreadTime -KernelEvents:NetworkTCPIP,FileIOInit,Threading -Merge:true SQLTrace.etl
```

### スレッド枯渇の検出

```
PerfView collect -CircularMB 1024 -ThreadTime -ClrEvents:GC,Exception,Contention,Loader -KernelEvents:Thread,ThreadPool,Dispatcher -Merge:true ThreadStarvation.etl
```

### ファイルI/Oパフォーマンス分析

```
PerfView collect -CircularMB 1024 -ThreadTime -KernelEvents:FileIOInit,FileIO,DiskIO -Merge:true FileIOTrace.etl
```

## 5. トレース分析テクニック

### CPUホットスポットの特定

1. 「CPU Stacks」ビューを開く
2. 「ByName」列で降順ソートしてCPU時間が最も長いメソッドを特定
3. 「Caller/Callee」列をダブルクリックして呼び出し元/呼び出し先を確認

### メモリ割り当ての分析

1. 「GC Stacks」ビューを開く
2. 「Inc」列で降順ソートして、メモリ割り当てが多いメソッドを特定
3. 「New Object Type」で「Group」を選択し、どのような型のオブジェクトが多く作成されているかを確認

### スタックの詳細分析

1. 興味のあるスタックを右クリック
2. 「View Callers」を選択して呼び出し元を分析
3. 「View Callees」を選択して呼び出し先を分析
4. 「Open Any Stacks」でフィルタリングして特定のパターンを検索

### フィルタリングテクニック

1. 「Filter」ボックスに以下のような検索語を入力:
   - 名前空間: `YourCompany.`
   - 特定のメソッド: `SqlCommand.Execute`
   - 複合条件: `YourCompany. SAMPLE:1000`（1000件のサンプルに制限）

### パターン認識

1. 同期的なI/O操作のパターン: `System.IO.*` で終わるスタック
2. データベース待機のパターン: `System.Data.SqlClient.*` で終わるスタック
3. スレッドプール枯渇のパターン: 多数の `ThreadPoolEnqueue` イベントと対応する `ThreadPoolDequeue` イベントとの間に大きな時間差

## 6. スレッド枯渇の検出と分析

### スレッド枯渇の主な兆候

- スレッドプールのキュー深さが増加
- タスク完了までの待機時間が長い（数秒以上）
- スレッドプールの調整イベントが頻発

### 詳細分析手順

1. 「ThreadPool Stats」ビューを開く:
   - 左側のナビゲーションで「Advanced Group」→「ThreadPool Stats」を選択
   - スレッドプールのサイズ、キュー深さ、調整イベントを確認

2. スレッドプールイベントを確認:
   - 「Events」ビューを開き、「Filter」に「ThreadPool」と入力
   - 「Microsoft-Windows-DotNETRuntime/ThreadPoolEnqueue」と「ThreadPoolDequeue」の時間差を確認
   - 「Microsoft-Windows-DotNETRuntime/ThreadPoolAdjustmentReason」イベントの頻度と理由を確認

3. スレッドの状態を確認:
   - 「Thread Time」ビューで、多くのスレッドが同時に同じような待機状態になっていないか確認
   - ブロッキング操作（DB接続、ファイルI/O、外部API呼び出しなど）が多数のスレッドで同時発生していないか確認

4. デッドロックパターンの確認:
   - 非同期メソッドの同期的な待機（`.Result`や`.Wait()`の使用）
   - 同期的なコンテキスト待機 (`ConfigureAwait(false)` がない場合)

### スレッド枯渇解消のヒント

- スレッドプールの最小値を適切に設定（`ThreadPool.SetMinThreads()`）
- I/O操作は常に非同期メソッド（`async/await`）を使用
- 長時間実行される処理は専用スレッドで実行（`new Thread()`）
- スレッドプールを占有する長時間実行タスクを分割

## 7. SQLServer連携の分析

### SQLServerアクセスパターンの分析

1. 「CPU Stacks」または「Thread Time」ビューで、フィルタに「System.Data.SqlClient」または「Microsoft.Data.SqlClient」を入力
2. 長時間実行されるSQLクエリを特定（スタックの深さと時間を確認）
3. 同期的なSQL操作のパターンを確認（`ExecuteNonQuery`, `ExecuteReader` など）

### SQLクエリのタイミング分析

1. 「Events」ビューでフィルタに「Microsoft-Data-SqlClient」を入力（利用可能な場合）
2. SQL接続開始・終了イベントと、クエリ実行開始・終了イベントの時間差を確認
3. 多数の小さなクエリが連続実行されていないか確認（N+1問題の兆候）

### SQLの最適化ヒント

- 同期的なSQLオペレーションを非同期版（`ExecuteReaderAsync`など）に置き換え
- 接続プールの適切な設定確認
- バッチ処理やストアドプロシージャの活用
- トランザクションスコープの最適化

## 8. I/Oパフォーマンスの分析

### ファイルI/O操作の分析

1. 「Events」ビューでフィルタに「FileIO」を入力
2. 頻繁なファイル操作やサイズの大きなファイル操作を特定
3. 同期的なファイルI/O操作のパターンを確認

### ネットワークI/O操作の分析

1. 「Events」ビューでフィルタに「NetworkTCPIP」を入力
2. 接続の確立、送信、受信イベントを時系列で確認
3. タイムアウトや再試行パターンを特定

### ログ出力の最適化分析

1. ファイルI/Oイベントをフィルタリングしてログファイルパスを特定
2. ログ書き込みの頻度とパターンを確認
3. 高頻度の小さな書き込みがないか確認（バッファリングの不足を示唆）

### I/O最適化のヒント

- ファイル操作は非同期メソッド（`WriteAsync`, `ReadAsync`）を使用
- バッファリングの活用（特にログ出力）
- メモリ内キャッシュの検討
- 必要に応じてバッチ処理の実装

## 9. runtimeconfig.jsonによる構成設定

.NET Core/.NET 8アプリケーションでは、`runtimeconfig.json`ファイルを使用してランタイムの動作を設定できます。これはPerfViewで検出したパフォーマンス問題に対応するための重要なツールです。

### runtimeconfig.jsonの基本

`runtimeconfig.json`ファイルは、アプリケーションの起動時に.NET Runtimeによって読み込まれる構成ファイルです。アプリケーションのバイナリと同じディレクトリに配置され、通常は`{アプリケーション名}.runtimeconfig.json`という名前になります。

### 基本的な構造

```json
{
  "runtimeOptions": {
    "tfm": "net8.0",
    "framework": {
      "name": "Microsoft.NETCore.App",
      "version": "8.0.0"
    },
    "configProperties": {
      // ここに構成プロパティを記述
    }
  }
}
```

### スレッドプール設定

スレッド枯渇問題に対応するためのスレッドプール設定:

```json
{
  "runtimeOptions": {
    "configProperties": {
      "System.Threading.ThreadPool.MinThreads": 20,
      "System.Threading.ThreadPool.MaxThreads": 200
    }
  }
}
```

### ガベージコレクション設定

メモリとGC関連の問題に対応するための設定:

```json
{
  "runtimeOptions": {
    "configProperties": {
      "System.GC.Server": true,
      "System.GC.Concurrent": true,
      "System.GC.RetainVM": false,
      "System.GC.HeapHardLimit": 8589934592  // 8GB
    }
  }
}
```

### JITコンパイラ設定

パフォーマンスクリティカルなアプリケーションのJIT最適化:

```json
{
  "runtimeOptions": {
    "configProperties": {
      "System.Runtime.TieredCompilation": true,
      "System.Runtime.TieredCompilation.QuickJit": false,
      "System.Runtime.TieredCompilation.QuickJitForLoops": true
    }
  }
}
```

### ネットワーク関連設定

ネットワーク接続のパフォーマンスチューニング:

```json
{
  "runtimeOptions": {
    "configProperties": {
      "System.Net.Http.SocketsHttpHandler.MaxConnectionsPerServer": 20,
      "System.Net.Http.SocketsHttpHandler.EnableMultipleHttp2Connections": true
    }
  }
}
```

### 実行手順

1. アプリケーションのバイナリと同じディレクトリに`{アプリケーション名}.runtimeconfig.json`ファイルを作成
2. 上記のような設定を必要に応じて追加
3. アプリケーションを再起動して設定を反映
4. PerfViewで効果を測定・検証

### 設定の検証

設定が正しく適用されているかを確認するには:

1. PerfViewでトレースを取得
2. `Events`ビューでフィルタに`Microsoft-Windows-DotNETRuntime/Startup`と入力
3. スタートアップイベントで読み込まれた設定値を確認

### 注意点

- すべての設定が全ての.NETバージョンで利用可能なわけではない
- 設定によってはパフォーマンスとリソース使用のトレードオフが生じる場合がある
- プロダクション環境に適用する前にテスト環境で効果と影響を確認すること

## 10. よくある問題と解決策

### シンボル読み込みの問題

**症状**: スタックトレースにアドレスのみが表示され、メソッド名が表示されない

**解決策**:
1. カスタムPDBファイルが正しい場所にあることを確認
2. シンボルパスが正しく設定されていることを確認
3. 「Symbols」→「Load PDB」で手動でPDBを読み込む
4. `-NoNGenPdbs`オプションを試す

### メモリ不足エラー

**症状**: 大きなトレースファイルを開くとメモリ不足エラーが発生

**解決策**:
1. 64ビット版PerfViewを使用
2. フィルタを使って必要な情報のみに絞る
3. トレース収集時の`-CircularMB`値を小さくする
4. 分析対象の期間や範囲を絞る

### スレッドプール設定の反映問題

**症状**: スレッドプール設定を変更したがアプリケーションに反映されない

**解決策**:
1. アプリケーションの再起動が必要
2. `runtimeconfig.json`ファイルが正しく配置されていることを確認
3. 設定値が有効範囲内であることを確認

## 11. コマンドラインリファレンス

### 基本的なトレース収集

```
PerfView collect [オプション] [出力ファイル名]
```

### 主要なオプション

- `-CircularMB <サイズ>`: 循環バッファのサイズをMB単位で指定
- `-MaxCollectSec <秒数>`: トレース収集の最大時間を秒数で指定
- `-ThreadTime`: スレッドタイミング情報を収集（CPUサンプリングに必須）
- `-Merge:true`: トレースファイルを自動的にマージする
- `-Zip:true`: 収集後にデータをZIP形式で圧縮する

### CLRイベントオプション

- `-ClrEvents:Default`: 基本的なCLRイベントを収集
- `-ClrEvents:GC`: ガベージコレクション関連イベントのみ収集
- `-ClrEvents:JIT`: JITコンパイラ関連イベントを収集
- `-ClrEvents:Loader`: アセンブリ読み込み関連イベントを収集
- `-ClrEvents:Exception`: 例外発生イベントを収集
- `-ClrEvents:Contention`: ロック競合イベントを収集
- `-ClrEvents:All`: すべてのCLRイベントを収集（大量のデータになる可能性あり）

### カーネルイベントオプション

- `-KernelEvents:Default`: 基本的なカーネルイベントを収集
- `-KernelEvents:Process`: プロセス関連イベントを収集
- `-KernelEvents:Thread`: スレッド関連イベントを収集
- `-KernelEvents:FileIOInit`: ファイルI/O初期化イベントを収集
- `-KernelEvents:FileIO`: ファイルI/Oイベントを収集
- `-KernelEvents:DiskIO`: ディスクI/Oイベントを収集
- `-KernelEvents:NetworkTCPIP`: ネットワークTCP/IPイベントを収集
- `-KernelEvents:Registry`: レジストリアクセスイベントを収集
- `-KernelEvents:All`: すべてのカーネルイベントを収集（大量のデータになる可能性あり）

### プロセス指定オプション

- `-Process <名前またはID>`: 特定のプロセスのみをトレース
- `-ProcessName <名前>`: 指定した名前のプロセスをトレース
- `-ProcessID <ID>`: 指定したIDのプロセスをトレース

### 分析コマンド

- `PerfView run [トレースファイル名]`: トレースファイルを開いて分析
- `PerfView GCStats [トレースファイル名]`: GC統計情報を表示
- `PerfView ThreadTime [トレースファイル名]`: スレッド時間情報を表示
- `PerfView HeapSnapshot`: ヒープスナップショットを取得

---

この文書は.NET 8アプリケーションのパフォーマンス分析における基本的なPerfViewの使用方法をカバーしています。実際のアプリケーション分析では、より具体的な問題に応じて追加の設定やアプローチが必要になる場合があります。
