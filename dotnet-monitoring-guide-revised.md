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

## 5. モニタリングのベストプラクティス

### 5.1 統合的なアプローチ

1. **dotnet-monitorをベースラインとして使用**: ランタイムおよびフレームワークメトリクスの収集
2. **カスタムメトリクスを戦略的に追加**: ビジネスクリティカルな部分には特に注力
3. **カスタムメトリクスをdotnet-monitorと統合**: カスタムメトリクスもdotnet-monitorから公開

### 5.2 モニタリングダッシュボードの構築

1. **階層的アプローチ**:
   - レベル1: システム全体の健全性
   - レベル2: サービス別のパフォーマンス
   - レベル3: エンドポイント/プロセス別の詳細

2. **相関ダッシュボード**:
   - API処理時間とDB処理時間の相関
   - メモリ使用量とGCの相関
   - スレッドプール使用率とレイテンシの相関

### 5.3 アラート戦略

1. **多層的なアラート**:
   - システムレベルアラート（CPU、メモリ、例外率など）
   - ビジネスプロセスレベルアラート（SLA違反、トランザクション失敗率など）

2. **統計的アラート**:
   - 平均値ではなくp95/p99を使用したアラート
   - 急激な変化（勾配）に基づくアラート

## 6. 結論

`dotnet-monitor`は.NETアプリケーションのモニタリングの強力な基盤を提供しますが、完全なモニタリングソリューションには以下のことが必要です：

1. **dotnet-monitorが自動的に提供するメトリクスの活用**
2. **アプリケーション固有のカスタムメトリクスの追加実装**
3. **全てのメトリクスを統合し、Datadogなどのモニタリングプラットフォームで可視化**

このアプローチにより、.NETアプリケーションの技術的側面だけでなく、ビジネス的側面も含めた包括的なモニタリングが可能になります。
