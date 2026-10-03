# Decisões vigentes — MVP mínimo público

**Decidido por Pedro:** somente descoberta de jogos públicos; detalhe factual mínimo permitido; sem login/OAuth/reviews no MVP. Implementação/checks locais e commit/push isolado + PR draft para preview autorizados; push aguarda confirmação do ambiente não produção. PRIVATE não é público nem acessível por possuir link/slug; regras de criador/admin seguem no domínio autenticado, sem construir acesso privado no plugin.

## Duas pendências operacionais

1. **Endpoint de teste real:** Pedro escolheu PR draft para preview Vercel do repo existente. Antes do push, confirmar banco/serviços Preview de homologação e branch fora de produção; leitura Vercel retornou 403 e não foi contornada. Depois verificar SHA/deploy/HTTPS/proteção e conexão real. [Gate e evidências](09-preview.md).
2. **Exposição pública final:** revisar direitos/conteúdo do catálogo, metadata/suporte/identidade Peach e elegibilidade antes de submeter. Sem comércio/checkout/links de compra; aprovação de diretório não está garantida.

Defaults técnicos proporcionais: duas tools noauth/read-only, quatro campos factuais, q/tags/locale e paginação limitada; sem UI, descrição livre, personalização ou ordenação por preço. Critério MVC: adaptador coordena models pequenos; integração/caso de uso verifica resultado da composição. Não criar tooling/camadas genéricas como requisito.

OAuth/Supabase/Auth0, vínculo, revogação, rascunho/aprovação/publicação e edição de reviews ficam explicitamente posteriores. As cinco perguntas D1–D5 abaixo são histórico e não bloqueiam o MVP atual. A decisão PRIVATE permanece vigente; a interpretação de criador e 404 continua com as ressalvas registradas.

## Histórico supersedido — decisões do plano anterior

# Decisões abertas e alternativas

**Nada nesta tabela é decisão tomada por Pedro.** Gestão Peach é premissa do pedido; donos abaixo são responsabilidades propostas. O [resumo](../../manifold-mcp-plan.md) é a pauta de conversa; estes detalhes explicam as consequências.

## Decisão já tomada: PRIVATE não é público

Pedro definiu depois da primeira entrega: jogo PRIVATE não pode ser visto pelo público nem por quem só tem link/slug; leitura privada somente para criador/proprietário e administrador conforme papéis reais. Não ampliar para afiliados, proprietários/membros de Outlet ou delegates automaticamente. Scopes OAuth não concedem essas permissões. Aplicar consistência em busca, detalhe e dados relacionados; MCP sem autenticação nunca expõe PRIVATE. Essa regra está fechada e não é uma sexta decisão em aberto.

**Mapeamento verificado e detalhe ainda aberto:** User tem features; `read:game:any` é a capability de leitura admin usada no backoffice. Game referencia estúdio desenvolvedor, cujo `owner_id` referencia User; não registra o indivíduo que cadastrou o Game. Recomenda-se o proprietário do estúdio como interpretação operacional de criador/proprietário, mas confirmar se Pedro pretende o autor individual original, que não é identificável nesse schema. Não hardcode Pedro ou use `can(update:game/update:studio)` para ampliar leitura: esses checks aceitam membros. [Evidências](01-evidencias.md#private-papeis).

**Detalhes pendentes:** código HTTP para negação (404 é recomendação para ocultar existência); UX/entrada autenticada de owner/admin; interpretação operacional de criador e casos de ausência/mudança do estúdio. Recomenda-se manter tools públicas do MVP sem leitura privada e usar superfície protegida do site. Criador/admin não ganham permissão de publicar review de PRIVATE. A regra de INACTIVE não é alterada por essa decisão.

**Correção futura, sem implementação:** o teste de detalhe anônimo espera 200 para PRIVATE; a lista de jogos do estúdio também espera 200 incluindo PRIVATE para membro com `update:studio`. Ambas as expectativas devem ser caracterizadas e ajustadas à nova regra, preservando owner/admin positivos e sem executar/configurar permissões nesta rodada. [Casos de aceite](05-testes-ci.md#private-casos).

## Cinco escolhas que continuam abertas

| ID / pergunta para debate                                                        | Recomendação provisória                                                                                | Alternativas e tradeoffs                                                                                                                                                                                 | Evidência/critério para fechar                                                                                  | Responsável proposto             |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| D1 — Recorte independente de descoberta/reviews, sem comércio digital no plugin? | Manter; remover preço/ofertas/CTA e aquisição da superfície MCP                                        | Links informativos exigem revisar destino/conteúdo; link com compra/checkout não é alternativa elegível para contornar restrição. Site independente segue fora do escopo                                 | Revisar DTO/metadata/UI e política vigente; direitos do catálogo e conteúdo apropriado também pendentes         | Pedro + Peach                    |
| D2 — Onde o usuário aprova?                                                      | Página dedicada Manifold + publicação idempotente após aceite                                          | “Aprovar e publicar” no mesmo clique reduz uma chamada e combina compromisso; UI no chat reduz troca de contexto, mas exige prova de canal/host. Confirmação host sem prova backend não atende requisito | Testar prévia exata, conta correta, edição entre GET/POST, CSRF e link encaminhado; demonstrar UX no host       | Pedro + produto/engenharia Peach |
| D3 — Qual granularidade de consentimento e prazo de revogação?                   | Separar rascunho/publicação se provider suportar; vínculo/grant local revogável, escrita falha fechada | Consentimento único simplifica Supabase, exige política local explícita. JWT curto sem online check admite janela após revoke IdP; check online custa disponibilidade/latência                           | Fixar prazo aceito; sandbox confirma scopes/resource/refresh/revoke e informa custo/limites; então escolher IdP | Pedro + engenharia Peach         |
| D4 — Alterar review já publicada na primeira versão?                             | Primeiro create + editar rascunhos; manter conflito para review existente                              | Update exige prévia identificada como substituição, alvo/revisão, CAS/locks compartilhados com PATCH web e contadores corretos. Mais valor para quem já avaliou, maior teste de concorrência             | Pedro define necessidade da jornada; se incluir, E2 + teste entre superfícies/conflito são aceites mínimos      | Pedro + produto                  |
| D5 — Manter review de ONLY_DISPLAY sem biblioteca?                               | Preservar regra atual e explicar entitlement versus experiência                                        | Exigir prova de posse externa introduz integração não existente e atrito; usar declaração de experiência do jogador não comprova compra. Não alterar regra de domínio silenciosamente                    | Decisão de produto; manter teste E1:165 se preservada; qualquer mudança requer caracterização explícita         | Pedro                            |

## Detalhes subordinados às cinco decisões

- **Vínculo inicial:** navegador comprova ambas as contas, sem match por email; conta apenas OTP continua válida. Cadastro automático/migração de senha ficam fora do desenho baseline. Supabase/Auth0 não autorizam substituir Users por convenience de SDK.
- **Retenção/validade:** hipótese inicial de aprovação 10 minutos e draft 24 horas para debate. Definir retenção após publicação, cancelamento e exclusão da conta, audit trail mínimo e privacidade antes de armazenar feedback. Não inventar obrigação legal de prazo; responsável Peach.
- **Hospedagem/SDK:** adaptar Node/Pages Router primeiro; verificar duração/stream/proxy e versão de MCP com cliente real. Serviço separado só com incompatibilidade demonstrada. Não impor Supabase Edge Functions ou Sites porque skill traz um default.
- **Descoberta/região:** catálogo inicial independente de preço, mantendo locale informado. Validar se há restrições editoriais/territoriais reais além de status; não usar ausência de preço como prova universal de invisibilidade. Não expor jogos indisponíveis legalmente por remover pricing. Essa regra extra não foi demonstrada no código.
- **Peach/submissão:** confirmar titular verificado, marca/domínios, suporte, política de privacidade, retenção e direitos de conteúdos/fontes de catálogo. Conta de demonstração precisa viabilizar review sem passos externos imprevisíveis; revisar exigência atual sobre OTP/MFA de conta de review. Nenhuma conta será criada nesta rodada.

## Como debater sem overengineering

Começar com exemplos: A relatou “gostei da exploração; combate repetitivo; recomendo” → prévia literal aprovada → uma review; B tenta publicar o draft de A → nenhuma escrita; A muda recomendação após aprovar → aprovação perdida; status vira PRIVATE → publicação negada; chamada perde resposta → uma review e resultado recuperado.

Uma implementação futura só avança quando o caso de uso e testes correspondentes forem claros. Domínio compartilhado vem antes de wrapper MCP; comparações de provider dependem dos requisitos decididos, não de preferência de stack. Se o caminho simples satisfaz invariantes e jornada, não adicionar camadas genéricas de aprovação ou integração.

**Não dependem de nova escolha:** não inventar experiência; preview exata; aprovação verificada no servidor; auth/isolamento; scopes não elevam domínio; revalidação na publicação; retry sem duplicação; catálogo filtrado/allowlist; preservação da frente de checkout. Esses requisitos vieram do pedido.
