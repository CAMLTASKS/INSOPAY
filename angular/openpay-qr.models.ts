/**
 * Modelos e interfaces TypeScript para la integración de Códigos QR de Openpay Colombia
 */

export type TransactionStatus = 
  | 'charge_pending' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';

export interface CustomerDto {
  name: string;
  last_name?: string;
  email: string;
  phone_number?: string;
}

export interface CreateQrRequest {
  amount: number;
  description?: string;
  order_id?: string;
  customer?: CustomerDto;
}

export interface QrPaymentMethod {
  type: 'qr';
  barcode_base64: string;
  qr_type: 'dynamic' | 'static' | string;
}

export interface QrTimerInfo {
  duration_minutes: number;
  expires_at: string;
  expires_in_seconds: number;
  remaining_seconds?: number;
  must_refresh: boolean;
}

export interface OpenpayChargeResponse {
  id: string;
  authorization: string | null;
  operation_type: 'in' | 'out';
  transaction_type: 'charge';
  status: TransactionStatus;
  conciliated: boolean;
  creation_date: string;
  operation_date: string;
  description: string | null;
  error_message: string | null;
  order_id: string | null;
  gateway_card_present?: string;
  origin_channel?: string;
  amount: number;
  currency: string;
  method: 'qr';
  customer?: CustomerDto;
  payment_method: QrPaymentMethod;
  timer?: QrTimerInfo;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  is_simulation?: boolean;
  charge: T;
  error?: string;
  details?: any;
}
