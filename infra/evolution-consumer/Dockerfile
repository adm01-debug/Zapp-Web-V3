# evolution-rabbit-consumer — imagem oficial do consumer (A-10)
# Publicada em ghcr.io/adm01-debug/evolution-rabbit-consumer (pinned por digest)
# Substitui a imagem local 'consumer-prebuilt:v2' (sem registry — risco de prune)
FROM python:3.12-alpine

RUN apk add --no-cache ca-certificates && \
    pip install --no-cache-dir \
      pika==1.3.2 \
      requests==2.32.3 \
      psycopg2-binary==2.9.10 \
      sentry-sdk==2.20.0

WORKDIR /app
COPY consumer.py /app/consumer.py

# O entrypoint real (stack 113) exporta secrets e executa:
#   exec python -u /app/consumer.py
# (o patch HMAC agora é aplicado em build-time via consumer.py v6 — ver B-6)
CMD ["python", "-u", "/app/consumer.py"]
