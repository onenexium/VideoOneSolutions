// Help, legal documents, share links, tickets, reports and the privacy centre (backend BE-72, BE-73,
// BE-75, BE-76, BE-77).

import { api, unwrap } from "./api";
import type { components } from "@/types/api";

type Schemas = components["schemas"];
export type HelpArticleSummary = Schemas["HelpArticleSummaryResponse"];
export type HelpArticle = Schemas["HelpArticleResponse"];
export type LegalDocument = Schemas["LegalDocumentResponse"];
export type Ticket = Schemas["TicketResponse"];
export type TicketDetail = Schemas["TicketDetailResponse"];
export type Privacy = Schemas["PrivacyResponse"];
export type PrivacyRequest = Schemas["PrivacyRequestResponse"];
export type Share = Schemas["ShareResponse"];
export type TicketCategory = Schemas["CreateTicketDto"]["category"];
export type ReportCategory = Schemas["CreateReportDto"]["category"];
export type LegalKind = LegalDocument["kind"];

// ---- help and legal (public) ----

export async function getHelpArticles(language: string, q?: string): Promise<HelpArticleSummary[]> {
  return unwrap(await api.GET("/v1/help/articles", { params: { query: { language, q } } })).items;
}

export async function getHelpArticle(slug: string, language: string): Promise<HelpArticle> {
  return unwrap(
    await api.GET("/v1/help/articles/{slug}", { params: { path: { slug }, query: { language } } }),
  );
}

/** The legal text in force, or null while none is published. */
export async function getLegalDocument(kind: LegalKind, language: string): Promise<LegalDocument | null> {
  const result = await api.GET("/v1/legal/{kind}", { params: { path: { kind }, query: { language } } });
  if (result.response.status === 404) return null;
  return unwrap(result);
}

// ---- sharing ----

/** A share of a series or episode: the link to send (null where the website is not configured). */
export async function createShare(input: {
  series: string;
  episode?: number;
  channel?: Schemas["CreateShareDto"]["channel"];
}): Promise<Share> {
  return unwrap(await api.POST("/v1/shares", { body: input }));
}

// ---- tickets and reports ----

export async function createTicket(input: Schemas["CreateTicketDto"]): Promise<Ticket> {
  return unwrap(await api.POST("/v1/tickets", { body: input }));
}

export async function reportTitle(input: Schemas["CreateReportDto"]): Promise<Ticket> {
  return unwrap(await api.POST("/v1/reports", { body: input }));
}

export async function getTickets(): Promise<Ticket[]> {
  return unwrap(await api.GET("/v1/me/tickets", {})).items;
}

export async function getTicket(id: string): Promise<TicketDetail> {
  return unwrap(await api.GET("/v1/me/tickets/{id}", { params: { path: { id } } }));
}

export async function replyToTicket(id: string, message: string): Promise<TicketDetail> {
  return unwrap(await api.POST("/v1/me/tickets/{id}/messages", { params: { path: { id } }, body: { message } }));
}

// ---- privacy centre ----

export async function getPrivacy(): Promise<Privacy> {
  return unwrap(await api.GET("/v1/me/privacy", {}));
}

/** A DPDP request, with a fresh step-up code (requestStepUp first). */
export async function createPrivacyRequest(input: Schemas["PrivacyRequestDto"]): Promise<PrivacyRequest> {
  return unwrap(await api.POST("/v1/me/privacy/requests", { body: input }));
}

/** Replaces the nominees (an empty list removes them), with a fresh step-up code. */
export async function setNominees(input: Schemas["SetNomineesDto"]) {
  return unwrap(await api.PUT("/v1/me/nominees", { body: input }));
}

/**
 * Changes the optional consents (recommendations, analytics, offers): a new record against the current
 * notice; withdrawing is as easy as giving (DPDP Rule 3). The required purpose stays given.
 */
export async function updateConsent(choices: { recommendations: boolean; analytics: boolean; marketing: boolean }) {
  const current = unwrap(await api.GET("/v1/me/consents", {}));
  return unwrap(
    await api.POST("/v1/me/consents", { body: { noticeId: current.notice.id, required: true, ...choices } }),
  );
}

// ---- notifications ----

export type NotificationPreferences = Schemas["NotificationPreferencesResponse"];

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  return unwrap(await api.GET("/v1/me/notification-preferences", {}));
}

/** 409 marketing-consent-required to turn a marketing type on without that consent. */
export async function updateNotificationPreferences(
  changes: Schemas["UpdateNotificationPreferencesDto"],
): Promise<NotificationPreferences> {
  return unwrap(await api.PATCH("/v1/me/notification-preferences", { body: changes }));
}

/** This phone's push token (sent at every start and after each login, once push permission is given). */
export async function registerPushToken(input: Schemas["RegisterPushTokenDto"]): Promise<void> {
  unwrap(await api.PUT("/v1/me/push-tokens", { body: input }));
}
