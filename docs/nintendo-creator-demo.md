# Outlets Nintendo — demonstração local

## Direção visual

Referências inspecionadas em 11/09/2026:

- [Digplay](https://www.canaldigplay.com/): fundo `#0F0A14`, grandes áreas vinho `#850012`, chamadas em laranja `#EA4620`, texto e marca brancos, tipografia Nunito. A identidade já funciona sobre fundo escuro. No exemplo, o layout **Community** valoriza o canal, a comunidade e uma seleção visual de jogos.
- [Nintendo Barato](https://www.nintendobarato.com.br/): vermelho `#E60013`, branco e cinza `#F5F5F5`, tipografia Inter, navegação por categorias e destaque para produtos/ofertas. No exemplo, o layout **Channel** combina capa vermelha, conteúdo escuro e reviews do Coelho no Japão.

A recomendação é manter a base escura, aplicar o vermelho intenso nas áreas grandes de marca e usar branco para títulos. Links e controles pequenos recebem vermelho mais claro para contraste. As novas paletas **Vermelho vibrante** e **Vinho escuro** são opções reutilizáveis no editor de qualquer outlet, sem depender do nome ou slug do criador. A tipografia usa o preset existente; fontes exatas de cada marca ainda seriam uma evolução.

Um tema claro continua sendo uma evolução independente: a página de produto ainda contém cores escuras fixas. Para suportá-lo integralmente, é necessário converter essas superfícies para tokens e verificar produto, filtros, menus, estados e contraste; mudar somente o fundo não basta.

## Conteúdo e autoria

Os cinco jogos foram importados pelo fluxo real `models/nintendo_import.ts`, integrado da branch local `codex/nintendo-eshop-import`. O seed consulta as páginas oficiais brasileiras, vincula o NSUID validado aos IDs existentes e chama o importador, preservando slugs, curadorias e reviews. Descrições, galeria, recursos e ofertas regionais vêm da Nintendo. O modo público é `NINTENDO_ONLY`: preço de referência em reais e botão para a Nintendo eShop. A compra acontece na Nintendo.

Preços obtidos em 11/09/2026: Bananza R$389,90; Mario Kart World R$439,90; Pikmin 4 R$329,90; Mario Maker 2 R$329,90; Celeste R$59,99. As ofertas armazenam data da consulta; os valores podem mudar na origem. A primeira versão usava cadastros simplificados sem oferta e foi substituída por esta importação real.

Os vídeos abaixo foram encontrados diretamente na busca de reviews do canal [Coelho no Japão](https://www.youtube.com/@coelhonojapao/search?query=review). Cada link está na review editorial do respectivo jogo no Nintendo Barato, usando o embed de YouTube que a plataforma já possui:

| Jogo                | Review original                                                            |
| ------------------- | -------------------------------------------------------------------------- |
| Donkey Kong Bananza | [Análise completa](https://www.youtube.com/watch?v=B2Mhsf6OU5A)            |
| Mario Kart World    | [Análise completa](https://www.youtube.com/watch?v=LsoX00HFbLs)            |
| Pikmin 4            | [Análise / review](https://www.youtube.com/watch?v=H0bc_rpHLT8)            |
| Super Mario Maker 2 | [Comprar ou não?](https://www.youtube.com/watch?v=9kBxwT3M340)             |
| Celeste             | [Análise e gameplay no Japão](https://www.youtube.com/watch?v=3qrczdM-pnM) |

Não foram transcritos os vídeos nem atribuídas notas ou opiniões novas ao criador. A review é uma apresentação do vídeo original. No Digplay, os mesmos jogos formam uma seleção explicitamente ilustrativa, sem reviews do Coelho atribuídas ao Digplay.

Artes: páginas oficiais de [Bananza](https://www.nintendo.com/us/store/products/donkey-kong-bananza-switch-2/), [Mario Kart World](https://www.nintendo.com/us/store/products/mario-kart-world-switch-2/), [Pikmin 4](https://www.nintendo.com/us/store/products/pikmin-4-switch/), [Mario Maker 2](https://www.nintendo.com/us/store/products/super-mario-maker-2-switch/) e [Celeste](https://www.nintendo.com/us/store/products/celeste-switch/). Logos referenciam os próprios sites dos criadores. Todos os recursos externos continuam sujeitos à disponibilidade de suas origens.

## Reprodução

Foi criado o banco PostgreSQL **local e separado** `nintendo_creator_demo`, no mesmo servidor local de desenvolvimento. A configuração `.env.development` não foi modificada.

Para abrir os exemplos já preparados, com o PostgreSQL local em execução:

```sh
npm run dev:nintendo
```

A demonstração usa a porta **3001**, `MANIFOLD_DEV_COUNTRY=BR` para ofertas brasileiras e um diretório de compilação próprio. O desenvolvimento padrão na porta 3000 usa outro banco e não exibe esses exemplos. Abra `http://127.0.0.1:3001/pt-BR/store` para ver os dois outlets na listagem.

Para preparar novamente o banco de demonstração, caso necessário:

```powershell
$env:POSTGRES_DB='nintendo_creator_demo'
npx prisma migrate deploy
npx tsx --env-file=.env.development scripts/seed-nintendo-creator-demo.ts --confirm-database=nintendo_creator_demo
npm run dev:nintendo
```

Rotas:

- `http://127.0.0.1:3001/pt-BR/store/nintendo-barato-demo`
- `http://127.0.0.1:3001/pt-BR/store/digplay-demo`

O seed verifica loopback, recusa produção e exige o nome exato do banco. Usa IDs próprios, detecta colisões e publica pelo modelo de lifecycle da plataforma. Uma segunda execução preserva outlets já publicados. Nada é publicado na internet e nenhuma conta real dos criadores é usada. Os exemplos pertencem a um usuário local de demonstração sem senha.

O catálogo possui cinco jogos e três destaques por outlet. As reviews pertencem à relação outlet × jogo. Busca, filtros, ordenação e os links de produto mantêm o comportamento da plataforma, incluindo o contexto `?store=`.

## Próximas decisões de produto

1. Oferecer as duas paletas no onboarding/editor (implementado).
2. Permitir identidade por capa e logo (já suportado); uma capa desenhada pelo criador substitui a capa padrão.
3. A integração Nintendo existente foi incorporada à demonstração; importação, ofertas e atualização usam os componentes compartilhados da plataforma. Nenhum preço foi digitado manualmente.
4. Caso seja necessária fidelidade maior, adicionar fontes e um preset de catálogo/ofertas, preservando os mesmos dados, autoria e links de produto.

## Validação realizada

- 70 suítes unitárias, 453 testes aprovados, incluindo contraste das paletas, presets, página de review e cartão de produto.
- TypeScript do código da aplicação e scripts aprovado; ESLint dos arquivos alterados aprovado.
- API local: ambos publicados, cinco jogos por catálogo, busca por Celeste, autoria das cinco reviews, ofertas BRL e links oficiais da Nintendo verificados.
- Seed executado novamente: preservou os outlets publicados.
- Navegador: layouts de desktop e celular inspecionados, sem rolagem horizontal no celular; abertura do produto manteve `?store=nintendo-barato-demo` e exibiu o player original de Bananza com autoria Coelho no Japão.
- Ajustes encontrados no teste: logos agora usam contain; cards não exibem o restante do texto após o primeiro parágrafo; destaque prioriza o motivo de recomendação; status interno de catálogo deixou de ocupar o lugar do preço; os fallbacks de preço passam pela tradução em todas as vitrines; zero avaliações não é mais apresentado como nota “Mistas”.

Os 10 testes de integração de importação Nintendo e persistência passaram em um banco exclusivo de validação. O caso baseado na galeria pública de Bananza verifica as URLs exatas da capa, seis screenshots e dois trailers, a gravação no PostgreSQL e os dados públicos da vitrine. A fixture é reduzida e fixa, sem dependência de rede da Nintendo no CI. Testes unitários também verificam a miniatura do trailer, isolamento entre regiões/NSUIDs e preservação dos vídeos quando a origem não os retorna.

A suíte completa de integração fica para o CI. ESLint e Prettier foram executados sobre os arquivos alterados; TypeScript sobre aplicação e scripts, excluindo diretórios locais de worktrees e artefatos.

Prints reais em `output/nintendo-creators/`: `nintendo-barato-mobile.png`, `digplay-mobile.png`, `coelho-review-mobile.png`, `nintendo-barato-desktop.png` e `digplay-desktop.png`.

## Trailers Nintendo

O importador agora inclui os assets de vídeo da galeria do produto, que antes eram descartados. As URLs MP4 e miniaturas JPG são da CDN pública assets.nintendo.com; o player HTML5 existente reproduz diretamente dessa origem. São preferidos os vídeos brasileiros, com fallback apenas para outra região do mesmo NSUID. IDs de outro produto e caminhos inválidos são recusados. Uma atualização sem trailers na origem preserva vídeos previamente cadastrados.

Nesta demonstração: Bananza 2 trailers, Mario Kart World 3, Pikmin 4 7 e Celeste 1. Mario Maker 2 não possui trailers nas galerias BR/US consultadas; o seed adiciona como complemento editorial o trailer oficial da Nintendo of America (https://www.youtube.com/watch?v=AjJWzJC8Kfk). Esse complemento não é apresentado como uma descoberta automática da eShop. Reviews do Coelho continuam separadas dos trailers.

Validação: 29 testes direcionados aprovados, TypeScript aprovado, URLs de vídeo dos quatro jogos responderam HTTP 200 video/mp4. Reprodução real de Bananza confirmada no navegador, com duração de 47,88 segundos, readyState 4 e reprodução avançando.
