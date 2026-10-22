import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timer } from 'rxjs';
import { switchMap, takeWhile, filter, map } from 'rxjs/operators';
import { 
  CreateQrRequest, 
  OpenpayChargeResponse, 
  ApiResponse 
} from './openpay-qr.models';

/**
 * Servicio Angular para la generación y seguimiento de pagos QR con Openpay Colombia
 */
@Injectable({
  providedIn: 'root'
})
export class OpenpayQrService {
  // URL del backend Node.js intermediario (evita exponer la Secret Key en el navegador)
  private readonly baseUrl = 'http://localhost:3000/api/qr';

  constructor(private http: HttpClient) {}

  /**
   * Generar nuevo código QR de pago recibiendo el valor a cobrar
   * @param request Datos del cobro (monto requerido, descripción, cliente)
   */
  generateQr(request: CreateQrRequest): Observable<ApiResponse<OpenpayChargeResponse>> {
    return this.http.post<ApiResponse<OpenpayChargeResponse>>(
      `${this.baseUrl}/generate`, 
      request
    );
  }

  /**
   * Generación rápida recibiendo únicamente el monto
   * @param amount Monto a cobrar en pesos colombianos (sin decimales)
   * @param description Descripción opcional
   */
  generateQuickQr(amount: number, description?: string): Observable<ApiResponse<OpenpayChargeResponse>> {
    return this.generateQr({
      amount: Math.round(amount),
      description: description || `Cobro QR por $${amount.toLocaleString('es-CO')} COP`,
      customer: {
        name: 'Cliente Mostrador',
        last_name: 'General',
        email: 'cliente@comercio.co',
        phone_number: '3001234567'
      }
    });
  }

  /**
   * Consultar estado de la transacción en Openpay
   * @param transactionId ID de la transacción devuelto al crear el QR (ej: trrftc5hz1mshp6yygwj)
   */
  checkStatus(transactionId: string): Observable<ApiResponse<OpenpayChargeResponse>> {
    return this.http.get<ApiResponse<OpenpayChargeResponse>>(
      `${this.baseUrl}/status/${transactionId}`
    );
  }

  /**
   * Sondeo automático (Polling) del estado del QR cada 30 segundos
   * Se detiene automáticamente cuando el estado cambia a 'completed', 'cancelled' o 'failed'
   * @param transactionId ID de la transacción
   * @param intervalMs Intervalo en ms (por defecto 30,000ms según recomendación Openpay)
   */
  pollStatusUntilFinished(
    transactionId: string, 
    intervalMs: number = 30000
  ): Observable<OpenpayChargeResponse> {
    return timer(0, intervalMs).pipe(
      switchMap(() => this.checkStatus(transactionId)),
      map(res => res.charge),
      takeWhile(
        charge => charge.status === 'charge_pending', 
        true // Incluye la última emisión cuando cambia a completed/cancelled/failed
      )
    );
  }

  /**
   * Simular pago exitoso en ambiente Sandbox
   */
  simulatePayment(transactionId: string): Observable<ApiResponse<OpenpayChargeResponse>> {
    return this.http.post<ApiResponse<OpenpayChargeResponse>>(
      `${this.baseUrl}/simulate-payment/${transactionId}`, 
      {}
    );
  }
}
