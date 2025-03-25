# .NET アプリケーションのパフォーマンス監視ガイド

このドキュメントでは、.NET（特に.NET 8）アプリケーションのパフォーマンス監視の方法と、Kubernetes環境でのDatadogとの統合について説明します。

## .NETランタイムのメトリクス収集メカニズム

.NET アプリケーションには、パフォーマンスメトリクスを収集するための複数のメカニズムがあります：

### EventCounters

EventCountersは.NETのライトウェイトな診断メカニズムで、アプリケーションのパフォーマンスメトリクスを提供します：

- **デフォルトのカウンター**: `System.Runtime`, `Microsoft.AspNetCore.Hosting`など
- **gRPC固有のカウンター**: `Grpc.AspNetCore.Server.CallsPerSecond`, `Grpc.AspNetCore.Server.CallsTotal`など
- **取得方法**: `dotnet-counters` ツールまたはEventPipe APIを使用して収集可能

### EventPipe

EventPipeは.NETのプロセス間通信メカニズムで、リアルタイムのメトリクスとイベントデータを収集します：

- プロセス間でイベントとメトリクスデータをストリーミング
- 低オーバーヘッドで高パフォーマンス
- `dotnet-trace`ツールまたはDiagnosticsClient APIでアクセス可能

### CORECLR_PROFILER

`CORECLR_PROFILER`は.NETランタイムのプロファイリングメカニズムで、APMツールが動的な計測に使用します：

- **役割**: アプリケーション実行中の動的計測とプロファイリングを可能にする
- **主要な環境変数**:
  - `CORECLR_ENABLE_PROFILING`: プロファイリングを有効にするフラグ（"1"または"0"）
  - `CORECLR_PROFILER`: 使用するプロファイラーのCLSID/GUID
  - `CORECLR_PROFILER_PATH`: プロファイラーのネイティブライブラリパス

- **動作方法**:
  - アプリケーション起動時に.NET Runtimeが環境変数をチェック
  - 指定されたプロファイラーがロードされる
  - プロファイラーがJITコンパイル、メソッド呼び出し、例外などのイベントをフック
  - メソッドの実行時間計測、コールグラフ作成などが可能に

- **Datadogの場合**:
  - DatadogのGUID: `{846F5F1C-F9AE-4B07-969E-05C26BC060D8}`
  - メソッド呼び出し、DB操作、HTTP/gRPC呼び出しなどを自動的に計測
  - EventPipeからパフォーマンスカウンターを収集

- **セキュリティ考慮点**:
  - プロファイラーはアプリケーションコードを変更できる強力な機能を持つ
  - 信頼できるソースからのプロファイラーのみを使用すべき

## gRPCアプリケーションのデフォルトメトリクス

.NET 8のgRPCアプリケーションでデフォルトで利用可能な主要なメトリクス：

- **gRPC固有のメトリクス**:
  - `Grpc.AspNetCore.Server.CallsPerSecond`: 1秒あたりのgRPCコール数
  - `Grpc.AspNetCore.Server.CallsTotal`: 合計gRPCコール数
  - `Grpc.AspNetCore.Server.CallsFailed`: 失敗したgRPCコール数
  - `Grpc.AspNetCore.Server.CallsDeadlineExceeded`: タイムアウトしたコール数

- **ASP.NET Core基本メトリクス**:
  - `Microsoft.AspNetCore.Hosting.HttpRequestIn.*`: HTTPリクエスト関連メトリクス
  - `Microsoft.AspNetCore.Server.Kestrel.*`: Kestrelサーバー関連メトリクス

- **ランタイムメトリクス**:
  - `System.Runtime.cpu-usage`: CPU使用率
  - `System.Runtime.gc-heap-size`: GCヒープサイズ
  - `System.Runtime.threadpool-thread-count`: スレッドプールスレッド数

## Datadogでメトリクスを収集する方法

### 1. Datadog .NET トレーサーの使用

```yaml
# Kubernetes Deployment抜粋
spec:
  containers:
  - name: my-grpc-service
    image: your-registry/my-grpc-service:latest
    env:
      # Datadog APM有効化
      - name: DD_TRACE_ENABLED
        value: "true"
      - name: DD_RUNTIME_METRICS_ENABLED
        value: "true"
      # .NET Profiler設定
      - name: CORECLR_ENABLE_PROFILING
        value: "1"
      - name: CORECLR_PROFILER
        value: "{846F5F1C-F9AE-4B07-969E-05C26BC060D8}"
      - name: CORECLR_PROFILER_PATH
        value: "/opt/datadog/Datadog.Trace.ClrProfiler.Native.so"
      # gRPC特有の設定
      - name: DD_TRACE_GRPC_ENABLED
        value: "true"
```

### 2. OpenTelemetryとPrometheus Exporterの使用

**Program.cs での設定**:

```csharp
var builder = WebApplication.CreateBuilder(args);

// gRPCサービスの追加
builder.Services.AddGrpc();

// OpenTelemetryとPrometheusエクスポーターを設定
builder.Services
    .AddOpenTelemetry()
    .ConfigureResource(resource => resource
        .AddService(serviceName: "my-grpc-service"))
    .WithMetrics(metrics => metrics
        // ランタイムメトリクス
        .AddRuntimeInstrumentation()
        // ASP.NET Coreメトリクス
        .AddAspNetCoreInstrumentation()
        // gRPCクライアントメトリクス
        .AddGrpcClientInstrumentation()
        // EventCountersからメトリクスを収集
        .AddEventCountersInstrumentation(options =>
        {
            options.AddEventSources(
                "System.Runtime", 
                "Microsoft.AspNetCore.Hosting", 
                "Grpc.AspNetCore.Server", 
                "Grpc.Net.Client");
        })
        // Prometheusエクスポーター
        .AddPrometheusExporter());

var app = builder.Build();

// Prometheusエンドポイントの設定
app.UseOpenTelemetryPrometheusScrapingEndpoint();

// gRPCサービスのマッピング
app.MapGrpcService<YourGrpcService>();

app.Run();
```

**Kubernetes マニフェスト**:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-grpc-service
spec:
  selector:
    matchLabels:
      app: my-grpc-service
  template:
    metadata:
      labels:
        app: my-grpc-service
      annotations:
        # Datadogに対してPrometheusメトリクスのエンドポイントを知らせる
        ad.datadoghq.com/my-grpc-service.check_names: '["prometheus"]'
        ad.datadoghq.com/my-grpc-service.init_configs: '[{}]'
        ad.datadoghq.com/my-grpc-service.instances: |
          [
            {
              "prometheus_url": "http://%%host%%:80/metrics",
              "namespace": "my_grpc_service",
              "metrics": [".*"]
            }
          ]
    spec:
      containers:
      - name: my-grpc-service
        image: your-registry/my-grpc-service:latest
        ports:
        - containerPort: 80
```

### 3. dotnet-monitorの使用

dotnet-monitorを使用するには2つの主要なアプローチがあります。

#### 3.1 サイドカーコンテナ方式（推奨）

サイドカーコンテナとしてdotnet-monitorを実行する方法は、Kubernetes環境で特に適しています：

**Kubernetes Deployment**:

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
  - name: my-grpc-service
    image: your-registry/my-grpc-service:latest
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

**Datadogアノテーション**:

```yaml
metadata:
  annotations:
    ad.datadoghq.com/dotnet-monitor.check_names: '["prometheus"]'
    ad.datadoghq.com/dotnet-monitor.init_configs: '[{}]'
    ad.datadoghq.com/dotnet-monitor.instances: |
      [
        {
          "prometheus_url": "http://%%host%%:52325/metrics",
          "namespace": "dotnet_monitor",
          "metrics": [".*"]
        }
      ]
```

**サイドカー方式の利点**:
- アプリケーションと監視ツールの関心の分離
- 監視ツールを個別にスケールまたは更新可能
- アプリケーションコンテナのイメージサイズが最小限に保たれる
- リソース制限を別々に設定可能

#### 3.2 アプリケーションコンテナに組み込む方式

小規模な環境や、Kubernetesを使用していない場合は、dotnet-monitorをアプリケーションコンテナに直接組み込むことも可能です。

**Dockerfile例**:

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
# ビルド手順...

FROM mcr.microsoft.com/dotnet/monitor:8.0 AS monitor

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
# dotnet-monitorからの必要なファイルをコピー
COPY --from=monitor /app /app/dotnet-monitor

ENV PATH="${PATH}:/app/dotnet-monitor"
ENV DOTNETMONITOR_Metrics__Endpoints="http://+:52325/metrics"
ENV DOTNETMONITOR_DiagnosticPort__ConnectionMode="Connect"
ENV DOTNET_DiagnosticPorts="/diag/monitor.sock"

# 監視とアプリケーションを起動するスクリプト
COPY start.sh /app/
RUN chmod +x /app/start.sh
ENTRYPOINT ["/app/start.sh"]
```

start.sh:
```bash
#!/bin/bash
mkdir -p /diag
# バックグラウンドでdotnet-monitorを起動
/app/dotnet-monitor/dotnet-monitor collect --urls http://+:52323 &
# アプリケーションを起動
dotnet YourApp.dll
```

## 監視すべき重要なgRPCメトリクス

### 1. レイテンシーメトリクス
- **リクエスト処理時間**: 各gRPCメソッドの処理にかかる時間
- **p50/p95/p99パーセンタイル**: 異常値を検出するための統計的分布

### 2. スループットメトリクス
- **リクエスト数/秒**: メソッド別のRPSを測定
- **処理されたバイト数**: 特に大きなペイロードやストリーミングで重要

### 3. エラーメトリクス
- **エラー率**: gRPCステータスコード別のエラー発生率
- **デッドライン超過**: タイムアウトしたリクエストの数

### 4. リソース使用量
- **CPU使用率**: gRPCの並行処理能力に直接影響
- **メモリ使用量**: 特にバッファサイズと関連
- **GCメトリクス**: GCの頻度と停止時間

## カスタムメトリクスの実装例

より詳細なメトリクスを取得するためのカスタム実装例：

```csharp
using System.Diagnostics.Metrics;
using System.Diagnostics;

public class GrpcService : YourService.YourServiceBase
{
    private readonly Meter _meter;
    private readonly Histogram<double> _requestDuration;
    private readonly Counter<long> _requestCounter;
    
    public GrpcService()
    {
        _meter = new Meter("MyCompany.MyApp.Grpc", "1.0.0");
        
        _requestDuration = _meter.CreateHistogram<double>(
            "grpc.request.duration",
            unit: "ms",
            description: "The duration of gRPC requests");
            
        _requestCounter = _meter.CreateCounter<long>(
            "grpc.request.count",
            description: "Number of gRPC requests");
    }
    
    public override async Task<Response> UnaryMethod(Request request, 
        ServerCallContext context)
    {
        var stopwatch = Stopwatch.StartNew();
        try 
        {
            var result = await base.UnaryMethod(request, context);
            stopwatch.Stop();
            
            _requestCounter.Add(1, new("method", "UnaryMethod"));
            _requestDuration.Record(stopwatch.ElapsedMilliseconds, 
                new("method", "UnaryMethod"));
                
            return result;
        }
        catch
        {
            stopwatch.Stop();
            throw;
        }
    }
}
```

## 結論

.NET 8アプリケーションのメトリクス監視には複数の方法があります。特にKubernetes環境でDatadogを使用する場合は、以下の選択肢があります：

1. **Datadog .NET Tracer**: 最も簡単な方法で、APMとの統合が優れています
2. **OpenTelemetryとPrometheus**: 標準化されたアプローチで、ベンダーロックインを避けられます
3. **dotnet-monitor**: 追加コンテナを使用する方法で、アプリケーションコードの変更が不要です

アプリケーションの要件と運用環境に基づいて、最適な方法を選択してください。
