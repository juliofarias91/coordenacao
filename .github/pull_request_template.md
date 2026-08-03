<!--
  Este texto aparece sozinho ao abrir um pull request. Apague o que não servir.
  O guia de colaboração está em docs/COLABORACAO.md.
-->

## O que muda

<!-- Uma ou duas frases, do ponto de vista de quem USA o sistema.
     "A célula da planilha passa a salvar sozinha" — e não "altera GradePlanilha". -->

## Por quê

<!-- O problema que existia. É a parte que o código não consegue contar sozinho,
     e é ela que faz alguém entender a decisão daqui a seis meses. -->

## Como conferir

<!-- O caminho na tela, ou o comando. Ex.:
     Abrir um projeto › Auditoria › Geral › escolher um modelo, escrever num
     comentário e trocar de tela sem sair do campo — o texto tem de estar lá ao
     voltar. -->

## Checklist

- [ ] `npm run lint` e `npm run build` passam
- [ ] `npm run test:api` passa (contra banco LOCAL — ver `docs/COLABORACAO.md`)
- [ ] Se mexi em banco: **avisei a outra pessoa** antes de criar a migration
- [ ] Se mudei uma decisão registrada: atualizei o `CLAUDE.md` junto
