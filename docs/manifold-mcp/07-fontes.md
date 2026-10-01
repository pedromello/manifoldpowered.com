# Fontes vigentes do MVP noauth

Reconsultadas em 2026-10-01 UTC para o escopo reduzido. [OpenAI Authentication](https://developers.openai.com/plugins/build/auth), seções Authenticate your users e Triggering authentication UI, confirma modo anônimo read-only e securitySchemes com type noauth por tool. Isso dispensa OAuth/login para este catálogo público; não autoriza dados privados.

[Build MCP server](https://developers.openai.com/plugins/build/mcp-server) orienta tools com schemas/anotações, structuredContent e utilidade sem UI; endpoint Streamable HTTP e HTTPS estável para publicação. [Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt) descreve endpoint HTTPS ou Secure MCP Tunnel em developer mode, cuja disponibilidade depende de conta/política do workspace. Túnel de teste não substitui HTTPS público de submissão.

[SDK oficial v2](https://github.com/modelcontextprotocol/typescript-sdk) é a linha estável da revisão 2026-07-28. [HTTP](https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html) documenta createMcpHandler per-request e adaptador Node; [legacy clients](https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients.html) permite fallback stateless para 2025. Sem garantia de versão efetivamente usada pelo host até testar.

Plano original de conexão posterior (atualização Vercel e autorização de PR draft em [preview](09-preview.md)): disponibilizar build aprovado em runtime Node com DB e HTTPS autorizado em /api/mcp; não apontar produção por suposição. Conferir Host/Origin/proxy, ausência de redirect de locale/login e streaming/JSON; Inspector lista/call as duas tools anonimamente. Em ChatGPT, habilitar developer mode conforme política, adicionar endpoint/túnel pelo fluxo vigente, revisar tools e testar busca/seguimento/slug privado/pedido de compra. Registrar protocolo, inputs/outputs e resultado; não criar contas/deploy nem declarar sucesso no host agora.

**Elegibilidade separada:** catálogo factual independente, sem preço/ofertas/checkout/links de compra; [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines) permanece requisito. SDK/local noauth tecnicamente viável não determina aprovação da OpenAI, direitos do catálogo ou disponibilidade da infraestrutura.

## Histórico de fontes — escopo de reviews/OAuth supersedido

As fontes abaixo foram consultadas para o primeiro plano; contratos de OAuth/provedores/aprovação pertencem à etapa posterior e não são dependências do MVP atual.

# Fontes oficiais e validade das conclusões

Consultadas em **2026-10-01 UTC**. Somente documentação de OpenAI, MCP e provedores foi usada para os contratos externos. URLs antigas Apps SDK redirecionaram para Plugins; não confundir com o antigo protocolo `ai-plugin.json`/OpenAPI. As regras e docs podem mudar; reconsultar antes de implementar/submeter.

## OpenAI e MCP

| ID  | Fonte primária                                                                                                                                                                                                                         | Uso neste plano                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines), Commerce and monetization, Privacy, MCP requirements                                                                                                     | Restrição de digital/links transacionais; minimização e anotações; não concede elegibilidade automática ao Manifold                                                                                        |
| S2  | [Authentication](https://developers.openai.com/plugins/build/auth)                                                                                                                                                                     | Contrato do host: PKCE, resource, registro, callback por modo; suporte de provider precisa ser provado                                                                                                     |
| S3  | [MCP Authorization 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) e [Client Registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration) | Resource server/metadata, validação de token, ordem CIMD/pré-registro/DCR e limites de refresh                                                                                                             |
| S4  | [Security & Privacy](https://developers.openai.com/plugins/guides/security-privacy)                                                                                                                                                    | Confirmação humana e validação server-side; sem recibo universal de gesto humano definido nessa fonte                                                                                                      |
| S19 | [Define tools](https://developers.openai.com/plugins/plan/tools)                                                                                                                                                                       | Operações com entradas/efeitos claros e anotações; evitar executor genérico e efeitos ocultos                                                                                                              |
| S20 | [Build MCP server](https://developers.openai.com/plugins/build/mcp-server)                                                                                                                                                             | Superfície mínima, perfil opcional, metadados e elicitation; SDK não substitui políticas                                                                                                                   |
| S21 | [Remote MCP server review requirements](https://developers.openai.com/plugins/deploy/app-review)                                                                                                                                       | Identidade de publicação, testes/demonstração e acesso de revisão. Há exigência de conta de teste utilizável sem MFA/etapas de verificação como email; resolver em sandbox, sem enfraquecer usuários reais |
| S22 | [Streamable HTTP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)                                                                                                                | Transporte atual e segurança de Origin; compatibilidade com versões antigas deve ser deliberada                                                                                                            |
| S23 | [Elicitation 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)                                                                                                                                  | Form/URL/capability, correlação de estado e identidade; URL accept não significa conclusão da ação                                                                                                         |

**Mudança relevante na especificação atual:** transporte 2026-07-28 removeu GET stream e sessões de protocolo; interações server→client passam pelo mecanismo multi round-trip. Não implementar inicialização/sessões de versões antigas como se fossem contrato único atual. Negociar versão/headers e testar compatibilidade necessária com ChatGPT/SDK; ler doc não demonstra versão efetivamente suportada no host. [S22](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).

**Aplicação da política ao produto (inferência):** venda/compra de jogos digitais e giftcards digitais não cabe no recorte de comércio permitido. Por isso o plano exclui compras e links que as iniciem; a viabilidade do endpoint de compra no site não altera elegibilidade do plugin. Não se encontrou regra que autorizasse essa exceção. [S1](https://developers.openai.com/plugins/plugin-guidelines).

## Supabase Auth

### S5

[OAuth 2.1 Server overview](https://supabase.com/docs/guides/auth/oauth-server): servidor OAuth/OIDC com PKCE, consentimento e usuários Supabase. “Usar usuários existentes” nessa documentação não significa que os Users próprios deste repo já estejam no provedor.

### S6

[OAuth 2.1 Flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows): fluxos authorization code/refresh, claims e scopes padrões. A fonte diz que custom scopes não estão disponíveis; exemplo de audience é `authenticated`. Requer rechecagem antes da escolha.

### S7

[MCP Authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication): discovery, pré-registro/DCR, rotação e middleware. Não basta copiar exemplo que acessa Supabase APIs para proteger Prisma/Manifold.

### S8

[Token Security & RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security): client_id e hooks para audience/claims. Hook por cliente não demonstra suporte completo a resource indicators; não usar user_metadata editável como autoridade.

### S9

[Getting Started](https://supabase.com/docs/guides/auth/oauth-server/getting-started): UI de consentimento e redirect de cliente com match exato. Não houve configuração de projeto nesta rodada.

### S16

[User sessions](https://supabase.com/docs/guides/auth/sessions): refresh/session e limitação de revogação do JWT; checar session_id para exigência forte em ações sensíveis. Não confundir session_id Supabase com cookie opaco Manifold.

### S24

[Changelog](https://supabase.com/changelog) e [mudança OAuth token HTTP 200](https://supabase.com/changelog/45468-breaking-change-oauth-token-endpoint-will-return-http-200-instead-of-201): desde 2026-06-01, resposta de token é 200 em vez de 201. O índice `.md` não ficou acessível; changelog HTML e entrada específica foram consultados. Não copiar assertions 201 da API Manifold para token endpoint. API exposure/RLS só seriam tema adicional se DB/Data API fossem usados, sem migração proposta aqui.

## Auth0

### S10

[Authorization Code Flow with PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce): fluxo candidato. Provar configuração S256/redirect/reuse no ambiente escolhido.

### S11

[API Scopes](https://auth0.com/docs/get-started/apis/scopes/api-scopes): scopes customizados e consentimento de terceiros. Scopes Manifold no plano são candidatos; não features já concedidas.

### S12

[Register Applications with CIMD](https://auth0.com/docs/get-started/auth0-overview/create-applications/register-applications-with-cimd) e [Tenant Settings](https://auth0.com/docs/get-started/tenant-settings): importação **manual** de CIMD, métodos none/private_key_jwt e compatibility profile para resource. A publicidade da capability não prova registro automático de URL arbitrária nem compatibilidade da configuração concreta.

### S13

[Dynamic Client Registration](https://auth0.com/docs/get-started/applications/dynamic-client-registration) e [Third-party security controls](https://auth0.com/docs/get-started/applications/third-party-applications/security-controls): DCR opcional, PKCE obrigatório e grants explícitos/permissões de terceiros. Não habilitar DCR irrestrito por suposição.

### S14

[Auth for MCP](https://auth0.com/ai/docs/mcp/overview) e [Validate Access Tokens](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens): papéis e proteção por token destinado à API, não ID token genérico.

### S15

[Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation): troca de refresh e detecção de reuso; comportamento real depende de settings e contrato de cliente.

### S17

[Revoke Refresh Tokens](https://auth0.com/docs/secure/tokens/refresh-tokens/revoke-refresh-tokens): revoke/grant e configurações de alcance. Não assumir que todo JWT já emitido deixa de ser aceito imediatamente pelo nosso backend.

### S18

[User Account Linking](https://auth0.com/docs/manage-users/user-accounts/user-account-linking): prova de ambas as contas e risco de vinculação insegura. Não usar como autorização para fazer merge/migrar contas Manifold.

## Pendências de validação externa

Não houve teste de OAuth/ChatGPT, login em tenant/projeto, leitura de preços/plano comercial ou análise de direitos de catálogo. CIMD Supabase e propagação resource→aud nas duas etapas não foram confirmados nas páginas lidas; tratar como pendência, não ausência absoluta de capacidade. Auth0 manual CIMD/resource está documentado, mas configuração concreta ainda não foi provada. Não prometer compatibilidade por nome de produto.

Antes de selecionar provider/submeter: verificar documentos vigentes, versão de SDK, callback/issuer do modo real, emissão de AT, grants/scopes, refresh/revogação, vínculo de User existente e aprovação humana no sandbox. Guardar resultado mínimo redigido por cenário da [matriz](05-testes-ci.md), sem credenciais em repo/artifacts.
