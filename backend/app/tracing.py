"""Optional OpenTelemetry -> Cloud Trace wiring (set ENABLE_TRACING=true)."""
from .config import settings


def setup_tracing(app) -> None:
    if not settings().enable_tracing:
        return
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        provider = TracerProvider()
        provider.add_span_processor(BatchSpanProcessor(CloudTraceSpanExporter()))
        trace.set_tracer_provider(provider)
        FastAPIInstrumentor.instrument_app(app)
    except Exception as exc:  # noqa: BLE001 - tracing must never take the app down
        print(f"tracing disabled: {exc}")
