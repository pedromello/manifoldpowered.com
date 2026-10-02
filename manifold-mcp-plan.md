> **Incremento atual:** card Manifold e reviews públicas em implementação/validação na PR #272 draft; veja [estado, fonte do plugin e evidências](docs/manifold-mcp/10-card-descoberta.md). O recorte inicial e decisões posteriores abaixo permanecem como histórico.

# Manifold no ChatGPT — MVP público de leitura

**Gestão Peach. Base 6cfc1e86ae8876bde68b38ab2a51cf6f3df5959e. Branch docs/manifold-mcp-peach-plan-20261001. Implementação local e commit/push isolado + PR draft para preview Vercel autorizados. Push aguarda confirmação de ambiente não produção. Sem merge, produção ou configuração de contas/credenciais/permissões.**

## Escopo vigente e histórico

Em 2026-10-01 Pedro reduziu o MVP para **buscar jogos públicos Manifold, com detalhe factual mínimo**, sem login/OAuth. Depois autorizou implementar código, testes e checks locais nesse recorte, mantendo MVC/SOLID do repo. O plano anterior de reviews/aprovação/OAuth foi supersedido como MVP: [identidade posterior](docs/manifold-mcp/03-oauth-vinculo.md) e [reviews posteriores](docs/manifold-mcp/04-aprovacao.md) ficam preservadas para outra etapa e não bloqueiam esta entrega. Nenhuma frente giftcards/checkout entra no escopo.

Decisão mantida: PRIVATE não é público nem acessível apenas por link/slug. Acesso privado de criador/proprietário e admin pertence a caminhos autenticados do domínio, sem construir isso no plugin inicial. Repo: Game.studio_id → Studio.owner_id e capability read:game:any; autor individual do cadastro não é registrado. [Evidência e limite](docs/manifold-mcp/01-evidencias.md#private-papeis). 404 é recomendação para ocultar existência, não decisão geral de produto.

## Pequena vitória e contrato

1. Usuário pede jogos por nome/termo ou tags.
2. ChatGPT chama search_games anonimamente; recebe somente ACTIVE/ONLY_DISPLAY e paginação filtrada.
3. Se precisar, get_game usa slug retornado e entrega o mesmo conjunto factual mínimo; PRIVATE/INACTIVE não sai, mesmo com cookie/token enviado.
4. ChatGPT responde a partir dos fatos; sem opinião/experiência inventada, preço, ofertas, links comerciais ou compra.

Duas tools noauth/read-only, sem UI própria: search_games e get_game. Saída: slug, título, tags e data de lançamento; sem descrição livre, mídia, reviews ou dados de contas no MVP. Inputs estritos/bounded; defaults e erros na [arquitetura vigente](docs/manifold-mcp/02-arquitetura.md). Cookie/Bearer não amplia leitura. Adaptador coordena funções pequenas dos models, sem simular sessão nem criar novas camadas genéricas.

## Etapas e aceite

| Etapa                | Aceite                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consulta pública/DTO | Estados públicos na consulta de busca e slug; contagem não inclui privados; allowlist estrita sem comércio/dados privados                                   |
| MCP mínimo           | SDK oficial, Streamable HTTP stateless, schemas/anotações/noauth, validação de Origin/Host/body e erros úteis sem detalhes internos                         |
| Verificação local    | Caso de uso anônimo busca→detalhe; negativos de PRIVATE/INACTIVE, limites/filtros/erros; suite existente completa, lint/typecheck/build conforme evidências |
| Teste real posterior | URL HTTPS autorizada com runtime Node e DB; Inspector e ChatGPT descobrem/call tools sem login; registrar versão/metadata/resultados                        |

[CI mínimo e evidências](docs/manifold-mcp/05-testes-ci.md) · [Poucas pendências](docs/manifold-mcp/06-decisoes.md) · [Fontes e conexão real](docs/manifold-mcp/07-fontes.md).

[Código entregue, contrato e verificações locais](docs/manifold-mcp/08-implementacao.md): **241 suítes / 1.540 testes aprovados**, lint, typecheck MCP e build passaram. Typecheck geral mantém 15 erros antigos de testes. O histórico anterior permanece preservado; somente catálogo público foi implementado.

Sucesso local não significa conexão funcionando no ChatGPT. Hospedagem/publicação precisam de autorização posterior; leitura pública tecnicamente viável não garante elegibilidade no diretório.

[Preview Vercel: investigação, proteção e gate antes de publicar](docs/manifold-mcp/09-preview.md).
