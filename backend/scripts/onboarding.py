"""SP-502 · Importa um projeto inteiro a partir de um arquivo YAML.

    python -m scripts.onboarding scripts/dados/cpq11.yaml
    python -m scripts.onboarding meu-projeto.yaml --dry-run

Existe porque o onboarding de um projeto real é dezenas de cadastros que
dependem uns dos outros: critério referencia standard, checklist referencia
critério, disciplina referencia empresa e standard, modelo referencia
disciplina. Fazer isso pela tela é uma tarde de trabalho e um erro de digitação
no meio.

**Idempotente**: rodar de novo atualiza o que mudou e não duplica nada. É o que
permite tratar o YAML como a fonte da configuração do projeto — edita e
reimporta, quantas vezes for preciso.
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import AuthSessionLocal
from app.models import (
    ChecklistItem,
    Cliente,
    Contato,
    Criterio,
    Disciplina,
    Empresa,
    Modelo,
    NomenclaturaPadrao,
    Organizacao,
    Projeto,
    Standard,
    Usuario,
)
from app.models.enums import (
    Automacao,
    ChecklistTipo,
    CriterioNivel,
    EmpresaPapel,
    EmpresaTipo,
    MacroDisc,
    PapelUsuario,
)


@dataclass
class Relatorio:
    criados: dict[str, int] = field(default_factory=dict)
    atualizados: dict[str, int] = field(default_factory=dict)
    avisos: list[str] = field(default_factory=list)

    def criou(self, o_que: str) -> None:
        self.criados[o_que] = self.criados.get(o_que, 0) + 1

    def atualizou(self, o_que: str) -> None:
        self.atualizados[o_que] = self.atualizados.get(o_que, 0) + 1

    def imprimir(self) -> None:
        print("\n--- resumo ---")
        for o_que in sorted(set(self.criados) | set(self.atualizados)):
            print(
                f"  {o_que:16} {self.criados.get(o_que, 0):3} criado(s)"
                f"  {self.atualizados.get(o_que, 0):3} atualizado(s)"
            )
        for aviso in self.avisos:
            print(f"  ! {aviso}")


def _definir(obj: Any, dados: dict[str, Any]) -> bool:
    """Aplica os campos e diz se algo mudou de verdade."""
    mudou = False
    for campo, valor in dados.items():
        if getattr(obj, campo, None) != valor:
            setattr(obj, campo, valor)
            mudou = True
    return mudou


def importar(db: Session, definicao: dict[str, Any], rel: Relatorio) -> Projeto:
    # ------------------------------------------------------------ organização
    org_def = definicao["organizacao"]
    org = db.execute(
        select(Organizacao).where(Organizacao.slug == org_def["slug"])
    ).scalar_one_or_none()
    if org is None:
        org = Organizacao(nome=org_def["nome"], slug=org_def["slug"])
        db.add(org)
        db.flush()
        rel.criou("organização")
    else:
        rel.atualizou("organização")

    # ----------------------------------------------------------------- cliente
    # No YAML o cliente continua sendo uma linha de texto — é o que quem
    # escreve a definição sabe informar. Aqui ele é resolvido para a entidade
    # criada na 0003: encontra pelo nome (sem diferenciar caixa, senão
    # 'Microsoft' e 'microsoft' virariam dois) ou cria.
    cliente = None
    if nome_cliente := (definicao["projeto"].get("cliente") or "").strip():
        cliente = db.execute(
            select(Cliente).where(
                Cliente.org_id == org.id, func.lower(Cliente.nome) == nome_cliente.lower()
            )
        ).scalar_one_or_none()
        if cliente is None:
            cliente = Cliente(org_id=org.id, nome=nome_cliente)
            db.add(cliente)
            db.flush()
            rel.criou("cliente")

    # ---------------------------------------------------------------- projeto
    proj_def = definicao["projeto"]
    projeto = db.execute(
        select(Projeto).where(
            Projeto.org_id == org.id, Projeto.codigo == proj_def["codigo"].upper()
        )
    ).scalar_one_or_none()
    campos_projeto = {
        "nome": proj_def["nome"],
        "cliente_id": cliente.id if cliente else None,
        "coordenacao": proj_def.get("coordenacao"),
        "bep_ref": proj_def.get("bep_ref"),
        "status": proj_def.get("status", "config"),
    }
    if projeto is None:
        projeto = Projeto(org_id=org.id, codigo=proj_def["codigo"].upper(), **campos_projeto)
        db.add(projeto)
        db.flush()
        rel.criou("projeto")
    elif _definir(projeto, campos_projeto):
        rel.atualizou("projeto")

    # ----------------------------------------------------------- nomenclatura
    if definicao.get("nomenclatura"):
        segmentos = definicao["nomenclatura"]
        vigente = db.execute(
            select(NomenclaturaPadrao).where(
                NomenclaturaPadrao.projeto_id == projeto.id,
                NomenclaturaPadrao.vigente.is_(True),
            )
        ).scalar_one_or_none()
        if vigente is None:
            db.add(
                NomenclaturaPadrao(
                    org_id=org.id, projeto_id=projeto.id, segmentos=segmentos, vigente=True
                )
            )
            rel.criou("nomenclatura")
        elif vigente.segmentos != segmentos:
            # Arquiva o anterior: auditorias já publicadas continuam
            # explicáveis pelo padrão que valia na época.
            vigente.vigente = False
            db.add(
                NomenclaturaPadrao(
                    org_id=org.id, projeto_id=projeto.id, segmentos=segmentos, vigente=True
                )
            )
            rel.atualizou("nomenclatura")
        db.flush()

    # -------------------------------------------------------------- standards
    standards: dict[str, Standard] = {}
    for std_def in definicao.get("standards", []):
        std = db.execute(
            select(Standard).where(
                Standard.projeto_id == projeto.id, Standard.nome == std_def["nome"]
            )
        ).scalar_one_or_none()
        campos = {
            "tipo": std_def["tipo"],
            "referencia": std_def.get("referencia"),
            "conteudo": std_def.get("conteudo"),
            "referencia_url": std_def.get("referencia_url"),
        }
        if std is None:
            std = Standard(
                org_id=org.id, projeto_id=projeto.id, nome=std_def["nome"], **campos
            )
            db.add(std)
            db.flush()
            rel.criou("standard")
        elif _definir(std, campos):
            rel.atualizou("standard")
        standards[std_def["nome"]] = std

    # --------------------------------------------------------------- empresas
    empresas: dict[str, Empresa] = {}
    # Duas passadas: a primeira cria todas, a segunda amarra a subcontratação.
    # Sem isso, uma empresa que aparece antes da sua contratante quebraria.
    for emp_def in definicao.get("empresas", []):
        emp = db.execute(
            select(Empresa).where(Empresa.org_id == org.id, Empresa.nome == emp_def["nome"])
        ).scalar_one_or_none()
        campos = {
            "tipo": EmpresaTipo(emp_def.get("tipo", "terceirizada")),
            "papeis": [EmpresaPapel(p) for p in emp_def.get("papeis", [])],
            "ferramenta": emp_def.get("ferramenta"),
            "departamento": emp_def.get("departamento"),
            "disciplinas": emp_def.get("disciplinas"),
            "cnpj": emp_def.get("cnpj"),
        }
        if emp is None:
            emp = Empresa(org_id=org.id, nome=emp_def["nome"], **campos)
            db.add(emp)
            db.flush()
            rel.criou("empresa")
        elif _definir(emp, campos):
            rel.atualizou("empresa")
        empresas[emp_def["nome"]] = emp

    for emp_def in definicao.get("empresas", []):
        contratante = emp_def.get("contratada_por")
        if not contratante:
            continue
        if contratante not in empresas:
            rel.avisos.append(
                f"empresa '{emp_def['nome']}': contratante '{contratante}' não está no arquivo"
            )
            continue
        if empresas[emp_def["nome"]].contratada_por != empresas[contratante].id:
            empresas[emp_def["nome"]].contratada_por = empresas[contratante].id
            rel.atualizou("subcontratação")

    for emp_def in definicao.get("empresas", []):
        for contato_def in emp_def.get("contatos", []):
            empresa = empresas[emp_def["nome"]]
            contato = db.execute(
                select(Contato).where(
                    Contato.empresa_id == empresa.id, Contato.email == contato_def.get("email")
                )
            ).scalar_one_or_none()
            campos = {
                "nome": contato_def.get("nome"),
                "cargo": contato_def.get("cargo"),
                "telefone": contato_def.get("telefone"),
                "departamento": contato_def.get("departamento"),
                "disciplina": contato_def.get("disciplina"),
            }
            if contato is None:
                db.add(
                    Contato(
                        org_id=org.id,
                        empresa_id=empresa.id,
                        email=contato_def.get("email"),
                        **campos,
                    )
                )
                rel.criou("contato")
            elif _definir(contato, campos):
                rel.atualizou("contato")
    db.flush()

    # -------------------------------------------------------------- critérios
    criterios: dict[str, Criterio] = {}
    for crit_def in definicao.get("criterios", []):
        codigo = crit_def["codigo"].upper()
        crit = db.execute(
            select(Criterio).where(
                Criterio.projeto_id == projeto.id, Criterio.codigo == codigo
            )
        ).scalar_one_or_none()
        std_nome = crit_def.get("standard")
        campos = {
            "nome_pt": crit_def["pt"],
            "nome_en": crit_def["en"],
            "categoria": crit_def.get("categoria"),
            "nivel": CriterioNivel(crit_def.get("nivel", "modelo")),
            "automacao": Automacao(crit_def.get("automacao", "manual")),
            "parametro_esperado": crit_def.get("parametro_esperado"),
            "criterio_aceitacao": crit_def.get("criterio_aceitacao"),
            "instrucao": crit_def.get("instrucao"),
            "standard_id": standards[std_nome].id if std_nome in standards else None,
        }
        if std_nome and std_nome not in standards:
            rel.avisos.append(f"critério {codigo}: standard '{std_nome}' não está no arquivo")
        if crit is None:
            crit = Criterio(org_id=org.id, projeto_id=projeto.id, codigo=codigo, **campos)
            db.add(crit)
            db.flush()
            rel.criou("critério")
        elif _definir(crit, campos):
            rel.atualizou("critério")
        criterios[codigo] = crit

    # ------------------------------------------------------------- checklists
    for nome, codigos in (definicao.get("checklists") or {}).items():
        checklist = ChecklistTipo(str(nome))
        atuais = {
            item.criterio_id: item
            for item in db.execute(
                select(ChecklistItem).where(
                    ChecklistItem.projeto_id == projeto.id,
                    ChecklistItem.checklist == checklist,
                )
            ).scalars()
        }
        desejados: list[uuid.UUID] = []
        for codigo in codigos:
            crit = criterios.get(str(codigo).upper())
            if crit is None:
                rel.avisos.append(f"checklist {nome}: critério '{codigo}' não está no arquivo")
                continue
            desejados.append(crit.id)

        for ordem, criterio_id in enumerate(desejados, start=1):
            item = atuais.pop(criterio_id, None)
            if item is None:
                db.add(
                    ChecklistItem(
                        org_id=org.id,
                        projeto_id=projeto.id,
                        checklist=checklist,
                        criterio_id=criterio_id,
                        ordem=ordem,
                    )
                )
                rel.criou("item de checklist")
            elif item.ordem != ordem:
                item.ordem = ordem
                rel.atualizou("item de checklist")

        # O que sobrou saiu do arquivo: sai do checklist também.
        for sobra in atuais.values():
            db.delete(sobra)
            rel.atualizou("item de checklist")
    db.flush()

    # ------------------------------------------------------------ disciplinas
    disciplinas: dict[str, Disciplina] = {}
    for disc_def in definicao.get("disciplinas", []):
        codigo = f"{disc_def['disc'].upper()}-{disc_def['sub'].upper()}"
        disc = db.execute(
            select(Disciplina).where(
                Disciplina.projeto_id == projeto.id, Disciplina.codigo == codigo
            )
        ).scalar_one_or_none()
        projetista = disc_def.get("projetista")
        if projetista and projetista not in empresas:
            rel.avisos.append(f"disciplina {codigo}: empresa '{projetista}' não está no arquivo")
        nomenclatura = disc_def.get("nomenclatura")
        campos = {
            "macro": MacroDisc(disc_def["macro"]),
            "disc": disc_def["disc"].upper(),
            "sub": disc_def["sub"].upper(),
            "projetista_id": empresas[projetista].id if projetista in empresas else None,
            "checklists": [ChecklistTipo(str(c)) for c in disc_def.get("checklists", [])],
            "areas": list(disc_def.get("areas", [])),
            "nomenclatura_id": (
                standards[nomenclatura].id if nomenclatura in standards else None
            ),
        }
        if disc is None:
            disc = Disciplina(org_id=org.id, projeto_id=projeto.id, codigo=codigo, **campos)
            db.add(disc)
            db.flush()
            rel.criou("disciplina")
        elif _definir(disc, campos):
            rel.atualizou("disciplina")
        disciplinas[codigo] = disc

    # AS ÁREAS DO PROJETO (migration 0019). Depois das disciplinas, e não junto
    # dos outros campos do projeto, porque saem delas: o YAML declara a área na
    # disciplina que a audita, e o projeto passou a ser onde a lista é DEFINIDA.
    # É a mesma união que a migration fez com o dado que já existia — sem isto,
    # importar um projeto o deixaria com disciplinas apontando para áreas que o
    # projeto não define, que é exatamente o estado que a 0019 veio desfazer.
    # `areas:` no bloco `projeto` acrescenta setores que ainda não têm disciplina.
    declaradas = {a for d in disciplinas.values() for a in d.areas}
    declaradas.update(proj_def.get("areas", []))
    if (ordenadas := sorted(declaradas)) != sorted(projeto.areas):
        projeto.areas = ordenadas
        rel.atualizou("projeto")
    db.flush()

    # ---------------------------------------------------------------- modelos
    for mod_def in definicao.get("modelos", []):
        codigo = mod_def["codigo"].upper()
        mod = db.execute(
            select(Modelo).where(Modelo.projeto_id == projeto.id, Modelo.codigo == codigo)
        ).scalar_one_or_none()
        disc_codigo = mod_def.get("disciplina")
        if disc_codigo and disc_codigo not in disciplinas:
            rel.avisos.append(f"modelo {codigo}: disciplina '{disc_codigo}' não está no arquivo")
        campos = {
            "disciplina_id": (
                disciplinas[disc_codigo].id if disc_codigo in disciplinas else None
            ),
            "instaladora_id": (
                empresas[mod_def["instaladora"]].id
                if mod_def.get("instaladora") in empresas
                else None
            ),
            "modeladora_id": (
                empresas[mod_def["modeladora"]].id
                if mod_def.get("modeladora") in empresas
                else None
            ),
            "acc_item_id": mod_def.get("acc_item_id"),
        }
        if mod is None:
            db.add(Modelo(org_id=org.id, projeto_id=projeto.id, codigo=codigo, **campos))
            rel.criou("modelo")
        elif _definir(mod, campos):
            rel.atualizou("modelo")
    db.flush()

    # --------------------------------------------------------------- usuários
    for user_def in definicao.get("usuarios", []):
        login = user_def["login"].strip().lower()
        usuario = db.execute(
            select(Usuario).where(Usuario.org_id == org.id, Usuario.login == login)
        ).scalar_one_or_none()
        empresa_nome = user_def.get("empresa")
        campos = {
            "nome": user_def.get("nome"),
            "papel": PapelUsuario(user_def["papel"]),
            "empresa_id": empresas[empresa_nome].id if empresa_nome in empresas else None,
            "idioma": user_def.get("idioma", "pt"),
        }
        if usuario is None:
            # Senha só por variável de ambiente, nunca no YAML — o arquivo vive
            # no repositório do projeto.
            variavel = f"SENHA_{login.split('@')[0].upper().replace('.', '_')}"
            senha = os.environ.get(variavel)
            db.add(
                Usuario(
                    org_id=org.id,
                    login=login,
                    senha_hash=hash_password(senha) if senha else None,
                    **campos,
                )
            )
            rel.criou("usuário")
            if not senha:
                rel.avisos.append(
                    f"usuário {login} criado sem senha (só SSO). Para definir uma: "
                    f"defina {variavel} e rode de novo, ou use PUT /usuarios/{{id}}/senha"
                )
        elif _definir(usuario, campos):
            rel.atualizou("usuário")

    db.flush()
    return projeto


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Importa a configuração de um projeto a partir de um YAML."
    )
    parser.add_argument("arquivo", type=Path, help="caminho do YAML de definição")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="mostra o que faria e desfaz tudo ao final",
    )
    args = parser.parse_args()

    if not args.arquivo.exists():
        print(f"arquivo não encontrado: {args.arquivo}", file=sys.stderr)
        return 1

    definicao = yaml.safe_load(args.arquivo.read_text(encoding="utf-8"))
    rel = Relatorio()

    with AuthSessionLocal() as db:
        try:
            projeto = importar(db, definicao, rel)
            if args.dry_run:
                db.rollback()
                print(f"\n[dry-run] nada foi gravado. Projeto: {projeto.codigo}")
            else:
                db.commit()
                print(f"\nprojeto {projeto.codigo} importado ({projeto.id})")
        except Exception as exc:
            db.rollback()
            print(f"\nfalhou, nada foi gravado: {type(exc).__name__}: {exc}", file=sys.stderr)
            return 1

    rel.imprimir()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
