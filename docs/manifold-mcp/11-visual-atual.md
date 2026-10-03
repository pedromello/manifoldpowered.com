# Card MCP: design atual e atualização privada

## Referências verificadas em 2026-10-03

Base visual `6cfc1e86ae8876bde68b38ab2a51cf6f3df5959e`, idêntica nos arquivos abaixo à base do card `ac41fef66f12aef26a160ff067d6ee27637b4fd0`. A home real é `/store` (`pages/index.tsx` redireciona); a ficha real é `/item/[slug]`. Foram renderizadas em Chromium as rotas `/pt-BR/store` e `/pt-BR/item/portal-fixture-local`, não uma tela reconstruída a partir de logo/paleta.

| Referência atual                                                                                  | Trecho que orienta o widget                                                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `pages/store/index.tsx:9` e `components/store/StoreHomeLayout.tsx:163`                            | Shell escuro, navegação, composição geral                                      |
| `components/store/StoreHomeLayout.tsx:32`                                                         | Logo oficial 36px + wordmark MANIFOLD, peso 900/tracking 0.16em                |
| `components/storefront/default/PlatformStorefrontHome.tsx:84`                                     | Spotlight, superfície #14101c, border 10%, CTA fúcsia/violeta                  |
| `components/storefront/default/PlatformStorefrontHome.tsx:317`                                    | Cards com arte 920/430, conteúdo p-4, título compacto                          |
| `pages/item/[slug].tsx:144` e `components/storefront/default/item/DefaultItemPage.tsx:55`         | Ficha atual, fundo #0b0812, separadores e seções                               |
| `components/storefront/default/item/GameHero.tsx:26`                                              | Tags → título → descrição → resumo, mídia ao lado; peso 900, tracking -0.045em |
| `components/storefront/default/item/ReviewsSection.tsx:40` e `components/store/ReviewCard.tsx:73` | Ícone violeta, cards de review, badges verde/rosa, texto e datas               |

Refs remotas inspecionadas sem merge: `codex/store-self-explanatory-home` = `5d1d5a86b50f066c739347903442fc59388daaa3` (20/08); `codex/storefront-ui-system` = `54cf4def0573d0e1ef31b89febdca7e2d533c2d6` (21/08); `feat/creator-outlet-presets` = `da529cfcf31f25bba2658d49eb8c9bb50516156a` (01/09); `feat/better-creators-ux` = `470225d2bb4c019c7f7a4e921c5404aa7ecbe62f` (03/09). Todas são ancestrais de main. Os quatro arquivos principais na última ref são idênticos a main; as refs anteriores não são a referência visual atual.

## Correção e limites

O primeiro card usou a paleta `sf-` de `styles/global.css`, roxo #1d0f3b/amarelo #ffb400, que não descreve essas telas atuais. O build agora usa CSS do widget referenciado explicitamente às telas atuais; sem alterar os temas/shells do site. Fundo #0b0812, superfície #14101c, opacidades de branco, acentos violeta/fúcsia, mesma família sans e asset do logo. A hierarquia da ficha, cards de busca e reviews foi adaptada à largura inline. O recurso passa a `ui://manifold/game-card/v2.html` para distinguir o asset corrigido na descoberta; isso não garante comportamento de cache do host.

Contratos/allowlists, filtros/reviews, bridge MCP e fallback de mídia continuam no mesmo domínio. Não se copiam navegação para compra, preços, wishlist, autores privados ou ações de escrita do site para o widget.

Capturas reais: `/tmp/manifold-home-current.png`, `/tmp/manifold-game-current.png` e [card parcial na Library](oai-library://libfile_18b96875fdac819191dc5b3a06fd525d/manifold-card-redesign-partial.png). Fixture local claramente identificada; reviews `[Fixture]` sintéticas. URLs de mídia reais do catálogo Steam, mas imagens falham pela rede do executor e playback não está comprovado. Sem fixture remota. O browser da ficha reportou fundo rgb(11,8,18), título peso 900/tracking -2.7px em 60px, e nenhum overlay Next; home também sem overlay.

## Plugin pessoal atualizado por autorização explícita

Pedro pediu “Manda atualizar o plugin por favor, quero testar”. Foi relida a fonte proprietária `plugins_6ac016770530819183971606dd458348`, USER/PRIVATE, 0.1.1, release `pluginrel_6ac0177889e48191aa67faec6f70ac03`. Os dois manifests foram comparados estruturalmente: só versão muda. O ZIP parcial inclui somente `plugin.json`, `.codex-plugin/plugin.json`, `skills/find-games/SKILL.md`; omitidos preservados pelo editor oficial.

Atualização guardada salva e relida: [Manifold Store](https://chatgpt.com/plugins/plugins_6ac016770530819183971606dd458348), 0.1.2, release `pluginrel_6ac0486463b88191b0f4b549c37ef19c`, mesma identidade, USER/PRIVATE. Inventário preserva o logo; `.mcp.json` e `mcp.json` estão byte a byte iguais à fonte anterior. A skill nova usa descoberta natural, 3–5 jogos reais e reviews consultadas, sem experiência/opinião inventada. A URL aponta para o mesmo preview de branch; versão de skill e SHA de servidor são evidências separadas. Não houve publicação em diretório público, ampliação de permissões ou credencial nova.

## Validação e próximo checkpoint

Após a correção inicial: `build:mcp-ui` e `typecheck:mcp` passaram; 6 suítes / 48 testes (HTTP, SDK/caso de uso, projeção de mídia e markup) passaram, exit 0. O aviso legado de open handles do Jest permanece. A asserção de recurso rejeita a antiga origem de cor e verifica as superfícies atuais. Comparação visual final lado a lado, suíte completa/build e CI do novo SHA ainda serão registrados. Evidência integral da versão anterior permanece em [10-card-descoberta.md](10-card-descoberta.md).

Teste mínimo de Pedro: abrir uma conversa nova com a release atual, pedir opções reais do catálogo, abrir um slug retornado e solicitar leitura/filtragem de reviews. Conferir o card inline v2 e mídia/fallback. Não há uma rota standalone de ficha do MCP: o HTML requer o resultado inicial enviado pelo bridge do host. Este executor não pode confirmar renderização nem cache no ChatGPT de Pedro.
