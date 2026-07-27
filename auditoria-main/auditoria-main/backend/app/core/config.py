"""Configuração da aplicação, lida do ambiente (.env na raiz do repositório)."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> backend/app/core -> backend/app -> backend -> raiz
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", Path(".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Aplicação ---------------------------------------------------------
    app_env: str = "dev"
    app_debug: bool = True
    api_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:5173"

    # --- Banco -------------------------------------------------------------
    postgres_user: str = "spbim"
    postgres_password: str = "spbim"
    postgres_db: str = "spbim_auditoria"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    database_url: str = ""

    app_db_user: str = "spbim_app"
    app_db_password: str = "spbim_app"
    # Ecoa todo SQL no log. Útil para depurar uma query específica, insuportável
    # como padrão — por isso é opt-in, e não amarrado ao APP_DEBUG.
    db_echo: bool = False

    # URL do papel de aplicação quando ela não deriva das partes acima. É o
    # caso do Supabase, cujo pooler tem host e porta próprios.
    app_database_url: str = ""

    # Sobrescreve a detecção automática de pooler em modo transação. Deixe
    # nulo para detectar pela URL — ver `usa_pooler_de_transacao`.
    db_pooler_transacao: bool | None = None

    # --- Redis / Celery ----------------------------------------------------
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"

    # --- Segurança ---------------------------------------------------------
    jwt_secret: str = "troque-este-valor-em-producao"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 14

    # --- OIDC / SSO --------------------------------------------------------
    oidc_enabled: bool = False
    oidc_issuer: str = ""
    oidc_client_id: str = ""
    oidc_client_secret: str = ""
    oidc_redirect_uri: str = ""
    oidc_scopes: str = "openid profile email"

    # --- Storage -----------------------------------------------------------
    s3_endpoint_url: str = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_bucket: str = "spbim-auditoria"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"

    # --- Autodesk Platform Services ---------------------------------------
    aps_client_id: str = ""
    aps_client_secret: str = ""
    aps_acc_account_id: str = ""
    aps_webhook_secret: str = ""

    # Nome do parâmetro de sessão do Postgres que carrega o tenant corrente.
    # É ele que as policies de row-level security consultam.
    tenant_guc: str = Field(default="app.org_id", exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def sqlalchemy_url(self) -> str:
        """URL usada pela API (papel de aplicação, sujeito ao RLS)."""
        if self.app_database_url:
            return self.app_database_url
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg://{self.app_db_user}:{self.app_db_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def owner_url(self) -> str:
        """URL do dono das tabelas — passa por cima do row-level security.

        Usada em exatamente dois lugares: as migrations e a autenticação
        (o login precisa achar o usuário *antes* de existir um tenant).
        """
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def alembic_url(self) -> str:
        return self.owner_url

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_prod(self) -> bool:
        return self.app_env == "prod"

    @property
    def usa_pooler_de_transacao(self) -> bool:
        """A conexão passa por um pooler em modo transação?

        Importa porque o psycopg3 prepara statements a partir da 5ª execução
        da mesma query, e num pooler de transação a conexão física muda entre
        as execuções — o servidor então responde "prepared statement não
        existe" de forma intermitente, só sob carga.

        A detecção é pela URL (Supavisor do Supabase atende na 6543, com host
        `*.pooler.supabase.com`; o PgBouncer costuma usar 6432). `DB_POOLER_
        TRANSACAO` sobrescreve quando o endereço não denuncia o pooler.
        """
        if self.db_pooler_transacao is not None:
            return self.db_pooler_transacao
        url = self.sqlalchemy_url
        return "pooler.supabase.com" in url or ":6543/" in url or ":6432/" in url

    def problemas_de_producao(self) -> list[str]:
        """Segredos que ficaram no valor de desenvolvimento.

        Devolve lista de problemas em vez de levantar: `verificar_producao`
        decide o que fazer, e os testes conseguem inspecionar a lista.
        """
        problemas: list[str] = []

        if self.jwt_secret == "troque-este-valor-em-producao" or len(self.jwt_secret) < 32:
            problemas.append(
                "JWT_SECRET no valor padrão ou curto demais — qualquer pessoa forjaria "
                "um token de admin. Gere com "
                "`python -c \"import secrets; print(secrets.token_urlsafe(48))\"`"
            )
        if self.postgres_password in ("spbim", "postgres", "") and not self.database_url:
            problemas.append("POSTGRES_PASSWORD no valor de desenvolvimento")
        if self.app_db_password in ("spbim_app", ""):
            problemas.append("APP_DB_PASSWORD no valor de desenvolvimento")
        if self.s3_access_key == "minioadmin" or self.s3_secret_key == "minioadmin":
            problemas.append("credenciais do S3 nos valores padrão do MinIO")
        if self.app_debug:
            problemas.append("APP_DEBUG ligado em produção")
        if "*" in self.cors_origin_list:
            problemas.append("CORS_ORIGINS com curinga em produção")

        return problemas


def verificar_producao(settings_: Settings | None = None) -> None:
    """Impede a aplicação de subir em produção com segredo de desenvolvimento.

    Falhar no start é barulhento e barato; descobrir depois que o piloto
    rodou um mês com `JWT_SECRET=troque-este-valor-em-producao` não é.
    """
    cfg = settings_ or get_settings()
    if not cfg.is_prod:
        return
    problemas = cfg.problemas_de_producao()
    if problemas:
        raise RuntimeError(
            "configuração insegura para APP_ENV=prod:\n  - " + "\n  - ".join(problemas)
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
