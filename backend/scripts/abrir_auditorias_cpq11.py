"""Fecha o onboarding do CPQ11: gabarito, versões e auditorias abertas.

O importador YAML cadastra até o modelo — versão ele NÃO inventa, de propósito
(a entrega vem do ACC ou de upload). Aqui a versão é criada explicitamente para
que as telas de auditoria tenham do que falar, e o caminho é o MESMO do
sistema: `ao_registrar_versao`, que invalida os rounds anteriores e abre a
geral. Nada é escrito à mão no banco que a aplicação não escreveria.

O que este script NÃO faz: preencher resposta de auditoria. Os percentuais das
planilhas são agregados de rounds reais e não dá para reconstruir o item a item
a partir deles. As planilhas nascem em branco, que é a verdade.
"""

from __future__ import annotations

from sqlalchemy import select

from app.db.session import AuthSessionLocal
from app.models import Auditoria, Disciplina, Modelo, Projeto, VersaoModelo
from app.models.enums import ChecklistTipo, VersaoFormato
from app.services import gabarito
from app.services.auditoria import CHECKLISTS_POR_AREA, abrir_auditoria, ao_registrar_versao

db = AuthSessionLocal()
projeto = db.execute(select(Projeto).where(Projeto.codigo == "CPQ11")).scalar_one()
org_id = projeto.org_id
print(f"projeto {projeto.codigo} ({projeto.id})")

# 1. Os 17 itens da geral. Sem eles a auditoria abre com zero linhas.
resumo = gabarito.aplicar(
    db, org_id=org_id, projeto_id=projeto.id, checklist=ChecklistTipo.GERAL
)
print(f"gabarito geral: {len(resumo.criterios_criados)} criados, "
      f"{len(resumo.criterios_reaproveitados)} ja existiam")

# 2. O gabarito de LOD 300 para as disciplinas que têm arquivo de referência.
for disc in sorted(gabarito.gabarito_lod.GABARITOS_LOD):
    r = gabarito.aplicar(
        db,
        org_id=org_id,
        projeto_id=projeto.id,
        checklist=ChecklistTipo.LOD300,
        disciplina=disc,
    )
    print(f"gabarito lod300/{disc}: {len(r.criterios_criados)} criados")

db.commit()

# 3. Uma versão por modelo, pelo caminho normal.
modelos = list(
    db.execute(select(Modelo).where(Modelo.projeto_id == projeto.id).order_by(Modelo.codigo))
    .scalars()
)
disciplinas = {
    d.id: d
    for d in db.execute(select(Disciplina).where(Disciplina.projeto_id == projeto.id)).scalars()
}

novas = 0
for modelo in modelos:
    ja = db.execute(
        select(VersaoModelo).where(VersaoModelo.modelo_id == modelo.id)
    ).scalars().first()
    if ja is not None:
        continue
    formato = VersaoFormato.IFC if modelo.codigo.upper().endswith(".IFC") else VersaoFormato.REVIT
    versao = VersaoModelo(org_id=org_id, modelo_id=modelo.id, versao="V1", formato=formato)
    db.add(versao)
    db.flush()
    ao_registrar_versao(db, org_id=org_id, versao=versao)
    novas += 1
db.commit()
print(f"versoes criadas: {novas}")

# 4. Os recortes de especificação, um por área da disciplina.
abertas = 0
for modelo in modelos:
    versao = db.execute(
        select(VersaoModelo)
        .where(VersaoModelo.modelo_id == modelo.id)
        .order_by(VersaoModelo.created_at.desc())
    ).scalars().first()
    disciplina = disciplinas.get(modelo.disciplina_id) if modelo.disciplina_id else None
    if versao is None or disciplina is None:
        continue
    for checklist in disciplina.checklists:
        areas = list(disciplina.areas) if checklist in CHECKLISTS_POR_AREA else [None]
        for area in areas or [None]:
            antes = db.execute(
                select(Auditoria).where(
                    Auditoria.versao_id == versao.id,
                    Auditoria.checklist == checklist,
                    Auditoria.area.is_(None) if area is None else Auditoria.area == area,
                )
            ).scalar_one_or_none()
            if antes is None:
                abrir_auditoria(
                    db, org_id=org_id, versao=versao, checklist=checklist, area=area
                )
                abertas += 1
    db.commit()

print(f"auditorias abertas: {abertas}")

for checklist in (ChecklistTipo.GERAL, ChecklistTipo.LOD400, ChecklistTipo.LOD500):
    n = db.execute(
        select(Auditoria)
        .join(VersaoModelo, VersaoModelo.id == Auditoria.versao_id)
        .join(Modelo, Modelo.id == VersaoModelo.modelo_id)
        .where(Modelo.projeto_id == projeto.id, Auditoria.checklist == checklist)
    ).scalars().all()
    com_area = sum(1 for a in n if a.area)
    print(f"  {checklist.value:<8} {len(n):>4} auditorias, {com_area} com area")

db.close()
