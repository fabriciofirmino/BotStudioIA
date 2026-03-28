# StudioFlow — Plano de Testes E2E

## Visão Geral

Este plano cobre o teste end-to-end de todo o fluxo do StudioFlow,
desde o recebimento de mensagens WhatsApp até a execução dos cron jobs.

---

## Pré-requisitos

### Serviços Necessários

| Serviço              | Comando                                       | URL padrão                |
|----------------------|-----------------------------------------------|---------------------------|
| Cloudflare Worker    | `cd apps/worker-whatsapp-agent && wrangler dev` | http://localhost:8787    |
| Supabase local       | `supabase start`                              | http://localhost:54321    |
| Edge Functions       | `supabase functions serve`                    | http://localhost:54321/functions/v1 |
| Evolution API (mock) | Mock server ou instância real                 | http://localhost:8080     |

### Variáveis de Ambiente

Copie `.env.example` para `.env.test` e preencha:

```bash
WORKER_URL=http://localhost:8787
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<sua-key>
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=<sua-key>
ANTHROPIC_API_KEY=<sua-key>
WEBHOOK_SECRET=test-webhook-secret
EDGE_FUNCTION_URL=http://localhost:54321/functions/v1
```

### Mock da Evolution API (Recomendado)

Para testes locais, use um servidor mock que capture mensagens enviadas:

```bash
# Exemplo com json-server ou servidor HTTP simples
# que aceite POST em /message/sendText/{instance} e retorne 200
```

---

## Suítes de Teste

### 1. `01-webhook-basic.test.ts` — Webhook Básico

**Objetivo**: Validar o comportamento fundamental do webhook.

| # | Cenário                              | Esperado                        |
|---|--------------------------------------|---------------------------------|
| 1 | Request sem header HMAC              | 401 Unauthorized                |
| 2 | Request com HMAC inválido            | 401 Unauthorized                |
| 3 | Request com HMAC válido              | 200 OK                          |
| 4 | Mensagem de grupo (@g.us)            | 200 + `{ignored: true}`         |
| 5 | Mensagem fromMe=true                 | 200 + `{ignored: true}`         |
| 6 | Unit não encontrada                  | 200 + `{ignored: true}`         |
| 7 | GET no /webhook                      | 405 Method Not Allowed          |
| 8 | POST em rota desconhecida            | 404 Not Found                   |

---

### 2. `02-agent-conversation.test.ts` — Fluxo de Conversa

**Objetivo**: Validar o ciclo completo de interação com o agente IA.

| # | Cenário                              | Esperado                                    |
|---|--------------------------------------|---------------------------------------------|
| 1 | Saudação                             | Agente responde com cumprimento              |
| 2 | Pergunta sobre serviços              | Agente chama `listar_servicos`, retorna lista |
| 3 | Pergunta sobre disponibilidade       | Agente chama `consultar_agenda`, mostra horários |
| 4 | Solicita agendamento completo        | Agente chama `criar_agendamento`, appointment no DB |
| 5 | Solicita cancelamento                | Agente oferece remarcação, depois cancela     |
| 6 | Follow-up sem contexto explícito     | Agente mantém contexto do histórico (KV)     |

---

### 3. `03-cron-confirmacao.test.ts` — Cron Confirmação

**Objetivo**: Validar a confirmação automática de agendamentos.

| # | Cenário                              | Esperado                                    |
|---|--------------------------------------|---------------------------------------------|
| 1 | Appointment PENDING existe           | Status → CONFIRMED, WhatsApp enviado         |
| 2 | Appointment já CONFIRMED             | Não processado (count = 0)                  |
| 3 | Nenhum appointment PENDING           | Retorna processed = 0                       |

---

### 4. `04-cron-lembretes.test.ts` — Cron Lembretes

**Objetivo**: Validar o envio de lembretes para o dia seguinte.

| # | Cenário                              | Esperado                                    |
|---|--------------------------------------|---------------------------------------------|
| 1 | CONFIRMED para amanhã                | WhatsApp de lembrete enviado                |
| 2 | CONFIRMED para hoje (não amanhã)     | Não processado                              |
| 3 | CANCELLED para amanhã                | Não processado                              |

---

### 5. `05-cron-noshow.test.ts` — Cron No-Show

**Objetivo**: Validar a detecção e tratamento de no-shows.

| # | Cenário                              | Esperado                                    |
|---|--------------------------------------|---------------------------------------------|
| 1 | CONFIRMED com endsAt > 30min atrás   | Status → CANCELLED, retroReason = 'no-show' |
| 2 | CONFIRMED com endsAt < 30min atrás   | Não processado (grace period)               |
| 3 | COMPLETED com endsAt > 30min atrás   | Não processado                              |
| 4 | Múltiplos no-shows simultâneos       | Todos processados corretamente              |

---

### 6. `06-cron-relatorio.test.ts` — Cron Relatório

**Objetivo**: Validar a geração de relatório diário.

| # | Cenário                              | Esperado                                    |
|---|--------------------------------------|---------------------------------------------|
| 1 | Unit aiEnabled + appointments hoje   | Relatório gerado por Claude, enviado WhatsApp |
| 2 | Unit aiEnabled + zero appointments   | Relatório com zeros, ainda enviado          |

---

### 7. `07-cron-remarketing.test.ts` — Cron Remarketing

**Objetivo**: Validar o envio de campanhas de marketing.

| # | Cenário                              | Esperado                                    |
|---|--------------------------------------|---------------------------------------------|
| 1 | Campaign ACTIVE + clients matching   | Mensagens personalizadas por Claude, enviadas |
| 2 | Campaign DRAFT ou PAUSED             | Não processada (count = 0)                  |
| 3 | Campaign ACTIVE + 0 clients          | Processada, messagesSent = 0                |

---

### 8. `08-full-flow.test.ts` — Fluxo Completo

**Objetivo**: Validar todo o ciclo de vida do cliente.

| Step | Ação                                | Verificação                                  |
|------|-------------------------------------|----------------------------------------------|
| 1    | Cliente envia "Olá" via WhatsApp    | Worker responde, 200 OK                      |
| 2    | Cliente agenda serviço              | Appointment criado no DB                     |
| 3    | Cron confirmação executa            | Status PENDING → CONFIRMED                   |
| 4    | Cron lembretes executa              | Reminder enviado (appointment é para amanhã) |
| 5    | Simula no-show (altera endsAt)      | Status → CANCELLED, retroReason = 'no-show'  |
| 6    | Cron relatório executa              | Relatório gerado e enviado                   |
| 7    | Verifica consistência final         | Todos os status válidos, no-show correto     |

---

## Como Executar

```bash
# 1. Iniciar serviços
supabase start
cd apps/worker-whatsapp-agent && wrangler dev &
supabase functions serve &

# 2. Carregar variáveis
export $(cat .env.test | xargs)

# 3. Executar testes E2E
pnpm test:e2e

# 4. Executar suite específica
pnpm test:e2e -- --grep "Webhook"
pnpm test:e2e -- --grep "No-Show"
pnpm test:e2e -- --grep "Full E2E"
```

---

## Cobertura de Cenários por Componente

| Componente           | Testes | Cenários |
|----------------------|--------|----------|
| Webhook HMAC         | 3      | Valid, invalid, missing signature |
| Message filtering    | 3      | Group, fromMe, unknown unit |
| Agent conversation   | 6      | Greet, services, availability, book, cancel, context |
| Cron confirmação     | 3      | Pending → confirmed, skip confirmed, empty |
| Cron lembretes       | 3      | Tomorrow reminder, today skip, cancelled skip |
| Cron no-show         | 4      | Overdue, grace period, completed, batch |
| Cron relatório       | 2      | With data, empty day |
| Cron remarketing     | 3      | Active campaign, draft/paused, empty audience |
| Full flow            | 7      | Complete lifecycle |
| **Total**            | **34** | |
