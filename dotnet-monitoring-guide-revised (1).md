# .NET アプリケーションの監視: dotnet-monitor アプローチ

このドキュメントでは、`dotnet-monitor`を中心とした.NETアプリケーションの監視アプローチと、それだけでは不十分な場合の補完方法について説明します。

## 1. dotnet-monitorの概要

`dotnet-monitor`は.NETランタイムチームが提供する公式の診断ツールで、.NETアプリケーションの状態とパフォーマンスをモニタリングし、診断データを収集します。

### 1.1 主な機能

- **メトリクス収集**: EventCountersやEventPipeによるメトリクス収集
- **診断データのエクスポート**: Prometheusエンドポイントによるメトリクス公開
- **ダンプ収集**: メモリダンプ、GCダンプの取得
- **トレース収集**: アプリケーションのトレース情報の収集
- **ログ収集**: アプリケーションのログデータの収集

### 1.2 Kubernetes環境での導入

#### サイドカーコンテナとしてのデプロイ（推奨）

```yaml
spec:
  containers:
  # dotnet-monitorのサイドカーコンテナ
  - name: dotnet-monitor
    image: mcr.microsoft.com/dotnet/monitor:8.0
    args: ["collect", "--urls", "http://+:52323"]
    env:
      - name: DOTNETMONITOR_DiagnosticPort__ConnectionMode
        value: "Listen"
      - name: DOTNETMONITOR_Metrics__Endpoints
        value: "http://+:52325/metrics"
      - name: DOTNETMONITOR_Metrics__IncludeDefaultProviders
        value: "true"
    ports:
      - containerPort: 52323
      - containerPort: 52325
    volumeMounts:
      - name: diagsocket
        mountPath: /diag
  
  # メインのアプリケーションコンテナ
  - name: my-app
    image: your-registry/my-app:latest
    env:
      - name: DOTNET_DiagnosticPorts
        value: "/diag/monitor.sock"
    volumeMounts:
      - name: diagsocket
        mountPath: /diag
  
  volumes:
    - name: diagsocket
      emptyDir: {}
```

### 1.3 Datadogとの統合

```yaml
metadata:
  annotations:
    ad.datadoghq.com/dotnet-monitor.check_names: '["prometheus"]'
    ad.datadoghq.com/dotnet-monitor.init_configs: '[{}]'
    ad.datadoghq.com/dotnet-monitor.instances: |
      [
        {
          "prometheus_url": "http://%%host%%:52325/metrics",
          "namespace": "dotnet",
          "metrics": [".*"]
        }
      ]
```

## 2. dotnet-monitorで収集できるメトリクス

### 2.1 ランタイムメトリクス (自動収集)

`dotnet-monitor`は`System.Runtime`のEventCountersを自動的に収集します：

- **CPU使用率**: `cpu-usage`
- **GCヒープサイズ**: `gc-heap-size`
- **GCコレクション**: `gc-collections`, `gc-committed`
- **例外数**: `exception-count`
- **スレッドプール**: `threadpool-thread-count`, `threadpool-queue-length`
- **メモリ使用量**: `working-set`, `time-in-gc`
- **JITコンパイル**: `time-in-jit`

### 2.2 ASP.NET Core メトリクス (自動収集)

ASP.NET Coreアプリケーションでは以下のメトリクスが収集されます：

- **リクエスト数**: `Microsoft.AspNetCore.Hosting.HttpRequestsTotal`
- **リクエストレート**: `Microsoft.AspNetCore.Hosting.HttpRequestsPerSecond`
- **処理中リクエスト**: `Microsoft.AspNetCore.Hosting.HttpRequestsInProgress`
- **リクエスト待ち時間**: `Microsoft.AspNetCore.Http.Connections.ConnectionsDuration`

### 2.3 Kestrelサーバーメトリクス (自動収集)

- **接続数**: `Microsoft.AspNetCore.Server.Kestrel.ConnectionsStarted`, `ConnectionsPerSecond`
- **TLS**: `Microsoft.AspNetCore.Server.Kestrel.TlsHandshakesPerSecond`
- **接続状態**: `Microsoft.AspNetCore.Server.Kestrel.ConnectionsClosed`, `ConnectionsTimedOut`

### 2.4 SQLクライアントメトリクス (自動収集)

`Microsoft.Data.SqlClient`を使用する場合：

- **接続数**: `Microsoft.Data.SqlClient.HardConnectsPerSecond`
- **切断数**: `Microsoft.Data.SqlClient.HardDisconnectsPerSecond`
- **接続プール**: `Microsoft.Data.SqlClient.ConnectionPoolCount`
- **アクティブ接続**: `Microsoft.Data.SqlClient.ActiveConnections`
- **非アクティブ接続**: `Microsoft.Data.SqlClient.InactiveConnections`

### 2.5 HTTPクライアントメトリクス (自動収集)

- **リクエスト数**: `System.Net.Http.HttpClient.RequestsStarted`
- **レート**: `System.Net.Http.HttpClient.RequestsStartedRate`
- **失敗**: `System.Net.Http.HttpClient.RequestsFailed`

## 3. dotnet-monitorが提供しない/限定的なメトリクス

以下のカテゴリのメトリクスは、追加の設定やカスタム実装が必要です。

### 3.1 API/エンドポイントレベルのメトリクス

dotnet-monitorでは **収集できない メトリクス**:

- **エンドポイント別のレイテンシ**: 各APIエンドポイント別の応答時間
- **エンドポイント別のエラー率**: 各APIエンドポイント別のエラー発生率
- **エンドポイント別のリクエスト数**: 各APIエンドポイント別の呼び出し頻度

#### 対応方法: カスタムミドルウェアによる実装

```csharp
app.Use(async (context, next) => {
    var stopwatch = Stopwatch.StartNew();
    var endpoint = context.GetEndpoint()?.DisplayName;
    
    try
    {
        await next();
    }
    finally
    {
        stopwatch.Stop();
        if (!string.IsNullOrEmpty(endpoint))
        {
            // カスタムメトリクスの記録
            var meter = new Meter("MyApp.Api", "1.0.0");
            meter.CreateHistogram<double>("http.request.duration")
                .Record(stopwatch.ElapsedMilliseconds, 
                    new("endpoint", endpoint),
                    new("status", context.Response.StatusCode.ToString()));
        }
    }
});
```

dotnet-monitorで上記のカスタムメトリクスを収集するには設定が必要です：

```json
{
  "Metrics": {
    "IncludeDefaultProviders": true,
    "Providers": [
      {
        "ProviderName": "MyApp.Api",
        "EventCounterIntervalSec": 5
      }
    ]
  }
}
```

### 3.2 SQLクエリレベルのメトリクス

dotnet-monitorでは **収集できない/限定的な メトリクス**:

- **クエリ/SP別の実行時間**: 個別のSQLクエリやストアドプロシージャのパフォーマンス
- **クエリ/SP別のエラー率**: 個別のSQLクエリやストアドプロシージャのエラー率
- **クエリ/SP別の実行頻度**: 個別のSQLクエリやストアドプロシージャの実行頻度

#### 対応方法: カスタムSQLクライアントラッパー

```csharp
public async Task<TResult> ExecuteStoredProcedureAsync<TResult>(
    string connectionString, 
    string procedureName,
    Dictionary<string, object> parameters)
{
    var meter = new Meter("MyApp.Database", "1.0.0");
    var stopwatch = Stopwatch.StartNew();
    
    try 
    {
        using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        
        using var cmd = new SqlCommand(procedureName, connection)
        {
            CommandType = CommandType.StoredProcedure
        };
        
        // パラメータの追加
        foreach (var param in parameters)
        {
            cmd.Parameters.AddWithValue(param.Key, param.Value);
        }
        
        // 実行と結果の取得
        var result = await cmd.ExecuteScalarAsync();
        
        stopwatch.Stop();
        
        // メトリクスの記録
        meter.CreateCounter<long>("sql.sproc.calls").Add(1, new("procedure", procedureName));
        meter.CreateHistogram<double>("sql.sproc.duration").Record(
            stopwatch.ElapsedMilliseconds, new("procedure", procedureName));
            
        return (TResult)Convert.ChangeType(result, typeof(TResult));
    }
    catch (Exception ex)
    {
        stopwatch.Stop();
        
        // エラーメトリクスの記録
        meter.CreateCounter<long>("sql.sproc.errors").Add(1, 
            new("procedure", procedureName),
            new("error_type", ex.GetType().Name));
            
        throw;
    }
}
```

### 3.3 Kafkaメトリクス

dotnet-monitorでは **収集できない メトリクス**:

- **トピック/パーティション別のメッセージ数**: 各トピック/パーティションの処理数
- **コンシューマーラグ**: コンシューマーグループの処理遅延（未処理メッセージ数）
- **メッセージ処理時間**: メッセージの処理にかかる時間
- **エラー率**: 処理エラーの発生率

#### 対応方法: Kafka統計情報ハンドラーとカスタムメトリクス

```csharp
// プロデューサー設定例
var producerConfig = new ProducerConfig
{
    BootstrapServers = "kafka:9092",
    StatisticsIntervalMs = 5000
};

// Kafka統計情報からのメトリクス収集
using var producer = new ProducerBuilder<string, string>(producerConfig)
    .SetStatisticsHandler((_, stats) => 
    {
        var jsonStats = JObject.Parse(stats);
        var meter = new Meter("MyApp.Kafka", "1.0.0");
        
        // 統計情報からメトリクスを抽出して記録
        foreach (var topic in jsonStats["topics"].Children<JProperty>())
        {
            var topicName = topic.Name;
            var partitions = topic.Value["partitions"];
            
            foreach (var partition in partitions.Children<JProperty>())
            {
                var partitionId = partition.Name;
                var txmsgs = partition.Value["txmsgs"]?.Value<long>() ?? 0;
                
                meter.CreateCounter<long>("kafka.producer.messages")
                    .Add(txmsgs, 
                        new("topic", topicName), 
                        new("partition", partitionId));
            }
        }
    })
    .Build();

// コンシューマーラグ監視のバックグラウンドサービス
public class KafkaLagMonitor : BackgroundService
{
    private readonly Meter _meter = new Meter("MyApp.Kafka.Lag", "1.0.0");
    
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // コンシューマーラグの収集と記録のロジック
        // ...
        
        _meter.CreateObservableGauge<long>("kafka.consumer.lag")
            .Record(calculatedLag, 
                new("topic", topicName), 
                new("partition", partitionId.ToString()));
    }
}
```

### 3.4 ビジネスメトリクス

dotnet-monitorでは **収集できない メトリクス**:

- **ビジネスプロセス完了率**: 特定のビジネスプロセスの完了率
- **トランザクション成功率**: ビジネストランザクションの成功/失敗率
- **処理項目数**: 処理された注文、請求書などの数
- **SLA遵守率**: SLAを満たしたリクエストの割合

#### 対応方法: サービスレイヤーでのメトリクス収集

```csharp
public class OrderService
{
    private readonly Meter _meter;
    
    public OrderService()
    {
        _meter = new Meter("MyApp.Business", "1.0.0");
    }
    
    public async Task<OrderResult> ProcessOrderAsync(Order order)
    {
        var stopwatch = Stopwatch.StartNew();
        
        try
        {
            // 注文処理ロジック
            var result = await ProcessOrderInternalAsync(order);
            
            stopwatch.Stop();
            
            // ビジネスメトリクスの記録
            _meter.CreateCounter<long>("orders.processed").Add(1, 
                new("status", result.Status),
                new("customer_type", order.CustomerType));
                
            _meter.CreateHistogram<double>("orders.processing_time").Record(
                stopwatch.ElapsedMilliseconds,
                new("order_type", order.Type));
                
            if (stopwatch.ElapsedMilliseconds > 5000) // SLAの例
            {
                _meter.CreateCounter<long>("orders.sla_breached").Add(1);
            }
            
            return result;
        }
        catch
        {
            stopwatch.Stop();
            _meter.CreateCounter<long>("orders.failed").Add(1);
            throw;
        }
    }
}
```

## 4. dotnet-monitor 環境変数設定リファレンス

dotnet-monitorは環境変数を使用して設定を行うことができます。すべての設定オプションは `DOTNETMONITOR_` プレフィックスで始まる環境変数を通じて指定できます。

### 4.1 基本設定の環境変数

```yaml
# サーバーのURL設定
- name: DOTNETMONITOR_Urls
  value: "http://+:52323"

# 診断ポート設定
- name: DOTNETMONITOR_DiagnosticPort__ConnectionMode
  value: "Listen"  # または "Connect"
- name: DOTNETMONITOR_DiagnosticPort__EndpointName
  value: "/diag/monitor.sock"

# ストレージ設定
- name: DOTNETMONITOR_Storage__DumpTempFolder
  value: "/tmp/dumps"

# メトリクスエンドポイント設定
- name: DOTNETMONITOR_Metrics__Endpoints
  value: "http://+:52325/metrics"
- name: DOTNETMONITOR_Metrics__IncludeDefaultProviders
  value: "true"
```

### 4.2 メトリクスプロバイダー設定の環境変数

```yaml
# System.Runtime プロバイダー
- name: DOTNETMONITOR_Metrics__Providers__0__ProviderName
  value: "System.Runtime"
- name: DOTNETMONITOR_Metrics__Providers__0__EventCounterIntervalSec
  value: "5"

# ASP.NET Core プロバイダー
- name: DOTNETMONITOR_Metrics__Providers__1__ProviderName
  value: "Microsoft.AspNetCore.Hosting"
- name: DOTNETMONITOR_Metrics__Providers__1__EventCounterIntervalSec
  value: "5"

# Kestrel プロバイダー
- name: DOTNETMONITOR_Metrics__Providers__2__ProviderName
  value: "Microsoft.AspNetCore.Server.Kestrel"
- name: DOTNETMONITOR_Metrics__Providers__2__EventCounterIntervalSec
  value: "5"

# SQLクライアント プロバイダー
- name: DOTNETMONITOR_Metrics__Providers__3__ProviderName
  value: "Microsoft.Data.SqlClient.EventSource"
- name: DOTNETMONITOR_Metrics__Providers__3__EventCounterIntervalSec
  value: "5"

# HTTPクライアント プロバイダー
- name: DOTNETMONITOR_Metrics__Providers__4__ProviderName
  value: "System.Net.Http"
- name: DOTNETMONITOR_Metrics__Providers__4__EventCounterIntervalSec
  value: "5"

# カスタムAPIメトリクス プロバイダー
- name: DOTNETMONITOR_Metrics__Providers__5__ProviderName
  value: "MyApp.Api"
- name: DOTNETMONITOR_Metrics__Providers__5__EventCounterIntervalSec
  value: "5"

# カスタムデータベースメトリクス プロバイダー
- name: DOTNETMONITOR_Metrics__Providers__6__ProviderName
  value: "MyApp.Database"
- name: DOTNETMONITOR_Metrics__Providers__6__EventCounterIntervalSec
  value: "5"

# カスタムKafkaメトリクス プロバイダー
- name: DOTNETMONITOR_Metrics__Providers__7__ProviderName
  value: "MyApp.Kafka"
- name: DOTNETMONITOR_Metrics__Providers__7__EventCounterIntervalSec
  value: "5"
```

### 4.3 Prometheusメトリクス制限の環境変数

```yaml
# メトリクスの最大数
- name: DOTNETMONITOR_Metrics__MetricCount
  value: "100"

# ヒストグラムの最大数
- name: DOTNETMONITOR_Metrics__MaxHistograms
  value: "100"

# 時系列データの最大数
- name: DOTNETMONITOR_Metrics__MaxTimeSeries
  value: "1000"
```

### 4.4 認証・認可の環境変数

```yaml
# API認証キー
- name: DOTNETMONITOR_Authentication__MonitorApiKey__Subject
  value: "DOTNET_MONITOR_API_KEY"
- name: DOTNET_MONITOR_API_KEY
  value: "your-secure-api-key-here"

# 認可の設定
- name: DOTNETMONITOR_Authorization__DefaultActions__0
  value: "Metrics"
- name: DOTNETMONITOR_Authorization__DefaultActions__1
  value: "Logs"
```

### 4.5 ログの環境変数

```yaml
# ログレベル
- name: DOTNETMONITOR_Logging__LogLevel__Default
  value: "Information"
- name: DOTNETMONITOR_Logging__LogLevel__Microsoft
  value: "Warning"

# コンソールログ
- name: DOTNETMONITOR_Logging__Console__FormatterName
  value: "json"
```

### 4.6 コレクションルール設定の環境変数

```yaml
# CPU使用率が高い場合のダンプ取得ルール
- name: DOTNETMONITOR_CollectionRules__HighCpuRule__Trigger__Type
  value: "EventCounter"
- name: DOTNETMONITOR_CollectionRules__HighCpuRule__Trigger__Settings__ProviderName
  value: "System.Runtime"
- name: DOTNETMONITOR_CollectionRules__HighCpuRule__Trigger__Settings__CounterName
  value: "cpu-usage"
- name: DOTNETMONITOR_CollectionRules__HighCpuRule__Trigger__Settings__GreaterThan
  value: "80"
- name: DOTNETMONITOR_CollectionRules__HighCpuRule__Actions__0__Type
  value: "CollectDump"
- name: DOTNETMONITOR_CollectionRules__HighCpuRule__Actions__0__Settings__Type
  value: "Mini"
```

### 4.7 Kubernetes環境での環境変数設定例

Kubernetes DeploymentマニフェストでのdotNet-monitor設定例：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-dotnet-app
spec:
  selector:
    matchLabels:
      app: my-dotnet-app
  template:
    metadata:
      labels:
        app: my-dotnet-app
    spec:
      containers:
      # アプリケーションコンテナ
      - name: app
        image: your-registry/your-app:latest
        env:
          - name: DOTNET_DiagnosticPorts
            value: "/diag/monitor.sock"
        volumeMounts:
          - name: diagsocket
            mountPath: /diag
      
      # dotnet-monitorサイドカーコンテナ
      - name: dotnet-monitor
        image: mcr.microsoft.com/dotnet/monitor:8.0
        args: ["collect"]
        env:
          # 基本設定
          - name: DOTNETMONITOR_Urls
            value: "http://+:52323"
          - name: DOTNETMONITOR_DiagnosticPort__ConnectionMode
            value: "Listen"
          - name: DOTNETMONITOR_DiagnosticPort__EndpointName
            value: "/diag/monitor.sock"
            
          # メトリクス設定
          - name: DOTNETMONITOR_Metrics__Endpoints
            value: "http://+:52325/metrics"
          - name: DOTNETMONITOR_Metrics__IncludeDefaultProviders
            value: "true"
            
          # プロバイダー設定
          - name: DOTNETMONITOR_Metrics__Providers__0__ProviderName
            value: "System.Runtime"
          - name: DOTNETMONITOR_Metrics__Providers__0__EventCounterIntervalSec
            value: "5"
          - name: DOTNETMONITOR_Metrics__Providers__1__ProviderName
            value: "Microsoft.AspNetCore.Hosting"
          - name: DOTNETMONITOR_Metrics__Providers__1__EventCounterIntervalSec
            value: "5"
            
          # ログ設定
          - name: DOTNETMONITOR_Logging__LogLevel__Default
            value: "Information"
        ports:
          - containerPort: 52323
            name: monitor-api
          - containerPort: 52325
            name: monitor-metrics
        volumeMounts:
          - name: diagsocket
            mountPath: /diag
      
      volumes:
        - name: diagsocket
          emptyDir: {}
```

### 4.8 環境変数設定の命名規則

1. **プレフィックス**: すべての環境変数は`DOTNETMONITOR_`で始まります
2. **階層構造**: JSONの階層構造は`__`（ダブルアンダースコア）で表現
3. **配列**: 配列要素は`__0__`、`__1__`のようにインデックスを使用
4. **ブール値**: "true"/"false"の文字列として指定
5. **数値**: 数値も文字列として指定（例: "5"、"100"）

### 4.9 重要な環境変数のチートシート

| 環境変数 | 説明 | 例 |
|---------|------|-----|
| `DOTNETMONITOR_Urls` | APIエンドポイントURL | "http://+:52323" |
| `DOTNETMONITOR_Metrics__Endpoints` | メトリクスエンドポイント | "http://+:52325/metrics" |
| `DOTNETMONITOR_DiagnosticPort__ConnectionMode` | 診断接続モード | "Listen" または "Connect" |
| `DOTNETMONITOR_DiagnosticPort__EndpointName` | 診断ソケットのパス | "/diag/monitor.sock" |
| `DOTNETMONITOR_Metrics__IncludeDefaultProviders` | デフォルトプロバイダーを含めるか | "true" |
| `DOTNETMONITOR_Metrics__Providers__N__ProviderName` | メトリクスプロバイダー名 | "System.Runtime" |
| `DOTNETMONITOR_Logging__LogLevel__Default` | デフォルトログレベル | "Information" |

## 5. SQLサーバーストアドプロシージャの計測

SQLサーバーのストアドプロシージャ（SP）のパフォーマンスを監視することは、アプリケーションの最適化において重要です。ここでは、SPの呼び出し時間と実行時間の違いおよびそれらを計測するための方法について説明します。

### 5.1 呼び出し時間と実行時間の違い

#### 呼び出し時間（Call Time）
クライアント側（.NETアプリケーション）から測定した、SPを呼び出してから結果が返ってくるまでの合計時間を指します。以下が含まれます：

- 接続確立または接続プールからの接続取得時間
- SQLサーバーへのリクエスト送信時間（ネットワーク）
- SQLサーバーでの実行時間
- 結果がクライアントに戻ってくる時間（ネットワーク）
- 結果の処理時間

#### 実行時間（Execution Time）
SQLサーバー側で実際にSPが実行されるのにかかった時間のみを指します。サーバー内部で測定され、クエリプラン生成、データ検索、結合、集計などの純粋なデータベース処理時間だけが含まれます。

### 5.2 dotnet-monitorとSQLパフォーマンス監視の統合

dotnet-monitorは標準では接続数や全体的なSQL操作回数は収集しますが、SP別の詳細メトリクスは収集しません。以下のカスタム実装が必要です。

#### 5.2.1 呼び出し時間の計測（クライアント側）

カスタムインスツルメンテーションコード例：

```csharp
public class SqlMetricsService
{
    private readonly Meter _meter;
    private readonly Histogram<double> _sprocDuration;
    private readonly Counter<long> _sprocCalls;
    private readonly Counter<long> _sprocErrors;
    private readonly string _connectionString;
    
    public SqlMetricsService(string connectionString)
    {
        _connectionString = connectionString;
        _meter = new Meter("MyApp.Database", "1.0.0");
        
        // SPの呼び出し時間を記録するヒストグラム
        _sprocDuration = _meter.CreateHistogram<double>(
            "sql.sproc.duration",
            unit: "ms",
            description: "Stored procedure call duration");
            
        // SP呼び出し回数カウンター
        _sprocCalls = _meter.CreateCounter<long>(
            "sql.sproc.calls",
            description: "Number of stored procedure calls");
            
        // SPエラーカウンター
        _sprocErrors = _meter.CreateCounter<long>(
            "sql.sproc.errors",
            description: "Number of stored procedure errors");
    }
    
    public async Task<T> ExecuteStoredProcedureAsync<T>(
        string procedureName,
        Dictionary<string, object> parameters = null)
    {
        // 呼び出し時間計測開始
        var stopwatch = Stopwatch.StartNew();
        
        try 
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            
            using var cmd = new SqlCommand(procedureName, connection)
            {
                CommandType = CommandType.StoredProcedure
            };
            
            // パラメータの追加
            if (parameters != null)
            {
                foreach (var param in parameters)
                {
                    cmd.Parameters.AddWithValue(param.Key, param.Value ?? DBNull.Value);
                }
            }
            
            // SP実行
            var result = await cmd.ExecuteScalarAsync();
            
            // 呼び出し時間計測終了
            stopwatch.Stop();
            
            // メトリクスの記録
            _sprocCalls.Add(1, new("procedure", procedureName));
            _sprocDuration.Record(stopwatch.ElapsedMilliseconds, 
                new("procedure", procedureName),
                new("status", "success"));
                
            return (T)Convert.ChangeType(result, typeof(T));
        }
        catch (Exception ex)
        {
            // 呼び出し時間計測終了（エラー時）
            stopwatch.Stop();
            
            // エラーメトリクスの記録
            _sprocErrors.Add(1, 
                new("procedure", procedureName),
                new("error_type", ex.GetType().Name));
                
            // 呼び出し時間も記録（エラー時）
            _sprocDuration.Record(stopwatch.ElapsedMilliseconds, 
                new("procedure", procedureName),
                new("status", "error"));
                
            throw;
        }
    }
    
    // 複数行の結果セットを返すSP用
    public async Task<List<T>> ExecuteStoredProcedureListAsync<T>(
        string procedureName,
        Dictionary<string, object> parameters = null) where T : new()
    {
        // 同様の実装（ExecuteReaderを使用）
        // ...
    }
}
```

#### 5.2.2 実行時間の計測（サーバー側）

SQLサーバー側の実行時間を計測するには、追加の設定が必要です：

1. **クエリストアを有効化するSQLスクリプト**:

```sql
-- データベースでクエリストアを有効化
ALTER DATABASE YourDatabaseName SET QUERY_STORE = ON;

-- クエリストア設定変更（オプション）
ALTER DATABASE YourDatabaseName SET QUERY_STORE (
    OPERATION_MODE = READ_WRITE,
    CLEANUP_POLICY = (STALE_QUERY_THRESHOLD_DAYS = 30),
    DATA_FLUSH_INTERVAL_SECONDS = 900,
    MAX_STORAGE_SIZE_MB = 1000,
    INTERVAL_LENGTH_MINUTES = 60
);
```

2. **実行時間データを取得するクエリ**:

```sql
-- SP実行時間を取得するクエリ
CREATE PROCEDURE dbo.GetStoredProcPerformance
AS
BEGIN
    SELECT 
        OBJECT_NAME(q.object_id) AS ProcedureName,
        ROUND(AVG(rs.avg_duration) / 1000.0, 2) AS AvgDurationMs,
        ROUND(MIN(rs.min_duration) / 1000.0, 2) AS MinDurationMs,
        ROUND(MAX(rs.max_duration) / 1000.0, 2) AS MaxDurationMs,
        ROUND(SUM(rs.count_executions * rs.avg_duration) / SUM(rs.count_executions) / 1000.0, 2) AS WeightedAvgDurationMs,
        SUM(rs.count_executions) AS ExecutionCount,
        MIN(rs.last_execution_time) AS FirstExecutionTime,
        MAX(rs.last_execution_time) AS LastExecutionTime
    FROM sys.query_store_query q
    JOIN sys.query_store_query_text qt ON q.query_text_id = qt.query_text_id
    JOIN sys.query_store_plan p ON q.query_id = p.query_id
    JOIN sys.query_store_runtime_stats rs ON p.plan_id = rs.plan_id
    JOIN sys.query_store_runtime_stats_interval rsi ON rs.runtime_stats_interval_id = rsi.runtime_stats_interval_id
    WHERE q.object_id IS NOT NULL  -- ストアドプロシージャのみを対象
    GROUP BY OBJECT_NAME(q.object_id)
    ORDER BY SUM(rs.count_executions) DESC;
END
```

3. **SQL実行時間データの定期収集バックグラウンドサービス**:

```csharp
public class SqlPerformanceCollectorService : BackgroundService
{
    private readonly ILogger<SqlPerformanceCollectorService> _logger;
    private readonly string _connectionString;
    private readonly Meter _meter;
    
    public SqlPerformanceCollectorService(
        IConfiguration config, 
        ILogger<SqlPerformanceCollectorService> logger)
    {
        _logger = logger;
        _connectionString = config.GetConnectionString("MainDatabase");
        _meter = new Meter("MyApp.Database.ServerSide", "1.0.0");
    }
    
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            // 30秒ごとにSQLサーバーからパフォーマンスデータを収集
            var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
            
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await CollectSqlPerformanceMetricsAsync();
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Error in SQL performance collector service");
        }
    }
    
    private async Task CollectSqlPerformanceMetricsAsync()
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            
            using var cmd = new SqlCommand("dbo.GetStoredProcPerformance", connection)
            {
                CommandType = CommandType.StoredProcedure
            };
            
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var procedureName = reader.GetString(0);
                var avgDurationMs = reader.GetDouble(1);
                var minDurationMs = reader.GetDouble(2);
                var maxDurationMs = reader.GetDouble(3);
                var executionCount = reader.GetInt64(5);
                
                // メトリクスとして記録
                _meter.CreateObservableGauge<double>("sql.server.sproc.avg_duration", "ms", "SP average execution time")
                    .Record(avgDurationMs, new("procedure", procedureName));
                
                _meter.CreateObservableGauge<double>("sql.server.sproc.max_duration", "ms", "SP maximum execution time")
                    .Record(maxDurationMs, new("procedure", procedureName));
                
                _meter.CreateObservableGauge<long>("sql.server.sproc.execution_count", "count", "SP execution count")
                    .Record(executionCount, new("procedure", procedureName));
                
                _logger.LogDebug("Collected metrics for SP {ProcedureName}: Avg={AvgDuration}ms, Max={MaxDuration}ms, Count={Count}", 
                    procedureName, avgDurationMs, maxDurationMs, executionCount);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to collect SQL performance metrics");
        }
    }
}
```

### 5.3 dotnet-monitorでのSP監視設定

#### 5.3.1 環境変数設定

カスタムメトリクスを収集するために必要なdotnet-monitor環境変数設定：

```yaml
# クライアント側SPメトリクス収集設定
- name: DOTNETMONITOR_Metrics__Providers__0__ProviderName
  value: "MyApp.Database"
- name: DOTNETMONITOR_Metrics__Providers__0__EventCounterIntervalSec
  value: "5"

# サーバー側SPメトリクス収集設定
- name: DOTNETMONITOR_Metrics__Providers__1__ProviderName
  value: "MyApp.Database.ServerSide"
- name: DOTNETMONITOR_Metrics__Providers__1__EventCounterIntervalSec
  value: "5"
```

#### 5.3.2 アプリケーション登録

Program.cs でのサービス登録：

```csharp
// DI登録
builder.Services.AddSingleton<SqlMetricsService>();
builder.Services.AddHostedService<SqlPerformanceCollectorService>();

// OpenTelemetryとの統合（オプション）
builder.Services.AddOpenTelemetry()
    .WithMetrics(metrics => metrics
        .AddMeter("MyApp.Database")
        .AddMeter("MyApp.Database.ServerSide")
        .AddPrometheusExporter());
```

### 5.4 呼び出し時間と実行時間の差異分析

呼び出し時間と実行時間の差を分析することで、パフォーマンスのボトルネックを特定できます：

1. **大きな差異がある場合の原因**:
   - ネットワークレイテンシー
   - 接続プールの問題
   - 大きな結果セットの転送時間
   - クライアント側の処理オーバーヘッド

2. **分析ダッシュボード例（Datadog）**:

```yaml
- name: DOTNETMONITOR_CollectionRules__SqlPerformanceRule__Trigger__Type
  value: "EventCounter"
- name: DOTNETMONITOR_CollectionRules__SqlPerformanceRule__Trigger__Settings__ProviderName
  value: "MyApp.Database"
- name: DOTNETMONITOR_CollectionRules__SqlPerformanceRule__Trigger__Settings__CounterName
  value: "sql.sproc.duration"
- name: DOTNETMONITOR_CollectionRules__SqlPerformanceRule__Trigger__Settings__GreaterThan
  value: "1000"  # 1秒以上かかるSP呼び出しを検出
```

### 5.5 パフォーマンス最適化のヒント

1. **呼び出し時間の最適化**:
   - 接続プーリングの適切な設定
   - バッチ処理の活用
   - 適切なトランザクション管理

2. **実行時間の最適化**:
   - インデックスの最適化
   - クエリプランの分析と改善
   - パラメーターのスニッフィング問題への対応

3. **監視アラートの設定**:
   - 呼び出し時間と実行時間の差が大きくなった場合のアラート
   - 特定のSPの実行時間が増加した場合のアラート
   - 頻繁に実行されるSPのパフォーマンス低下検出
