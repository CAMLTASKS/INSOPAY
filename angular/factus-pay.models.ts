/**
 * Modelos e interfaces TypeScript para la integración completa de Factus Pay (Bre-B Colombia)
 */

export type FactusCollectionStatus = 
  | 'started' 
  | 'ready' 
  | 'paid' 
  | 'failed' 
  | 'rejected';

export type FactusSimulationScenario = 
  | 'paid' 
  | 'tx_insufficient_funds' 
  | 'tx_account_error' 
  | 'tx_timeout';

export interface FactusPayerInfo {
  name?: string;
  document_type?: string;
  document_number?: string;
}

export interface CreateFactusCollectionRequest {
  amount: number;
  reference_code?: string;
  description?: string;
}

export interface FactusCollectionFilters {
  page?: number;
  status?: FactusCollectionStatus | 'all';
  reference_code?: string;
}

export interface FactusCollectionData {
  reference_code: string;
  amount: number;
  status: FactusCollectionStatus;
  breb_key: string;
  created_at: string;
  qr_expires_at?: string;
  qr?: string; // Imagen en base64: data:image/png;base64,...
  qr_image?: string;
  description?: string;
  currency?: string;
  payer?: FactusPayerInfo | null;
}

export interface FactusApiResponse<T> {
  success: boolean;
  provider: 'factus_pay';
  environment: 'sandbox' | 'production';
  message: string;
  data: T;
  error?: string;
  details?: any;
}

export interface FactusCollectionsListResponse {
  success: boolean;
  provider: 'factus_pay';
  data: FactusCollectionData[];
  links: {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
  };
  meta: {
    current_page: number;
    from: number;
    last_page: number;
    per_page: number;
    to: number;
    total: number;
    links?: Array<{ url: string | null; label: string; active: boolean; page: number | null }>;
  };
  status: string;
  message: string;
}

export interface FactusWebhookLogEntry {
  id: string;
  received_at: string;
  event: string;
  reference_code: string;
  amount: number | null;
  status: string;
  breb_key: string | null;
  payer?: FactusPayerInfo | null;
  is_duplicate?: boolean;
  raw_payload: any;
}

export interface FactusWebhookLogsResponse {
  success: boolean;
  total: number;
  webhook_key?: string;
  webhook_url?: string;
  logs: FactusWebhookLogEntry[];
}

export interface FactusTestConnectionResponse {
  success: boolean;
  provider: 'factus_pay';
  environment: 'sandbox' | 'production';
  baseUrl: string;
  email: string;
  latencyMs: number;
  tokenAvailable: boolean;
  tokenTimestamp: string;
  webhookKeyConfigured?: boolean;
  webhookUrl?: string;
  message: string;
  error?: string;
}

export interface FactusSimulateRequest {
  reference_code: string;
  scenario: FactusSimulationScenario;
  amount?: number;
}

export interface FactusSimulateResponse {
  success: boolean;
  message: string;
  scenario: FactusSimulationScenario;
  resulting_status: FactusCollectionStatus;
  simulated_payload: any;
  webhook_processed?: any;
}
