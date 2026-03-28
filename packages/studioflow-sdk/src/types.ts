// ─── Enums ───────────────────────────────────────────────────────────────────

export type UnitSegment = "BARBERSHOP" | "FACIAL_AESTHETICS" | "NAIL_STUDIO" | "BEAUTY_CLINIC";
export type AppointmentStatus = "CONFIRMED" | "PENDING" | "COMPLETED" | "CANCELLED";
export type EntryMode = "SCHEDULED" | "RETROACTIVE";
export type UserRole = "ADMIN" | "GERENTE" | "PROFISSIONAL" | "CLIENTE" | "ATENDIMENTO";
export type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED";
export type CatalogDomain = "CLIENT_TAG" | "SERVICE_CATEGORY" | "PROFESSIONAL_SPECIALTY" | "UNIT_TYPE_NOTE";

// ─── DB Row Interfaces ──────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  ownerEmail: string;
  createdAt: string;
}

export interface AiPolicies {
  confirmation?: string;
  cancellation?: string;
  noShow?: string;
  [key: string]: string | undefined;
}

export interface Unit {
  id: string;
  organizationId: string;
  segment: UnitSegment;
  templateKey: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  ownerEmail: string;
  setupCompleted: boolean;
  setupData: Record<string, unknown> | null;
  openingHours: Record<string, unknown> | null;
  bookingRules: Record<string, unknown> | null;
  aiEnabled: boolean;
  aiTone: string | null;
  aiSystemPrompt: string | null;
  aiGreeting: string | null;
  aiFallback: string | null;
  aiPolicies: AiPolicies | null;
  publicSlug: string | null;
  logoPath: string | null;
  brandPrimaryColor: string | null;
  brandHighlightColor: string | null;
  brandSurfaceTintColor: string | null;
  whatsappInstance: string | null;
  whatsappNumber: string | null;
  createdAt: string;
}

export interface Professional {
  id: string;
  name: string;
  specialty: string | null;
  color: string | null;
  phone: string | null;
  email: string | null;
  bio: string | null;
  workStart: string | null;
  workEnd: string | null;
  workingDays: number[] | null;
  isActive: boolean;
  unitId: string;
  commissionPercent: number | null;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number;
  category: string | null;
  isActive: boolean;
  unitId: string;
  cost: number | null;
  suggestedCommissionPercent: number | null;
}

export interface ServiceImage {
  id: string;
  serviceId: string;
  path: string;
  displayOrder: number;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  birthday: string | null;
  tags: string[] | null;
  unitId: string;
  marketingAudienceId: string | null;
  createdAt: string;
}

export interface Appointment {
  id: string;
  unitId: string;
  clientId: string;
  professionalId: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  entryMode: EntryMode;
  retroReason: string | null;
  notes: string | null;
  totalPrice: number | null;
  createdAt: string;
}

export interface CatalogOption {
  id: string;
  unitId: string;
  domain: CatalogDomain;
  label: string;
  isActive: boolean;
  createdAt: string;
}

export interface MarketingAudience {
  id: string;
  unitId: string;
  name: string;
  description: string | null;
  channelHint: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingCampaign {
  id: string;
  unitId: string;
  name: string;
  objective: string | null;
  channel: string | null;
  message: string;
  status: CampaignStatus;
  audienceId: string | null;
  audienceLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplate {
  id: string;
  unitId: string;
  name: string;
  category: string | null;
  objective: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  organizationId: string | null;
  defaultUnitId: string | null;
  authUserId: string | null;
  createdAt: string;
}

export interface UserUnit {
  id: string;
  userId: string;
  unitId: string;
  role: UserRole;
  createdAt: string;
}

// ─── RPC Return Types ───────────────────────────────────────────────────────

export interface UnitByWhatsApp {
  unit_id: string;
  unit_name: string;
  segment: UnitSegment;
  whatsapp_instance: string;
  ai_enabled: boolean;
}

// ─── Conversation History ───────────────────────────────────────────────────

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── Agent Tool Input Types ─────────────────────────────────────────────────

export interface ConsultarAgendaInput {
  professional_id?: string;
  date: string;
  service_id?: string;
}

export interface CriarAgendamentoInput {
  professional_id: string;
  service_id: string;
  starts_at: string;
  client_name: string;
}

export interface CancelarAgendamentoInput {
  appointment_id: string;
}

// ─── WAHA Webhook Types ────────────────────────────────────────────────────

export interface WahaWebhookEvent {
  id: string;
  timestamp: number;
  session: string;
  metadata: Record<string, unknown> | null;
  engine: string;
  me: { id: string; pushName: string } | null;
  event: string;
  payload: WahaMessagePayload;
}

export interface WahaMessagePayload {
  id: string;
  timestamp: number;
  from: string;
  fromMe: boolean;
  to: string;
  participant: string | null;
  body: string;
  hasMedia: boolean;
  media: unknown | null;
  mediaUrl: string;
  ack: number;
  ackName: string;
  source: string;
  author: string | null;
  replyTo: unknown | null;
  _data: unknown;
}
