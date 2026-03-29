# StudioFlow Backend

Backend serverless para SaaS multi-tenant de salões de beleza, barbearias e clínicas estéticas. Agente IA no WhatsApp que agenda, cancela, consulta horários e envia campanhas de marketing.

## Stack

| Componente | Tecnologia |
|---|---|
| Runtime | Supabase Edge Functions (Deno) |
| Banco de dados | Supabase PostgreSQL |
| IA | Claude API (claude-sonnet-4-20250514) |
| WhatsApp | WAHA (WhatsApp HTTP API) |
| Histórico de conversa | Upstash Redis |
| Linguagem | TypeScript (strict mode) |

## Arquitetura

```
                         ┌─────────────────────────────────────────────────┐
                         │            Supabase Edge Functions              │
┌──────────┐  ┌──────┐  │  ┌─────────────────────┐  ┌─────────────────┐  │  ┌──────────┐
│ WhatsApp │◄►│ WAHA │──┼─►│ edge-whatsapp-webhook│─►│ Claude API      │  │  │ Upstash  │
│ (cliente)│  │(Docker)│ │  └─────────┬───────────┘  └─────────────────┘  │  │  Redis   │
└──────────┘  └──┬───┘  │            │                                    │  └──────────┘
                 │      │  ┌─────────┴───────────┐                        │
                 │◄─────┼──│ Supabase PostgreSQL  │◄── cron functions ────│
                 │      │  └─────────────────────┘                        │
                 │      └─────────────────────────────────────────────────┘
                 │
                 └── POST /api/sendText (resposta do agente)
```

## Estrutura de pastas

```
studioflow-backend/
├── apps/
│   ├── edge-whatsapp-webhook/    # Webhook WhatsApp (agente IA)
│   │   └── index.ts
│   ├── edge-whatsapp-sessions/   # Gerenciamento de sessões WAHA
│   │   └── index.ts
│   ├── edge-cron-confirmacao/    # Cron: confirma agendamentos PENDING
│   │   └── index.ts
│   ├── edge-cron-lembretes/      # Cron: lembrete para amanhã
│   │   └── index.ts
│   ├── edge-cron-noshow/         # Cron: marca no-show
│   │   └── index.ts
│   ├── edge-cron-relatorio/      # Cron: relatório diário via Claude
│   │   └── index.ts
│   └── edge-cron-remarketing/    # Cron: campanhas de marketing
│       └── index.ts
├── packages/
│   └── studioflow-sdk/           # SDK compartilhado
│       └── src/
│           ├── index.ts          # Re-exports
│           ├── types.ts          # Tipos do schema + WAHA
│           ├── utils.ts          # normalizePhone, formatDate, etc
│           ├── supabase.ts       # Cliente REST para PostgREST
│           ├── waha.ts           # Cliente WAHA (sendText, sendImage)
│           ├── anthropic.ts      # Cliente Claude API
│           └── redis.ts          # Cliente Upstash Redis (HTTP)
├── tests/
│   └── e2e/                      # 34 cenários de teste E2E
├── package.json
├── tsconfig.base.json
├── pnpm-workspace.yaml
├── vitest.e2e.config.ts
├── .env.example
└── .gitignore
```

---

## Pré-requisitos

- [Supabase CLI](https://supabase.com/docs/guides/cli) v1.200+
- [Docker](https://docs.docker.com/get-docker/) (para WAHA)
- [pnpm](https://pnpm.io/) v9+
- Conta no [Supabase](https://supabase.com)
- Conta no [Upstash](https://upstash.com) (plano gratuito funciona)
- API key da [Anthropic](https://console.anthropic.com)

---

## Setup passo a passo

### 1. Clonar e instalar dependências

```bash
git clone https://github.com/fabriciofirmino/BotStudioIA.git
cd BotStudioIA
pnpm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Preencha o `.env`:

```env
# ─── Supabase ───
SUPABASE_URL=https://xrarnvibyloemhsrvejy.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Settings → API → service_role key

# ─── Claude AI ───
ANTHROPIC_API_KEY=sk-ant-...      # console.anthropic.com → API Keys

# ─── WAHA (WhatsApp) ───
WAHA_API_URL=http://seu-vps:3000  # URL do container WAHA
WAHA_API_KEY=sua-chave-waha       # Definida no docker run
WEBHOOK_SECRET=segredo-hmac-aqui  # Qualquer string segura

# ─── Upstash Redis ───
UPSTASH_REDIS_URL=https://xxx.upstash.io  # Console Upstash → REST URL
UPSTASH_REDIS_TOKEN=AX...                  # Console Upstash → REST Token
```

### 3. Criar funções SQL no Supabase

Acesse o **SQL Editor** no Supabase Dashboard e execute:

```sql
-- Resolve a Unit pelo número WhatsApp ou instância WAHA
CREATE OR REPLACE FUNCTION get_unit_by_whatsapp(p_number TEXT)
RETURNS TABLE (
  unit_id TEXT,
  unit_name TEXT,
  segment TEXT,
  whatsapp_instance TEXT,
  ai_enabled BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id::TEXT,
    u.name::TEXT,
    u.segment::TEXT,
    u."whatsappInstance"::TEXT,
    u."aiEnabled"
  FROM "Unit" u
  WHERE REGEXP_REPLACE(u."whatsappNumber", '[^0-9]', '', 'g') = REGEXP_REPLACE(p_number, '[^0-9]', '', 'g')
     OR u."whatsappInstance" = p_number;
END;
$$ LANGUAGE plpgsql;

-- Monta o system prompt completo para o agente IA
CREATE OR REPLACE FUNCTION build_agent_prompt(p_unit_id TEXT)
RETURNS TEXT AS $$
DECLARE
  v_unit RECORD;
  v_services TEXT;
  v_professionals TEXT;
  v_prompt TEXT;
BEGIN
  -- Busca a Unit
  SELECT * INTO v_unit FROM "Unit" WHERE id = p_unit_id::uuid;

  IF NOT FOUND THEN
    RETURN 'Você é um assistente virtual.';
  END IF;

  -- Lista serviços ativos
  SELECT COALESCE(string_agg(
    FORMAT('- %s (%s min, R$ %s)', s.name, s."durationMin", s.price),
    E'\n'
  ), 'Nenhum serviço cadastrado.')
  INTO v_services
  FROM "Service" s
  WHERE s."unitId" = p_unit_id::uuid AND s."isActive" = true;

  -- Lista profissionais ativos
  SELECT COALESCE(string_agg(
    FORMAT('- %s (ID: %s, %s)', p.name, p.id, COALESCE(p.specialty, 'Geral')),
    E'\n'
  ), 'Nenhum profissional cadastrado.')
  INTO v_professionals
  FROM "Professional" p
  WHERE p."unitId" = p_unit_id::uuid AND p."isActive" = true;

  -- Monta prompt
  v_prompt := COALESCE(v_unit."aiSystemPrompt",
    FORMAT('Você é o assistente virtual da %s.', v_unit.name));

  v_prompt := v_prompt || E'\n\n';
  v_prompt := v_prompt || FORMAT('Tom de voz: %s', COALESCE(v_unit."aiTone", 'profissional e amigável'));
  v_prompt := v_prompt || E'\n\n';
  v_prompt := v_prompt || 'Serviços disponíveis:' || E'\n' || v_services;
  v_prompt := v_prompt || E'\n\n';
  v_prompt := v_prompt || 'Profissionais:' || E'\n' || v_professionals;

  IF v_unit."aiPolicies" IS NOT NULL THEN
    v_prompt := v_prompt || E'\n\n' || 'Políticas: ' || v_unit."aiPolicies"::TEXT;
  END IF;

  v_prompt := v_prompt || E'\n\n';
  v_prompt := v_prompt || 'Data/hora atual: ' || NOW()::TEXT;
  v_prompt := v_prompt || E'\n';
  v_prompt := v_prompt || 'Sempre use as ferramentas disponíveis para consultar, agendar e cancelar. ';
  v_prompt := v_prompt || 'Nunca invente horários ou dados. Confirme todos os dados antes de agendar.';

  RETURN v_prompt;
END;
$$ LANGUAGE plpgsql;
```

### 4. Subir o WAHA (WhatsApp)

```bash
docker run -d \
  --name waha \
  --restart unless-stopped \
  -p 3000:3000 \
  -e WHATSAPP_API_KEY=sua-chave-waha \
  -e WHATSAPP_DEFAULT_ENGINE=NOWEB \
  -v waha_sessions:/app/.sessions \
  devlikeapro/waha
```

Verifique se está rodando:

```bash
curl http://localhost:3000/api/sessions -H "X-Api-Key: sua-chave-waha"
# Deve retornar []
```

### 5. Conectar número WhatsApp (via API do StudioFlow)

Após o deploy, use a Edge Function de gerenciamento de sessões:

```bash
# Conectar uma Unit (cria sessão WAHA + gera QR Code)
curl -X POST https://xrarnvibyloemhsrvejy.supabase.co/functions/v1/edge-whatsapp-sessions/{UNIT_ID}/connect \
  -H "Authorization: Bearer SUA_SERVICE_ROLE_KEY"

# Resposta:
# {
#   "unitId": "abc-123",
#   "session": "studioflow-centro",
#   "status": "SCAN_QR_CODE",
#   "qrCode": "2@ABC123...",       ← texto para gerar QR no frontend
#   "qrImage": "data:image/png;base64,...",  ← imagem pronta
#   "message": "Scan the QR code with WhatsApp on your phone."
# }

# Verificar status
curl https://xrarnvibyloemhsrvejy.supabase.co/functions/v1/edge-whatsapp-sessions/{UNIT_ID}/status \
  -H "Authorization: Bearer SUA_SERVICE_ROLE_KEY"

# Pegar QR Code atualizado (se expirou)
curl https://xrarnvibyloemhsrvejy.supabase.co/functions/v1/edge-whatsapp-sessions/{UNIT_ID}/qr \
  -H "Authorization: Bearer SUA_SERVICE_ROLE_KEY"

# Desconectar
curl -X POST https://xrarnvibyloemhsrvejy.supabase.co/functions/v1/edge-whatsapp-sessions/{UNIT_ID}/disconnect \
  -H "Authorization: Bearer SUA_SERVICE_ROLE_KEY"
```

Ou direto no WAHA (sem o middleware):

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "X-Api-Key: sua-chave-waha" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "studioflow-centro",
    "start": true,
    "config": {
      "webhooks": [{
        "url": "https://xrarnvibyloemhsrvejy.supabase.co/functions/v1/edge-whatsapp-webhook",
        "events": ["message"],
        "hmac": { "key": "segredo-hmac-aqui" }
      }]
    }
  }'
```

Isso retorna um QR Code. Escaneie com o WhatsApp do estabelecimento.

O valor `"name"` deve ser igual ao campo `whatsappInstance` na tabela `Unit`.

### 6. Deploy das Edge Functions

```bash
# Deploy de todas as funções
supabase functions deploy edge-whatsapp-webhook --project-ref xrarnvibyloemhsrvejy
supabase functions deploy edge-whatsapp-sessions --project-ref xrarnvibyloemhsrvejy
supabase functions deploy edge-cron-confirmacao --project-ref xrarnvibyloemhsrvejy
supabase functions deploy edge-cron-lembretes --project-ref xrarnvibyloemhsrvejy
supabase functions deploy edge-cron-noshow --project-ref xrarnvibyloemhsrvejy
supabase functions deploy edge-cron-relatorio --project-ref xrarnvibyloemhsrvejy
supabase functions deploy edge-cron-remarketing --project-ref xrarnvibyloemhsrvejy
```

Configurar os **secrets** (variáveis de ambiente) nas Edge Functions:

```bash
supabase secrets set \
  SUPABASE_URL=https://xrarnvibyloemhsrvejy.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  ANTHROPIC_API_KEY=sk-ant-... \
  WAHA_API_URL=http://seu-vps:3000 \
  WAHA_API_KEY=sua-chave-waha \
  WEBHOOK_SECRET=segredo-hmac-aqui \
  UPSTASH_REDIS_URL=https://xxx.upstash.io \
  UPSTASH_REDIS_TOKEN=AX... \
  --project-ref xrarnvibyloemhsrvejy
```

### 7. Configurar Cron Schedules

No **Supabase Dashboard** → **Database** → **pg_cron**, ou via SQL:

```sql
-- Confirma agendamentos PENDING (a cada hora)
SELECT cron.schedule('cron-confirmacao', '0 * * * *',
  $$SELECT net.http_post(
    url := 'https://xrarnvibyloemhsrvejy.supabase.co/functions/v1/edge-cron-confirmacao',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb
  )$$
);

-- Lembretes para amanhã (08h diário)
SELECT cron.schedule('cron-lembretes', '0 8 * * *',
  $$SELECT net.http_post(
    url := 'https://xrarnvibyloemhsrvejy.supabase.co/functions/v1/edge-cron-lembretes',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb
  )$$
);

-- No-show detection (a cada 30min)
SELECT cron.schedule('cron-noshow', '*/30 * * * *',
  $$SELECT net.http_post(
    url := 'https://xrarnvibyloemhsrvejy.supabase.co/functions/v1/edge-cron-noshow',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb
  )$$
);

-- Relatório diário (21h)
SELECT cron.schedule('cron-relatorio', '0 21 * * *',
  $$SELECT net.http_post(
    url := 'https://xrarnvibyloemhsrvejy.supabase.co/functions/v1/edge-cron-relatorio',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb
  )$$
);

-- Remarketing (09h diário)
SELECT cron.schedule('cron-remarketing', '0 9 * * *',
  $$SELECT net.http_post(
    url := 'https://xrarnvibyloemhsrvejy.supabase.co/functions/v1/edge-cron-remarketing',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb
  )$$
);
```

> Substitua `SERVICE_ROLE_KEY` pela chave real. Para usar `pg_cron` + `pg_net`, ative as extensões em **Database** → **Extensions**.

---

## Rotas / Endpoints

### Webhook WhatsApp

| Rota | Método | Descrição |
|---|---|---|
| `/functions/v1/edge-whatsapp-webhook` | `POST` | Recebe mensagens do WAHA |

**Headers obrigatórios:**
- `Content-Type: application/json`
- `x-hub-signature-256: sha256=<hmac>` (gerado pelo WAHA)

**Payload de entrada (WAHA):**

```json
{
  "event": "message",
  "session": "studioflow-centro",
  "payload": {
    "from": "5511988880000@c.us",
    "fromMe": false,
    "to": "5511940021001@c.us",
    "body": "Quero agendar um corte",
    "participant": null
  }
}
```

**Respostas:**

| Status | Body | Quando |
|---|---|---|
| `200` | `{"success": true, "unitId": "..."}` | Mensagem processada |
| `200` | `{"ignored": true, "reason": "..."}` | Mensagem ignorada (grupo, fromMe, unit not found, etc) |
| `401` | `{"error": "Invalid signature"}` | HMAC inválido ou ausente |
| `405` | `Method not allowed` | Método != POST |

**Reasons de ignore:**

| reason | Descrição |
|---|---|
| `not_message_event` | Evento WAHA != "message" |
| `from_me` | Mensagem enviada pelo próprio bot |
| `group_message` | Mensagem de grupo (@g.us) |
| `empty_message` | Body vazio |
| `unit_not_found` | Nenhuma Unit com esse whatsappInstance |
| `ai_disabled` | Unit tem aiEnabled = false |

### Gerenciamento de Sessões WhatsApp

Todas requerem header `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.

| Rota | Método | Descrição |
|---|---|---|
| `/functions/v1/edge-whatsapp-sessions` | `GET` | Lista todas as sessões WAHA |
| `/functions/v1/edge-whatsapp-sessions/:unitId/status` | `GET` | Status da sessão (WORKING, SCAN_QR_CODE, STOPPED...) |
| `/functions/v1/edge-whatsapp-sessions/:unitId/connect` | `POST` | Cria sessão + configura webhook + retorna QR Code |
| `/functions/v1/edge-whatsapp-sessions/:unitId/qr` | `GET` | Retorna QR Code (texto raw para renderizar no frontend) |
| `/functions/v1/edge-whatsapp-sessions/:unitId/qr-image` | `GET` | Retorna QR Code como `data:image/png;base64,...` |
| `/functions/v1/edge-whatsapp-sessions/:unitId/disconnect` | `POST` | Desconecta o WhatsApp (logout + stop) |
| `/functions/v1/edge-whatsapp-sessions/:unitId/restart` | `POST` | Reinicia a sessão |
| `/functions/v1/edge-whatsapp-sessions/:unitId/delete` | `DELETE` | Remove a sessão permanentemente |

**Fluxo de conexão no frontend:**

```
1. POST /:unitId/connect
   → Cria sessão no WAHA, retorna qrCode/qrImage

2. Frontend exibe QR Code (usando qrImage ou gerando a partir de qrCode)

3. Usuário escaneia QR com WhatsApp

4. Frontend faz polling: GET /:unitId/status (a cada 3s)
   → Quando status = "WORKING" → conectado!

5. Se QR expirar: GET /:unitId/qr → novo QR Code
```

**Respostas padrão:**

```json
{
  "unitId": "abc-123",
  "unitName": "StudioFlow Centro",
  "session": "studioflow-centro",
  "status": "WORKING",
  "connected": true,
  "me": { "id": "5511940021001@c.us", "pushName": "StudioFlow Centro" }
}
```

**Status possíveis:**

| Status | Descrição |
|---|---|
| `NOT_CREATED` | Sessão não existe no WAHA |
| `STOPPED` | Sessão parada |
| `STARTING` | Sessão iniciando |
| `SCAN_QR_CODE` | Aguardando scan do QR Code |
| `WORKING` | Conectado e funcionando |
| `FAILED` | Erro na sessão |

### Cron Functions

Todas requerem header `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.

| Rota | Método | Schedule | Descrição |
|---|---|---|---|
| `/functions/v1/edge-cron-confirmacao` | `POST` | `0 * * * *` | Confirma appointments PENDING, envia WhatsApp |
| `/functions/v1/edge-cron-lembretes` | `POST` | `0 8 * * *` | Lembrete para appointments CONFIRMED de amanhã |
| `/functions/v1/edge-cron-noshow` | `POST` | `*/30 * * * *` | Marca no-show (CONFIRMED com endsAt > 30min atrás) |
| `/functions/v1/edge-cron-relatorio` | `POST` | `0 21 * * *` | Relatório diário via Claude, envia para admin |
| `/functions/v1/edge-cron-remarketing` | `POST` | `0 9 * * *` | Campanhas ACTIVE, personaliza msg via Claude |

**Resposta padrão dos crons:**

```json
{
  "success": true,
  "processed": 5,
  "errors": 0
}
```

---

## Ferramentas do Agente IA

O agente WhatsApp tem 4 ferramentas (Claude tool_use) que executam queries no Supabase:

| Ferramenta | Descrição | Quando é usada |
|---|---|---|
| `consultar_agenda` | Consulta horários disponíveis por profissional e data | "Quais horários disponíveis?" |
| `criar_agendamento` | Cria appointment com profissional, serviço, data e hora | "Quero agendar corte amanhã 10h" |
| `cancelar_agendamento` | Cancela appointment existente | "Preciso cancelar meu agendamento" |
| `listar_servicos` | Lista serviços ativos com preço e duração | "Quais serviços vocês oferecem?" |

O agente faz até **5 rounds** de tool_use por mensagem e mantém **histórico de conversa** (últimas 20 mensagens, TTL 24h) no Upstash Redis.

---

## Multi-tenant

Cada **Unit** é um tenant isolado:

```
Organization (empresa dona)
  └── Unit A (barbearia centro)    → session WAHA: studioflow-centro
  └── Unit B (clínica skin)        → session WAHA: studioflow-skin
```

- Todos os dados são filtrados por `unitId`
- Cada Unit tem seu próprio prompt AI (`aiSystemPrompt`, `aiTone`, `aiPolicies`)
- Cada Unit tem sua própria session WAHA (número WhatsApp separado)
- Histórico Redis separado por `conv:{unitId}:{phone}`
- Crons iteram todas as Units automaticamente

---

## Schema do banco

As tabelas usam **PascalCase** no PostgreSQL:

| Tabela | Campos principais |
|---|---|
| `Organization` | id, name, ownerEmail |
| `Unit` | id, organizationId, segment, name, phone, whatsappInstance, whatsappNumber, aiEnabled, aiTone, aiSystemPrompt, aiPolicies |
| `Professional` | id, unitId, name, specialty, workStart, workEnd, workingDays, isActive |
| `Service` | id, unitId, name, durationMin, price, category, isActive |
| `Client` | id, unitId, name, phone, email, tags, marketingAudienceId |
| `Appointment` | id, unitId, clientId, professionalId, serviceId, startsAt, endsAt, status, entryMode, retroReason, totalPrice |
| `MarketingAudience` | id, unitId, name, description, active |
| `MarketingCampaign` | id, unitId, name, message, status (DRAFT/ACTIVE/PAUSED), audienceId |
| `User` | id, name, email, role, organizationId, defaultUnitId |

**Enums:**

| Enum | Valores |
|---|---|
| `AppointmentStatus` | PENDING, CONFIRMED, COMPLETED, CANCELLED |
| `EntryMode` | SCHEDULED, RETROACTIVE |
| `UnitSegment` | BARBERSHOP, FACIAL_AESTHETICS, NAIL_STUDIO, BEAUTY_CLINIC |
| `CampaignStatus` | DRAFT, ACTIVE, PAUSED |
| `UserRole` | ADMIN, GERENTE, PROFISSIONAL, CLIENTE, ATENDIMENTO |

---

## Desenvolvimento local

### Rodar as Edge Functions localmente

```bash
# 1. Iniciar Supabase local
supabase start

# 2. Servir todas as edge functions
supabase functions serve --env-file .env

# 3. Testar o webhook manualmente
curl -X POST http://localhost:54321/functions/v1/edge-whatsapp-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message",
    "session": "studioflow-centro",
    "payload": {
      "from": "5511988880000@c.us",
      "fromMe": false,
      "to": "bot@c.us",
      "body": "Olá, quero agendar um corte",
      "participant": null,
      "id": "test1",
      "timestamp": 1679561234,
      "hasMedia": false,
      "media": null,
      "mediaUrl": "",
      "ack": 0,
      "ackName": "PENDING",
      "source": "APP",
      "author": null,
      "replyTo": null,
      "_data": {}
    },
    "id": "test1",
    "timestamp": 1679561234567,
    "metadata": null,
    "engine": "NOWEB",
    "me": null
  }'

# 4. Testar um cron manualmente
curl -X POST http://localhost:54321/functions/v1/edge-cron-noshow \
  -H "Authorization: Bearer eyJ..."  # service_role key
```

### Rodar testes E2E

```bash
# Configurar variáveis de teste
cp .env.example .env.test
# Editar .env.test com valores de teste

# Executar todos os testes
pnpm test:e2e

# Executar suite específica
pnpm test:e2e -- --grep "Webhook"
pnpm test:e2e -- --grep "No-Show"
pnpm test:e2e -- --grep "Full E2E"
```

---

## Custos estimados (produção)

| Serviço | Plano | Custo/mês |
|---|---|---|
| Supabase | Free (500MB, 50k MAU) | $0 |
| Supabase Edge Functions | Free (500k invocações) | $0 |
| WAHA | Docker em VPS (Hetzner CX22) | ~$4 |
| Upstash Redis | Free (10k comandos/dia) | $0 |
| Claude API | Pay per use (~$3/MTok in) | ~$10-30 |
| **Total** | | **~$15-35/mês** |

---

## Troubleshooting

| Problema | Solução |
|---|---|
| WAHA QR Code expirou | `POST /api/sessions/studioflow-centro/start` para gerar novo QR |
| Mensagens não chegam | Verificar webhook URL no WAHA, checar logs do Supabase |
| "Unit not found" nos logs | Verificar se `whatsappInstance` na tabela Unit bate com o session name do WAHA |
| Erro no Claude API | Verificar se `ANTHROPIC_API_KEY` está configurada nos secrets |
| Redis timeout | Verificar `UPSTASH_REDIS_URL` e `UPSTASH_REDIS_TOKEN` |
| Cron não executa | Verificar se `pg_cron` e `pg_net` estão ativados nas extensions |
| PostgREST erro 404 | Tabelas usam PascalCase — verificar se o nome está correto |

---

## Licensa

Projeto privado. Todos os direitos reservados.
