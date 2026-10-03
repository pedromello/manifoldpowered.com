> **Atualização de 2026-10-02:** esta página registra a primeira etapa (busca/detalhe mínimos). O incremento atual com card, mídia e leitura de reviews, e a confirmação de conexão por Pedro, estão em [10-card-descoberta.md](10-card-descoberta.md). Bloqueios antigos não são diagnóstico do host atual.

# Preview para testar no ChatGPT — investigação e gate de publicação

Em 2026-10-01 Pedro autorizou commit/push isolado e PR **draft** para obter preview Vercel do MVP público. Merge, produção, novas contas/credenciais/grants e mudanças de proteção permanecem fora do escopo. Nada desta seção afirma deploy concluído ou conexão real ChatGPT.

## Menor opção concreta

Reutilizar o projeto Vercel **manifoldpowered-com**, integrado a **pedromello/manifoldpowered.com**, por branch própria + PR draft. Isso evita novo hosting, domínio, túnel e banco: usa a infraestrutura de homologação existente **somente depois de sua separação da produção ser confirmada**. O [contrato Vercel de ambientes](https://vercel.com/docs/deployments/environments) permite preview por push fora da production branch/PR; [integração GitHub](https://vercel.com/docs/git/vercel-for-github) publica status/comentário com URL. Não presumir que draft impeça deploy, que main seja a production branch configurada, ou que criar PR gere URL pronta.

Exigir URL do deployment/commit exato, alvo Preview, build READY e SHA igual ao remoto. Só depois entregar `<URL-verificada>/api/mcp`. URLs de branch podem mudar a cada push; a [URL de commit](https://vercel.com/docs/deployments/generated-urls) identifica uma versão específica. Nenhuma URL foi inventada ou testada nesta rodada.

## Fatos verificados antes de publicar

- Checkout próprio: branch `docs/manifold-mcp-peach-plan-20261001`, base `6cfc1e86ae8876bde68b38ab2a51cf6f3df5959e`; original preservado.
- GitHub connector leu o repo e confirmou default branch main e permissão push; status do commit-base contém Vercel/success e aponta ao projeto acima. Isso prova integração anterior, não sucesso do novo MCP.
- `vercel.json:3` usa `npm run vercel:build`. [Build](../../scripts/vercel-build.ts), linhas 6–18, chama a [política](../../scripts/vercel-build-policy.ts), linhas 8–13: apenas VERCEL_ENV=production executa migrations; preview executa generate + build. [Teste existente](../../tests/unit/scripts/vercel-build-policy.test.ts), linhas 4–16, caracteriza essa seleção. Nenhum desses identifica o DB selecionado no runtime.
- [Origem](../../infra/webserver.ts), linhas 2–12: override MANIFOLD_PREVIEW_ORIGIN; depois dev localhost; preview usa VERCEL_URL. Host/Origin do [controller](../../pages/api/mcp.ts), linhas 10–31, precisam corresponder à URL usada, sem wildcard. [Proxy](../../proxy.ts), linhas 19–24 e 64–70, exclui API da lógica de locale.
- DB local testado: localhost:6432/local*db, fixtures sintéticas. [Database runtime](../../infra/database.ts), linhas 6–18, usa POSTGRES*\* e SSL em NODE_ENV=production; não escolhe banco seguro só porque VERCEL_ENV é preview. Não foram lidos valores de secrets remotos.
- Vercel list_teams retornou lista vazia. Leitura do projeto identificado pelo status GitHub retornou **403: falta de autorização para o scope**. Não tentar outro token/CLI/API, criar grants ou contornar esse acesso. A chamada anterior com os nomes de argumentos anunciados pela ferramenta falhou validação; ajustar o nome exigido levou ao 403, sem alteração remota.
- gh auth status informou token CLI inválido; connector GitHub de leitura funcionou. Não reconfigurar credencial. Publicação remota exige caminho autorizado funcional, sem prometer que o CLI poderá fazer push.

**Gate pendente antes do push:** evidência autorizada ou confirmação de Pedro de que as variáveis Preview efetivas, inclusive overrides da branch, apontam a DB e serviços de homologação, sem recursos de produção, e que esta branch não é production branch. [Overrides Vercel](https://vercel.com/docs/environment-variables) prevalecem sobre valores Preview gerais. Pular migration não prova isolamento. O push pode disparar deploy imediatamente, antes da PR; por isso não publicar apenas para descobrir o ambiente depois. Confirmação de homologação não autoriza reset/migrations/fixtures no banco compartilhado.

## Dados e proteção do teste

As duas tools expõem só catálogo ACTIVE/ONLY_DISPLAY: slug/title/tags/launch_date e paginação pública. O processo consulta o DB configurado; read-only do MCP não transforma credenciais DB em role read-only. Preview do repo publica a **aplicação Next inteira**, com rotas existentes, não exclusivamente MCP. Portanto direitos, dados de homologação e proteções das demais rotas continuam relevantes; os conflitos PRIVATE antigos permanecem em [evidências](01-evidencias.md#private-papeis). Não testar slugs privados reais nem seedar o ambiente remoto sem autorização adicional.

Noauth é o contrato das tools, não bypass do hosting. [Deployment Protection](https://vercel.com/docs/deployment-protection) pode exigir login Vercel/senha antes de MCP. Se a URL responder 401/403/redirect/login, registrar bloqueio e preservar proteção. Inspector pode usar configuração de cliente, mas isso não demonstra que ChatGPT envie os mesmos headers/cookies. [Bypass de automação](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation) exige segredo via header/query; não foi criado, usado ou compartilhado, nem foi provado suporte do host. Não colocar secret na URL entregue ao chat ou no repo.

Se protection bloquear, a menor alternativa **sem mudar o projeto** é manter preview protegido para QA e avaliar Secure MCP Tunnel separado, somente com nova autorização e disponibilidade já existente de Tunnels Use/workspace. [OpenAI](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) permite stdio/HTTP via conexão de saída; não é URL pública nem publicação no diretório, exige cliente ativo e associação ao workspace. Criar túnel/grants/chave não está autorizado aqui. Nenhuma dessas condições foi verificada na conta de Pedro.

## Preview nativo, duração e custos

Nesta configuração não há ferramenta de encaminhamento de porta/URL HTTPS nativa verificada; `.vercel/project.json` e `.openai/hosting.json` não existem em ambos os checkouts. [.agent/workflows/preview.md](../../.agent/workflows/preview.md) e [script](../../.agent/scripts/auto_preview.py) apenas gerenciam localhost HTTP. URL da API interna do executor não é preview da aplicação. Sites está disponível, mas seu contrato de deploy é produção, exige fonte publicada/Workers e seu MCP gerencia auth na borda; não é preview transparente deste Pages Router + Prisma/PostgreSQL. Não criar Site ou adaptar runtime por este teste.

O preview Vercel não garante duração fixa: retenção/settings e plano real do projeto não puderam ser lidos. Usar uma janela curta de teste combinada, sem prometer expiração automática. Reaproveitar projeto não exige plano/domínio/DB novos por princípio; build/runtime/tráfego contam no plano vigente. [Preço Pro oficial](https://vercel.com/docs/plans/pro-plan) informa US$20/mês de plataforma com uma seat e US$20 de crédito, acrescido de uso/add-ons; isso não confirma plano ou custo incremental desta conta. Não contratar ou mudar plano. Preço/TTL de Secure Tunnel não foram confirmados nas fontes consultadas; não chamar de gratuito.

## Aceite após gate e publicação

1. Revisar e publicar somente diff MVP/docs/testes, sem dados privados/segredos/fornecedor, com commit convencional e PR draft no repo existente.
2. Confirmar remoto por SHA, PR draft, checks e deployment do mesmo SHA; GitHub é caminho permitido para status se Vercel permanecer negado. CI verde não prova READY; READY não prova acesso anônimo/DB seguro.
3. Usar POST no endpoint HTTPS sem cookies/token: initialize, tools/list e chamadas representativas, parsing JSON/SSE conforme protocolo negociado. Validar só duas tools/noauth/read-only, allowlist e consulta pública. Não usar GET simples como prova de MCP; GET legado intencionalmente retorna 405.
4. Se dataset de homologação autorizado contiver fixture privada sintética conhecida, confirmar recusa; caso contrário registrar negativo remoto como pendente, preservando prova local. Não criar fixture ou consultar objeto privado real por suposição.
5. Conectar no [ChatGPT developer mode](https://developers.openai.com/plugins/deploy/connect-chatgpt) conforme conta/workspace, com endpoint realmente acessível; registrar escolha de tools/argumentos/outputs e capacidades não suportadas. Host ainda não testado.
