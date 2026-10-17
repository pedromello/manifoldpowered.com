---
name: manifold-cli
description: "Operar a plataforma Manifold pela CLI: autenticar contas reais em local, hml ou produção, importar Steam/Nintendo e criar, personalizar, verificar e publicar outlets. Use também para manutenção de catálogo, editoriais, reviews elegíveis e execução de curadores paralelos. Para apenas descobrir jogos públicos, prefira o catálogo Manifold conectado."
---

# Manifold CLI

Use a CLI do repositório `pedromello/manifoldpowered.com` para operar com as permissões reais da conta. O pedido do usuário determina ambiente, conta, recursos e publicação; esta skill não concede autorização adicional nem exige reconfirmação do que já foi autorizado.

## Preparar e descobrir

Localize o checkout com `tools/cli/package.json`. Trabalhe na raiz dele. Se as dependências ainda não estiverem instaladas, use `npm ci`; para o executável compilado, use `npm run cli:build`. O pacote usa Node 24; confira `package.json` para a versão exigida.

Nos exemplos, `manifold` representa o executável instalado ou `node tools/cli/dist/index.js`. Sem instalação global, use `npm run --silent cli -- ...`. O `--silent` impede mensagens do npm fora do resultado JSON. Não dependa de um caminho específico desta máquina.

```sh
npm run --silent cli -- --help
npm run --silent cli -- schema outlets create --json
npm run --silent cli -- outlets options --json
```

Consulte `schema <comando> --json` antes de usar campos desconhecidos. O schema informa o input, o contexto exigido e os campos exclusivos de stdin. Prefira `--json` e `--input -` ou um JSON de conteúdo sem segredos. Campos de input usam nomes da API, como `game_slugs` e `expected_draft_revision`; flags usam hífens.

## Fixar ambiente e conta

- Local: `http://localhost:3000` por padrão; admite outro loopback/porta.
- Hml: exige a origem HTTPS real. Descubra a implantação pelo plugin Vercel quando necessário; não invente uma origem ou use a de produção como hml.
- Produção: origem canônica fixa `https://www.manifoldpowered.com`. `env connect --env prod` aplica essa origem; credenciais não atravessam redirects.

Uma conexão apenas valida o ambiente; autenticação e publicação são operações independentes. Mutações exigem `--env` e `--account`, ou um `--profile` explícito que forneça ambos.

Para curadores paralelos, atribua um perfil imutável e um alias distintos por conta. Cada agente recebe o próprio perfil explicitamente em todos os comandos. Não use `auth use` ou a seleção global como mecanismo de isolamento.

```sh
manifold profiles create --name curador-coop --env prod --account curador-coop --json
manifold env connect --profile curador-coop --json
manifold auth whoami --profile curador-coop --json
```

Se um perfil já existir, leia `profiles list` e confira sua vinculação; não o redefina. Mudanças de origem ou conta exigem outro perfil. Importações alimentam o catálogo compartilhado; outlets, seleções e editoriais têm dono. Não use SQL, impersonação ou privilégios administrativos para contornar permissões.

## Cadastro, ativação e login

Use contas reais e e-mails/aliases de uma caixa sob controle do usuário. Cadastro tem `password: null` por padrão. Consulte os schemas de `users register`, `users activate`, `auth login request` e `auth login verify`.

1. Cadastre com username e email. Guarde a pendência, o destinatário e o horário da solicitação.
2. Leia a mensagem correta na caixa conectada, conferindo destinatário, tipo e horário; caixas podem agrupar aliases na mesma conversa. Em local, prefira `--mailcatcher --wait`.
3. Envie `activation_url` exclusivamente por stdin e confirme `auth whoami`.
4. Para entrar novamente, solicite OTP; forneça `code` via stdin. Login por senha é opcional, com `email` e `password` também via stdin.

Senha, OTP, token de sessão e o link inteiro de ativação — inclusive o UUID no caminho — são segredos. Não os coloque em flags, arquivos, variáveis de shell interpoladas, histórico, logs ou relatórios. Use stdin com entrada sem eco. Diagnósticos de e-mail devem conter apenas IDs, cabeçalhos e horários. Se o conector redigir o código, não tente revelar o valor com formato raw, decodificação ou outro canal técnico; use a leitura normal autorizada da mensagem ou solicite entrada segura do usuário.

Sessões persistem no cofre do sistema, em namespace da CLI. Sem cofre, uma sessão existente pode vir das variáveis de processo vinculadas a ambiente/origem/conta e, se aplicável, perfil; consulte `docs/agent-cli.md` no checkout. Nunca imprima seus valores. `auth logout --profile ...` revoga somente a sessão indicada.

## Curadoria e publicação

Para criar ou manter uma outlet, leia [o fluxo de curadoria](references/curadoria.md). Ele contém a sequência de inicialização, revisões, verificação pública e limites das reviews.

Pesquise fontes oficiais para mecânicas, modos, idiomas e requisitos. Use imagens HTTPS pertinentes e uma identidade coerente com o nicho. A verificação de imagens mede disponibilidade, não qualidade visual: inspecione a página real para avaliar composição, legibilidade e mobile.

`outlets ratings options/get/preview/set` expõe as escalas e sua configuração/conversão. Use `outlets ratings game get/set` para dar ou remover uma nota sem substituir o texto editorial. Leia o fluxo referenciado antes de converter notas existentes; o mapping do set leva somente `from/to`, sem o `count` diagnóstico do preview.

Identifique curadoria por IA quando esse for o papel da conta. Não invente experiência pessoal de jogo, afiliação oficial, perfis sociais ou notas comunitárias. Editoriais da outlet são diferentes de reviews da conta; estas dependem da elegibilidade real devolvida pelo servidor.

## Named, shareable game selections

Use `outlets selections` for named collections with their own page, rather than
the whole-catalog `outlets catalog` commands. Consult
`schema outlets selections create --json` and the checkout's
`docs/agent-cli.md#named-game-selections` before operating. The matching selection
API and migration must be deployed in the target environment; local CLI support
alone does not install server features.

An input uses `slug` for the outlet and `selection_slug` for the collection,
plus `title`, `description`, `cover_url`, optional `image_urls` and ordered
`game_slugs`. Commands: `list`, `get`, `create`, `update`, `games set`, `readiness`,
`preview`, `publish`, `unpublish`, `public`, and `discover`. A game may be in
multiple selections. Mutations require the selection's own inspected
`expected_draft_revision`, not the parent outlet revision. Keep an explicit
profile/account context for each curator.

Publish the outlet and its catalog first, then inspect selection readiness,
preview and publish if authorized. Confirm `public`, its URL and published
revision anonymously. A draft edit preserves the live edition. Withdrawing a
selection or its outlet hides the public page. Resolve 409 conflicts through
fresh reads; do not retry writes automatically. Preserve account boundaries and
never bypass game eligibility.

## Recuperação e resultado

Leia `state`, `data`, `error`, `next_action`, `execution_id` e o código de saída; não considere apenas HTTP ou exit0 como prova de publicação. Exit0 também pode ser cadastro/OTP aceito com pendência. Exit1 é falha ou lote parcial; exit2 é entrada inválida; exit3 é timeout de uma operação ainda pendente.

- Imports aceitos: acompanhe `operation_id` com `games import status` ou `runs resume`; não ressubmeta a referência para tentar acompanhar.
- Conflito409: releia o rascunho e reveja a intenção antes de editar com a nova revisão.
- Timeout, 5xx ou412 de escrita podem ocorrer depois de uma alteração aplicada. `mutation_outcome: unknown` exige consulta ao recurso/journal antes de qualquer nova escrita. Não interprete412 como prova de que nada mudou.
- `mutation_outcome: applied` com próximo passo de readiness significa que a edição foi aceita e a leitura posterior falhou: repita apenas a leitura.
- Previews de tags/lotes são leituras mesmo usando POST; falhas transitórias podem ser repetidas de forma limitada conforme `retryable`. Isso não autoriza repetir o apply.

Registre recursos, URLs, referências importadas, IDs de operação e revisões em um relatório proporcional ao pedido. Quando incluir e-mails de contas, mantenha o relatório em local privado fora do Git. Nunca inclua segredos. Relate falhas parciais e pendências com o próximo comando útil. Ao publicar, confirme a versão anônima e devolva sua URL pública e revisão.
