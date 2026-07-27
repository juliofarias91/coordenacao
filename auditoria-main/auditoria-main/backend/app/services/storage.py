"""Armazenamento de arquivos (S3 ou compatível — MinIO no desenvolvimento).

Guarda logos de empresa agora; a partir da Fase 2 guarda os modelos
(.ifc/.rvt), as evidências das auditorias e os exports.

As chaves são sempre prefixadas por `org_id`: além do isolamento lógico, isso
deixa a limpeza de um tenant ser um prefixo só.
"""

from __future__ import annotations

import logging
import uuid
from functools import lru_cache
from pathlib import PurePosixPath

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings

log = logging.getLogger(__name__)


class StorageError(RuntimeError):
    """Falha ao falar com o storage — o chamador decide se vira 5xx."""


@lru_cache
def cliente():
    """Cliente S3. Serve MinIO, AWS e o Storage do Supabase sem mudar código.

    O Supabase expõe endpoint S3-compatível em
    `https://<ref>.supabase.co/storage/v1/s3`, com região e credencial
    próprias (Storage → Settings → S3 access keys). É configuração, não
    código — por isso o endpoint sempre veio de variável de ambiente.
    """
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url or None,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
    )


def garantir_bucket() -> None:
    s3 = cliente()
    try:
        s3.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        log.info("criando bucket %s", settings.s3_bucket)
        s3.create_bucket(Bucket=settings.s3_bucket)


def chave(org_id: uuid.UUID, *partes: str) -> str:
    return "/".join(["org", str(org_id), *partes])


def enviar(org_id: uuid.UUID, caminho: str, conteudo: bytes, content_type: str) -> str:
    """Grava e devolve a chave (não a URL: a URL é assinada na hora de ler)."""
    k = chave(org_id, caminho)
    try:
        garantir_bucket()
        cliente().put_object(
            Bucket=settings.s3_bucket, Key=k, Body=conteudo, ContentType=content_type
        )
    except ClientError as exc:
        raise StorageError(f"falha ao gravar {k}: {exc}") from exc
    return k


def baixar_para_arquivo(k: str, destino: str) -> str:
    """Baixa a chave para um caminho local. Usado pelo worker de automação.

    Vai para disco e não para memória de propósito: o IfcOpenShell abre por
    caminho, e um .ifc de datacenter não cabe confortavelmente em RAM junto
    com o resto do worker.
    """
    try:
        cliente().download_file(settings.s3_bucket, k, destino)
    except ClientError as exc:
        raise StorageError(f"falha ao baixar {k}: {exc}") from exc
    return destino


def url_assinada(k: str, expira_em: int = 3600) -> str:
    try:
        return cliente().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket, "Key": k},
            ExpiresIn=expira_em,
        )
    except ClientError as exc:
        raise StorageError(f"falha ao assinar {k}: {exc}") from exc


def extensao_segura(nome_arquivo: str, permitidas: set[str]) -> str:
    """Extensão normalizada do arquivo enviado, validada contra uma lista.

    Nunca usamos o nome original na chave — ele vem do cliente e pode conter
    travessia de caminho.
    """
    ext = PurePosixPath(nome_arquivo or "").suffix.lower()
    return ext if ext in permitidas else ""
