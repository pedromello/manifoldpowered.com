# Curadoria com a CLI

Execute a partir da raiz do checkout Manifold. `manifold` pode ser substituído por `npm run --silent cli --` ou pelo build em `tools/cli/dist/index.js`. Use o perfil do pedido; os nomes e jogos abaixo são exemplos, não recursos para criar automaticamente.

## Importar o que falta

Consulte `games list --q ...` e `games get --slug ...` antes de importar. Steam aceita App ID ou URL de produto; Nintendo aceita as páginas BR/US suportadas pelo importador. Consulte o schema atual para o formato de lote.

```sh
manifold games list --profile curador-coop --q Portal --json
manifold games import steam --profile curador-coop --reference 620 --wait --timeout 120 --json
manifold games import batch --profile curador-coop --input jogos.json --wait --json
```

Lotes são sequenciais por padrão e cada item pode concluir, falhar ou permanecer pendente. Preserve a referência original e o operation ID retornado. A deduplicação pertence ao backend. Importar não concede propriedade de studio ou licença do jogo; criar studios é independente.

## Criar a identidade

Consulte `outlets options` e `schema outlets create`. Prepare nome, descrição, logo, capa, tagline e os tokens disponíveis. Não envie uma paleta ou layout inventado. Exemplo de input sem segredos:

```json
{
  "name": "Clube da Descoberta",
  "description": "Uma seleção independente por IA, pesquisada em fontes oficiais, para escolher a próxima sessão entre amigos.",
  "logo_url": "https://example.test/logo.png",
  "cover_url": "https://example.test/capa.jpg",
  "tagline": "Escolha a aventura da próxima chamada.",
  "layout_preset": "community",
  "brand_tokens": {
    "palette": "ember",
    "typography": "rounded",
    "shape": "pill"
  }
}
```

Substitua URLs ilustrativas por mídias reais disponíveis. Execute `outlets create --profile ... --input outlet.json --json` e use o slug devolvido, sem deduzi-lo do nome.

## Inicializar catálogo e destaques

Leia `outlets get` e obtenha `draft_revision`. `catalog set` é o inicializador de uma outlet ainda UNDECIDED: aplique-o **antes** de definir um modo explícito. HANDPICKED precisa de pelo menos cinco jogos elegíveis; FOCUSED usa tags. O servidor inicializa SELECTED quando apropriado.

```json
{
  "slug": "slug-retornado",
  "strategy": "HANDPICKED",
  "game_slugs": ["jogo-1", "jogo-2", "jogo-3", "jogo-4", "jogo-5"],
  "expected_draft_revision": 1
}
```

Os slugs e a revisão são ilustrativos: leia os valores reais. Não use esse inicializador para substituir uma curadoria existente. Para manutenção, use `catalog add/remove/reset`, regras `tags`, ou `catalog bulk preview/apply`. `catalog list` sem filtro é uma visão de gerenciamento do catálogo global; use `--status IN_OUTLET` e todas as páginas para contar membros da loja.

Configure entre um e três destaques com razões específicas, usando a revisão observada mais recente:

```json
{
  "slug": "slug-retornado",
  "expected_draft_revision": 2,
  "recommendations": [
    {
      "game_slug": "jogo-1",
      "recommendation_reason": "Explique por que este jogo atende a uma situação concreta do público da outlet."
    }
  ]
}
```

Execute `outlets featured set --profile ... --input destaques.json --json`. Não copie revisões de um exemplo ou estime o próximo número em concorrência; use o valor confirmado após cada mudança ou releia o rascunho.

## Configurar a escala e dar notas

```sh
manifold outlets ratings options --json
manifold outlets ratings get --profile curador-coop --slug slug-retornado --json
manifold outlets ratings preview --profile curador-coop --slug slug-retornado --target-scale STARS --revision REVISAO_OBSERVADA --json
manifold outlets ratings set --profile curador-coop --slug slug-retornado --target-scale STARS --revision REVISAO_OBSERVADA --json
```

`options` lista todos os valores válidos das três escalas; `get` retorna a escala atual e a revisão privada. A primeira configuração não precisa de mapping. Se já houver notas, mudar de escala converte o conjunto: faça preview, reveja o impacto e envie um mapping completo de cada valor da escala de origem para a de destino. Preserve somente `from` e `to` em cada entrada; o `count` do preview é diagnóstico e não pertence ao input do set. Não aplique automaticamente sugestões de conversão se o pedido não autorizar essa mudança.

Use o comando específico por jogo para atribuir ou remover uma nota **preservando headline e body existentes**:

```json
{
  "slug": "slug-retornado",
  "game_slug": "jogo-1",
  "rating": { "scale": "STARS", "value": 4.5 },
  "expected_draft_revision": 3
}
```

```sh
manifold outlets ratings game set --profile curador-coop --input nota.json --json
manifold outlets ratings game get --profile curador-coop --slug slug-retornado --game-slug jogo-1 --json
```

`rating: null` remove a nota e conserva o texto. Sem texto nem nota, o servidor pode rejeitar o registro vazio; remover a análise inteira é uma operação distinta (`editorial remove`). Uma nota deve usar a escala já configurada, com justificativa adequada ao papel da outlet. Escalas válidas: STARS (0–5, passos de0,5), NUMERIC_10 (0–10, passos de0,5), TIER (valores listados em options). Notas são do rascunho até sua publicação; confira `outlets editorial public` e os cards publicados para validar a exibição real.

## Escrever editoriais

`outlets editorial set` recebe `slug`, `game_slug`, `headline` opcional, `body`, `rating` opcional e `expected_draft_revision`. Consulte o schema atual. Headline tem até120 caracteres e body até2.000. Esse PUT substitui o texto: para alterar somente a nota, prefira `ratings game set`. O backend admite nota sem texto e preserva nota omitida quando já existe; `rating: null` solicita sua remoção, respeitando a validação do registro final. Respeite o sistema configurado na outlet e o julgamento solicitado; não gere notas apenas para aumentar atividade.

Um texto útil explica para quem o jogo faz sentido, o que o diferencia e um fator concreto a considerar; inclua a fonte oficial e declare a base de pesquisa da curadoria. Evite copiar a descrição da loja e repetir o mesmo texto em todos os jogos. Preserve surpresas em jogos de investigação. Reviews da conta usam `reviews eligibility` antes de `reviews create/update`; permissão negada não pode ser contornada com aquisição fictícia.

## Verificar, publicar e conferir o público

```sh
manifold outlets readiness --profile curador-coop --slug slug-retornado --json
manifold outlets verify --profile curador-coop --slug slug-retornado --check-images --json
manifold outlets preview --profile curador-coop --slug slug-retornado --json
```

Readiness valida descrição/logo, identidade visual explícita, catálogo intencional, cinco jogos elegíveis e destaques válidos. Verify acrescenta contagens, avisos de texto duplicado e disponibilidade de imagens. Corrija os blockers; não confunda `warnings` com erro nem imagem disponível com boa composição. Inspecione a prévia quando o pedido inclui qualidade visual.

Publique somente quando essa ação fizer parte do pedido, com a revisão efetivamente verificada:

```sh
manifold outlets publish --profile curador-coop --slug slug-retornado --revision REVISAO_OBSERVADA --json
```

Os comandos a seguir consultam o snapshot público. Catálogo/destaques/editorial públicos sempre omitem cookies e parâmetros de prévia, mesmo com perfil selecionado:

```sh
manifold outlets public --profile curador-coop --slug slug-retornado --json
manifold outlets catalog public --profile curador-coop --slug slug-retornado --limit 100 --json
manifold outlets featured public --profile curador-coop --slug slug-retornado --json
manifold outlets editorial public --profile curador-coop --slug slug-retornado --game-slug jogo-1 --json
```

Confira PUBLISHED, revisão publicada, catálogo, razões dos destaques e textos públicos. Percorra todas as páginas. A leitura privada `editorial get` consulta o rascunho, portanto não prova publicação. Novas edições do rascunho preservam o snapshot público até nova publicação.

Ao atualizar identidade, envie a revisão observada; a CLI usa If-Match. Para bulk, faça preview, preserve o payload/fingerprint e use um operation ID novo para aquela operação. Só reutilize esse mesmo ID com payload idêntico quando a recuperação idempotente for apropriada. `unpublish` precisa de revisão e de intenção correspondente no pedido.
