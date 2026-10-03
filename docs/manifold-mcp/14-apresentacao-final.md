# Apresentação final e leitura de avaliações

## Problema e evidência

O usuário relatou que a UI às vezes aparece e depois é recolhida enquanto o ChatGPT continua trabalhando. A captura inspecionada na conversa principal mostra o App **expandido**, com logo e vídeo sob o cabeçalho recolhível “Opened Get public Manifold game facts”. Uma imagem estática não demonstra a sequência do recolhimento. O download da captura nesta execução falhou; a observação visual é atribuída à inspeção da conversa principal.

No commit-base `73ed773c3e25f799b004f56fb23cd5c82b6cd3b6`, as três consultas anexavam o mesmo template; `listTools()` reaplicava o metadata compartilhado; ler reviews enviava automaticamente uma mensagem do usuário; uma nova notificação de input limpava a ficha. Esses fatos explicam oportunidades de reduzir renderizações e mudanças locais, mas não demonstram a causa do recolhimento externo.

Esta entrega sucede o comportamento descrito em [13-conversa-implementada.md](13-conversa-implementada.md). Não promete manter o cabeçalho do ChatGPT expandido.

## Fluxo implementado

1. `search_games`, `get_game` e `get_game_reviews` retornam dados reutilizáveis sem template de UI.
2. Depois de reunir os fatos necessários, o modelo chama **`show_catalog`** para apresentar uma seleção, ficha ou comentários. É a única tool com `_meta.ui.resourceUri` e o alias `openai/outputTemplate`.
3. A apresentação recebe `view`, `slugs`, idioma e opções de consulta suportadas. Resolve os slugs pelo domínio existente, revalida visibilidade e aplica a mesma projeção pública. Não recebe descrições, URLs de mídia, opiniões ou identidade de autores fornecidas pelo modelo.
4. O card chama as tools de dados diretamente para interações locais. “Ler avaliações” abre comentários abaixo da ficha, mantendo seu vídeo montado. Ler, paginar e filtrar não enviam mensagem ao GPT.
5. “Conversar sobre as avaliações” envia o contexto da amostra atual e uma mensagem explícita, depois da confirmação de capacidade/aceite do host. A skill orienta aproveitar essa evidência, evitando uma consulta ou apresentação repetida sem necessidade.

Exemplos de entrada:

```json
{
  "view": "list",
  "slugs": ["slug-real-1", "slug-real-2"],
  "locale": "pt-BR",
  "tags": ["exploration"]
}
```

```json
{ "view": "detail", "slugs": ["slug-real-1"], "locale": "pt-BR" }
```

```json
{
  "view": "reviews",
  "slugs": ["slug-real-1"],
  "page": 1,
  "limit": 10,
  "recommendation": "all",
  "sort": "newest",
  "locale": "pt-BR"
}
```

Os slugs dos exemplos são placeholders, não resultados do catálogo. A lista aceita 1–5 slugs distintos, na ordem escolhida; ficha/reviews exigem um único slug. Entradas são estritas e rejeitam campos extras ou referências duplicadas. A lista apresentada contém apenas a seleção, sem inventar um total global de busca. Tags de correspondência são calculadas contra as tags efetivas do jogo. Se qualquer referência da seleção estiver indisponível, a apresentação falha integralmente; não produz uma lista silenciosamente incompleta.

O resultado reutiliza contratos de seleção/ficha/reviews. A apresentação relê fatos atuais, portanto dados podem mudar desde a consulta preparatória. O modelo deve considerar o resultado final. Não há cache de fatos aprovado pela IA nem recibo persistente de consulta. O incremento continua público, sem autenticação, compras ou escrita de reviews.

Fontes de implementação: [contratos](../../contracts/public-game-catalog.ts), [domínio](../../models/public_game_catalog.ts), [servidor](../../infra/public_catalog_mcp.ts), [metadata do recurso](../../infra/public_catalog_ui.ts), [controller](../../components/mcp/catalog-card-controller.ts), [entry](../../components/mcp/catalog-card-entry.tsx), [componentes](../../components/mcp/CatalogCard.tsx) e [skill](../../plugins/manifold-games/skills/find-games/SKILL.md).

## Estado, falhas e limite do host

- Durante leitura do mesmo jogo, a ficha e a evidência anterior continuam visíveis com estado de carregamento; o novo resultado substitui apenas os dados correspondentes.
- Uma troca real de jogo ou retorno à lista limpa a seleção anterior. A versão de requisição impede que respostas assíncronas antigas substituam a seleção recente ou enviem uma discussão obsoleta.
- Falha de transporte mantém fatos já verificados e mostra erro. Um resultado explícito “Game not found.” remove a ficha, comentários e lista mantidos pelo widget, porque a referência pública não foi revalidada.
- Rejeição da conversa pelo host preserva ficha e comentários, mostra a falha e não afirma que a análise foi enviada.
- Trailer continua com controles nativos, mute, `playsInline`, uma tentativa de autoplay por fonte e fallback para imagem/link de vídeo permitido. Trocar de jogo pausa e desmonta o vídeo antigo.
- `ui.visibility = ["model", "app"]` define disponibilidade de chamada, não expansão visual ou autorização de domínio. Nenhuma tool foi escondida do modelo para tentar controlar o cabeçalho.
- O recurso passa a `ui://manifold/game-card/v4.html`; servidor `0.3.0`, App `0.2.0`, pacote privado preparado `0.1.3`. O URI identifica a revisão; não garante invalidação de cache em toda sessão do host.
- Não foi adicionado fullscreen/PiP, permissão ou domínio CSP. Não há API documentada consultada para forçar o cabeçalho inline sempre aberto. O comportamento externo requer reteste no ChatGPT.

## Testes e gates

| Cenário                   | Pré-condição / ação                                                                                     | Resultado e invariante                                                                                    | Evidência e gate                                                   | Limitação                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Dados versus apresentação | Listar tools pelo MCP HTTP                                                                              | Só `show_catalog` anuncia template; quatro tools noauth; metadata individual, schemas e alias preservados | Integração `api/mcp/post.test.ts`; Jest CI                         | Metadata não obriga renderização/expansão no host                                  |
| Jornada completa          | Buscar → selecionar slugs → apresentar → ler detalhes/reviews                                           | Contratos reais validados pelo cliente MCP, resultados públicos, nenhuma escrita                          | Caso de uso `public-catalog-mcp-flow.test.ts`; Jest CI             | Cliente MCP HTTP não reproduz layout ChatGPT                                       |
| Fatos e projeção          | Apresentar lista ordenada, ficha e página filtrada                                                      | Dados relidos do domínio; mídia allowlist; sem preço/checkout/autor privado; bases e amostra preservadas  | Integração HTTP; Jest CI                                           | Fatos podem mudar entre consulta e apresentação                                    |
| Visibilidade              | Ler publicamente, tornar privado, apresentar nos três modos                                             | Erro sem facts; seleção mista falha integralmente; PRIVATE/INACTIVE/ausente negados                       | Integração HTTP e caso de uso; Jest CI                             | Não garante estabilidade posterior à resposta já recebida                          |
| Entrada adulterada        | Enviar descrições/reviews/mídia inventados, campos extras, slugs duplicados ou limites inválidos        | Entrada rejeitada, nenhum `structuredContent` de sucesso                                                  | Integração HTTP parametrizada; Jest CI                             | Não julga preferências declaradas pelo usuário                                     |
| Mesmo jogo                | Ler e paginar comentários                                                                               | Ficha mantida; zero mensagens automáticas; amostra corrente enviada só após ação de discussão             | Unit de controller + navegador real com fixture; Jest CI para unit | Mock/bridge local não reproduzem decisões do host                                  |
| Concorrência              | Selecionar B e C; resolver C antes de B                                                                 | C prevalece; mídia anterior é limpa ao mudar; discussão obsoleta não enviada                              | Unit de controller; Jest CI                                        | Versão local não garante ordenação externa de notificações do host                 |
| Falhas                    | Transporte falha, referência deixa de ser pública, host rejeita contexto/mensagem                       | Erro explícito; fatos preservados em transporte, removidos em negativa pública; nenhuma falsa confirmação | Unit e navegador; Jest CI para unit                                | Erros de transporte são fixtures controladas                                       |
| Mídia e layout            | Reproduzir, ler reviews, pausar, trocar jogo, recusar autoplay/falhar mídia, largura 320px e tema claro | Mesmo DOM de vídeo na leitura; mute/controles; fallback e ausência de overflow horizontal                 | Cinco cenários no navegador; screenshots abaixo                    | Vídeo VP9/WebM sintético, sem áudio; não é trailer remoto nem política ChatGPT/iOS |

Os testes reaproveitam o orchestrator, o endpoint e o caso de uso existentes. Não foi instalado um framework de testes frontend nem alterado workflow nesta rodada. Os gates existentes executam Jest completo, Prettier, ESLint, Commitlint e build de prévia. `typecheck:mcp` é verificação local explícita; ainda não é um passo próprio no workflow atual. Quantidade de testes não constitui garantia de experiência no host.

Reprodução proporcional, com serviços e dados locais de teste:

```bash
# Node 24.13.1 e Docker, conforme CLAUDE.md
npm run test
npm run typecheck:mcp
npm run lint:prettier:check
npm run lint:eslint:check
npm run build
```

Não executar o build sobre o mesmo `.next` enquanto a suíte usa `next dev`. Nesta execução, a primeira tentativa teve rotas inesperadas no servidor com cache anterior e dois erros novos de fixture/expectativa. Foi interrompida; os testes novos foram corrigidos e a suíte reiniciada com um `.next` novo. Isso não foi tratado como sucesso nem como motivo para alterar fluxos fora do MCP.

Resultados locais: **244 suites / 1.592 testes / zero snapshots**, em 517,159 s, com exit 0; typecheck MCP, Prettier e ESLint passaram. O build Next.js terminou com exit 0 e o trace da API inclui o HTML do widget. Os testes focados iniciais também passaram (3 suites / 17 testes), assim como cinco cenários de navegador. Os checks do SHA remoto são registrados no PR272. A validação do próprio ChatGPT continua sendo um aceite separado.

## Evidência visual e reteste

As imagens abaixo vêm do **HTML efetivamente compilado**, renderizado no Chromium com o AppBridge oficial 2.0.3 e handlers locais. O cabeçalho de cada captura identifica host e mídia/dados sintéticos. A amostra não representa reviews reais. Não são capturas do ChatGPT.

- [Seleção final](visual/14-shortlist.png).
- [Ficha/trailer durante carregamento de comentários](visual/14-loading.png).
- [Ficha/trailer e comentários abertos](visual/14-comments.png).

No ChatGPT, iniciar uma conversa nova com Manifold Store e testar:

1. “Me mostra esse Rematch”: consulta de fatos seguida de apresentação final, quando o jogo estiver público no catálogo e o host oferecer as tools novas.
2. “Ler avaliações”: comentários abrem abaixo da ficha; não deve surgir uma mensagem do usuário ou análise automática. Vídeo já carregado continua montado.
3. “Conversar sobre as avaliações”: inicia a análise da amostra mostrada; cita bases/referências e não inventa experiência.
4. Buscar outra opção e voltar à conversa: verificar a ficha correta e registrar se/quando o cabeçalho externo recolhe. Esse último comportamento não está garantido pelo plugin.

## Fontes oficiais atuais

Consultadas em 2026-10-03:

- [OpenAI: separar processamento de dados e UI](https://developers.openai.com/plugins/build/chatgpt-ui#separate-data-processing-from-ui-rendering): orientação para dados reutilizáveis e uma chamada final de apresentação, reduzindo renderizações desnecessárias.
- [OpenAI: metadata e resultados](https://developers.openai.com/plugins/reference): `ui.resourceUri`, alias, disponibilidade modelo/App, status e descrição do widget; distinguem dados do modelo e metadata exclusivo do componente.
- [OpenAI: modos de apresentação](https://developers.openai.com/plugins/concepts/ui-guidelines#display-modes): inline, fullscreen e PiP; não documenta obrigação de manter o cabeçalho inline expandido.
- [MCP Apps SDK oficial](https://github.com/modelcontextprotocol/ext-apps): contratos locais da versão fixada 2.0.3 para mensagem, contexto e pedidos de modo.
