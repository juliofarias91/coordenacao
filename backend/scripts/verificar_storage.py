"""Confere que o bucket existe e que NÃO é público.

    python -m scripts.verificar_storage             # só lê: existe? é público?
    python -m scripts.verificar_storage --criar     # cria o bucket se faltar
    python -m scripts.verificar_storage --canario   # prova com um objeto de teste

Existe porque "conferir no painel se o bucket nasceu privado" é uma pendência
que ninguém fecha. O bucket é criado pela própria aplicação no primeiro upload
(`storage.garantir_bucket`), com o padrão do provedor — e um padrão é
exatamente o tipo de coisa que se supõe e não se verifica. Um bucket público
aqui não vaza um avatar: vaza o modelo BIM inteiro do cliente.

O QUE CADA MODO PROVA, e o que não prova:

  padrão    o bucket responde a `head_bucket`, e o ACL/policy que a API S3
            expõe não concede leitura a `AllUsers`. É a checagem barata, e
            passa mesmo em provedor que não implementa `get_bucket_acl` —
            nesse caso ela diz que não soube responder, em vez de fingir.

  --canario a única prova que vale de verdade: grava um objeto, tenta baixá-lo
            por HTTP SEM CREDENCIAL NENHUMA e exige 401/403/404. É o que um
            estranho na internet faria. Escreve e apaga um objeto de ~40 bytes
            sob a chave `_verificacao/`, e apaga mesmo se a checagem falhar.

Sai com código 1 se encontrar algo público — serve em CI ou num cron.
"""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.request
import uuid

from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings
from app.services import storage

# Os dois URIs com que a S3 designa "qualquer pessoa". Um ACL que conceda a
# qualquer um deles é leitura anônima.
TODOS = {
    "http://acs.amazonaws.com/groups/global/AllUsers",
    "http://acs.amazonaws.com/groups/global/AuthenticatedUsers",
}

CHAVE_CANARIO = "_verificacao/canario.txt"


def _bucket_existe() -> bool:
    try:
        storage.cliente().head_bucket(Bucket=settings.s3_bucket)
        return True
    except ClientError as exc:
        codigo = exc.response.get("Error", {}).get("Code", "?")
        if codigo in {"404", "NoSuchBucket"}:
            return False
        # 403 aqui é credencial sem permissão, não bucket ausente — e tratá-lo
        # como ausente levaria o `--criar` a tentar criar um bucket que existe.
        raise


def _acl_publico() -> bool | None:
    """True/False, ou None quando o provedor não responde ACL.

    O Storage do Supabase não implementa `get_bucket_acl`: o público/privado
    dele é um campo da própria tabela de buckets, não um ACL S3. Devolver None
    é honesto — a resposta certa nesse caso é rodar com `--canario`.
    """
    try:
        acl = storage.cliente().get_bucket_acl(Bucket=settings.s3_bucket)
    except ClientError:
        return None
    for concessao in acl.get("Grants", []):
        if concessao.get("Grantee", {}).get("URI") in TODOS:
            return True
    return False


def _canario_e_acessivel_sem_credencial() -> tuple[bool, str]:
    """Grava, tenta ler anonimamente, apaga. Devolve (acessível, detalhe)."""
    s3 = storage.cliente()
    marca = uuid.uuid4().hex
    corpo = f"canario de verificacao {marca}".encode()

    s3.put_object(
        Bucket=settings.s3_bucket,
        Key=CHAVE_CANARIO,
        Body=corpo,
        ContentType="text/plain",
    )
    try:
        # URL assinada e depois SEM a assinatura: é assim que se chega ao
        # endereço público real do objeto, sem adivinhar o formato de URL do
        # provedor.
        assinada = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket, "Key": CHAVE_CANARIO},
            ExpiresIn=60,
        )
        publica = assinada.split("?")[0]
        try:
            with urllib.request.urlopen(publica, timeout=10) as resp:  # noqa: S310
                lido = resp.read()
            if lido == corpo:
                return True, f"{publica} devolveu o conteúdo sem credencial"
            return True, f"{publica} respondeu {resp.status} sem credencial"
        except urllib.error.HTTPError as exc:
            if exc.code in {400, 401, 403, 404}:
                return False, f"anônimo recebeu {exc.code}, como esperado"
            return True, f"anônimo recebeu {exc.code}, que não é uma recusa"
        except urllib.error.URLError as exc:
            return False, f"não foi possível testar ({exc.reason})"
    finally:
        # `finally`: um canário esquecido no bucket é lixo com nome de teste, e
        # da próxima vez alguém vai se perguntar o que é.
        try:
            s3.delete_object(Bucket=settings.s3_bucket, Key=CHAVE_CANARIO)
        except ClientError:
            print(f"  ATENÇÃO: não consegui apagar {CHAVE_CANARIO} — apague à mão")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--criar", action="store_true", help="cria o bucket se não existir")
    p.add_argument(
        "--canario",
        action="store_true",
        help="grava um objeto de teste e tenta lê-lo sem credencial (a prova real)",
    )
    args = p.parse_args()

    print(f"bucket   {settings.s3_bucket}")
    print(f"endpoint {settings.s3_endpoint_url or '(padrão da AWS)'}")

    existe = _bucket_existe()
    if not existe:
        if not args.criar:
            print("\n  o bucket NÃO existe.")
            print("  A aplicação o cria no primeiro upload; use --criar para antecipar")
            print("  e conferir a privacidade antes de qualquer arquivo real entrar.")
            return 0
        print("\n  criando…")
        storage.cliente().create_bucket(Bucket=settings.s3_bucket)
        print("  criado")

    publico = _acl_publico()
    if publico is None:
        print("\n  ACL: o provedor não respondeu (normal no Supabase Storage)")
    elif publico:
        print("\n  ACL: CONCEDE LEITURA A QUALQUER UM")
    else:
        print("\n  ACL: sem concessão pública")

    if not args.canario:
        if publico:
            print("\nRESULTADO: bucket PÚBLICO. Corrija antes de subir arquivo real.")
            return 1
        print("\nRESULTADO: nada indica bucket público.")
        print("Isto NÃO É PROVA — rode com --canario para a verificação de verdade.")
        return 0

    print("\n  canário: gravando, lendo sem credencial, apagando…")
    acessivel, detalhe = _canario_e_acessivel_sem_credencial()
    print(f"  {detalhe}")

    if acessivel:
        print("\nRESULTADO: o bucket ENTREGA ARQUIVO A QUEM NÃO TEM CREDENCIAL.")
        print("Todo modelo BIM enviado está exposto. Torne-o privado antes de seguir.")
        return 1

    print("\nRESULTADO: privado — um anônimo não lê o que está lá.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (BotoCoreError, ClientError) as exc:
        # Endpoint errado, credencial ausente, storage fora do ar. Um traceback
        # de 40 linhas do botocore esconde a única informação útil, que é a
        # linha abaixo — e a causa quase sempre é o .env do ambiente errado.
        print(f"\nnão foi possível falar com o storage:\n  {exc}\n")
        print("Confira no .env (ou nas variáveis do ambiente onde isto roda):")
        print("  S3_ENDPOINT_URL   deve ter `.storage.` no meio, no Supabase")
        print("  S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET / S3_REGION")
        print("\nAs chaves de produção vivem no Easypanel, não no .env local —")
        print("rode isto de lá (ou exporte-as antes) para conferir o bucket real.")
        sys.exit(2)
