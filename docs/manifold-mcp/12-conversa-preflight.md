# Direção conversacional: preflight e bloqueio visual

Preflight histórico da base `20c9029`, antes de alterar o código. O bloqueio foi posteriormente resolvido com fonte textual autorizada e inspeção local; implementação/validação atual em [13-conversa-implementada.md](13-conversa-implementada.md).

Estado em 2026-10-03: autorizado implementar o novo conceito e tentar autoplay mudo/inline. Branch `docs/manifold-mcp-peach-plan-20261001`, HEAD e remoto `20c902934aa62c97a5fb4567f4c9a82084412d88`; worktree inicialmente limpo. Sem alteração de código, release, PR ou deploy nesta investigação. A evidência verde da versão anterior não valida esta direção ainda não implementada.

## Insumos visuais obrigatórios

| Referência Library                         | Arquivo resolvido  | Versão | Estado dos bytes locais      |
| ------------------------------------------ | ------------------ | ------ | ---------------------------- |
| `libfile_61982eb2ef7c819181f3ff55eeb5e73f` | `01-descobrir.png` | 0      | Download falhou; PNG ausente |
| `libfile_4710fd01199c8191930ae95c61fcb575` | `02-explorar.png`  | 1      | Download falhou; PNG ausente |
| `libfile_20da9fa9756881919afe07ae042b194b` | `03-decidir.png`   | 0      | Download falhou; PNG ausente |

O executor consumiu o fluxo vigente da Library com destinos próprios `/workspace/scratch/manifold-native-design-inputs` e, na única repetição limitada, `/workspace/scratch/manifold-native-design-inputs-retry`. O helper atual retornou exit 1 e `library file transfer failed: download failed` para todos os arquivos nas duas tentativas. Os dois diretórios foram verificados: nenhum PNG legível. A repetição usou IDs/nomes resolvidos para manter a versão 1 do detalhe. A Library resolveu os itens sem negação de acesso, mas não entregou bytes consumíveis aqui; não se determinou a causa de rede. Nenhuma URL de armazenamento foi inventada ou usada como atalho.

Não houve inspeção dos pixels. A instrução explícita da delegação proíbe implementar o layout a partir do texto sozinho. Desbloqueio necessário: fornecer os três PNGs por uma rota autorizada que entregue bytes legíveis no executor consumidor. Caminhos de outro executor não são caminhos locais. Dados/art/reviews dos conceitos permanecem fictícios e não devem virar dados de produção.

Classificação da falha com os registros disponíveis: download/transferência; causa de rede versus erro HTTP **indeterminada**. O helper apresentou somente `download failed`, sem status HTTP, categoria de transporte ou motivo. Não consta negação explícita da Library nem rejeição de aprovação: ambas as preparações retornaram os três itens, sem unavailable_items/warnings. Python/helper iniciaram e os diretórios locais existem; não foi observado erro de dependência ou de permissão local. Isso não identifica nem exclui uma restrição subjacente no download. Nenhuma nova tentativa foi feita para este esclarecimento.

## Fatos verificados no código

- `components/mcp/CatalogCard.tsx:76`: player atual usa controls/playsInline/preload none; não tenta autoplay. HLS depende de suporte nativo. A mídia aparece depois do bloco textual; reviews formam uma seção com filtros/ordem/paginação.
- `components/mcp/catalog-card-controller.ts`: reutiliza resultado inicial; seleção chama `get_game`; reviews chamam `get_game_reviews`. Um contador impede resposta tardia de uma chamada UI anterior, mas a notificação externa de resultado não invalida esse contador. Testar atualização de tool durante chamada pendente antes de alterar esse comportamento.
- `lib/public-catalog-media.ts`: origens HTTPS exatas, sem credenciais/fragments; arquivos MP4/WebM/HLS e IDs YouTube validados. `media.images` combina banner e screenshots: o cliente atual não consegue identificar qual imagem é gameplay. Nunca rotular um banner como screenshot de gameplay por suposição.
- `infra/public_catalog_ui.ts`: recurso v2, resourceDomains restritos, connectDomains/frameDomains vazios. YouTube é hoje link externo, não player embutido. O SDK instalado declara câmera/microfone/geolocation/clipboardWrite em suas permissões de recurso; isso não cria uma garantia de autoplay delegada pelo host.
- `contracts/public-game-catalog.ts`: pesquisa recebe q/tags, não preferências persistentes nem motivo livre por jogo. Um motivo contextual precisa ter base explícita em dados retornados/contexto compartilhado; não inventar personalização a partir do ranking. Comentários consultados e contadores globais já têm bases distintas no contrato.
- Projeção pública/modelo preservam ACTIVE/ONLY_DISPLAY e allowlists, sem preços/compra/autores privados. Não adicionar OAuth, escrita de reviews, comércio ou permissões de domínio.

## Estratégia técnica a validar após ver os protótipos

Um único vídeo real no detalhe selecionado, sem players de autoplay no shortlist. Configurar muted e playsInline antes de uma tentativa de play; resolver/rejeitar a Promise e observar eventos reais. Não repetir tentativas para forçar a política nem desmutar sem ação explícita. Manter controls acessíveis; rejeição de autoplay deixa a reprodução manual disponível, sem confundir recusa com mídia ausente. Troca de jogo/tool update encerra o player anterior e reinicia o estado da fonte atual. Falha de rede/codec usa poster/imagem real e link de vídeo permitido.

Preferir arquivo direto permitido com codec verificável. HLS: usar capacidade nativa quando disponível e fallback honesto quando ausente; não prometer reprodução idêntica em Chromium/iOS. YouTube exige análise de player oficial, frames/CSP e permissões do host; não ampliar CSP ou introduzir embed arbitrário só para reproduzir o protótipo. Sem trailer, selecionar screenshot real distinguível no catálogo; quando só houver capa, nomeá-la corretamente. Sem mídia real, ausência explícita.

Shortlist, detalhe e síntese de reviews devem aproveitar a conversa, sem composer duplicado, menus profundos ou scroll interno. Seleção/contexto enviados ao host precisam de capacidade suportada e tratamento de recusa; não inventar que uma mensagem já foi entregue ao modelo. Os pixels definirão a composição; o texto acima é decisão técnica preliminar.

## Regressões e aceite

| Cenário                            | Invariante / evidência necessária                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Lista → detalhe; A → B repetido    | Jogo/fonte atuais; resposta A tardia não substitui B; sem áudio/player anterior                                                 |
| Tool update durante chamada UI     | Último resultado relevante prevalece; erro/cancelamento não deixa spinner ou mídia stale                                        |
| MP4/WebM/HLS, ausente/URL insegura | Somente mídia real permitida; sem rede para origem rejeitada; ausência/codec tratados distintamente                             |
| Autoplay aceito/rejeitado          | Teste de estado e browser com Promise/eventos; inicia mudo; manual play/pause/mute acessíveis; sem retry loop                   |
| Sem trailer                        | Screenshot real quando distinguível; capa identificada; nenhuma imagem/vídeo fabricado                                          |
| Reviews / domínio                  | Reusar integração HTTP/SDK existente: visibilidade, cookies/Bearer não ampliam leitura, agregado vs filtro/amostra, sem escrita |
| Mobile/teclado                     | Layout sem overflow/scroll interno, targets acessíveis, foco visível, rótulos e ordem semântica                                 |
| Host ChatGPT/iOS                   | Homologação real de sandbox, autoplay, CSP, codec e encaminhamento conversacional; fixtures não provam essas políticas          |

Executar regressões focadas e a suíte inteira exigida por CLAUDE.md, lint completo, typecheck MCP e build/trace. Capturas novas devem ser do widget realmente renderizado, identificando fixture local quando usada. Não reutilizar os PNGs conceituais como prova de implementação. Confirmar CI/Vercel no SHA final e atualizar o mesmo plugin privado somente se necessário pelo fluxo guardado.

## Fontes oficiais lidas

- [OpenAI: What makes a great ChatGPT app](https://developers.openai.com/blog/what-makes-a-great-chatgpt-app): capacidades pequenas voltadas à decisão, contexto da conversa e refinamentos leves.
- [OpenAI: UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines): cards leves, ações limitadas, sem navegação profunda, scroll interno ou entradas duplicadas.
- [OpenAI: MCP Apps/Pizzaz](https://developers.openai.com/plugins/build/chatgpt-ui#explore-the-pizzaz-component-gallery): bridge e componentes de referência; não determina garantia de autoplay.
- [Spotify: integração conversacional](https://newsroom.spotify.com/2025-10-06/spotify-personalized-prompts-chatgpt/): contexto/mood na descoberta; referência de UX, não contrato de reprodução Manifold.
- [MDN: autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay) e [Permissions Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/autoplay): tentativa mudo/inline, detecção de rejeição e controle da política pelo navegador/iframe.
- [YouTube: player parameters](https://developers.google.com/youtube/player_parameters): player oficial e configuração; adoção depende da análise de host/CSP e não está implementada.
