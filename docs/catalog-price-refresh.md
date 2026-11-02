# Atualização de preços externos

A atualização é manual e independente das cotas de importação. Consulta Steam,
Nintendo e PlayStation em BR/US, preservando o conteúdo editorial e os preços
próprios do Manifold. O Backoffice em **Jogos → Preços das lojas externas**
permite iniciar, acompanhar, retomar e tentar novamente os itens com falha.
Os totais são de ofertas regionais: um jogo em uma loja corresponde a dois itens.

## Ativação em produção

1. Aplicar a migração aditiva `20261102180000_price_refresh_runs` usando o fluxo
   normal de deploy. Não rodar testes de integração contra produção.
2. Publicar `.github/workflows/price-refresh.yaml` na `main`. Confirmar que Actions
   está habilitado e os segredos `PRODUCTION_POSTGRES_HOST`,
   `PRODUCTION_POSTGRES_PORT`, `PRODUCTION_POSTGRES_USER`,
   `PRODUCTION_POSTGRES_PASSWORD` e `PRODUCTION_POSTGRES_DB` estão configurados.
3. Configurar `PRICE_REFRESH_GITHUB_TOKEN` **somente no ambiente de servidor**:
   token de acesso refinado, restrito a este repositório, com Actions: write.
   Não colocar o token no código, em variáveis `NEXT_PUBLIC_*`, logs ou workflow inputs.
   O destino, workflow e branch são constantes no servidor. A implantação precisa
   ter a mesma versão de schema/serviço que a `main` executada pelo workflow.
4. Antes de habilitar o botão, executar um lote pequeno por loja pelo script,
   com `--limit 1`, usando o ambiente de produção já configurado de forma segura.
   Conferir os relatórios e as páginas públicas. Só então habilitar a variável
   de disparo no servidor. Sem ela o botão fica indisponível.

Não existe cron nesta versão. GitHub Actions pode demorar a iniciar: a tela mostra
“Na fila” sem exigir que o navegador permaneça aberto. Após dez minutos na fila
sem início, é possível retomar. Um worker sem heartbeat por 90 segundos é
considerado parado. Cada processo trabalha por até cinco horas e salva tudo antes
de encerrar como interrompido; o operador pode retomar os pendentes.

## Script

O script carrega o ambiente Next.js do projeto. Para produção, definir
`NODE_ENV=production` e as variáveis `POSTGRES_*` pelo mecanismo seguro de execução.
Não colocar credenciais na linha de comando.

```sh
npm run prices:refresh -- --dry-run --provider NINTENDO --limit 1
npm run prices:refresh -- --provider STEAM --limit 1
npm run prices:refresh -- --provider PLAYSTATION --limit 1
npm run prices:refresh
npm run prices:refresh -- --run-id <uuid>
npm run prices:refresh -- --run-id <uuid> --retry-failed
```

`--dry-run` consulta as lojas e imprime as propostas sem gravar no banco. `--limit`
conta jogos, não regiões; é destinado à validação inicial. Uma execução em aberto
é compartilhada entre script e painel: uma nova solicitação devolve essa execução,
mesmo quando seu filtro é diferente. Para mudar o filtro, concluir a execução atual.
O script retorna código diferente de zero quando há falhas ou trabalho incompleto.

## Garantias e diagnóstico

- Um registro global de execução e uma trava renovável impedem execuções simultâneas.
  Cada loja processa uma região por vez, com pausa mínima de um segundo. Erros
  transitórios têm até três tentativas por sessão, com espera crescente e Retry-After.
- O preço só é substituído após validação da região e da identidade. A data de
  captura marca o início da consulta. A atualização e a reimportação usam a mesma
  trava de linha e rejeitam preços mais antigos. Colunas legadas Steam seguem US.
- Falha, preço ausente ou edição divergente preservam o preço e a data anteriores.
  O relatório distingue alteração, verificação sem alteração, item ignorado e falha.
  Descontos encerrados são removidos quando a fonte retorna o preço regular.
- Nintendo e Steam não fornecem uma validade de promoção nos conectores atuais;
  a validade fica nula. PlayStation preserva a validade informada pela loja.
- `DISPATCH_FAILED`: conferir credencial, permissão Actions e workflow na main;
  retomar pelo painel. Nenhum corpo de resposta externo ou credencial é registrado.
- `HTTP_429`: limite da loja; aguardar antes de repetir. `PRICE_UNAVAILABLE`:
  loja sem preço público; o jogo não é convertido em gratuito.
- Não há atualização automática dos preços após o fim de uma promoção. Execute
  novamente quando necessário; agendamento será uma extensão deste mesmo serviço.

Rollback: remover a variável de disparo e impedir novos workflows. As tabelas
aditivas podem permanecer para preservar relatórios. Não é necessário alterar as
Outlets ou republicá-las para refletir preços.
