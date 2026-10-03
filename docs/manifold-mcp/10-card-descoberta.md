# Incremento revisável: descoberta com card e reviews públicas

## Base e estado

Base desta etapa: `12de8db0bfadf775d1d1b8b54fc834a2315ff1ec`, PR [#272](https://github.com/pedromello/manifoldpowered.com/pull/272), draft. Os commits de Pedro `90bc761` e `12de8db` foram incorporados por fast-forward. Preservar a configuração `MCP_ALLOWED_HOSTNAMES` e os demais ajustes; nunca restaurar o SHA anterior para contorná-los.

Pedro informou que conectou o plugin ao ChatGPT e consultou busca/detalhe com sucesso em 2026-10-02. Isso comprova a jornada que ele executou, não a renderização do card novo. O comentário Vercel da PR indica Ready para a base desta etapa. Limites de rede encontrados na investigação anterior são históricos; não demonstram um bloqueio atual no host de Pedro.

## Fatos verificados no domínio

- `Game` contém descrição curta, `media` JSON com banner/screenshots/vídeos e contadores de reviews; `GameLocalization` já resolve texto por idioma.
- `review.getPaginatedReviewsBySlug` já exige ACTIVE/ONLY_DISPLAY, pagina reviews e devolve resumo. A rota GET `/api/v1/reviews` usa essa função e `authorization.filterOutput("read:review")`.
- O DTO público do site contém username da review. O MCP deve aplicar allowlist adicional: referência da review, mensagem, recomendação e datas, sem username, User.id, email, sessão ou campos de posse/escrita.
- `styles/global.css` define a paleta storefront `#1d0f3b`, foreground branco e accent `#ffb400`. O logo oficial é `public/images/brand/manifold-logo.png`. Não há fonte customizada carregada em `_app`/`_document`; usar a mesma família sans do site, sem introduzir identidade nova.
- `MediaGallery` do site suporta vídeos diretos e YouTube, inclusive HLS via hls.js. Seu iframe e autoplay não devem ser transportados automaticamente para o host MCP.
- CI atual instala com npm ci e executa npm run test. O lint é verificado separadamente. Há testes de markup React no repo, embora a descrição histórica de CLAUDE diga que não há setup frontend completo.

## Recorte proposto

Ampliar `search_games` e `get_game` com descrição curta, mídia de catálogo permitida e resumo numérico público. Adicionar `get_game_reviews`: slug, page, limit, filtro de recomendação, ordem temporal explícita. Manter todos públicos/noauth/read-only; sem login, escrita, comércio, migrations ou mudanças de checkout.

Priorizar a função existente de leitura de reviews: filtros opcionais preservam os callers atuais. Contagem e paginação usam o mesmo filtro; ordenação inclui desempate determinístico. Total do catálogo, total filtrado e quantidade efetivamente retornada devem ter nomes distintos. O resumo deve declarar a origem dos números; contadores denormalizados não provam que todos os comentários foram consultados.

Card inline efêmero, com logo e tokens existentes: título, descrição, tags, imagem quando disponível, galeria simples e resumo. Busca mantém dados úteis sem UI e limita a apresentação inicial a 3–5 opções. Detalhe mostra ausência de mídia/reviews honestamente. Player direto com controles, sem autoplay; links externos para vídeos de terceiros e fallback se o host negar reprodução/abertura. Não gerar URLs de vídeo, screenshots ou opiniões.

Mídia exige HTTPS, sem credenciais e em origens explícitas compartilhadas entre projeção e CSP. Não usar `https:`/`*` como CSP nem construir allowlist a partir de conteúdo não confiável. Não buscar URLs arbitrárias no servidor. Links de vídeo são somente destinos de mídia reconhecidos, nunca social_links genéricos ou links de compra. Omitir mídia fora da política e documentar essa limitação.

## Contrato de UI e fontes atuais

Usar recurso versionado `ui://manifold/game-card/v1.html`, MIME `text/html;profile=mcp-app`, referenciado por `_meta.ui.resourceUri` nos tools que devem renderizar. O bridge MCP Apps recebe o resultado inicial; não consultar novamente o mesmo jogo só para abrir o card. Métodos padrão para tool calls e links; tratar recusas do host.

Definir explicitamente inline como modo disponível/preferido no recurso e na capability do App. Preferências de apresentação são hints; só a observação no host prova a posição real. CSP sem frames aninhados nesta etapa.

- [OpenAI: adicionar UI](https://developers.openai.com/plugins/build/chatgpt-ui): bridge padrão, recursos, CSP e fallback de capacidades.
- [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview): extensão interoperável, não garantia de suporte de qualquer cliente.
- [SDK App](https://apps.extensions.modelcontextprotocol.io/api/classes/app.App.html): callServerTool/openLink; abertura pode ser recusada.
- [OpenAI Extensions: display modes](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#display-modes): availableDisplayModes/preferredDisplayMode ficam em `_meta["openai/ui"]` do conteúdo do recurso.

## Fonte do plugin instalado

Metadados e arquivos foram lidos via Plugin Creator, não inferidos pelo nome da skill. Plugin `manifold-games`, ID `plugins_6ac016770530819183971606dd458348`, escopo USER, PRIVATE, versão `0.1.1`, release `pluginrel_6ac0177889e48191aa67faec6f70ac03` no momento da leitura. Fonte editável do pacote: `plugin.json`, `.codex-plugin/plugin.json`, `skills/find-games/SKILL.md`, `mcp.json`, `.mcp.json`, asset de logo.

Preparar a skill em seu caminho original, preservando identidade, defaultPrompt completo, logo, servidor Vercel e audiência. Pedro autorizou explicitamente atualizar seu plugin pessoal privado em 2026-10-03. A atualização guardada de 0.1.1 para 0.1.2 foi salva e relida; detalhes em [11-visual-atual.md](11-visual-atual.md). Antes de eventual upload, reler release e reconciliar mudanças concorrentes. Não interpretar ausência de tools nesta tarefa como desconexão do host de Pedro.

### Comportamento da skill proposto

Objetivo: ajudar a pessoa a escolher seu próximo jogo. Aproveitar gostos, jogos anteriores, humor, tempo e plataforma já informados. Na busca genérica, devolver 3–5 opções reais, com motivos apoiados em tags/descrições e uma pergunta leve que ajude a próxima rodada. Perguntas são naturais e oportunas: não repetir contexto nem exigir pergunta em toda resposta específica.

Em detalhe, consultar reviews existentes quando úteis: separar total do catálogo de amostra lida, informar filtros/ordem e contar temas somente nos comentários realmente consultados. Citar referência e data da review/amostra; não tratar a amostra como consenso estatístico. Conectar pontos positivos/negativos aos gostos informados; não atribuir experiência pessoal à IA nem ao usuário. Hardware/compatibilidade só quando existirem dados e contexto suficientes; esta projeção inicial não entrega requisitos, portanto não garante execução num PC.

## Verificação proporcional

| Cenário      | Ação/precondição                                                                 | Invariante e evidência necessária                                                            | Gate/limite                                                                          |
| ------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Visibilidade | ACTIVE/ONLY_DISPLAY/PRIVATE/INACTIVE com mídia e reviews                         | Só jogos públicos entram na busca/detalhe/reviews; cookie admin/Bearer não ampliam a leitura | Integração HTTP + banco; revalidar após mudança de status                            |
| Privacidade  | Fixtures com campos comerciais, User.id/email/username e texto adversarial       | Allowlist idêntica em texto/structuredContent; texto é dado, não instrução                   | Integração, não prova comportamento do modelo                                        |
| Reviews      | Mais de uma página, filtros positivos/negativos, datas empatadas, nenhuma review | Contagem filtrada correta, desempate estável, sem amostra inventada                          | Integração/domínio existente; alterações entre páginas não dão snapshot transacional |
| Mídia        | URLs válidas, ausentes, malformadas, esquemas perigosos, origem fora da CSP      | Sem URL fabricada/execução de HTML; omissão explícita e fallback                             | Integração + UI; não prova codec/egress no ChatGPT                                   |
| UI           | Resultado inicial de busca/detalhe, erro, mídia/reviews vazias                   | Marca existente, layout estreito, controles/links acessíveis; nenhuma escrita/compra         | Markup + browser com bridge de teste; host real pendente                             |
| Jornada      | Cliente SDK → busca → detalhe → reviews → recurso                                | Schemas/MIME/metadata válidos, banco sem escrita por ferramentas                             | SDK HTTP + PostgreSQL local; não equivale à conexão/renderização ChatGPT             |
| Build/CI     | Instalação limpa, bundle determinístico, lint/typecheck/build e suíte inteira    | Assets incluídos no deploy e typecheck MCP ampliado                                          | Credenciais sintéticas locais; sem contas produção; observar CI no SHA final         |

## Checkpoint de autorização

A revisão automática inicialmente aplicou o pedido antigo de planejamento e negou instalar dependências. A autorização explícita atual de Pedro para implementar foi apresentada; a repetição única foi aceita. A confirmação anterior está supersedida e não precisa de resposta. SDK MCP Apps `2.0.3` e esbuild `0.28.2` foram instalados com versões exatas. Sem republicação do plugin.

## Implementação em verificação

Schemas em `contracts/public-game-catalog.ts`; projeção no model existente; filtros opcionais em `models/review.ts`; recurso em `infra/public_catalog_ui.ts`; view/controller em `components/mcp`. Build inline reproduzível reaproveita o logo binário oficial. Após correção solicitada por Pedro, o widget acompanha as superfícies e composição da home/ficha atuais; os tokens legados `sf-` de `styles/global.css` não alimentam mais o card. Referências renderizadas e validação em [11-visual-atual.md](11-visual-atual.md). Hooks npm constroem o asset antes de dev/test/build; Next inclui explicitamente o HTML no trace de `/api/mcp`. Workflows permanecem iguais. A configuração de Host/Origin de Pedro foi preservada.

O overlay da skill e versões de manifests, preservando seus demais campos, está em `plugins/manifold-games`. Não é pacote novo completo. O overlay foi aplicado à mesma identidade pessoal privada por autorização de Pedro; a fonte instalada está na versão `0.1.2`.

Checks focados: 7 suítes / 53 testes passaram (incluindo a rota pública antiga de reviews). A inclusão posterior do cenário de mídia válido/negado entra na suíte completa. Foram corrigidos o contrato de ferramenta desconhecida e a transformação ESM do SDK UI no Jest; isso não é validação de host. Typecheck MCP passou. Suíte completa/CI passaram; evidência visual e checkpoint final estão abaixo.

## Evidência visual e limites reais

Captura de navegador em Chromium, com SDK App real conectado a bridge local de teste e tools HTTP reais contra Next/PostgreSQL local. Fixture `Portal — fixture local`; reviews prefixadas `[Fixture]`, sem representar opiniões de jogadores reais. As URLs de imagem/vídeo foram lidas do [catálogo público Steam de Portal](https://store.steampowered.com/api/appdetails?appids=400), não geradas. Isso não é teste no ChatGPT nem dados da base Manifold remota.

Artefato: `/tmp/manifold-card-preview-browser.png`, salvo também na Library como `manifold-card-preview-browser.png`. A captura identifica seu contexto no topo. O navegador recebeu o detalhe inicial sem tool call duplicada; o botão de leitura consultou três reviews; o filtro negativo retornou um comentário e total filtrado 1; recusa de `ui/open-link` produziu campo para copiar a URL real; viewport 390px não teve overflow horizontal. Imagens externas falharam neste executor, e a UI mostra falha de carregamento sem declarar ausência de mídia no catálogo. Reprodução do trailer não foi comprovada. HLS depende de suporte nativo; se ausente ou playback falhar, manter o link de vídeo disponível.

A tentativa atual de consulta ao `/api/mcp` Vercel deste executor falhou no proxy (túnel 403), antes de avaliar a aplicação. Nenhuma proteção/permissão foi alterada e isso não contradiz a conexão que Pedro confirmou. Após deploy, ainda verificar no ChatGPT: card/render inline, CSP/mídia, vídeo/fallback, filtros e paginação, idioma e comportamento da skill na release efetivamente instalada.

## Pipeline e gates

`npm ci` → hooks `build:mcp-ui` → testes HTTP/caso de uso/UI markup e suíte inteira com serviços locais; scripts de lint completos e `typecheck:mcp`; `npm run build` recompõe o recurso e Next rastreia o HTML. Mesmo fluxo de build é usado em Vercel, sem novas migrations. Nenhuma credencial de produção é exigida pelo build da UI.

CI existente executa npm ci + npm run test e lint separado. O gate de Jest inclui os cenários novos e build do widget via pretest. Typecheck MCP/build local e Vercel são evidências separadas; ainda não há gate autônomo de browser/ChatGPT nem garantia automática do comportamento conversacional da skill. Os scripts temporários de screenshot/bridge não são um host de produção. Não alterar workflows nesta etapa. Suite/counts não estabelecem suporte de codec, política do host ou representatividade das reviews.

## Checkpoint do incremento anterior (antes da correção visual)

Commit de implementação e SHA remoto conferido: `ac41fef66f12aef26a160ff067d6ee27637b4fd0`. PR #272 permanece draft, sem merge/produção ou alteração da release do plugin instalado.

| Verificação                                        | Resultado comprovado                                                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suíte inteira local (`npm run test`, Node 24.13.1) | 243 suítes / 1.559 testes / 0 snapshots, todos passaram, 409,66 s, exit 0. posttest encerrou/removeu os três serviços locais                                            |
| Suíte inteira no CI do mesmo SHA                   | [Automated Tests](https://github.com/pedromello/manifoldpowered.com/actions/runs/37079055154): 243 suítes / 1.559 testes, 280,24 s, success                             |
| Lint no CI do mesmo SHA                            | [Linting](https://github.com/pedromello/manifoldpowered.com/actions/runs/37079055130): success                                                                          |
| Checks locais                                      | Prettier/ESLint completos e typecheck:mcp passaram                                                                                                                      |
| Build local no mesmo SHA                           | `npm run build` passou (exit 0); trace `.next/server/pages/api/mcp.js.nft.json` inclui `../../../../public/mcp/game-card.html`                                          |
| Vercel no mesmo SHA                                | [Deploy](https://vercel.com/pedro-mellos-projects-0447d2d6/manifoldpowered-com/6E5zrdcLUCqf9upChLj3iEw7nx1W) Ready/success; comentário da PR aponta o preview da branch |

As duas primeiras tentativas locais da suíte completa abortaram no startup por conflito com o servidor usado para a captura. Depois ele foi encerrado pela sessão controlada, a terceira execução passou e fez cleanup. Nenhum teste foi ignorado/alterado para contornar a falha. Jest ainda emitiu o aviso de operações assíncronas abertas; o comando saiu com sucesso e a causa do aviso não foi isolada. Isso já ocorria na primeira etapa.

### Revisão visual e próximo teste no host

[Preview da branch](https://manifoldpowered-com-git-d-5305b1-pedro-mellos-projects-0447d2d6.vercel.app). O endpoint conectado continua `/api/mcp`; não há ficha standalone publicada nem fixture inserida na base remota. `/mcp/game-card.html` é somente o asset do recurso MCP Apps: sem o host/bridge e seu resultado inicial, ele não consulta a API e não mostra uma ficha real. Não apresentá-lo como link funcional de jogo ou como validação do ChatGPT.

Para revisar agora, usar a captura real da Library com a fixture claramente identificada. Para testar dados reais no ChatGPT, atualizar a descoberta de ferramentas da conexão existente ou iniciar uma conversa nova com o plugin, consultar `search_games` e chamar `get_game` para um slug realmente retornado. Verificar se o card aparece, se a mídia carrega e se o filtro de reviews/refusado-link funciona. Pedir explicitamente leitura de `get_game_reviews` e comparação entre total e amostra; a skill foi atualizada para 0.1.2 em 2026-10-03; confirmar que a nova conversa utiliza a release atual. Ausência do novo tool exige conferir descoberta/cache, sem substituir o plugin ou alterar proteções por suposição.
